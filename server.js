import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

// Cấu hình môi trường (đọc .env)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Model mới nhất, nhanh và ổn định, tương thích với API v1
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
 * Chấp nhận mảng contents để hỗ trợ lịch sử chat.
 * @param {Array} contents Mảng lịch sử chat hoặc prompt đơn.
 * @returns {Promise<string>} Phản hồi từ model hoặc thông báo lỗi.
 */
async function callGeminiModel(contents) { 
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // body giờ là mảng contents
            body: JSON.stringify({ contents: contents }) 
        });

        const data = await response.json();

        if (data.error) {
            console.error("⚠️ Lỗi Gemini API:", data.error);
            return `❌ Lỗi từ Gemini API: ${data.error.message}. (Model: ${GEMINI_MODEL})`;
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

// 💬 Chat API (HỖ TRỢ CHAT LIÊN TỤC & HIGHLIGHT)
app.post("/api/chat", async (req, res) => {
    const { message, history } = req.body; // Nhận tin nhắn mới và lịch sử từ client
    if (!message) return res.status(400).json({ response: "Thiếu nội dung chat." });

    // 1. Định nghĩa System Instruction
    const systemInstruction = "Hãy trả lời tin nhắn sau một cách **cực kỳ ngắn gọn**, chỉ tập trung vào **trọng tâm** và không được dài hơn 2 đoạn văn. **Bắt buộc** sử dụng Markdown để **in đậm** (highlight) những từ khóa hoặc ý chính quan trọng nhất.";
    
    // 2. Tạo mảng contents
    let contents = [];
    
    // 3. Đưa lịch sử chat vào mảng contents (Chuyển "assistant" thành "model")
    // Client gửi { role: "user/assistant", text: "..." }
    history.forEach(item => {
        contents.push({
            role: item.role === "user" ? "user" : "model",
            parts: [{ text: item.text }]
        });
    });
    
    // 4. Gắn system instruction vào tin nhắn người dùng cuối cùng (tin nhắn mới nhất)
    // Lấy tin nhắn người dùng cuối cùng (tin nhắn mới nhất)
    const lastUserIndex = contents.length - 1;
    if (contents[lastUserIndex].role === "user") {
         // Thêm system instruction và prompt mới vào tin nhắn user cuối cùng
        contents[lastUserIndex].parts[0].text = systemInstruction + "\n\nTin nhắn: " + message;
    }

    const reply = await callGeminiModel(contents);
    res.json({ response: reply });
});

// 🧮 Giải toán API (HỖ TRỢ LATEX & HIGHLIGHT)
app.post("/api/math", async (req, res) => {
    const { question } = req.body;
    if (!question) return res.status(400).json({ response: "Thiếu đề toán." });
    
    // Yêu cầu dùng LaTeX, rút gọn các bước, và highlight kết quả
    const prompt = `Hãy giải bài toán sau bằng tiếng Việt. **BẮT BUỘC** sử dụng ký hiệu LaTeX (bên trong cặp dấu $) cho tất cả các biểu thức toán học. Trình bày lời giải theo các **bước CỰC KỲ NGẮN GỌN**, chỉ nêu các phép tính và lý do chính. Dùng **in đậm** để làm nổi bật **kết quả cuối cùng** và các **công thức quan trọng**. Bài toán: ${question}`;
    
    // Tạo cấu trúc contents cho bài toán
    const contents = [{ role: "user", parts: [{ text: prompt }] }];
    
    const reply = await callGeminiModel(contents); // Truyền contents thay vì prompt
    res.json({ response: reply });
});

// =============================================================
// 🚀 Khởi động Server
// =============================================================
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT} (Sử dụng model: ${GEMINI_MODEL})`);
});