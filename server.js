// ============================================================
// 🤖 MATH CHAT PROXY SERVER (Gemini + Pollinations)
// ============================================================

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(bodyParser.json());

// 🧩 Phục vụ file tĩnh (index.html cùng thư mục)
app.use(express.static("."));

// ============================================================
// 🧠 CẤU HÌNH GEMINI 1.5
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// 💡 Sử dụng endpoint đúng cho gemini-1.5-flash
const GEMINI_MODEL = "gemini-1.5-flash"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

// Cảnh báo nếu thiếu API key
if (!GEMINI_API_KEY) {
  console.warn(
    "⚠️ WARNING: GEMINI_API_KEY chưa được thiết lập trong .env. Chat và giải toán sẽ không hoạt động!"
  );
}

// ======== 🔹 Hàm gọi Gemini API (ĐÃ SỬA LỖI) ========
async function callGeminiModel(prompt) {
  if (!GEMINI_API_KEY) return "❌ Thiếu GEMINI_API_KEY trong .env.";

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });

    // 💡 Xử lý lỗi HTTP trước khi parse JSON
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Lỗi HTTP ${response.status} từ Gemini API: ${errorText}`);
        return `❌ Lỗi HTTP ${response.status} khi gọi Gemini: ${errorText.substring(0, 100)}...`;
    }

    const data = await response.json();

    // 💡 Trích xuất văn bản an toàn và trực tiếp hơn
    if (data.candidates && 
        data.candidates[0] && 
        data.candidates[0].content && 
        data.candidates[0].content.parts && 
        data.candidates[0].content.parts[0] && 
        data.candidates[0].content.parts[0].text
    ) {
      return data.candidates[0].content.parts[0].text;
    } 
    
    // Xử lý lỗi API trong phản hồi JSON (ví dụ: API Key sai)
    if (data.error) {
        console.error("❌ Lỗi API từ Gemini:", data.error);
        return `❌ Lỗi API từ Gemini: ${data.error.message}`;
    }

    console.log("Phản hồi Gemini không hợp lệ (Debug):", JSON.stringify(data, null, 2));
    return "❌ Không có phản hồi văn bản hợp lệ từ Gemini.";

  } catch (error) {
    console.error("🔥 Lỗi khi gọi Gemini:", error);
    return "❌ Lỗi khi kết nối đến Google Gemini.";
  }
}

// ============================================================
// 🖼️ API TẠO ẢNH (Pollinations - Giữ nguyên)
// ============================================================
app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });

  try {
    const safePrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=1024&height=1024`;
    res.json({ imageUrl });
  } catch (error) {
    console.error("Lỗi Pollinations:", error);
    res.status(500).json({ message: "Không thể tạo ảnh." });
  }
});

// ============================================================
// 💬 CHAT TỔNG HỢP (highlight vàng - Giữ nguyên Prompt)
// ============================================================
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ response: "Thiếu nội dung chat." });

  const prompt = `
  Bạn là trợ lý AI thông minh, trả lời bằng tiếng Việt, thân thiện, ngắn gọn. 
  Nếu có ý chính, hãy bọc trong <mark class="highlight">...</mark> để tô màu vàng.
  ${message}
  `;

  const reply = await callGeminiModel(prompt);
  res.json({ response: reply });
});

// ============================================================
// 🧮 GIẢI TOÁN (ngắn gọn, LaTeX, highlight vàng - Giữ nguyên Prompt)
// ============================================================
app.post("/api/math", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ response: "Thiếu đề toán." });

  const prompt = `
  Hãy giải bài toán sau **ngắn gọn nhất có thể**, bằng tiếng Việt dễ hiểu. 
  - Chỉ hiển thị **bước chính** và **kết quả cuối cùng**.
  - Viết công thức bằng LaTeX (dấu $...$).
  - Tô màu vàng các kết quả và ý quan trọng bằng <mark class="highlight">...</mark>.
  Bài toán: ${question}
  `;

  const reply = await callGeminiModel(prompt);
  res.json({ response: reply });
});

// ============================================================
// 🚀 KHỞI ĐỘNG SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
  if (!GEMINI_API_KEY)
    console.warn(
      "⚠️ GEMINI_API_KEY chưa được thiết lập. Chat và giải toán sẽ không hoạt động!"
    );
});