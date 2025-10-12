import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(bodyParser.json());
app.use(express.static(".")); // cho phép truy cập index.html

// --------------------------------------------------------------
// 🖼️ API TẠO ẢNH (Pollinations - đã hoạt động tốt, nologo)
// --------------------------------------------------------------
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

// --------------------------------------------------------------
// 💬 API CHAT VÀ TOÁN (Gemini 1.5 Pro)
// --------------------------------------------------------------
async function callGeminiModel(prompt) {
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=" + GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();

    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    } else {
      console.error("❌ Phản hồi Gemini không hợp lệ:", data);
      return "❌ Không có phản hồi hợp lệ từ Gemini.";
    }
  } catch (err) {
    console.error("❌ Lỗi từ Gemini:", err);
    return "❌ Lỗi khi kết nối đến Gemini.";
  }
}

// 💬 Chat thường
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ response: "Thiếu nội dung chat." });
  const reply = await callGeminiModel(message);
  res.json({ response: reply });
});

// 🧮 Giải toán
app.post("/api/math", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ response: "Thiếu đề toán." });

  const prompt = `Hãy giải chi tiết và trình bày rõ ràng bài toán sau (bằng tiếng Việt): ${question}`;
  const reply = await callGeminiModel(prompt);
  res.json({ response: reply });
});

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
