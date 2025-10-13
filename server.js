import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Cần dòng này để lấy đường dẫn thật của thư mục hiện tại
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Cho phép đọc file tĩnh như index.html, CSS, JS, ảnh

// 🟢 Khi truy cập "/", gửi file index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 🧠 Chat API
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    // 👉 Ví dụ phản hồi tạm (bạn thay bằng Gemini sau)
    res.json({ response: `Bot nhận được: ${message}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🧮 Math API
app.post("/api/math", async (req, res) => {
  try {
    const { question } = req.body;
    res.json({ response: `Đáp án của "${question}" là 42 (ví dụ).` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🖼️ Pollinations Image
app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
  res.json({ imageUrl });
});

// 🎞️ Pollinations Video (mẫu giả lập, chưa cần ffmpeg)
app.post("/api/pollinations-video", async (req, res) => {
  try {
    res.json({ videoUrl: "https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🚀 Khởi động server
app.listen(port, () => {
  console.log(`✅ Server đang chạy tại: http://localhost:${port}`);
});
