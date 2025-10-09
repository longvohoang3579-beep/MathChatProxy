// server.js

const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey);
const multimodalModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- VAI TRÒ HỆ THỐNG ĐƯỢC CẬP NHẬT ---
let systemInstruction = "";
try {
    // Ưu tiên đọc file role nếu có
    const roleFilePath = path.join(__dirname, 'c.role');
    systemInstruction = fs.readFileSync(roleFilePath, 'utf8');
} catch (error) {
    // VAI TRÒ MẶC ĐỊNH (ĐÃ CẢI TIẾN)
    systemInstruction = "You are a friendly and precise math tutoring bot. Your goal is to help users solve math problems. Provide detailed, step-by-step explanations, but keep the language clear and concise to answer quickly. Use backticks `` ` `` to highlight key formulas, numbers, or the final answer. Never answer questions that are not related to mathematics, science, or logic problems. Always respond in Vietnamese.";
    console.warn("c.role file not found, using improved default role.");
}
// -----------------------------------------

app.use(express.json({ limit: '10mb' }));

// --- CÁC TUYẾN ĐƯỜNG (ROUTES) ---

// 1. Phục vụ trang web
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. API Giải toán (Không đổi)
app.post('/api/ask', async (req, res) => {
    const { question, imageBase64 } = req.body;
    if (!question && !imageBase64) {
        return res.status(400).json({ message: "Yêu cầu phải có câu hỏi hoặc hình ảnh." });
    }

    try {
        const promptParts = [];
        const userPrompt = question || "Hãy giải bài toán trong hình ảnh này một cách chi tiết và từng bước.";
        promptParts.push(userPrompt);

        if (imageBase64) {
            promptParts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
        }
        
        const chat = multimodalModel.startChat({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            history: []
        });

        const result = await chat.sendMessage(promptParts);
        const text = result.response.text();
        res.json({ response: text });
    } catch (error) {
        console.error("Math API Error:", error);
        res.status(500).json({ message: "Đã có lỗi xảy ra khi giao tiếp với mô hình AI." });
    }
});

// 3. API TẠO ẢNH (MỚI)
app.post('/api/generate-image', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ message: "Nội dung để tạo ảnh không được để trống." });
    }

    try {
        // Mẹo: Chúng ta sẽ yêu cầu AI tạo ra một URL ảnh từ dịch vụ Unsplash.
        // Đây là cách thêm tính năng tạo ảnh mà không cần dùng đến một API tạo ảnh riêng biệt.
        const imageGenPrompt = `Create a descriptive Unsplash image URL for the following prompt: "${prompt}". The URL format is \`https://source.unsplash.com/800x600/?<keywords>\`. Replace <keywords> with 2-3 relevant, comma-separated English words. Only return the final URL and nothing else.`;

        const result = await multimodalModel.generateContent(imageGenPrompt);
        const imageUrl = result.response.text().trim();

        // Kiểm tra xem URL có hợp lệ không
        if (imageUrl.startsWith('https://source.unsplash.com')) {
            res.json({ imageUrl: imageUrl });
        } else {
            // Nếu AI không trả về đúng định dạng, cung cấp một ảnh ngẫu nhiên
            res.json({ imageUrl: `https://source.unsplash.com/800x600/?${prompt.split(' ').join(',')}` });
        }
    } catch (error) {
        console.error("Image Gen API Error:", error);
        res.status(500).json({ message: "Đã xảy ra lỗi khi tạo ảnh." });
    }
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});