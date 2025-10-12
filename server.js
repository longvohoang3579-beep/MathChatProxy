// server.js
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
app.use(express.static(".")); // phục vụ file index.html nếu có

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

// --------------------------------------------------------------
// 🖼️ API TẠO ẢNH (Pollinations - đã hoạt động tốt, thêm nologo)
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
// 💬 API CHAT & TOÁN (Gemini - sửa model và tự động fallback)
// --------------------------------------------------------------
app.post("/api/gemini", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ text: "Thiếu nội dung chat." });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      text: "❌ Lỗi: Không tìm thấy GEMINI_API_KEY trong file .env",
    });
  }

  // Danh sách model có thể dùng (ưu tiên từ trên xuống)
  const MODELS = [
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro-latest",
    "gemini-1.0-pro",
    "gemini-pro",
  ];

  // Thử lần lượt các model đến khi thành công
  let finalText = null;
  let lastError = null;

  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      });

      const data = await response.json();

      if (data.error) {
        lastError = data.error.message;
        console.warn(`⚠️ Lỗi từ model ${model}:`, lastError);
        continue;
      }

      finalText =
        data?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text)
          .join("\n") || null;

      if (finalText) {
        console.log(`✅ Dùng model: ${model}`);
        break;
      }
    } catch (err) {
      console.error(`❌ Lỗi hệ thống với model ${model}:`, err);
      lastError = err.message;
    }
  }

  if (!finalText) {
    return res.status(400).json({
      text: `❌ Lỗi từ Google Gemini: ${lastError || "Không có phản hồi hợp lệ."}`,
    });
  }

  res.json({ text: finalText });
});

// --------------------------------------------------------------
// 📜 ROUTE CHUNG - phục vụ trang chủ
// --------------------------------------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// --------------------------------------------------------------
// 🚀 KHỞI ĐỘNG SERVER
// --------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
});
