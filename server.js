// ============================================================
// 🤖 AI PROXY SERVER (Gemini 2.5 Flash + Pollinations + Video)
// ============================================================

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
// Xóa: import fs from "fs";
// Xóa: import path from "path";
// Xóa: import { exec } from "child_process";

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
// 🖼️/🎞️ API TẠO KHUNG HÌNH (Pollinations -> 20 frames Base64)
// Endpoint mới, KHÔNG dùng FFmpeg.
// ============================================================
app.post("/api/pollinations-frames", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả." });

  try {
    // 1. Dịch prompt
    const translatedPrompt = await translateToEnglish(prompt);
    const framesCount = 20;

    // 2. Tạo 20 promises để fetch và convert Base64
    const downloadPromises = [];
    for (let i = 0; i < framesCount; i++) {
      const variation = `${translatedPrompt}, motion frame ${i + 1} of ${framesCount}, cinematic, high detail`;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(variation)}?nologo=true&width=512&height=512`;
      
      downloadPromises.push(
        (async () => {
            try {
                const r = await fetch(url);
                if (!r.ok) {
                    // Log cảnh báo và trả về null để Promise.all không bị dừng
                    console.warn(`⚠️ Cảnh báo: Khung hình thứ ${i+1} lỗi (HTTP ${r.status}). Bỏ qua.`);
                    return null; 
                }
                
                // Lấy ArrayBuffer, chuyển sang Buffer (Node.js)
                const buffer = Buffer.from(await r.arrayBuffer());
                
                // Chuyển Buffer sang Base64 Data URL (Mime type JPEG)
                return `data:image/jpeg;base64,${buffer.toString("base64")}`;
            } catch (e) {
                console.error(`❌ Lỗi tải hoặc chuyển đổi khung hình ${i+1}:`, e.message);
                return null; // Trả về null nếu có lỗi mạng hoặc lỗi buffer
            }
        })()
      );
    }

    // 3. Chờ tất cả frame tải xong
    const frames = await Promise.all(downloadPromises);
    
    // 4. Lọc bỏ frames lỗi (chỉ trả về frames hợp lệ)
    const validFrames = frames.filter(f => f && typeof f === 'string' && f.startsWith('data:image'));
    
    if (validFrames.length === 0) {
        // Nếu không có khung hình nào hợp lệ, trả lỗi chi tiết hơn
        return res.status(500).json({ message: "Không thể tải bất kỳ khung hình nào từ Pollinations. Vui lòng thử lại với prompt khác." });
    }
    
    // 5. Trả về mảng Base64 Data URL
    res.json({ frames: validFrames });

  } catch (error) {
    console.error("❌ Lỗi xử lý chung tạo khung hình Base64:", error);
    // Cải thiện thông báo lỗi chung
    res.status(500).json({ message: "❌ Lỗi xử lý chung trên Server. (Vui lòng kiểm tra console server để biết chi tiết)" });
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
