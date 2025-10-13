// ============================================================
// 🤖 AI PROXY SERVER (Gemini 2.5 Flash + Pollinations + Video)
// ============================================================

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import GIFEncoder from "gifencoder";
import { createCanvas, loadImage } from "canvas";

// ------------------------------------------------------------
dotenv.config();
const app = express();
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static("."));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// 🧠 CẤU HÌNH GEMINI (giữ nguyên phần cũ)
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

async function callGeminiModel(contents) {
  if (!GEMINI_API_KEY) return "❌ Thiếu GEMINI_API_KEY trong .env.";
  try {
    for (let i = 0; i < 3; i++) {
      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          return data.candidates[0].content.parts[0].text;
        }
        return "❌ Không có phản hồi hợp lệ từ Gemini.";
      }
      if (response.status === 429 || response.status >= 500) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
        continue;
      }
      return `❌ Lỗi HTTP ${response.status}`;
    }
  } catch (err) {
    console.error(err);
    return "❌ Lỗi kết nối Gemini";
  }
}

// ============================================================
// 🖼️ API TẠO ẢNH POLLINATIONS (GIỮ NGUYÊN)
// ============================================================
app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Thiếu mô tả ảnh" });
  try {
    const safe = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safe}?nologo=true&width=1024&height=1024`;
    res.json({ imageUrl });
  } catch {
    res.status(500).json({ message: "Lỗi Pollinations" });
  }
});

// ============================================================
// 🎬 API TẠO VIDEO TỪ ẢNH (NEW)
// ============================================================
app.post("/api/pollinations-video", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu ảnh đầu vào" });

    // Lưu ảnh gốc tạm thời
    const inputPath = path.join(__dirname, "input.png");
    const buffer = Buffer.from(imageBase64.split(",")[1], "base64");
    fs.writeFileSync(inputPath, buffer);

    // Tạo 5 biến thể Pollinations
    const variations = [];
    for (let i = 0; i < 5; i++) {
      const prompt = encodeURIComponent(`slightly different version ${i} of the image`);
      const pollUrl = `https://image.pollinations.ai/prompt/${prompt}?nologo=true&width=512&height=512`;
      const resp = await fetch(pollUrl);
      const arrBuf = await resp.arrayBuffer();
      const outPath = path.join(__dirname, `frame_${i}.png`);
      fs.writeFileSync(outPath, Buffer.from(arrBuf));
      variations.push(outPath);
    }

    // Gộp thành GIF động
    const encoder = new GIFEncoder(512, 512);
    const gifPath = path.join(__dirname, "output.gif");
    const gifStream = fs.createWriteStream(gifPath);
    encoder.createReadStream().pipe(gifStream);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(200);
    encoder.setQuality(10);

    const canvas = createCanvas(512, 512);
    const ctx = canvas.getContext("2d");

    for (const frame of variations) {
      const img = await loadImage(frame);
      ctx.drawImage(img, 0, 0, 512, 512);
      encoder.addFrame(ctx);
    }
    encoder.finish();

    gifStream.on("finish", () => {
      const base64 = fs.readFileSync(gifPath, { encoding: "base64" });
      res.json({ videoUrl: `data:image/gif;base64,${base64}` });

      // Xóa file tạm
      [inputPath, ...variations, gifPath].forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ Lỗi khi tạo video từ ảnh." });
  }
});

// ============================================================
// 🚀 KHỞI ĐỘNG SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server chạy tại http://localhost:${PORT}`)
);
