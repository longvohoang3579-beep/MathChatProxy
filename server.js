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
    // throw new Error("GEMINI_API_KEY is not set in environment variables.");
    // Log lỗi thay vì throw để server vẫn có thể chạy
    console.error("LỖI CẤU HÌNH: GEMINI_API_KEY không được thiết lập.");
}
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const multimodalModel = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;

// System Roles
const mathSystemRole = "You are a friendly and precise math tutoring bot. Your goal is to help users solve math problems. Provide detailed, step-by-step explanations. Use backticks `` ` `` to highlight key formulas, numbers, or the final answer. Only answer questions related to mathematics. Always respond in Vietnamese.";
const generalChatSystemRole = "You are a helpful and friendly AI assistant. Chat with the user on any topic they want. Respond in Vietnamese.";

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- API ROUTES ---

// Helper function để kiểm tra API
const checkGeminiReady = (res) => {
    if (!genAI || !multimodalModel) {
        res.status(503).json({ message: "LỖI SERVER: API Key Gemini chưa được cấu hình hoặc sai." });
        return false;
    }
    return true;
}

// 1. API Giải toán (Gemini)
app.post('/api/ask', async (req, res) => {
    if (!checkGeminiReady(res)) return;
    const { question, imageBase64 } = req.body;
    try {
        const promptParts = [question || "Hãy giải bài toán trong hình ảnh này một cách chi tiết."];
        if (imageBase64) {
            promptParts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
        }
        // Lưu ý: Sử dụng .generateContent thay vì startChat để tránh tạo session mới mỗi lần request
        const result = await multimodalModel.generateContent({
            contents: [{ role: "user", parts: promptParts }],
            config: {
                systemInstruction: mathSystemRole
            }
        });
        res.json({ response: result.text });
    } catch (error) {
        console.error("Math API Error:", error.message);
        res.status(500).json({ message: "Lỗi khi giao tiếp với mô hình AI giải toán. Vui lòng kiểm tra API Key." });
    }
});

// 2. API Chat đa năng (Gemini)
app.post('/api/general-chat', async (req, res) => {
    if (!checkGeminiReady(res)) return;
    const { prompt } = req.body;
    try {
        // Lưu ý: Sử dụng .generateContent thay vì startChat
        const result = await multimodalModel.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                systemInstruction: generalChatSystemRole
            }
        });
        res.json({ response: result.text });
    } catch (error) {
        console.error("General Chat API Error:", error.message);
        res.status(500).json({ message: "Lỗi khi giao tiếp với mô hình AI chat. Vui lòng kiểm tra API Key." });
    }
});

// 3. API Tạo ảnh (DeepAI - ĐÃ SỬA LỖI ĐỊNH DẠNG DỮ LIỆU)
app.post('/api/deepai-image', async (req, res) => {
    const { prompt } = req.body;
    const deepAiApiKey = process.env.DEEPAI_API_KEY;

    if (!prompt) return res.status(400).json({ message: "Nội dung ảnh không được để trống." });
    if (!deepAiApiKey) return res.status(503).json({ message: "Chưa cấu hình API Key cho DeepAI trên server." });

    try {
        // *** SỬA LỖI QUAN TRỌNG: DeepAI cần gửi dữ liệu qua FormData ***
        const formData = new FormData();
        formData.append('text', prompt);
        
        // Cần truyền API Key qua header 'api-key' và không truyền Content-Type (FormData tự set)
        const response = await fetch("https://api.deepai.org/api/text2img", {
            method: 'POST',
            headers: { 'api-key': deepAiApiKey },
            body: formData, // Truyền formData, không cần JSON.stringify
        });

        const data = await response.json();

        if (response.status !== 200) {
             throw new Error(data.err || `Lỗi DeepAI: ${response.status} - ${JSON.stringify(data)}`);
        }

        if (data.output_url) {
            res.json({ imageUrl: data.output_url });
        } else {
            throw new Error(data.err || 'Không nhận được URL ảnh từ DeepAI. (Lỗi không xác định)');
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

// *** SỬA LỖI GIAO DIỆN: Thêm Route "Catch-all" ***
// Route này sẽ bắt tất cả các yêu cầu GET không khớp với các route ở trên (như /experiences/...) 
// và trả về trang chính, giúp khắc phục lỗi "Cannot GET /experiences/..."
app.get('*', (req, res) => {
    console.log(`Caught a stray GET request for: ${req.path}, redirecting to homepage.`);
    res.sendFile(path.join(__dirname, 'index.html'));
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
