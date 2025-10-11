// server.js
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

// Sử dụng node-fetch để gọi API bên ngoài (DeepAI)
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey);
const multimodalModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- SYSTEM ROLES ---
const mathSystemRole = "You are a friendly and precise math tutoring bot. Your goal is to help users solve math problems. Provide detailed, step-by-step explanations, but keep the language clear and concise to answer quickly. Use backticks `` ` `` to highlight key formulas, numbers, or the final answer. Never answer questions that are not related to mathematics, science, or logic problems. Always respond in Vietnamese.";
const generalChatSystemRole = "You are a helpful and friendly AI assistant. Chat with the user on any topic they want. Respond in Vietnamese.";

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// --- ROUTES ---

// 1. Serve the web page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Math Solver API
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
            systemInstruction: { parts: [{ text: mathSystemRole }] },
            history: []
        });

        const result = await chat.sendMessage(promptParts);
        const text = result.response.text();
        res.json({ response: text });
    } catch (error) {
        console.error("Math API Error:", error);
        res.status(500).json({ message: "Lỗi khi giao tiếp với mô hình AI giải toán." });
    }
});

// 3. General Chat API (NEW)
app.post('/api/general-chat', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ message: "Nội dung chat không được để trống." });
    }

    try {
        const chat = multimodalModel.startChat({
            systemInstruction: { parts: [{ text: generalChatSystemRole }] },
            history: [] // Có thể mở rộng để lưu lịch sử chat sau này
        });

        const result = await chat.sendMessage(prompt);
        const text = result.response.text();
        res.json({ response: text });
    } catch (error) {
        console.error("General Chat API Error:", error);
        res.status(500).json({ message: "Lỗi khi giao tiếp với mô hình AI chat." });
    }
});

// 4. DeepAI Image Generation API (NEW)
app.post('/api/deepai-image', async (req, res) => {
    const { apiKey, prompt } = req.body;
    if (!apiKey || !prompt) {
        return res.status(400).json({ message: "Cần có API Key và nội dung ảnh." });
    }

    try {
        const response = await fetch("https://api.deepai.org/api/text2img", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify({
                text: prompt,
            }),
        });
        
        const data = await response.json();

        if (data.output_url) {
            res.json({ imageUrl: data.output_url });
        } else {
            // Ném lỗi nếu DeepAI trả về thông báo lỗi
            throw new Error(data.err || 'Không nhận được URL ảnh từ DeepAI.');
        }

    } catch (error) {
        console.error("DeepAI API Error:", error);
        res.status(500).json({ message: error.message || "Đã xảy ra lỗi khi tạo ảnh từ DeepAI." });
    }
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});