import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static("."));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Khuyến nghị dùng model mới và hiệu quả cho chat: gemini-2.5-flash
const GEMINI_MODEL = "gemini-2.5-flash"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY chưa được thiết lập! Vui lòng tạo file .env và điền khóa API.");
}

/**
 * Hàm gọi API Gemini
 * @param {Array} contents 
 * @returns {Promise<string>}
 */
async function callGeminiModel(contents) {
  if (!GEMINI_API_KEY) return "❌ Lỗi: Vui lòng cung cấp GEMINI_API_KEY trong file .env.";
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });
    const data = await response.json();
    
    if (!response.ok) {
        console.error("❌ Lỗi từ Gemini API:", data);
        // YÊU CẦU 2: Cải tiến thông báo lỗi HTTP 404/khác
        const errorMessage = data.error?.message || 'Không có thông tin chi tiết. Vui lòng kiểm tra API Key và Project Google Cloud đã được kích hoạt dịch vụ Generative Language API chưa.';
        return `❌ Lỗi HTTP ${response.status} khi gọi Gemini: ${errorMessage}`;
    }
    
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
    return "❌ Không nhận được phản hồi hợp lệ từ Gemini.";
  } catch (error) {
    console.error("🔥 Lỗi kết nối đến Gemini:", error);
    return "❌ Lỗi kết nối đến Google Gemini. Vui lòng kiểm tra kết nối mạng của server.";
  }
}

/**
 * Xây dựng các phần nội dung cho API Gemini
 */
function buildContentParts(text, image, systemInstruction) {
  let parts = [{ text: `${systemInstruction}\n\nUser query: ${text || "Please analyze this image."}` }];
  if (image) {
    const [, mimeType, , data] = image.match(/data:(.*?);(.*?),(.*)/) || [];
    if (mimeType && data) {
      parts.push({ inlineData: { mimeType, data } });
    }
  }
  return parts;
}

/**
 * YÊU CẦU 1: Dịch prompt tạo ảnh sang Tiếng Anh
 * @param {string} text 
 * @returns {Promise<string>}
 */
async function translateToEnglish(text) {
    if (!text || /^[a-zA-Z0-9\s.,?!'-]*$/.test(text)) {
        return text;
    }
    try {
        // Sử dụng Google Translate API công cộng
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const data = await response.json();
        const translatedText = data[0].map(item => item[0]).join('');
        return translatedText || text;
    } catch (error) {
        console.error(" Lỗi dịch thuật, sử dụng văn bản gốc:", error.message);
        return text; 
    }
}

// =========================================================================
// API ENDPOINTS
// =========================================================================

app.post("/api/pollinations-image", async (req, res) => {
  let { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả." });
  try {
    // THỰC HIỆN DỊCH TRƯỚC KHI GỌI TẠO ẢNH
    const translatedPrompt = await translateToEnglish(prompt);
    const safePrompt = encodeURIComponent(translatedPrompt);
    // Pollinations.ai dùng tiếng Anh cho kết quả tốt nhất
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=1024&height=1024`;
    res.json({ imageUrl });
  } catch (error) {
    res.status(500).json({ message: "Không thể tạo ảnh." });
  }
});

app.post("/api/pollinations-frames", async (req, res) => {
    let { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả." });
    try {
        const translatedPrompt = await translateToEnglish(prompt);
        const safePrompt = encodeURIComponent(translatedPrompt);
        // API này sẽ trả về 10 frame hình ảnh base64 để tạo GIF
        const framesUrl = `https://image.pollinations.ai/prompt/${safePrompt}?frames=10&nologo=true&output_base64=true&width=512&height=512`;
        const response = await fetch(framesUrl);
        const data = await response.json();
        if (data.frames) {
            res.json({ frames: data.frames });
        } else {
            res.status(500).json({ message: "Không nhận được frames hợp lệ từ Pollinations." });
        }
    } catch (error) {
        res.status(500).json({ message: "Lỗi trong quá trình tạo frames video." });
    }
});


/**
 * Hàm xử lý chung cho các yêu cầu Gemini (chat/math)
 */
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
});