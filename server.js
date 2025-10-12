import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

// --------------------------------------------------------------
// ⚙️ Cấu hình cơ bản
// --------------------------------------------------------------
dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(bodyParser.json());

// --------------------------------------------------------------
// 🖼️ API TẠO ẢNH (Pollinations - giữ nguyên, thêm nologo)
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
// 💬 API CHAT (Gemini 1.5 Flash - đã fix định dạng)
// --------------------------------------------------------------
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ response: "❌ Vui lòng nhập nội dung chat." });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ response: "❌ Thiếu GEMINI_API_KEY trong .env." });

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: message }],
          },
        ],
      }),
    });

    const data = await response.json();
    console.log("🧠 Gemini chat response:", JSON.stringify(data, null, 2));

    if (data.error) {
      return res.json({ response: `❌ Lỗi từ Gemini: ${data.error.message}` });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Không có phản hồi từ Gemini.";
    res.json({ response: text });
  } catch (error) {
    console.error("Lỗi gọi Gemini (chat):", error);
    res.json({ response: "❌ Không thể kết nối đến Gemini API." });
  }
});

// --------------------------------------------------------------
// 🧮 API GIẢI TOÁN (Gemini 1.5 Flash - đã fix định dạng)
// --------------------------------------------------------------
app.post("/api/math", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ response: "❌ Vui lòng nhập câu hỏi toán." });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ response: "❌ Thiếu GEMINI_API_KEY trong .env." });

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const prompt = `Giải chi tiết bài toán sau, trình bày từng bước, giải thích ngắn gọn:\n\n${question}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    const data = await response.json();
    console.log("🧮 Gemini math response:", JSON.stringify(data, null, 2));

    if (data.error) {
      return res.json({ response: `❌ Lỗi từ Gemini: ${data.error.message}` });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Không có phản hồi từ Gemini.";
    res.json({ response: text });
  } catch (error) {
    console.error("Lỗi gọi Gemini (math):", error);
    res.json({ response: "❌ Không thể kết nối đến Gemini API." });
  }
});

// --------------------------------------------------------------
// 🌐 GIAO DIỆN CHÍNH
// --------------------------------------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// --------------------------------------------------------------
// 🚀 KHỞI ĐỘNG SERVER
// --------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server đang chạy tại http://localhost:${PORT}`));
