// server.js
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// === Cấu hình Gemini ===
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.error("⚠️ LỖI: GEMINI_API_KEY chưa được cấu hình trong biến môi trường!");
}
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const multimodalModel = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;

// === Vai trò hệ thống ===
const mathSystemRole = "You are a friendly and precise math tutoring bot. Your goal is to help users solve math problems. Provide detailed, step-by-step explanations. Use backticks `` ` `` to highlight key formulas, numbers, or the final answer. Only answer questions related to mathematics. Always respond in Vietnamese.";
const generalChatSystemRole = "You are a helpful and friendly AI assistant. Chat with the user on any topic they want. Respond in Vietnamese.";

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// === Hàm kiểm tra API Key Gemini ===
const checkGeminiReady = (res) => {
  if (!genAI || !multimodalModel) {
    res.status(503).json({ message: "LỖI: GEMINI_API_KEY chưa cấu hình hoặc sai." });
    return false;
  }
  return true;
};

// === API 1: Giải Toán ===
app.post('/api/ask', async (req, res) => {
  if (!checkGeminiReady(res)) return;
  const { question, imageBase64 } = req.body;
  try {
    const promptParts = [question || "Hãy giải bài toán trong hình ảnh này một cách chi tiết."];
    if (imageBase64) {
      promptParts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
    }
    const result = await multimodalModel.generateContent({
      contents: [{ role: "user", parts: promptParts }],
      config: { systemInstruction: mathSystemRole }
    });
    res.json({ response: result.text });
  } catch (error) {
    console.error("Math API Error:", error.message);
    res.status(500).json({ message: "Lỗi khi gọi Gemini giải toán." });
  }
});

// === API 2: Chat Tổng Hợp ===
app.post('/api/general-chat', async (req, res) => {
  if (!checkGeminiReady(res)) return;
  const { prompt } = req.body;
  try {
    const result = await multimodalModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { systemInstruction: generalChatSystemRole }
    });
    res.json({ response: result.text });
  } catch (error) {
    console.error("General Chat API Error:", error.message);
    res.status(500).json({ message: "Lỗi khi gọi Gemini Chat." });
  }
});

// === API 3: Tạo Ảnh bằng Pollinations (thay Google Imagen) ===
app.post('/api/pollinations-image', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập nội dung ảnh." });

  try {
    const safePrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error("Pollinations API Error:", error);
    res.status(500).json({ message: "Lỗi khi gọi Pollinations API." });
  }
});

// === Phục vụ giao diện web ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
