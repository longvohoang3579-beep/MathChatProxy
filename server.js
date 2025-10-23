// ==========================
// ✅ AI ASSISTANT PRO SERVER
// ==========================

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "20mb" }));
app.use(express.static("public"));

// ==========================
// 📦 IMPORT LANGCHAIN MODULES
// ==========================
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// ⚙️ FIX LỖI: YoutubeLoader thay đổi export trong @langchain/community
// -> dùng dynamic import để đảm bảo tương thích mọi phiên bản
let YoutubeLoader;
try {
  const mod = await import("@langchain/community/dist/document_loaders/web/youtube.js");
  YoutubeLoader = mod.YoutubeLoader;
} catch {
  try {
    const mod2 = await import("langchain/document_loaders/web/youtube.js");
    YoutubeLoader = mod2.YoutubeLoader;
  } catch (err) {
    console.error("❌ Không thể load YoutubeLoader:", err);
  }
}

// ==========================
// 🌐 KHỞI TẠO GEMINI
// ==========================
const chatModel = new ChatGoogleGenerativeAI({
  model: "gemini-1.5-flash",
  apiKey: process.env.GOOGLE_API_KEY,
});

// ==========================
// 🤖 API: CHAT CHUNG
// ==========================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, image, language } = req.body;
    const messages = [
      new SystemMessage("You are a helpful AI assistant."),
      new HumanMessage(message),
    ];

    const result = await chatModel.invoke(messages);
    res.json({ response: result.content });
  } catch (error) {
    console.error("❌ Chat Error:", error);
    res.status(500).json({ response: "❌ Error processing chat request." });
  }
});

// ==========================
// 🧮 API: GIẢI TOÁN (CÓ HÌNH ẢNH)
// ==========================
app.post("/api/math", async (req, res) => {
  try {
    const { question, image } = req.body;
    const prompt = image
      ? `Giải bài toán từ hình ảnh sau: ${image}`
      : `Giải bài toán sau: ${question}`;

    const result = await chatModel.invoke([new HumanMessage(prompt)]);
    res.json({ response: result.content });
  } catch (error) {
    console.error("❌ Math Error:", error);
    res.status(500).json({ response: "❌ Error solving math problem." });
  }
});

// ==========================
// 🖼️ API: TẠO ẢNH BẰNG POLLINATIONS
// ==========================
app.post("/api/pollinations-image", async (req, res) => {
  try {
    const { prompt } = req.body;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error("❌ Pollinations Image Error:", error);
    res.status(500).json({ response: "❌ Error generating image." });
  }
});

// ==========================
// 🎞️ API: TẠO VIDEO (GIF NGẮN)
// ==========================
app.post("/api/pollinations-frames", async (req, res) => {
  try {
    const { prompt } = req.body;
    const frames = [
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)} frame 1`,
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)} frame 2`,
    ];
    res.json({ frames });
  } catch (error) {
    console.error("❌ Pollinations Frames Error:", error);
    res.status(500).json({ response: "❌ Error generating frames." });
  }
});

// ==========================
// 🧠 API: TÓM TẮT YOUTUBE
// ==========================
app.post("/api/summarize-youtube", async (req, res) => {
  try {
    const { youtubeUrl } = req.body;

    if (!YoutubeLoader) {
      return res.status(500).json({ response: "❌ YoutubeLoader not available." });
    }

    const loader = new YoutubeLoader(youtubeUrl);
    const docs = await loader.load();

    const fullTranscript = docs.map((d) => d.pageContent).join("\n");
    const result = await chatModel.invoke([
      new SystemMessage("Tóm tắt video YouTube bằng tiếng Việt."),
      new HumanMessage(fullTranscript),
    ]);

    res.json({ response: result.content });
  } catch (error) {
    console.error("❌ YouTube Summary Error:", error);
    res.status(500).json({ response: "❌ Error summarizing YouTube video." });
  }
});

// ==========================
// 🗒️ API: GHI CHÚ / TÓM TẮT VĂN BẢN
// ==========================
app.post("/api/summarize-text", async (req, res) => {
  try {
    const { textToSummarize } = req.body;
    const result = await chatModel.invoke([
      new SystemMessage("Tóm tắt văn bản ngắn gọn và dễ hiểu."),
      new HumanMessage(textToSummarize),
    ]);

    res.json({ response: result.content });
  } catch (error) {
    console.error("❌ Summarize Error:", error);
    res.status(500).json({ response: "❌ Error summarizing text." });
  }
});

// ==========================
// 🖼️ API: CHỈNH SỬA ẢNH
// ==========================
app.post("/api/edit-image", async (req, res) => {
  try {
    const { message, image } = req.body;
    const prompt = `Người dùng muốn chỉnh sửa ảnh theo mô tả sau: "${message}". Hãy mô tả lại yêu cầu chỉnh sửa bằng tiếng Anh ngắn gọn để gửi tới AI tạo ảnh.`;
    const result = await chatModel.invoke([new HumanMessage(prompt)]);
    res.json({ response: result.content });
  } catch (error) {
    console.error("❌ Edit Image Error:", error);
    res.status(500).json({ response: "❌ Error generating edit prompt." });
  }
});

// ==========================
// 🚀 KHỞI ĐỘNG SERVER
// ==========================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server đang chạy tại cổng ${PORT}`));
