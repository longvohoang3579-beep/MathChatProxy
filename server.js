import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
import { YoutubeTranscript } from 'youtube-transcript';

dotenv.config();
const app = express();

// --- Middleware (Giữ nguyên cấu hình của bạn) ---
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static(".")); 

// --- Cấu hình Gemini API ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash"; // Bản ổn định nhất cho Render
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// --- Các hàm hỗ trợ ---
async function translateToEnglish(text) {
    try {
        const response = await fetch(GEMINI_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Translate the following text to English (return only the translation): ${text}` }] }]
            })
        });
        const data = await response.json();
        return data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
        return text;
    }
}

function extractYouTubeID(url) {
    const regex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// --- API ROUTES (Khớp chính xác với các nút trong index.html của bạn) ---

// 1. API Chat chính
app.post("/api/chat", async (req, res) => {
    const { message, history, language } = req.body;
    try {
        const response = await fetch(GEMINI_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                contents: history || [{ parts: [{ text: message }] }] 
            })
        });
        const data = await response.json();
        const aiResponse = data.candidates[0].content.parts[0].text;
        res.json({ response: aiResponse });
    } catch (error) {
        res.status(500).json({ error: "Lỗi kết nối Gemini API" });
    }
});

// 2. API Giải toán (Dành cho mathBtn)
app.post("/api/math", async (req, res) => {
    const { question } = req.body;
    try {
        const prompt = `Bạn là chuyên gia toán học. Hãy giải bài toán sau chi tiết, dùng LaTeX: ${question}`;
        const response = await fetch(GEMINI_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        res.json({ response: data.candidates[0].content.parts[0].text });
    } catch (error) {
        res.status(500).json({ error: "Lỗi giải toán" });
    }
});

// 3. API Tạo ảnh (Dành cho imageBtn)
app.post("/api/pollinations-image", async (req, res) => {
    const { prompt } = req.body;
    try {
        const engPrompt = await translateToEnglish(prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(engPrompt)}?width=1024&height=1024&nologo=true`;
        res.json({ imageUrl });
    } catch (error) {
        res.status(500).json({ error: "Lỗi tạo ảnh" });
    }
});

// 4. API Youtube (Dành cho videoBtn)
app.post("/api/youtube", async (req, res) => {
    const { url } = req.body;
    const videoId = extractYouTubeID(url);
    if (!videoId) return res.status(400).json({ error: "Link Youtube không hợp lệ" });
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        const fullText = transcript.map(t => t.text).join(" ");
        res.json({ transcript: fullText });
    } catch (error) {
        res.status(500).json({ error: "Không thể lấy phụ đề từ video này" });
    }
});

// --- Khởi động Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server AI PRO đang chạy tại cổng: ${PORT}`);
});
