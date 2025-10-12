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

app.use(bodyParser.json());

// 🧠 Pollinations Image API
app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });

  try {
    const safePrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error("Lỗi Pollinations:", error);
    res.status(500).json({ message: "Không thể tạo ảnh." });
  }
});

// 💬 Gemini Chat + Math
app.post("/api/gemini", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Thiếu nội dung chat." });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "❌ Không có phản hồi từ Gemini.";

    res.json({ text });
  } catch (err) {
    console.error("Gemini error:", err);
    res.status(500).json({ text: "❌ Lỗi khi gọi Gemini API." });
  }
});

// Trang chính
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server chạy tại http://localhost:${PORT}`));
