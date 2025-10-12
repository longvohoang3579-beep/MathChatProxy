import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

// Khởi tạo
dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.json());

// ----------------------------------------------------------------
// 🖼️ API TẠO ẢNH (KHÔNG ĐỔI — GIỮ NGUYÊN)
// ----------------------------------------------------------------
app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });

  try {
    const safePrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&crop=1`;
    res.json({ imageUrl });
  } catch (error) {
    console.error("Lỗi Pollinations:", error);
    res.status(500).json({ message: "Không thể tạo ảnh." });
  }
});

// ----------------------------------------------------------------
// 💬 GEMINI CHAT + TOÁN (SỬA MODEL CHUẨN CHO AI STUDIO)
// ----------------------------------------------------------------
app.post("/api/gemini", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Thiếu nội dung chat." });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("⚠️ Không tìm thấy GEMINI_API_KEY trong .env");
    return res.status(500).json({ text: "❌ Thiếu cấu hình API key." });
  }

  try {
    // ✅ Model tương thích 100% với key miễn phí của Google AI Studio
    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

    const response = await fetch(apiEndpoint, {
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
    console.log("🔎 Phản hồi từ Gemini:", JSON.stringify(data, null, 2));

    if (data.error) {
      console.error("❌ Google API lỗi:", data.error);
      return res.status(400).json({ text: `❌ Lỗi từ Google: ${data.error.message}` });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Không có phản hồi từ Gemini.";
    res.json({ text });

  } catch (err) {
    console.error("🔥 Lỗi hệ thống khi gọi Gemini API:", err);
    res.status(500).json({ text: "❌ Lỗi hệ thống hoặc kết nối thất bại." });
  }
});

// ----------------------------------------------------------------
// 🌐 TRANG WEB
// ----------------------------------------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ----------------------------------------------------------------
// 🚀 KHỞI ĐỘNG
// ----------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
