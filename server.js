import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

ffmpeg.setFfmpegPath(ffmpegPath);
const PORT = process.env.PORT || 3000;

// =======================
// 🧠 Chat (mẫu offline đơn giản)
// =======================
app.post("/api/chat", (req, res) => {
  const { message } = req.body;
  const reply =
    message.includes("AI") || message.includes("ứng dụng")
      ? "🌟 <mark>Một số ứng dụng AI nổi bật là ChatGPT, Midjourney, Pollinations và Leonardo AI.</mark>"
      : "💬 <mark>Tôi đã nhận được câu hỏi của bạn, vui lòng nói rõ hơn nhé!</mark>";
  res.json({ reply });
});

// =======================
// 📐 Giải toán (logic đơn giản không AI)
// =======================
app.post("/api/math", (req, res) => {
  const { problem } = req.body;
  try {
    // Thử tính toán đơn giản
    let result = eval(problem);
    res.json({
      result: `✅ <mark>Kết quả: ${result}</mark>`,
      explanation: `📘 Giải thích: Đây là phép tính cơ bản của biểu thức "${problem}".`,
    });
  } catch {
    res.json({
      result: "⚠️ Không hiểu đề bài. Hãy nhập lại bằng ký hiệu toán học chuẩn.",
    });
  }
});

// =======================
// 🎨 Tạo ảnh qua Pollinations
// =======================
app.post("/api/image", async (req, res) => {
  const { prompt } = req.body;
  try {
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
    res.json({ imageUrl });
  } catch (err) {
    console.error(err);
    res.json({ error: "⚠️ Không thể tạo ảnh." });
  }
});

// =======================
// 🎬 Tạo video từ ảnh Pollinations
// =======================
app.post("/api/video", async (req, res) => {
  const { prompt } = req.body;
  const framesDir = path.join("frames");

  try {
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir);

    const frameCount = 5;
    const imagePaths = [];

    // Tạo 5 ảnh
    for (let i = 1; i <= frameCount; i++) {
      const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + " khung " + i)}`;
      const response = await fetch(imgUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      const filePath = path.join(framesDir, `frame${i}.png`);
      fs.writeFileSync(filePath, buffer);
      imagePaths.push(filePath);
    }

    // Ghép ảnh thành video
    const outputVideo = path.join("public", "video.mp4");
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(path.join(framesDir, "frame%d.png"))
        .inputFPS(1)
        .outputOptions(["-vf scale=640:-1", "-pix_fmt yuv420p"])
        .on("end", resolve)
        .on("error", reject)
        .save(outputVideo);
    });

    // Xóa ảnh sau khi ghép
    fs.rmSync(framesDir, { recursive: true, force: true });

    res.json({ videoUrl: "/video.mp4" });
  } catch (error) {
    console.error("❌ Lỗi tạo video:", error);
    res.json({ error: "❌ Không thể tạo video." });
  }
});

// =======================
app.listen(PORT, () => console.log(`🚀 Server đang chạy tại cổng ${PORT}`));
