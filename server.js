// ============================================================
// 🤖 AI PROXY SERVER (Gemini 1.5 Flash + Pollinations + Video)
// ============================================================

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();

// ============================================================
// ⚙️ CẤU HÌNH MIDDLEWARE
// ============================================================

// ✅ Kích hoạt CORS cho tất cả các request
app.use(cors());

// Tăng giới hạn payload lên 50MB để chứa ảnh Base64
app.use(bodyParser.json({ limit: "50mb" }));

// Phục vụ file tĩnh (index.html cùng thư mục)
app.use(express.static("."));

// ============================================================
// 🧠 CẤU HÌNH GEMINI
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) {
    console.warn("⚠️ WARNING: GEMINI_API_KEY chưa được thiết lập trong .env. Chat và giải toán sẽ không hoạt động!");
}

/**
 * Hàm gọi Gemini API với cơ chế retry và backoff.
 * @returns {Promise<{text: string, status: number}>}
 */
async function callGeminiModel(contents) {
    if (!GEMINI_API_KEY) return { text: "❌ Thiếu GEMINI_API_KEY trong .env. Vui lòng kiểm tra Server.", status: 500 };

    try {
        for (let i = 0; i < 3; i++) {
            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents }),
            });

            if (response.ok) {
                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    return { text, status: 200 };
                }
                if (data.error) {
                    console.error("❌ Lỗi API từ Gemini:", data.error);
                    return { text: `❌ Lỗi API từ Gemini: ${data.error.message}`, status: 400 };
                }
                console.log("Phản hồi không hợp lệ từ Gemini:", JSON.stringify(data, null, 2));
                return { text: "❌ Không có phản hồi văn bản hợp lệ từ Gemini.", status: 500 };
            }

            const errorText = await response.text();
            console.error(`❌ Lỗi HTTP ${response.status} từ Gemini API: ${errorText}`);

            // Xử lý lỗi Rate Limit (429) và Server Error (5xx)
            if (response.status === 429 || response.status >= 500) {
                const delay = Math.pow(2, i) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            // Xử lý lỗi API Key sai (400) hoặc Unauthenticated (401)
            return { text: `❌ Lỗi API (${response.status}). Vui lòng kiểm tra API Key hoặc tham số.`, status: response.status };
        }
        return { text: "❌ Đã thử lại nhưng vẫn lỗi khi gọi Gemini.", status: 500 };
    } catch (error) {
        console.error("🔥 Lỗi khi gọi Gemini:", error);
        return { text: "❌ Lỗi khi kết nối đến Google Gemini. (Kiểm tra server/mạng)", status: 503 };
    }
}

// ======== Hàm build content parts (text + inline image) ========
function buildContentParts(text, image, systemInstruction) {
    let userParts = [];
    const textPart = systemInstruction + "\n\nTin nhắn: " + (text || "Vui lòng phân tích và mô tả chi tiết bức ảnh này.");
    userParts.push({ text: textPart });

    if (image) {
        const parts = image.split(',');
        const mimeTypeMatch = parts[0].match(/data:(.*?);/);
        if (mimeTypeMatch && parts.length === 2) {
            userParts.push({
                inlineData: {
                    mimeType: mimeTypeMatch[1],
                    data: parts[1]
                }
            });
        } else {
            throw new Error("Lỗi định dạng ảnh Base64 không hợp lệ.");
        }
    }
    return userParts;
}

// ======== Dịch sang tiếng Anh (fallback: trả text gốc) ========
async function translateToEnglish(text) {
    if (!text) return "";
    try {
        const promptTranslate = `Translate the following text to English. Return ONLY the translated text, without any introductory phrases or explanations. Text: "${text}"`;
        const contents = [{ role: "user", parts: [{ text: promptTranslate }] }];
        const { text: response, status } = await callGeminiModel(contents);
        // Trả về bản dịch chỉ khi API thành công và trả về văn bản hợp lệ.
        return (status === 200 && response && !response.startsWith("❌")) ? response.replace(/^"|"$/g, '').trim() : text;
    } catch (err) {
        console.error("Lỗi dịch với Gemini:", err);
        return text;
    }
}

// ============================================================
// 🖼️ API TẠO ẢNH (Pollinations - Có dịch đa ngôn ngữ)
// ============================================================
app.post("/api/pollinations-image", async (req, res) => {
    let { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });
    try {
        const translatedPrompt = await translateToEnglish(prompt);
        // Sử dụng mô hình tạo ảnh đơn giản, độ phân giải cao hơn
        const safePrompt = encodeURIComponent(translatedPrompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=1024&height=768&model=majic-mix-realistic`; // Thêm model
        res.json({ imageUrl });
    } catch (error) {
        console.error("Lỗi Pollinations:", error);
        res.status(500).json({ message: "Không thể tạo ảnh." });
    }
});

// ======== Hàm tải 1 khung hình với Retry (Tối đa 3 lần) ========
async function fetchFrameWithRetry(url, index, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const r = await fetch(url);
            if (r.ok) {
                // Tải thành công -> chuyển sang Base64
                const buffer = Buffer.from(await r.arrayBuffer());
                return `data:image/jpeg;base64,${buffer.toString("base64")}`;
            }
            if (attempt < maxRetries) {
                console.warn(`⚠️ Cảnh báo: Khung hình ${index} lỗi (HTTP ${r.status}). Thử lại lần ${attempt}/${maxRetries}.`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            } else {
                console.error(`❌ Lỗi tải khung hình ${index} sau ${maxRetries} lần thử (HTTP ${r.status}). Bỏ qua.`);
            }
        } catch (e) {
            if (attempt < maxRetries) {
                console.warn(`⚠️ Cảnh báo: Khung hình ${index} lỗi mạng. Thử lại lần ${attempt}/${maxRetries}. Chi tiết: ${e.message}`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            } else {
                console.error(`❌ Lỗi tải khung hình ${index} sau ${maxRetries} lần thử: ${e.message}. Bỏ qua.`);
            }
        }
    }
    return null; // Thất bại
}

// ============================================================
// 🖼️/🎞️ API TẠO KHUNG HÌNH (Pollinations -> 12 frames Base64)
// ============================================================
app.post("/api/pollinations-frames", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả." });
    try {
        const translatedPrompt = await translateToEnglish(prompt);
        const framesCount = 12;
        console.log(`Bắt đầu tải ${framesCount} khung hình cho prompt: ${translatedPrompt}`);

        // Tải một khung hình gốc chất lượng cao để làm nền/hình chiếu mở đầu
        const baseImageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(translatedPrompt)}?nologo=true&width=512&height=512&model=majic-mix-realistic`;
        const baseImagePromise = fetchFrameWithRetry(baseImageUrl, 0, 1);

        const downloadPromises = Array.from({ length: framesCount }, (_, i) => {
            const variation = `${translatedPrompt}, motion frame ${i + 1} of ${framesCount}, cinematic, high detail`;
            const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(variation)}?nologo=true&width=512&height=512`;
            return fetchFrameWithRetry(url, i + 1);
        });

        const [baseFrame, ...frames] = await Promise.all([baseImagePromise, ...downloadPromises]);
        
        // Đảm bảo có khung nền và ít nhất 7 khung hình chuyển động (tổng 8)
        const validFrames = frames.filter(f => f);
        if (baseFrame) validFrames.unshift(baseFrame); // Thêm khung nền vào đầu
        
        if (validFrames.length < 8) {
            console.error(`❌ Chỉ tải được ${validFrames.length}/${framesCount + 1} khung hình. Yêu cầu tối thiểu 8.`);
            return res.status(500).json({ message: "❌ Không thể tải đủ khung hình. Vui lòng thử lại." });
        }
        
        console.log(`✅ Đã tải thành công ${validFrames.length} khung hình.`);
        res.json({ frames: validFrames });
    } catch (error) {
        console.error("❌ Lỗi xử lý chung tạo khung hình Base64:", error);
        res.status(500).json({ message: "❌ Lỗi xử lý chung trên Server." });
    }
});

// ============================================================
// 💬 CHAT & 🧮 GIẢI TOÁN API (Sử dụng hàm chung)
// ============================================================

// Xử lý logic Gemini chung cho Chat và Toán
async function handleGeminiApi(req, res, systemInstruction) {
    const { message, question, image, language } = req.body;
    const prompt = message || question; // Dùng chung cho cả 2 mode

    if (!prompt && !image) {
        return res.status(400).json({ response: "Thiếu nội dung hoặc ảnh." });
    }

    try {
        const userParts = buildContentParts(prompt, image, systemInstruction);
        const contents = [{ role: "user", parts: userParts }];
        
        const { text: reply, status } = await callGeminiModel(contents);

        if (status === 200) {
            res.json({ response: reply });
        } else {
            // Trả lỗi Gemini về Client với mã HTTP chính xác
            res.status(status).json({ response: reply });
        }
    } catch (error) {
        console.error("Lỗi xử lý API:", error);
        res.status(500).json({ response: `❌ Lỗi xử lý dữ liệu trên server: ${error.message}` });
    }
}

// API Chat
app.post("/api/chat", (req, res) => {
    const languageMap = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' };
    const langName = languageMap[req.body.language] || languageMap['vi'];
    const systemInstruction = `
        Bạn là trợ lý AI thông minh, thân thiện. Hãy trả lời bằng **${langName}**.
        - Trả lời **NGẮN GỌN, TRỌNG TÂM**.
        - Nếu có ý chính/kết quả, hãy bọc trong <mark class="highlight">...</mark>.
        - KHÔNG thêm giới thiệu/đoạn lan man.
        - Nếu người dùng gửi ảnh, phân tích ảnh và trả lời dựa trên nội dung ảnh.
    `;
    handleGeminiApi(req, res, systemInstruction);
});

// API Giải Toán
app.post("/api/math", (req, res) => {
    const systemInstruction = `
        Hãy giải bài toán sau **ngắn gọn nhất có thể**, bằng tiếng Việt.
        - Chỉ hiển thị **bước chính** và **kết quả cuối cùng**.
        - Viết công thức bằng LaTeX (dấu $...$ hoặc $$...$$).
        - Tô màu vàng kết quả quan trọng bằng <mark class="highlight">...</mark>.
        - Nếu có ảnh, hãy phân tích ảnh để giải bài toán.
    `;
    handleGeminiApi(req, res, systemInstruction);
});

// ============================================================
// 🚀 KHỞI ĐỘNG SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`✅ Server đang chạy tại http://localhost:${PORT} (Model: ${GEMINI_MODEL})`);
    if (!GEMINI_API_KEY) console.warn("⚠️ GEMINI_API_KEY chưa được thiết lập. Chat và giải toán sẽ không hoạt động!");
});
server.timeout = 300000;