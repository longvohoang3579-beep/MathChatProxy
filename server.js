// server.js

// 1. Cấu hình ứng dụng Express và Gemini
const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Lấy API Key từ Biến Môi trường (Environment Variable) trên Render
const apiKey = process.env.GEMINI_API_KEY; 
if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
}

// Khởi tạo GoogleGenAI
const ai = new GoogleGenAI(apiKey);

// Khởi tạo đối tượng chat và cấu hình mô hình
const model = "gemini-2.5-flash"; 
let chat; // Đối tượng chat sẽ được khởi tạo cho mỗi phiên

// Khởi tạo nội dung vai trò
const roleFilePath = path.join(__dirname, 'c.role');
const msgFilePath = path.join(__dirname, 'msg.role');
let systemRole = ""; 
let initialMessage = ""; 

try {
    // Đọc nội dung file vai trò (Role Files)
    systemRole = fs.readFileSync(roleFilePath, 'utf8');
    initialMessage = fs.readFileSync(msgFilePath, 'utf8');
} catch (error) {
    // Nếu không tìm thấy file (vì bạn không upload lên GitHub)
    // SỬ DỤNG VAI TRÒ MẶC ĐỊNH
    systemRole = "You are a friendly and precise math tutoring bot. Your goal is to help users solve complex math problems step-by-step. Never answer questions that are not related to mathematics, science, or logic problems.";
    initialMessage = "Chào mừng bạn đến với MathChat AI! Bạn có câu hỏi toán học nào cần giúp đỡ không? Hãy chia sẻ đề bài nhé.";
    console.warn("Role files not found, using default roles.");
}

// Hàm khởi tạo/đặt lại chat
function initializeChat() {
    chat = ai.chats.create({
        model: model,
        config: {
            systemInstruction: systemRole
        }
    });
}

// Khởi tạo chat ban đầu
initializeChat();

// 2. Middleware và Tuyến đường

// Middleware để phân tích JSON và URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Tuyến đường gốc để phục vụ index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Tuyến đường để lấy tin nhắn ban đầu (dùng cho client-side)
app.get('/initial-message', (req, res) => {
    res.json({ message: initialMessage });
});


// Tuyến đường POST để xử lý tin nhắn và giao tiếp với Gemini
app.post('/ask', async (req, res) => {
    const userMessage = req.body.message;
    
    if (!userMessage) {
        return res.status(400).json({ error: "Missing message." });
    }

    try {
        // --- LOGIC GIỚI HẠN TIN NHẮN TỪ PHÍA MÁY CHỦ ---
        const MAX_USER_QUESTIONS = 4; // Giới hạn 4 câu hỏi
        // Tổng độ dài lịch sử = 4 user + 4 model = 8
        const MAX_HISTORY_LENGTH = MAX_USER_QUESTIONS * 2; 
        
        const history = await chat.getHistory();
        
        if (history.length >= MAX_HISTORY_LENGTH) {
            // Đã đạt giới hạn 4 câu hỏi (8 tin nhắn)
            
            // THÔNG BÁO LỖI VÀ CHẶN API CALL
            res.status(429).json({
                error: "Quota Exceeded",
                message: `Bạn đã đạt đến giới hạn ${MAX_USER_QUESTIONS} câu hỏi cho phiên này. Vui lòng làm mới trang (refresh) để bắt đầu cuộc trò chuyện mới.`
            });
            return; // Dừng xử lý
        }
        // --- KẾT THÚC LOGIC GIỚI HẠN TIN NHẮN ---
        
        
        // Gọi API Gemini
        const response = await chat.sendMessage({ 
            message: userMessage 
        });

        // Gửi câu trả lời của AI về client
        res.json({ 
            response: response.text 
        });

    } catch (error) {
        console.error("Gemini API Error:", error);
        res.status(500).json({ 
            error: "An error occurred while communicating with the AI model.",
            details: error.message 
        });
    }
});

// 3. Khởi động Máy chủ
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});