import express from "express";
import fetch from "node-fetch";
import translate from "@vitalets/google-translate-api";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(__dirname)); // cho phép truy cập file tĩnh (html, css, js)

// === ROUTES CƠ BẢN ===
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/chat.html", (req, res) => {
  res.sendFile(path.join(__dirname, "chat.html"));
});

app.get("/math.html", (req, res) => {
  res.sendFile(path.join(__dirname, "math.html"));
});

app.get("/image.html", (req, res) => {
  res.sendFile(path.join(__dirname, "image.html"));
});

app.get("/video.html", (req, res) => {
  res.sendFile(path.join(__dirname, "video.html"));
});

// === XỬ LÝ CHAT THƯỜNG ===
app.post("/api/chat", async (req, res) => {
  const { prompt } = req.body;
  try {
    // Dịch sang tiếng Anh để AI hiểu tốt hơn
    const translated = await translate(prompt, { to: "en" });
    const englishPrompt = translated.text;

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-tiny",
        messages: [{ role: "user", content: englishPrompt }],
      }),
    });

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Dịch lại về tiếng Việt
    const translatedResponse = await translate(aiResponse, { to: "vi" });

    res.json({ output: translatedResponse.text });
  } catch (error) {
    res.status(500).json({ error: "Lỗi xử lý chat." });
  }
});

// === XỬ LÝ TOÁN ===
app.post("/api/math", async (req, res) => {
  const { prompt } = req.body;
  try {
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-tiny",
        messages: [
          {
            role: "user",
            content: `Solve this math problem step-by-step and highlight the main formulas with ** marks: ${prompt}`,
          },
        ],
      }),
    });

    const data = await response.json();
    res.json({ output: data.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: "Lỗi xử lý toán." });
  }
});

// === XỬ LÝ TẠO ẢNH ===
app.post("/api/image", async (req, res) => {
  const { prompt } = req.body;
  try {
    // Dịch prompt sang tiếng Anh cho Pollinations
    const translated = await translate(prompt, { to: "en" });
    const englishPrompt = translated.text;

    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      englishPrompt
    )}`;
    res.json({ imageUrl });
  } catch {
    res.status(500).json({ error: "Lỗi tạo ảnh." });
  }
});

// === XỬ LÝ TẠO VIDEO ===
app.post("/api/video", async (req, res) => {
  const { prompt } = req.body;
  try {
    // Dịch prompt sang tiếng Anh cho Pollinations Frames
    const translated = await translate(prompt, { to: "en" });
    const englishPrompt = translated.text;

    const videoUrl = `https://pollinations.ai/p/${encodeURIComponent(
      englishPrompt
    )}`;
    res.json({ videoUrl });
  } catch {
    res.status(500).json({ error: "Lỗi tạo video." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server đang chạy tại http://localhost:${PORT}`));
