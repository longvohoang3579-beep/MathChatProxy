// server.js
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Cấu hình ES Module cho __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Khởi tạo Model
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
}
const genAI = new GoogleGenerativeAI(geminiApiKey);
const multimodalModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// System Roles
const mathSystemRole = "You are a friendly and precise math tutoring bot. Your goal is to help users solve math problems. Provide detailed, step-by-step explanations. Use backticks `` ` `` to highlight key formulas, numbers, or the final answer. Only answer questions related to mathematics. Always respond in Vietnamese.";
const generalChatSystemRole = "You are a helpful and friendly AI assistant. Chat with the user on any topic they want. Respond in Vietnamese.";

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- API ROUTES ---

// 1. API Giải toán (Gemini)
app.post('/api/ask', async (req, res) => {
    const { question, imageBase64 } = req.body;
    try {
        const promptParts = [question || "Hãy giải bài toán trong hình ảnh này một cách chi tiết."];
        if (imageBase64) {
            promptParts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
        }
        const chat = multimodalModel.startChat({ systemInstruction: { parts: [{ text: mathSystemRole }] } });
        const result = await chat.sendMessage(promptParts);
        res.json({ response: result.response.text() });
    } catch (error) {
        console.error("Math API Error:", error);
        res.status(500).json({ message: "Lỗi khi giao tiếp với mô hình AI giải toán." });
    }
});

// 2. API Chat đa năng (Gemini)
app.post('/api/general-chat', async (req, res) => {
    const { prompt } = req.body;
    try {
        const chat = multimodalModel.startChat({ systemInstruction: { parts: [{ text: generalChatSystemRole }] } });
        const result = await chat.sendMessage(prompt);
        res.json({ response: result.response.text() });
    } catch (error) {
        console.error("General Chat API Error:", error);
        res.status(500).json({ message: "Lỗi khi giao tiếp với mô hình AI chat." });
    }
});

// 3. API Tạo ảnh (DeepAI - Bảo mật)
app.post('/api/deepai-image', async (req, res) => {
    const { prompt } = req.body;
    const deepAiApiKey = process.env.DEEPAI_API_KEY;
    if (!prompt) return res.status(400).json({ message: "Nội dung ảnh không được để trống." });
    if (!deepAiApiKey) return res.status(500).json({ message: "Chưa cấu hình API Key cho DeepAI trên server." });

    try {
        const response = await fetch("https://api.deepai.org/api/text2img", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': deepAiApiKey },
            body: JSON.stringify({ text: prompt }),
        });
        const data = await response.json();
        if (data.output_url) {
            res.json({ imageUrl: data.output_url });
        } else {
            throw new Error(data.err || 'Không nhận được URL ảnh từ DeepAI.');
        }
    } catch (error) {
        console.error("DeepAI API Error:", error);
        res.status(500).json({ message: error.message });
    }
});

// --- SERVING ROUTES ---

// Route chính để phục vụ file index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// *** SỬA LỖI: Thêm Route "Catch-all" ***
// Route này phải được đặt ở CUỐI CÙNG.
// Nó sẽ bắt tất cả các yêu cầu GET không khớp với các route ở trên và trả về trang chính.
app.get('*', (req, res) => {
    console.log(`Caught a stray GET request for: ${req.path}, redirecting to homepage.`);
    res.sendFile(path.join(__dirname, 'index.html'));
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});