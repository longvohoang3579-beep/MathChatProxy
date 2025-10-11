// server.js
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
// Giữ lại FormData cho khả năng tương thích Node.js, dù không dùng cho Imagen
import FormData from 'form-data'; 

// Cấu hình ES Module cho __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Khởi tạo Model
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    console.error("LỖI CẤU HÌNH: GEMINI_API_KEY không được thiết lập trong biến môi trường.");
}
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
// Sử dụng mô hình cho chat/multimodal
const multimodalModel = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;
// Dùng API Endpoint cho Imagen (imagen-3.0-generate-002)
const IMAGEN_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict";

// System Roles
const mathSystemRole = "You are a friendly and precise math tutoring bot. Your goal is to help users solve math problems. Provide detailed, step-by-step explanations. Use backticks `` ` `` to highlight key formulas, numbers, or the final answer. Only answer questions related to mathematics. Always respond in Vietnamese.";
const generalChatSystemRole = "You are a helpful and friendly AI assistant. Chat with the user on any topic they want. Respond in Vietnamese.";

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- API ROUTES ---

// Helper function để kiểm tra API Gemini đã sẵn sàng chưa
const checkGeminiReady = (res) => {
    if (!genAI || !multimodalModel) {
        res.status(503).json({ message: "LỖI SERVER: API Key Gemini chưa được cấu hình hoặc sai. Vui lòng kiểm tra GEMINI_API_KEY trên Render." });
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

// 3. API Tạo ảnh (ĐÃ CHUYỂN SANG IMAGEN CỦA GOOGLE)
app.post('/api/deepai-image', async (req, res) => {
    const { prompt } = req.body;
    
    // Kiểm tra GEMINI_API_KEY vì Imagen dùng chung key này
    if (!checkGeminiReady(res)) return;
    if (!prompt) return res.status(400).json({ message: "Nội dung ảnh không được để trống." });

    try {
        // Cấu trúc payload cho Imagen API
        const payload = { 
            instances: [{ prompt: prompt }], 
            parameters: { 
                "sampleCount": 1, // Chỉ tạo 1 ảnh
                "aspectRatio": "1:1" // Tỷ lệ khung hình vuông (có thể thay đổi)
            } 
        };
        
        // Gọi Imagen API, sử dụng GEMINI_API_KEY
        const response = await fetch(`${IMAGEN_API_URL}?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await response.json();
        
        if (response.status !== 200) {
             // Bắt lỗi cụ thể từ Google API (ví dụ: INVALID_ARGUMENT, Quota Exceeded)
             throw new Error(`Lỗi Imagen: ${response.status} - ${data.error?.message || JSON.stringify(data)}`);
        }

        const base64Data = data.predictions?.[0]?.bytesBase64Encoded;

        if (base64Data) {
            // Trả về dữ liệu ảnh dưới dạng URL data base64 để hiển thị trực tiếp
            const imageUrl = `data:image/png;base64,${base64Data}`;
            res.json({ imageUrl: imageUrl });
        } else {
            throw new Error('Không nhận được dữ liệu ảnh từ Imagen. (Có thể do lỗi lọc nội dung hoặc hết hạn mức)');
        }
    } catch (error) {
        console.error("Imagen API Error:", error);
        res.status(500).json({ message: error.message || "Lỗi không xác định khi tạo ảnh." });
    }
});

// --- SERVING ROUTES ---

// Route chính để phục vụ file index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Catch-all route cho Single Page Application (SPA) - Khắc phục lỗi Cannot GET /experiences/...
app.get('*', (req, res) => {
    console.log(`Caught a stray GET request for: ${req.path}, redirecting to homepage.`);
    res.sendFile(path.join(__dirname, 'index.html'));
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
