// ============================================================
// 🤖 AI PROXY SERVER (Gemini 2.5 Flash + Pollinations + Video)
// ============================================================

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { exec } from "child_process";

dotenv.config();
const app = express();
// Tăng giới hạn payload lên 50MB để chứa ảnh Base64
app.use(bodyParser.json({ limit: "50mb" }));
// Phục vụ file tĩnh (index.html cùng thư mục)
app.use(express.static("."));

// ============================================================
// 🧠 CẤU HÌNH GEMINI
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY chưa được thiết lập trong .env. Chat và giải toán sẽ không hoạt động!");
}

// ======== Hàm gọi Gemini API (retry/backoff) ========
async function callGeminiModel(contents) {
  if (!GEMINI_API_KEY) return "❌ Thiếu GEMINI_API_KEY trong .env.";

  try {
    for (let i = 0; i < 3; i++) {
      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          return data.candidates[0].content.parts[0].text;
        }
        if (data.error) {
          console.error("❌ Lỗi API từ Gemini:", data.error);
          return `❌ Lỗi API từ Gemini: ${data.error.message}`;
        }
        return "❌ Không có phản hồi văn bản hợp lệ từ Gemini.";
      }

      const errorText = await response.text();
      console.error(`❌ Lỗi HTTP ${response.status} từ Gemini API: ${errorText}`);

      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return `❌ Lỗi HTTP ${response.status} khi gọi Gemini. Vui lòng kiểm tra lại API Key.`;
    }
    return "❌ Đã thử lại nhưng vẫn lỗi khi gọi Gemini.";
  } catch (error) {
    console.error("🔥 Lỗi khi gọi Gemini:", error);
    return "❌ Lỗi khi kết nối đến Google Gemini. (Kiểm tra server/mạng)";
  }
}

// ======== Hàm build content parts (text + inline image) ========
function buildContentParts(text, image, systemInstruction) {
  let userParts = [];
  const textPart = systemInstruction + "\n\nTin nhắn: " + (text || "Vui lòng phân tích và mô tả chi tiết bức ảnh này.");
  userParts.push({ text: textPart });

  if (image) {
    const parts = image.split(',');
    const mimeTypeMatch = parts[0].match(/data:(.*?);/);
    if (mimeTypeMatch && parts.length === 2) {
      userParts.push({
        inlineData: {
          mimeType: mimeTypeMatch[1],
          data: parts[1]
        }
      });
    } else {
      throw new Error("Lỗi định dạng ảnh Base64 không hợp lệ.");
    }
  }
  return userParts;
}

// ======== Dịch sang tiếng Anh (fallback: trả text gốc) ========
async function translateToEnglish(text) {
  if (!text) return "";
  // Nếu có Gemini key, dùng Gemini để dịch (như bạn yêu cầu ban đầu)
  if (GEMINI_API_KEY) {
    try {
      const promptTranslate = `Dịch văn bản sau sang tiếng Anh, chỉ trả về văn bản đã dịch. KHÔNG THÊM BẤT KỲ LỜI NÓI ĐẦU HAY LỜI KẾT NÀO.
Văn bản: "${text}"`;
      const contents = [{ role: "user", parts: [{ text: promptTranslate }] }];
      const response = await callGeminiModel(contents);
      if (response && !response.startsWith("❌")) {
        return response.replace(/^"|"$/g, '').trim();
      } else {
        return text;
      }
    } catch (err) {
      console.error("Lỗi dịch với Gemini:", err);
      return text;
    }
  }

  // Nếu không có GEMINI_API_KEY, fallback bằng MyMemory (miễn phí) — vẫn có thể bị giới hạn
  try {
    const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=vi|en";
    const r = await fetch(url);
    const d = await r.json();
    return d.responseData?.translatedText || text;
  } catch (e) {
    return text;
  }
}

// ============================================================
// 🖼️ API TẠO ẢNH (Pollinations - Có dịch đa ngôn ngữ)
// ============================================================
app.post("/api/pollinations-image", async (req, res) => {
  let { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });

  try {
    const translatedPrompt = await translateToEnglish(prompt);
    const safePrompt = encodeURIComponent(translatedPrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=1024&height=1024`;
    res.json({ imageUrl });
  } catch (error) {
    console.error("Lỗi Pollinations:", error);
    res.status(500).json({ message: "Không thể tạo ảnh." });
  }
});

// ============================================================
// 🎞️ API TẠO VIDEO (Pollinations -> 20 frames -> ffmpeg -> mp4)
// ============================================================
app.post("/api/pollinations-video", async (req, res) => {
  const { prompt, image } = req.body;
  if (!prompt && !image) return res.status(400).json({ message: "Vui lòng nhập mô tả hoặc tải ảnh." });

  try {
    const translatedPrompt = await translateToEnglish(prompt || "animation from image");
    const framesCount = 20; // số khung
    const framesDir = path.join(process.cwd(), "temp_frames");

    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

    // tạo 20 prompt biến thể để Pollinations sinh khác nhau
    const downloads = [];
    for (let i = 0; i < framesCount; i++) {
      const variation = `${translatedPrompt}, variation ${i + 1}, cinematic, high detail`;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(variation)}?nologo=true&width=512&height=512`;
      const outPath = path.join(framesDir, `frame_${i}.jpg`);
      // push promise download
      downloads.push(
        (async () => {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`Fetch frame failed: ${r.status}`);
          const buf = Buffer.from(await r.arrayBuffer());
          fs.writeFileSync(outPath, buf);
        })()
      );
    }

    // chờ tải tất cả frames
    await Promise.all(downloads);

    // ghép video bằng ffmpeg (lệnh dùng pattern index)
    const outputPath = path.join(process.cwd(), "temp_frames", `out_${Date.now()}.mp4`);
    // framerate có thể thay đổi (10..15)
    const ffmpegCmd = `ffmpeg -y -framerate 10 -i ${path.join(framesDir, "frame_%d.jpg")} -c:v libx264 -pix_fmt yuv420p ${outputPath}`;
    await new Promise((resolve, reject) => {
      exec(ffmpegCmd, (err, stdout, stderr) => {
        if (err) {
          console.error("ffmpeg error:", err, stderr);
          return reject(err);
        }
        resolve();
      });
    });

    // đọc file mp4 và trả về base64 data URL
    const videoBuf = fs.readFileSync(outputPath);
    const videoBase64 = videoBuf.toString("base64");
    const dataUrl = `data:video/mp4;base64,${videoBase64}`;

    // cleanup: xóa frames và mp4 (giữ an toàn)
    try {
      fs.readdirSync(framesDir).forEach(f => {
        const p = path.join(framesDir, f);
        fs.unlinkSync(p);
      });
      fs.rmdirSync(framesDir, { recursive: true, force: true });
    } catch (e) {
      // không quan trọng nếu xóa thất bại
      console.warn("Không xóa sạch temp_frames:", e);
    }

    res.json({ videoUrl: dataUrl });
  } catch (error) {
    console.error("❌ Lỗi tạo video:", error);
    res.status(500).json({ message: "Không thể tạo video." });
  }
});

// ============================================================
// 💬 CHAT (giữ nguyên behavior: highlight + short responses controlled by systemInstruction)
// ============================================================
app.post("/api/chat", async (req, res) => {
  const { message, history, language, image } = req.body;
  if (!message && !image) return res.status(400).json({ response: "Thiếu nội dung chat hoặc ảnh." });

  const languageMap = { 'vi': 'Tiếng Việt', 'en': 'English (Tiếng Anh)', 'zh-CN': '简体中文 (Tiếng Trung Giản thể)' };
  const langName = languageMap[language] || languageMap['vi'];

  const systemInstruction = `
Bạn là trợ lý AI thông minh, thân thiện. Hãy trả lời bằng **${langName}**.
- Trả lời **NGẮN GỌN, TRỌNG TÂM**, chỉ tập trung vào câu hỏi của người dùng.
- Nếu có ý chính/kết quả, hãy bọc trong <mark class="highlight">...</mark>.
- KHÔNG thêm giới thiệu/đoạn lan man.
- Nếu người dùng gửi ảnh, phân tích ảnh và trả lời dựa trên nội dung ảnh.
`;

  let contents = [];
  if (Array.isArray(history)) {
    history.forEach(item => {
      const role = item.role === "assistant" ? "model" : item.role;
      contents.push({ role: role, parts: [{ text: item.text }] });
    });
  }

  try {
    const userParts = buildContentParts(message, image, systemInstruction);
    contents.push({ role: "user", parts: userParts });
    const reply = await callGeminiModel(contents);
    res.json({ response: reply });
  } catch (error) {
    console.error("Lỗi xử lý chat:", error);
    res.status(500).json({ response: "❌ Lỗi xử lý dữ liệu chat trên server." });
  }
});

// ============================================================
// 🧮 GIẢI TOÁN (Ngắn gọn, LaTeX, Highlight, hỗ trợ ảnh)
// ============================================================
app.post("/api/math", async (req, res) => {
  const { question, image } = req.body;
  if (!question && !image) return res.status(400).json({ response: "Thiếu đề toán hoặc ảnh bài toán." });

  const systemInstruction = `
Hãy giải bài toán sau **ngắn gọn nhất có thể**, bằng tiếng Việt dễ hiểu.
- Chỉ hiển thị **bước chính** và **kết quả cuối cùng**.
- Viết công thức bằng LaTeX (dấu $...$).
- Tô màu vàng các kết quả và ý quan trọng bằng <mark class="highlight">...</mark>.
- Nếu có ảnh, hãy phân tích ảnh để giải bài toán trong ảnh.
`;

  try {
    const userParts = buildContentParts(question, image, systemInstruction);
    const contents = [{ role: "user", parts: userParts }];
    const reply = await callGeminiModel(contents);
    res.json({ response: reply });
  } catch (error) {
    console.error("Lỗi xử lý toán:", error);
    res.status(500).json({ response: "❌ Lỗi xử lý dữ liệu toán trên server." });
  }
});

// ============================================================
// 🚀 KHỞI ĐỘNG SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT} (Model: ${GEMINI_MODEL})`);
  if (!GEMINI_API_KEY) console.warn("⚠️ GEMINI_API_KEY chưa được thiết lập. Chat và giải toán sẽ không hoạt động!");
});
server.timeout = 300000;
