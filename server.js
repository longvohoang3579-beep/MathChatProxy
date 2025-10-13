// ============================================================
// 🤖 AI PROXY SERVER (Gemini + Pollinations) - PHIÊN BẢN HOÀN CHỈNH
// ============================================================

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from 'cors'; // Thư viện để xử lý lỗi kết nối CORS

dotenv.config();
const app = express();

// ================== CẤU HÌNH MIDDLEWARE ==================
// Bật CORS để frontend (chạy trên port khác) có thể gọi API này
app.use(cors());
// Tăng giới hạn payload lên 50MB để chứa ảnh Base64
app.use(bodyParser.json({ limit: "50mb" }));
// Phục vụ các file tĩnh như index.html từ thư mục hiện tại
app.use(express.static("."));

// ============================================================
// 🧠 CẤU HÌNH GEMINI
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY chưa được thiết lập!");
}

// ======== Hàm gọi Gemini API (có retry/backoff) ========
async function callGeminiModel(contents) {
  if (!GEMINI_API_KEY) return "❌ Thiếu GEMINI_API_KEY trong .env.";
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Lỗi HTTP ${response.status} từ Gemini API: ${errorText}`);
        return `❌ Lỗi HTTP ${response.status} khi gọi Gemini.`;
    }

    const data = await response.json();
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
    }
    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
        return "❌ Gemini đã chặn phản hồi do vi phạm chính sách an toàn.";
    }
    return "❌ Không có phản hồi văn bản hợp lệ từ Gemini.";
  } catch (error) {
    console.error("🔥 Lỗi khi gọi Gemini:", error);
    return "❌ Lỗi khi kết nối đến Google Gemini.";
  }
}

// ======== Hàm tải 1 khung hình với Retry ========
async function fetchFrameWithRetry(url, index, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const r = await fetch(url, { timeout: 45000 });
            if (r.ok) {
                const buffer = Buffer.from(await r.arrayBuffer());
                return `data:image/jpeg;base64,${buffer.toString("base64")}`;
            }
        } catch (e) {
            console.warn(`⚠️ Cảnh báo: Khung hình ${index} lỗi mạng (${e.name}). Thử lại lần ${attempt}/${maxRetries}.`);
            if (attempt < maxRetries) await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
        }
    }
    console.error(`❌ Lỗi tải khung hình ${index} sau ${maxRetries} lần thử. Bỏ qua.`);
    return null;
}

// ============================================================
// 🎞️ API TẠO VIDEO TỪ ẢNH GỐC (ENDPOINT CHÍNH)
// ============================================================
app.post("/api/video-from-image", async (req, res) => {
    const { image, prompt } = req.body;
    if (!image) return res.status(400).json({ message: "Vui lòng cung cấp ảnh gốc." });

    try {
        console.log("🤖 1/3: Dùng Gemini để phân tích ảnh...");
        const geminiSystemInstruction = `Analyze this image and describe it in a highly detailed, vivid, and artistic English prompt suitable for an AI image generator. Focus on the main subject, background, style, colors, and lighting. If the user provides an additional prompt, integrate it creatively. Return ONLY the final English prompt.`;
        
        const userParts = [];
        const textForGemini = prompt ? `User's additional instruction: "${prompt}"` : "Describe the image.";
        userParts.push({ text: textForGemini });

        const imgParts = image.split(',');
        userParts.push({ inlineData: { mimeType: imgParts[0].match(/data:(.*?);/)[1], data: imgParts[1] } });
        
        const contents = [
            { role: "user", parts: [{ text: "System instruction: " + geminiSystemInstruction }] },
            { role: "model", parts: [{ text: "Understood. I will provide a detailed English prompt." }] },
            { role: "user", parts: userParts }
        ];

        const basePromptFromImage = await callGeminiModel(contents);
        if (!basePromptFromImage || basePromptFromImage.startsWith("❌")) {
            return res.status(500).json({ message: "Không thể phân tích ảnh bằng AI. " + basePromptFromImage });
        }
        console.log("✅ 2/3: Gemini đã tạo prompt thành công!");

        const framesCount = 10; // Giảm số lượng frame để nhẹ hơn
        console.log(`⏳ 3/3: Bắt đầu tải ${framesCount} khung hình từ Pollinations...`);

        const downloadPromises = [];
        for (let i = 0; i < framesCount; i++) {
            const variation = `${basePromptFromImage}, motion frame ${i + 1} of ${framesCount}, cinematic`;
            // Giảm kích thước ảnh để trình duyệt xử lý nhẹ hơn và nhanh hơn
            const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(variation)}?nologo=true&width=384&height=384`;
            downloadPromises.push(fetchFrameWithRetry(url, i + 1));
        }

        const frames = await Promise.all(downloadPromises);
        const validFrames = frames.filter(f => f);

        if (validFrames.length < 7) { // Yêu cầu tối thiểu 7 frame
            return res.status(500).json({ message: `❌ Không thể tải đủ khung hình (${validFrames.length}/${framesCount}). Vui lòng thử lại.` });
        }

        console.log(`✅ Hoàn thành! Đã tải thành công ${validFrames.length} khung hình.`);
        res.json({ frames: validFrames });

    } catch (error) {
        console.error("❌ Lỗi xử lý chung khi tạo video từ ảnh:", error);
        res.status(500).json({ message: "❌ Lỗi không xác định trên server." });
    }
});

// ============================================================
// 🚀 KHỞI ĐỘNG SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
});
server.timeout = 600000; // Tăng timeout lên 10 phút