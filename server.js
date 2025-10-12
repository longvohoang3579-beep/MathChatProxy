import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(bodyParser.json());

// 🧠 Gọi Gemini API
async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  const data = await res.json();
  const output = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Không có phản hồi từ Gemini.";
  return output;
}

// ✅ API Chat đa năng
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const reply = await callGemini(message);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ message: "Lỗi chat đa năng." });
  }
});

// ✅ API Giải toán
app.post("/api/math", async (req, res) => {
  try {
    const { question } = req.body;
    const reply = await callGemini(`Giải bài toán sau chi tiết từng bước: ${question}`);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ message: "Lỗi giải toán." });
  }
});

// ✅ API Tạo ảnh
app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });

  try {
    const safePrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}`;
    res.json({ imageUrl });
  } catch {
    res.status(500).json({ message: "Không thể tạo ảnh từ Pollinations." });
  }
});

// ✅ Route giao diện
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ✅ Chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server chạy tại http://localhost:${PORT}`));
