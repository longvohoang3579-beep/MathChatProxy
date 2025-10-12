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

// 💬 GEMINI CHAT + MATH (Phần được viết lại để tìm lỗi)
app.post("/api/gemini", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ message: "Thiếu nội dung chat." });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // 1. KIỂM TRA XEM API KEY CÓ TỒN TẠI TRONG .env KHÔNG
  if (!apiKey) {
    console.error("LỖI NGHIÊM TRỌNG: Biến GEMINI_API_KEY không được tìm thấy trong file .env!");
    return res.status(500).json({ text: "❌ Lỗi cấu hình phía máy chủ: Thiếu API Key." });
  }

  try {
    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const data = await response.json();

    // 2. IN TOÀN BỘ PHẢN HỒI TỪ GOOGLE RA CONSOLE ĐỂ DEBUG
    // Đây là bước quan trọng nhất để tìm ra lỗi!
    console.log("--- PHẢN HỒI ĐẦY ĐỦ TỪ GEMINI API ---");
    console.log(JSON.stringify(data, null, 2));
    console.log("------------------------------------");

    // 3. KIỂM TRA CỤ THỂ CÁC TRƯỜNG HỢP LỖI MÀ GOOGLE TRẢ VỀ
    if (data.error) {
      console.error("Google API trả về lỗi:", data.error.message);
      return res.status(400).json({ text: `❌ Lỗi từ Google: ${data.error.message}` });
    }

    // 4. KIỂM TRA NỘI DUNG BỊ CHẶN VÌ LÝ DO AN TOÀN
    if (!data.candidates || data.candidates.length === 0) {
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) {
        console.warn(`Yêu cầu bị chặn vì lý do: ${blockReason}`);
        return res.json({ text: `❌ Yêu cầu của bạn đã bị chặn vì lý do an toàn: ${blockReason}` });
      }
      return res.json({ text: "❌ Gemini không trả về kết quả nào." });
    }
    
    // 5. TRƯỜNG HỢP THÀNH CÔNG
    const text = data.candidates[0]?.content?.parts[0]?.text || "❓ Không tìm thấy nội dung văn bản trong phản hồi.";
    res.json({ text });

  } catch (err) {
    console.error("Lỗi hệ thống khi cố gắng gọi Gemini API:", err);
    res.status(500).json({ text: "❌ Lỗi hệ thống, không thể kết nối đến Gemini API." });
  }
});

// Trang chính
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server chạy tại http://localhost:${PORT}`));