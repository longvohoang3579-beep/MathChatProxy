// server.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(".")); // phục vụ file HTML / JS ở thư mục gốc

// ✅ API Chat Gemini
app.post("/api/gemini", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Thiếu nội dung chat." });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        }),
      }
    );

    const data = await response.json();

    // Kiểm tra phản hồi rõ ràng
    if (!data.candidates || data.candidates.length === 0) {
      console.error("Phản hồi từ Gemini:", JSON.stringify(data, null, 2));
      return res.json({ text: "❌ Không có phản hồi từ Gemini (có thể do API key hoặc giới hạn truy cập)." });
    }

    const text = data.candidates[0].content.parts
      .map(part => part.text)
      .join("\n");

    res.json({ text });
  } catch (err) {
    console.error("Gemini error:", err);
    res.status(500).json({ text: "❌ Lỗi khi gọi Gemini API." });
  }
});

// ✅ API tạo ảnh Pollinations (hoạt động tốt)
app.post("/api/pollinations", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Thiếu mô tả ảnh." });

  try {
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true`;
    res.json({ imageUrl });
  } catch (err) {
    console.error("Pollinations error:", err);
    res.status(500).json({ message: "❌ Lỗi khi tạo ảnh." });
  }
});

// ✅ Khởi chạy server
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
