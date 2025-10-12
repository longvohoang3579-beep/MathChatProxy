// server.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(".")); // phục vụ file giao diện cùng thư mục

// ✅ API CHAT & GIẢI TOÁN (Gemini)
app.post("/api/gemini", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ text: "⚠️ Thiếu nội dung để xử lý." });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ]
      }),
    });

    const data = await response.json();

    // Nếu API phản hồi lỗi
    if (data.error) {
      console.error("❌ Lỗi từ Gemini:", data.error);
      return res.json({ text: `❌ Lỗi Gemini: ${data.error.message}` });
    }

    // Nếu không có candidate nào
    if (!data.candidates || data.candidates.length === 0) {
      console.error("⚠️ Phản hồi không có nội dung:", JSON.stringify(data, null, 2));
      return res.json({ text: "❌ Không có phản hồi từ Gemini." });
    }

    // ✅ Lấy phần text trả về
    const text = data.candidates[0].content.parts
      .map(p => p.text)
      .join("\n");

    res.json({ text });
  } catch (err) {
    console.error("🔥 Lỗi kết nối Gemini:", err);
    res.status(500).json({ text: "❌ Lỗi khi gọi Gemini API." });
  }
});

// ✅ API TẠO ẢNH (Pollinations)
app.post("/api/pollinations", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "⚠️ Thiếu mô tả ảnh." });

  try {
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true&crop=1`;
    res.json({ imageUrl });
  } catch (err) {
    console.error("🔥 Lỗi Pollinations:", err);
    res.status(500).json({ message: "❌ Không thể tạo ảnh." });
  }
});

// ✅ Khởi động server
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
});
