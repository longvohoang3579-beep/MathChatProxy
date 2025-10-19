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
const GEMINI_MODEL = "gemini-1.5-flash-latest"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY chưa được thiết lập trong .env. Chat và giải toán sẽ không hoạt động!");
}

async function callGeminiModel(contents) {
  if (!GEMINI_API_KEY) return "❌ Thiếu GEMINI_API_KEY trong .env.";
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Lỗi HTTP ${response.status} từ Gemini API: ${errorText}`);
        return `❌ Lỗi HTTP ${response.status} khi gọi Gemini. Vui lòng kiểm tra lại API Key và cấu hình project Google AI.`;
    }
    const data = await response.json();
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
    return "❌ Không có phản hồi văn bản hợp lệ từ Gemini.";
  } catch (error) {
    console.error("🔥 Lỗi khi gọi Gemini:", error);
    return "❌ Lỗi khi kết nối đến Google Gemini. (Kiểm tra server/mạng)";
  }
}

function buildContentParts(text, image, systemInstruction) {
  let userParts = [{ text: `${systemInstruction}\n\nUser query: ${text || "Please analyze this image."}` }];
  if (image) {
    const [, mimeType, , data] = image.match(/data:(.*?);(.*?),(.*)/);
    userParts.push({ inlineData: { mimeType, data } });
  }
  return userParts;
}

// ============================================================
//  G SỬA LỖI & NÂNG CẤP CHỨC NĂNG DỊCH
// ============================================================
async function translateToEnglish(text) {
    if (!text || !/[a-zA-Z]/.test(text) === false) { // Nếu không có text hoặc text đã là tiếng Anh
        return text;
    }
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const data = await response.json();
        // Dữ liệu trả về là một mảng phức tạp, ta chỉ cần lấy chuỗi đã dịch
        const translatedText = data[0].map(item => item[0]).join('');
        console.log(`✅ Đã dịch: "${text}" -> "${translatedText}"`);
        return translatedText || text;
    } catch (error) {
        console.error(" Lỗi dịch thuật:", error.message);
        return text; // Trả về văn bản gốc nếu có lỗi
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

// (Các API khác giữ nguyên, không cần thay đổi)
async function fetchFrameWithRetry(url, index, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const r = await fetch(url);
            if (r.ok) {
                const buffer = Buffer.from(await r.arrayBuffer());
                return `data:image/jpeg;base64,${buffer.toString("base64")}`;
            }
            console.warn(`⚠️ Khung hình ${index} lỗi (HTTP ${r.status}). Thử lại lần ${attempt}/${maxRetries}.`);
        } catch (e) {
            console.warn(`⚠️ Khung hình ${index} lỗi mạng. Thử lại lần ${attempt}/${maxRetries}.`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
    console.error(`❌ Bỏ qua khung hình ${index} sau ${maxRetries} lần thử.`);
    return null;
}

app.post("/api/pollinations-frames", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả." });
  try {
    const translatedPrompt = await translateToEnglish(prompt);
    const framesCount = 12;
    console.log(`Đang tải ${framesCount} khung hình cho: ${translatedPrompt}`);
    const downloadPromises = Array.from({ length: framesCount }, (_, i) => {
      const variation = `${translatedPrompt}, motion frame ${i + 1} of ${framesCount}, cinematic`;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(variation)}?nologo=true&width=512&height=512`;
      return fetchFrameWithRetry(url, i + 1);
    });
    const frames = (await Promise.all(downloadPromises)).filter(f => f);
    if (frames.length < 8) return res.status(500).json({ message: `Không thể tải đủ khung hình (${frames.length}/${framesCount}).` });
    res.json({ frames });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server khi tạo khung hình." });
  }
});

async function handleGeminiRequest(req, res, systemInstruction) {
    const { message, question, image } = req.body;
    const text = message || question;
    if (!text && !image) return res.status(400).json({ response: "Thiếu nội dung." });
    try {
        const userParts = buildContentParts(text, image, systemInstruction);
        const contents = [{ role: "user", parts: userParts }];
        const reply = await callGeminiModel(contents);
        res.json({ response: reply });
    } catch (error) {
        res.status(500).json({ response: "Lỗi xử lý dữ liệu trên server." });
    }
}

app.post("/api/chat", (req, res) => {
    const { language } = req.body;
    const langName = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' }[language] || 'Tiếng Việt';
    const systemInstruction = `Bạn là trợ lý AI. Trả lời bằng **${langName}**. Trả lời **NGẮN GỌN**, định dạng markdown, và highlight ý chính bằng <mark class="highlight">...</mark>.`;
    handleGeminiRequest(req, res, systemInstruction);
});

app.post("/api/math", (req, res) => {
    const systemInstruction = `Giải bài toán bằng tiếng Việt. Chỉ hiển thị **bước chính** và **kết quả cuối cùng**. Dùng LaTeX cho công thức ($...$) và <mark class="highlight">...</mark> cho kết quả.`;
    handleGeminiRequest(req, res, systemInstruction);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT} (Model: ${GEMINI_MODEL})`);
  if (!GEMINI_API_KEY) console.warn("⚠️ GEMINI_API_KEY chưa được thiết lập!");
});