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
app.use(express.static("public"));

// ============================================================
// 🧠 CẤU HÌNH GEMINI
// ============================================================
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";

// ======== 🔹 Hàm gọi Gemini API ========
async function callGeminiModel(prompt) {
  if (!GEMINI_API_KEY) return "❌ Thiếu GOOGLE_API_KEY trong .env.";

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      }),
    });

    const data = await response.json();

    if (!data.candidates || !data.candidates[0].content.parts[0].text) {
      console.error("❌ Lỗi từ Google Gemini:", data);
      return "❌ Không có phản hồi hợp lệ từ Gemini.";
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("🔥 Lỗi khi gọi Gemini:", error);
    return "❌ Lỗi khi kết nối đến Google Gemini.";
  }
}

// ============================================================
// 🖼️ API TẠO ẢNH (Pollinations - giữ nguyên như yêu cầu)
// ============================================================
app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });
  }

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
// 💬 CHAT TỔNG HỢP
// ============================================================
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ response: "Thiếu nội dung chat." });
  }

  const prompt = `
  Bạn là trợ lý AI thông minh, trả lời bằng tiếng Việt, thân thiện, ngắn gọn. 
  Nếu có ý chính, hãy bọc trong <mark class="highlight">...</mark> để tô màu vàng.
  ${message}
  `;

  const reply = await callGeminiModel(prompt);
  res.json({ response: reply });
});

// ============================================================
// 🧮 GIẢI TOÁN (ngắn gọn, có công thức & highlight)
// ============================================================
app.post("/api/math", async (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ response: "Thiếu đề toán." });
  }

  const prompt = `
  Hãy giải **ngắn gọn và dễ hiểu** bài toán sau bằng tiếng Việt. 
  - Chỉ hiển thị bước chính và kết quả cuối.
  - Viết công thức bằng LaTeX (dấu $...$).
  - Dùng Markdown + <mark class="highlight">...</mark> để tô màu vàng các ý chính hoặc kết quả.
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
});
