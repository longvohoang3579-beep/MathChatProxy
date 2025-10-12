import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

// Khởi tạo các thành phần cần thiết
dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cấu hình middleware
app.use(bodyParser.json());

// ----------------------------------------------------------------
// -- CÁC ROUTE API --
// ----------------------------------------------------------------

// 🖼️ API TẠO ẢNH (Phần này đã hoạt động tốt)
app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });
  }

  try {
    const safePrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error("Lỗi Pollinations:", error);
    res.status(500).json({ message: "Không thể tạo ảnh." });
  }
});

// 💬 GEMINI CHAT + MATH (Phần đã sửa lỗi tên model)
app.post("/api/gemini", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ message: "Thiếu nội dung chat." });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("LỖI: Biến GEMINI_API_KEY không được tìm thấy trong file .env!");
    return res.status(500).json({ text: "❌ Lỗi cấu hình phía máy chủ." });
  }

  try {
    // SỬA LỖI Ở ĐÂY: Dùng tên model "gemini-1.0-pro"
    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=${apiKey}`;

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const data = await response.json();

    // In log để debug nếu cần
    console.log("Phản hồi từ Gemini API:", JSON.stringify(data, null, 2));

    if (data.error) {
      console.error("Google API trả về lỗi:", data.error.message);
      return res.status(400).json({ text: `❌ Lỗi từ Google: ${data.error.message}` });
    }

    if (!data.candidates || data.candidates.length === 0) {
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) {
        return res.json({ text: `❌ Yêu cầu bị chặn vì: ${blockReason}` });
      }
      return res.json({ text: "❌ Gemini không trả về kết quả nào." });
    }
    
    const text = data.candidates[0]?.content?.parts[0]?.text || "❓ Không tìm thấy nội dung.";
    res.json({ text });

  } catch (err) {
    console.error("Lỗi hệ thống khi gọi Gemini API:", err);
    res.status(500).json({ text: "❌ Lỗi hệ thống, không thể kết nối đến Gemini API." });
  }
});

// ----------------------------------------------------------------
// -- PHỤC VỤ TRANG WEB VÀ KHỞI ĐỘNG SERVER --
// ----------------------------------------------------------------

// Phục vụ file index.html cho trang chủ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});