// ============================================================
// 🤖 AI PROXY SERVER (Gemini 1.5 Flash + Pollinations + Video)
// ============================================================

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();

// ============================================================
// ⚙️ CẤU HÌNH MIDDLEWARE
// ============================================================
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static("."));

// ============================================================
// 🧠 CẤU HÌNH GEMINI
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// ✅ SỬA LỖI: Đổi model về gemini-1.5-flash và URL về v1, phiên bản ổn định nhất
const GEMINI_MODEL = "gemini-1.5-flash-latest"; 
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
        console.log("Phản hồi không hợp lệ từ Gemini:", JSON.stringify(data, null, 2));
        return "❌ Không có phản hồi văn bản hợp lệ từ Gemini.";
      }

      const errorText = await response.text();
      console.error(`❌ Lỗi HTTP ${response.status} từ Gemini API: ${errorText}`);

      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      // Trả về lỗi rõ ràng hơn cho client
      return `❌ Lỗi HTTP ${response.status} khi gọi Gemini. Vui lòng kiểm tra lại API Key và cấu hình project Google AI.`;
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
  const textPart = systemInstruction + "\n\nTin nhắn: " + (text || "Please analyze and describe this image in detail.");
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
  if (GEMINI_API_KEY) {
    try {
      const promptTranslate = `Translate the following text to English. Return ONLY the translated text, without any introductory phrases or explanations. Text: "${text}"`;
      const contents = [{ role: "user", parts: [{ text: promptTranslate }] }];
      const response = await callGeminiModel(contents);
      return (response && !response.startsWith("❌")) ? response.replace(/^"|"$/g, '').trim() : text;
    } catch (err) {
      console.error("Lỗi dịch với Gemini:", err);
      return text;
    }
  }
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

// ======== Hàm tải 1 khung hình với Retry ========
async function fetchFrameWithRetry(url, index, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const r = await fetch(url);
            if (r.ok) {
                const buffer = Buffer.from(await r.arrayBuffer());
                return `data:image/jpeg;base64,${buffer.toString("base64")}`;
            }
            if (attempt < maxRetries) {
                console.warn(`⚠️ Cảnh báo: Khung hình ${index} lỗi (HTTP ${r.status}). Thử lại lần ${attempt}/${maxRetries}.`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            } else {
                console.error(`❌ Lỗi tải khung hình ${index} sau ${maxRetries} lần thử (HTTP ${r.status}). Bỏ qua.`);
            }
        } catch (e) {
            if (attempt < maxRetries) {
                console.warn(`⚠️ Cảnh báo: Khung hình ${index} lỗi mạng. Thử lại lần ${attempt}/${maxRetries}. Chi tiết: ${e.message}`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            } else {
                console.error(`❌ Lỗi tải khung hình ${index} sau ${maxRetries} lần thử: ${e.message}. Bỏ qua.`);
            }
        }
    }
    return null;
}

// ============================================================
// 🎞️ API TẠO KHUNG HÌNH (Pollinations)
// ============================================================
app.post("/api/pollinations-frames", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả." });
  try {
    const translatedPrompt = await translateToEnglish(prompt);
    const framesCount = 12;
    console.log(`Bắt đầu tải ${framesCount} khung hình cho prompt: ${translatedPrompt}`);
    const downloadPromises = Array.from({ length: framesCount }, (_, i) => {
      const variation = `${translatedPrompt}, motion frame ${i + 1} of ${framesCount}, cinematic, high detail`;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(variation)}?nologo=true&width=512&height=512`;
      return fetchFrameWithRetry(url, i + 1);
    });
    const frames = await Promise.all(downloadPromises);
    const validFrames = frames.filter(f => f);
    if (validFrames.length < 8) {
      console.error(`❌ Chỉ tải được ${validFrames.length}/${framesCount} khung hình.`);
      return res.status(500).json({ message: "❌ Không thể tải đủ khung hình. Vui lòng thử lại." });
    }
    console.log(`✅ Đã tải thành công ${validFrames.length} khung hình.`);
    res.json({ frames: validFrames });
  } catch (error) {
    console.error("❌ Lỗi xử lý chung tạo khung hình Base64:", error);
    res.status(500).json({ message: "❌ Lỗi xử lý chung trên Server." });
  }
});

// ============================================================
// 💬 CHAT & 🧮 GIẢI TOÁN API
// ============================================================
async function handleGeminiRequest(req, res, systemInstruction) {
    const { message, question, image } = req.body;
    const text = message || question;
    if (!text && !image) return res.status(400).json({ response: "Thiếu nội dung hoặc ảnh." });

    try {
        const userParts = buildContentParts(text, image, systemInstruction);
        const contents = [{ role: "user", parts: userParts }];
        const reply = await callGeminiModel(contents);
        res.json({ response: reply });
    } catch (error) {
        console.error("Lỗi xử lý request Gemini:", error);
        res.status(500).json({ response: "❌ Lỗi xử lý dữ liệu trên server." });
    }
}

app.post("/api/chat", (req, res) => {
    const { language } = req.body;
    const languageMap = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' };
    const langName = languageMap[language] || languageMap['vi'];
    const systemInstruction = `
        Bạn là trợ lý AI thông minh, thân thiện. Hãy trả lời bằng **${langName}**.
        - Trả lời **NGẮN GỌN, TRỌNG TÂM**.
        - Nếu có ý chính/kết quả, hãy bọc trong <mark class="highlight">...</mark>.
        - Định dạng câu trả lời bằng markdown nếu cần (ví dụ: dùng dấu * cho danh sách).
    `;
    handleGeminiRequest(req, res, systemInstruction);
});

app.post("/api/math", (req, res) => {
    const systemInstruction = `
        Hãy giải bài toán sau **ngắn gọn nhất có thể**, bằng tiếng Việt.
        - Chỉ hiển thị **bước chính** và **kết quả cuối cùng**.
        - Viết công thức bằng LaTeX (dấu $...$ hoặc $$...$$).
        - Tô màu vàng kết quả quan trọng bằng <mark class="highlight">...</mark>.
    `;
    handleGeminiRequest(req, res, systemInstruction);
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