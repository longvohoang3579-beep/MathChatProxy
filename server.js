// server.js (Đã chỉnh sửa systemInstruction)

import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

const MODEL_CHAT_MM = "gemini-2.5-flash";
const MODEL_CHAT = "gemini-2.5-flash";

function checkApiKey() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("LỖI CẤU HÌNH: Không tìm thấy GEMINI_API_KEY trong file .env");
    }
    return apiKey;
}

function imagePart(base64Data, mimeType = "image/jpeg") {
    return {
        inlineData: {
            data: base64Data,
            mimeType
        }
    };
}

// Hướng dẫn hệ thống đã được tối ưu cho độ ngắn gọn và highlight
const SYSTEM_INSTRUCTION = "Bạn là trợ lý Toán học. Hãy giải thích các bước giải **ngắn gọn, đủ ý**, **tối đa 50 từ** và chỉ tập trung vào các bước chính. Dùng cặp ký tự ` (backtick) để bôi đen/nhấn mạnh ý chính (ví dụ: `Đây là ý chính`).";


// API CHAT VỚI HÌNH ẢNH
app.post('/api/chat-with-image', async (req, res) => {
    try {
        const apiKey = checkApiKey();
        const ai = new GoogleGenAI({ apiKey });
        const { question, imageBase64 } = req.body;
        
        if (!imageBase64) return res.status(400).json({ response: "Thiếu dữ liệu hình ảnh Base64." });
        const userPrompt = question || "Mô tả chi tiết hình ảnh này.";

        const response = await ai.models.generateContent({
            model: MODEL_CHAT_MM,
            contents: [{ 
                role: "user", 
                parts: [
                    imagePart(imageBase64, "image/jpeg"),
                    { text: userPrompt }
                ]
            }],
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                temperature: 0.3
            }
        });

        return res.json({ response: response.text });
    } catch (error) {
        console.error("LỖI CHAT-WITH-IMAGE SERVER:", error.message);
        return res.status(500).json({ response: `❌ Lỗi Server: ${error.message}. Vui lòng kiểm tra API Key.` });
    }
});

// API CHAT THÔNG THƯỜNG
app.post('/api/chat', async (req, res) => {
    try {
        const apiKey = checkApiKey();
        const ai = new GoogleGenAI({ apiKey });
        const { messages } = req.body; 

        if (!messages || messages.length === 0) return res.status(400).json({ response: "Thiếu dữ liệu 'messages'." });

        const geminiMessages = messages.map(message => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: message.parts
        }));

        const response = await ai.models.generateContent({
            model: MODEL_CHAT,
            contents: geminiMessages,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                temperature: 0.5
            }
        });

        return res.json({ response: response.text });
    } catch (error) {
        console.error("LỖI CHAT SERVER:", error.message);
        return res.status(500).json({ response: `❌ Lỗi Server: ${error.message}. Vui lòng kiểm tra API Key.` });
    }
});


app.use(express.static(__dirname));

app.listen(port, () => {
    console.log(`✅ Server đang chạy tại: http://localhost:${port}`);
    console.log(`⚠️ Đảm bảo file .env có GEMINI_API_KEY và bạn đã chạy 'npm install'`);
});