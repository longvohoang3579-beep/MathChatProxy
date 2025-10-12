import express from "express";
import path from "path";
import bodyParser from "body-parser";

const app = express();
const __dirname = path.resolve();

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

// API tạo ảnh Pollinations
app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt)
    return res.status(400).json({ message: "Vui lòng nhập nội dung ảnh." });

  try {
    const safePrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error("Pollinations API Error:", error);
    res.status(500).json({ message: "Lỗi khi gọi Pollinations API." });
  }
});

// Trang chính
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server đang chạy tại: http://localhost:${PORT}`)
);
