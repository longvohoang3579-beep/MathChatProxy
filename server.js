import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import fs from "fs";
import { exec } from "child_process";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

// 🧱 Cấu hình
app.use(bodyParser.json({ limit: "20mb" }));
app.use(express.static("."));

// 🧩 API Dịch sang tiếng Anh (Pollinations hỗ trợ tốt hơn)
async function translateToEnglish(text) {
  if (!text) return "";
  try {
    const res = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=vi|en");
    const data = await res.json();
    return data.responseData.translatedText || text;
  } catch {
    return text;
  }
}

// ===========================================
// 🖼️ API TẠO ẢNH (Pollinations)
// ===========================================
app.post("/api/pollinations", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả." });
  const translatedPrompt = await translateToEnglish(prompt);
  const safePrompt = encodeURIComponent(translatedPrompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=512&height=512`;
  res.json({ imageUrl });
});

// ===========================================
// 🧮 API GIẢI TOÁN
// ===========================================
app.post("/api/math", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ answer: "Không có câu hỏi." });
  try {
    const result = eval(question.replace("^", "**"));
    res.json({ answer: `Kết quả: ${result}` });
  } catch {
    res.json({ answer: "Không hiểu đề bài. Hãy nhập lại bằng ký hiệu toán học chuẩn." });
  }
});

// ===========================================
// 💬 API CHAT
// ===========================================
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ reply: "Không có tin nhắn." });
  res.json({ reply: "🤖 AI: " + message.split(" ").reverse().join(" ") });
});

// ===========================================
// 🎞️ API TẠO VIDEO TỪ ẢNH HOẶC PROMPT
// ===========================================
app.post("/api/pollinations-video", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả." });

  try {
    const translatedPrompt = await translateToEnglish(prompt);
    const tempDir = "./temp_frames";
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const frameUrls = [];
    for (let i = 0; i < 20; i++) {
      const safePrompt = encodeURIComponent(`${translatedPrompt} frame ${i + 1}`);
      frameUrls.push(`https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=512&height=512`);
    }

    // tải ảnh
    const downloads = frameUrls.map(async (url, i) => {
      const imgRes = await fetch(url);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(path.join(tempDir, `frame_${i}.jpg`), buf);
    });
    await Promise.all(downloads);

    // ghép video
    const outputVideo = path.join(tempDir, "output.mp4");
    await new Promise((resolve, reject) => {
      exec(
        `ffmpeg -y -framerate 10 -pattern_type glob -i '${tempDir}/frame_*.jpg' -c:v libx264 -pix_fmt yuv420p ${outputVideo}`,
        (err) => (err ? reject(err) : resolve())
      );
    });

    const videoBase64 = fs.readFileSync(outputVideo).toString("base64");
    fs.rmSync(tempDir, { recursive: true, force: true });

    res.json({ videoUrl: `data:video/mp4;base64,${videoBase64}` });
  } catch (err) {
    console.error("❌ Lỗi:", err);
    res.status(500).json({ message: "Không thể tạo video." });
  }
});

// ===========================================
// 🚀 KHỞI ĐỘNG SERVER
// ===========================================
app.listen(PORT, () => console.log(`✅ Server chạy tại http://localhost:${PORT}`));
