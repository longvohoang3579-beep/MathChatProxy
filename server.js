import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

// Cấu hình môi trường (đọc .env)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Sử dụng model mới nhất và ổn định
const GEMINI_MODEL = "gemini-2.5-flash"; 

// Middleware
app.use(bodyParser.json());
// Phục vụ các file tĩnh (HTML, CSS, JS) từ thư mục gốc
app.use(express.static("."));

// =============================================================
// 🖼️ API TẠO ẢNH (Pollinations - Giữ nguyên)
// =============================================================
app.post("/api/pollinations-image", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });

    try {
        const safePrompt = encodeURIComponent(prompt);
        // Endpoint Pollinations
        const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=1024&height=1024`;
        res.json({ imageUrl });
    } catch (error) {
        console.error("Lỗi Pollinations:", error);
        res.status(500).json({ message: "Không thể tạo ảnh." });
    }
});

// =============================================================
// 💬 API CHAT & TOÁN - Sử dụng Gemini v2.5 Flash
// =============================================================

/**
 * Hàm gọi chung đến Gemini API để lấy phản hồi văn bản.
 */
async function callGeminiModel(prompt) {
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("⚠️ Lỗi Gemini API:", data.error);
            return `❌ Lỗi từ Gemini API: ${data.error.message}.`;
        }

        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        } else {
            console.log("Phản hồi từ Gemini (debug):", JSON.stringify(data, null, 2));
            return "❌ Không có phản hồi hợp lệ từ Gemini. Nội dung có thể bị chặn.";
        }
    } catch (err) {
        console.error("❌ Lỗi kết nối đến Gemini:", err);
        return "❌ Không thể kết nối đến Gemini.";
    }
}

// 💬 Chat API (ĐÃ CẬP NHẬT)
app.post("/api/chat", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ response: "Thiếu nội dung chat." });
    
    // 💡 Yêu cầu rút gọn và highlight ý chính
    const prompt = `Hãy trả lời tin nhắn sau một cách ngắn gọn, không quá 3 đoạn văn. Sử dụng Markdown để **in đậm** (highlight) những ý chính quan trọng nhất. Tin nhắn: ${message}`;
    
    const reply = await callGeminiModel(prompt);
    res.json({ response: reply });
});

// 🧮 Giải toán API (ĐÃ CẬP NHẬT)
app.post("/api/math", async (req, res) => {
    const { question } = req.body;
    if (!question) return res.status(400).json({ response: "Thiếu đề toán." });
    
    // 💡 Yêu cầu dùng LaTeX, rút gọn và highlight ý chính
    const prompt = `Hãy giải chi tiết bài toán sau bằng tiếng Việt. **Sử dụng ký hiệu LaTeX** (bên trong cặp dấu $) cho tất cả các biểu thức toán học. Trình bày các **bước giải chính thật ngắn gọn** và dùng **in đậm** để làm nổi bật các công thức hoặc kết quả quan trọng. Bài toán: ${question}`;
    
    const reply = await callGeminiModel(prompt);
    res.json({ response: reply });
});

// =============================================================
// 🚀 Khởi động Server
// =============================================================
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT} (Sử dụng model: ${GEMINI_MODEL})`);
});