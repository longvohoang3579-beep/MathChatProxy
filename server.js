import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(bodyParser.json());
app.use(express.static("."));

// --------------------------------------------------------------
// 🖼️ API TẠO ẢNH (Pollinations - hoạt động tốt)
// --------------------------------------------------------------
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

// --------------------------------------------------------------
// 💬 API CHAT & TOÁN - sử dụng Gemini v1
// --------------------------------------------------------------
async function callGeminiModel(prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;
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
      console.error("⚠️ Lỗi API:", data.error);
      return `❌ Lỗi từ Gemini API: ${data.error.message}`;
    }

    // kiểm tra phản hồi thực tế
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    } else {
      console.log("Phản hồi từ Gemini (debug):", JSON.stringify(data, null, 2));
      return "❌ Không có phản hồi hợp lệ từ Gemini.";
    }
  } catch (err) {
    console.error("❌ Lỗi kết nối đến Gemini:", err);
    return "❌ Không thể kết nối đến Gemini.";
  }
}

// 💬 Chat
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
  const prompt = `Hãy giải chi tiết bài toán sau bằng tiếng Việt: ${question}`;
  const reply = await callGeminiModel(prompt);
  res.json({ response: reply });
});

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
