import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();

// Xử lý đường dẫn tuyệt đối
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cấu hình middleware
app.use(bodyParser.json());

// ======================================================
// 🖼️ API TẠO ẢNH — ĐANG CHẠY TỐT, GIỮ NGUYÊN
// ======================================================
app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });
  }

  try {
    const safePrompt = encodeURIComponent(prompt);
    // Thêm nologo + crop để che watermark tự nhiên
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&crop=1`;
    res.json({ imageUrl });
  } catch (error) {
    console.error("Lỗi Pollinations:", error);
    res.status(500).json({ message: "Không thể tạo ảnh." });
  }
});

// ======================================================
// 💬 API GEMINI CHAT & GIẢI TOÁN (SỬA DỨT ĐIỂM)
// ======================================================
app.post("/api/gemini", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Thiếu nội dung chat." });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("⚠️ Thiếu GEMINI_API_KEY trong file .env");
    return res.status(500).json({ text: "❌ Thiếu cấu hình API key." });
  }

  try {
    // ✅ Model chính thức cho AI Studio (free key)
    const apiEndpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

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

    // Kiểm tra lỗi từ Google API
    if (data.error) {
      console.error("❌ Google API trả về lỗi:", data.error);
      return res.status(400).json({ text: `❌ Lỗi từ Google: ${data.error.message}` });
    }

    // Trích nội dung trả lời
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "❌ Không có phản hồi từ Gemini.";
    res.json({ text });

  } catch (err) {
    console.error("🔥 Lỗi hệ thống khi gọi Gemini API:", err);
    res.status(500).json({ text: "❌ Lỗi hệ thống hoặc kết nối thất bại." });
  }
});

// ======================================================
// 🌐 TRANG WEB GỐC
// ======================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ======================================================
// 🚀 KHỞI ĐỘNG SERVER
// ======================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
