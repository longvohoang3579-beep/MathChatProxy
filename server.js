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
    if (!apiKey) {
      console.error("Thiếu GEMINI_API_KEY trong file .env");
      return res.status(500).json({ text: "❌ Lỗi cấu hình phía server." });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    const data = await response.json();

    // GHI LẠI TOÀN BỘ PHẢN HỒI TỪ GOOGLE ĐỂ DEBUG
    console.log("Phản hồi từ Gemini API:", JSON.stringify(data, null, 2));

    // Kiểm tra xem có lỗi từ API không
    if (data.error) {
      return res.status(500).json({ text: `❌ Lỗi từ Google: ${data.error.message}` });
    }

    // Kiểm tra xem nội dung có bị chặn vì lý do an toàn không
    if (!data.candidates || data.candidates.length === 0) {
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) {
        return res.json({ text: `❌ Nội dung bị chặn vì: ${blockReason}` });
      }
      return res.json({ text: "❌ Không có phản hồi từ Gemini." });
    }

    const text = data.candidates[0]?.content?.parts[0]?.text || "❓ Không tìm thấy nội dung trả lời.";
    res.json({ text });

  } catch (err) {
    console.error("Lỗi hệ thống khi gọi Gemini:", err);
    res.status(500).json({ text: "❌ Lỗi hệ thống khi gọi Gemini API." });
  }
});