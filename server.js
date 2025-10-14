import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ⚙️ Cho phép truy cập các file tĩnh (ảnh, script, css, v.v.) trong cùng thư mục
app.use(express.static("."));

// ======= HÀM DỊCH NGÔN NGỮ TRƯỚC =======
async function translateToEnglish(text) {
  try {
    const res = await fetch(
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=" +
        encodeURIComponent(text)
    );
    const data = await res.json();
    return data[0][0][0]; // phần text đã dịch
  } catch (error) {
    console.error("Lỗi dịch:", error);
    return text; // fallback giữ nguyên nếu lỗi
  }
}

// ======= API TẠO ẢNH =======
app.post("/api/create-image", async (req, res) => {
  try {
    const { prompt } = req.body;
    const englishPrompt = await translateToEnglish(prompt);
    console.log("Prompt đã dịch:", englishPrompt);
    const response = await fetch(
      `https://image.pollinations.ai/prompt/${encodeURIComponent(englishPrompt)}`
    );
    const buffer = await response.arrayBuffer();
    res.set("Content-Type", "image/png");
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Lỗi tạo ảnh:", error);
    res.status(500).json({ error: "Tạo ảnh thất bại." });
  }
});

// ======= API TẠO VIDEO =======
app.post("/api/create-video", async (req, res) => {
  try {
    const { prompt } = req.body;
    const englishPrompt = await translateToEnglish(prompt);
    console.log("Prompt video đã dịch:", englishPrompt);
    const videoUrl = `https://pollinations.ai/p/${encodeURIComponent(
      englishPrompt
    )}?model=video`;
    res.json({ videoUrl });
  } catch (error) {
    console.error("Lỗi tạo video:", error);
    res.status(500).json({ error: "Tạo video thất bại." });
  }
});

// ======= TRANG MẶC ĐỊNH =======
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`)
);
