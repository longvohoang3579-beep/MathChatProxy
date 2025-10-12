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

// 🖼️ API TẠO ẢNH (Phần này đã OK, giữ nguyên)
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

// 💬 GEMINI CHAT + MATH (Đã sửa lỗi tên model)
app.post("/api/gemini", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ message: "Thiếu nội dung chat." });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("LỖI NGHIÊM TRỌNG: Biến GEMINI_API_KEY không được tìm thấy trong file .env!");
    return res.status(500).json({ text: "❌ Lỗi cấu hình phía máy chủ: Thiếu API Key." });
  }

  try {
    // SỬA LỖI Ở ĐÂY: Đổi "gemini-pro" thành "gemini-1.0-pro"
    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=${apiKey}`;

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const data = await response.json();
    console.log("Phản hồi đầy đủ từ Gemini API:", JSON.stringify(data, null, 2));

    if (data.error) {
      console.error("Google API trả về lỗi:", data.error.message);
      return res.status(400).json({ text: `❌ Lỗi từ Google: ${data.error.message}` });
    }

    if (!data.candidates || data.candidates.length === 0) {
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) {
        console.warn(`Yêu cầu bị chặn vì lý do: ${blockReason}`);
        return res.json({ text: `❌ Yêu cầu của bạn đã bị chặn vì lý do an toàn: ${blockReason}` });
      }
      return res.json({ text: "❌ Gemini không trả về kết quả nào." });
    }
    
    const text = data.candidates[0]?.content?.parts[0]?.text || "❓ Không tìm thấy nội dung văn bản trong phản hồi.";
    res.json({ text });

  } catch (err) {
    console.error("Lỗi hệ thống khi cố gắng gọi Gemini API:", err);
    res.status(500).json({ text: "❌ Lỗi hệ thống, không thể kết nối đến Gemini API." });
  }
});