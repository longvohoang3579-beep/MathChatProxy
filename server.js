// ============================================================
// 🤖 AI PROXY SERVER (Gemini 2.5 Flash + Pollinations + Video)
// ============================================================

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
// Tăng giới hạn payload lên 50MB để chứa ảnh Base64
app.use(bodyParser.json({ limit: "50mb" }));
// Phục vụ file tĩnh (index.html cùng thư mục)
app.use(express.static("."));

// ============================================================
// 🧠 CẤU HÌNH GEMINI
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash"; // Nâng cấp lên 1.5 flash để phân tích ảnh tốt hơn
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`; // API URL mới cho v1beta

if (!GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY chưa được thiết lập trong .env. Chat và giải toán sẽ không hoạt động!");
}

// ======== Hàm gọi Gemini API (retry/backoff) ========
async function callGeminiModel(contents) {
  if (!GEMINI_API_KEY) return "❌ Thiếu GEMINI_API_KEY trong .env.";

  try {
    for (let i = 0; i < 3; i++) {
      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          return data.candidates[0].content.parts[0].text;
        }
        if (data.error) {
          console.error("❌ Lỗi API từ Gemini:", data.error);
          return `❌ Lỗi API từ Gemini: ${data.error.message}`;
        }
        // Xử lý trường hợp bị block do safety settings
        if (data.candidates?.[0]?.finishReason === 'SAFETY') {
            console.warn("❌ Gemini đã chặn phản hồi do cài đặt an toàn.");
            return "❌ Gemini đã chặn phản hồi do vi phạm chính sách an toàn.";
        }
        return "❌ Không có phản hồi văn bản hợp lệ từ Gemini.";
      }

      const errorText = await response.text();
      console.error(`❌ Lỗi HTTP ${response.status} từ Gemini API: ${errorText}`);

      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return `❌ Lỗi HTTP ${response.status} khi gọi Gemini. Vui lòng kiểm tra lại API Key.`;
    }
    return "❌ Đã thử lại nhưng vẫn lỗi khi gọi Gemini.";
  } catch (error) {
    console.error("🔥 Lỗi khi gọi Gemini:", error);
    return "❌ Lỗi khi kết nối đến Google Gemini. (Kiểm tra server/mạng)";
  }
}

// ======== Hàm build content parts (text + inline image) ========
function buildContentParts(text, image, systemInstruction) {
    let userParts = [];
    // Thêm system instruction vào một turn riêng để hoạt động tốt hơn với model mới
    const contents = [];
    if (systemInstruction) {
        contents.push({
            role: "user",
            parts: [{ text: "Lệnh hệ thống: " + systemInstruction }]
        });
        contents.push({ role: "model", parts: [{ text: "Tôi đã hiểu và sẽ tuân theo chỉ dẫn." }] });
    }

    const textPart = text || (image ? "Vui lòng phân tích và mô tả chi tiết bức ảnh này." : "");
    if (textPart) {
        userParts.push({ text: textPart });
    }

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
    contents.push({ role: "user", parts: userParts });
    return contents;
}


// ======== Dịch sang tiếng Anh (fallback: trả text gốc) ========
async function translateToEnglish(text) {
  if (!text) return "";
  if (GEMINI_API_KEY) {
    try {
      const promptTranslate = `Translate the following text to English. Return ONLY the translated text, without any introductory phrases or quotes. Text: "${text}"`;
      const contents = [{ role: "user", parts: [{ text: promptTranslate }] }];
      const response = await callGeminiModel(contents);
      if (response && !response.startsWith("❌")) {
        return response.replace(/^"|"$/g, '').trim();
      }
      return text; // Fallback to original text if translation fails
    } catch (err) {
      console.error("Lỗi dịch với Gemini:", err);
      return text;
    }
  }
  return text; // Fallback if no Gemini key
}

// ============================================================
// 🖼️ API TẠO ẢNH (Pollinations - Có dịch đa ngôn ngữ)
// ============================================================
app.post("/api/pollinations-image", async (req, res) => {
  let { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });

  try {
    const translatedPrompt = await translateToEnglish(prompt);
    const safePrompt = encodeURIComponent(translatedPrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=1024&height=1024`;
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
            const r = await fetch(url, { timeout: 45000 }); // Thêm timeout 45 giây
            if (r.ok) {
                const buffer = Buffer.from(await r.arrayBuffer());
                return `data:image/jpeg;base64,${buffer.toString("base64")}`;
            }
            if (attempt < maxRetries) {
                console.warn(`⚠️ Cảnh báo: Khung hình ${index} lỗi (HTTP ${r.status}). Thử lại lần ${attempt}/${maxRetries}.`);
                await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
            } else {
                console.error(`❌ Lỗi tải khung hình ${index} sau ${maxRetries} lần thử (HTTP ${r.status}). Bỏ qua.`);
            }
        } catch (e) {
            if (attempt < maxRetries) {
                console.warn(`⚠️ Cảnh báo: Khung hình ${index} lỗi mạng (${e.name}). Thử lại lần ${attempt}/${maxRetries}.`);
                await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
            } else {
                console.error(`❌ Lỗi tải khung hình ${index} sau ${maxRetries} lần thử: ${e.message}. Bỏ qua.`);
            }
        }
    }
    return null; // Thất bại sau tất cả các lần thử
}

// ============================================================
// 🎞️ API TẠO VIDEO TỪ ẢNH GỐC (TÍNH NĂNG MỚI)
// ============================================================
app.post("/api/video-from-image", async (req, res) => {
    const { image, prompt } = req.body;
    if (!image) {
        return res.status(400).json({ message: "Vui lòng cung cấp ảnh gốc." });
    }

    try {
        // 1. Dùng Gemini để tạo prompt chi tiết từ ảnh
        console.log("🤖 Bắt đầu dùng Gemini để phân tích ảnh...");
        const geminiSystemInstruction = `Analyze this image and describe it in a highly detailed, vivid, and artistic English prompt suitable for an AI image generator like Pollinations.ai. Focus on the main subject, background, style, colors, lighting, and composition. If the user provides an additional prompt, integrate it creatively into the description. Return ONLY the final English prompt, nothing else.`;
        
        let contents = [];
        const userParts = [];

        // Thêm prompt bổ sung của người dùng nếu có
        const textForGemini = prompt ? `User's additional instruction: "${prompt}"` : "Describe the image.";
        userParts.push({ text: textForGemini });

        // Thêm ảnh Base64
        const parts = image.split(',');
        const mimeTypeMatch = parts[0].match(/data:(.*?);/);
        if (mimeTypeMatch && parts.length === 2) {
            userParts.push({ inlineData: { mimeType: mimeTypeMatch[1], data: parts[1] } });
        } else {
            return res.status(400).json({ message: "Định dạng ảnh Base64 không hợp lệ." });
        }
        
        // Cấu trúc contents cho Gemini
        contents.push({ role: "user", parts: [{ text: "System instruction: " + geminiSystemInstruction }]});
        contents.push({ role: "model", parts: [{ text: "Understood. I will provide a detailed English prompt based on the image and user instructions." }]});
        contents.push({ role: "user", parts: userParts });

        const basePromptFromImage = await callGeminiModel(contents);

        if (!basePromptFromImage || basePromptFromImage.startsWith("❌")) {
            console.error("Lỗi từ Gemini khi phân tích ảnh:", basePromptFromImage);
            return res.status(500).json({ message: "Không thể phân tích ảnh bằng AI. " + basePromptFromImage });
        }
        console.log("✅ Gemini đã tạo prompt thành công:", basePromptFromImage);

        // 2. Dùng prompt chi tiết để tạo các khung hình
        const framesCount = 12;
        console.log(`Bắt đầu tải ${framesCount} khung hình cho prompt vừa tạo...`);

        const downloadPromises = [];
        for (let i = 0; i < framesCount; i++) {
            const variation = `${basePromptFromImage}, motion frame ${i + 1} of ${framesCount}, cinematic, high detail, 8k`;
            const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(variation)}?nologo=true&width=512&height=512`;
            downloadPromises.push(fetchFrameWithRetry(url, i + 1));
        }

        const frames = await Promise.all(downloadPromises);
        const validFrames = frames.filter(f => f); // Lọc bỏ các giá trị null

        if (validFrames.length < 8) {
            console.error(`❌ Chỉ tải được ${validFrames.length}/${framesCount} khung hình.`);
            return res.status(500).json({ message: `❌ Không thể tải đủ khung hình (${validFrames.length}/${framesCount}). Vui lòng thử lại với ảnh khác.` });
        }

        console.log(`✅ Đã tải thành công ${validFrames.length} khung hình.`);
        res.json({ frames: validFrames });

    } catch (error) {
        console.error("❌ Lỗi xử lý chung khi tạo video từ ảnh:", error);
        res.status(500).json({ message: "❌ Lỗi không xác định trên server. Kiểm tra console để biết thêm chi tiết." });
    }
});


// ============================================================
// 💬 CHAT
// ============================================================
app.post("/api/chat", async (req, res) => {
  const { message, history, language, image } = req.body;
  if (!message && !image) return res.status(400).json({ response: "Thiếu nội dung chat hoặc ảnh." });

  const languageMap = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' };
  const langName = languageMap[language] || languageMap['vi'];

  const systemInstruction = `You are a friendly AI assistant. Respond in **${langName}**. Keep answers **CONCISE and FOCUSED**. If there is a key point, wrap it in <mark class="highlight">...</mark>. DO NOT use introductory fluff. If an image is provided, analyze it and answer based on its content.`;

  try {
    let conversationHistory = [];
    if (Array.isArray(history)) {
      history.forEach(item => {
        const role = item.role === "assistant" ? "model" : item.role;
        conversationHistory.push({ role: role, parts: [{ text: item.text }] });
      });
    }

    const contents = buildContentParts(message, image, systemInstruction);
    // Kết hợp history và request mới
    const finalContents = [...conversationHistory, ...contents];

    const reply = await callGeminiModel(finalContents);
    res.json({ response: reply });
  } catch (error) {
    console.error("Lỗi xử lý chat:", error);
    res.status(500).json({ response: "❌ Lỗi xử lý dữ liệu chat trên server." });
  }
});

// ============================================================
// 🧮 GIẢI TOÁN
// ============================================================
app.post("/api/math", async (req, res) => {
  const { question, image } = req.body;
  if (!question && !image) return res.status(400).json({ response: "Thiếu đề toán hoặc ảnh bài toán." });

  const systemInstruction = `Solve the following math problem as concisely as possible in Vietnamese. Show only the **main steps** and the **final result**. Use LaTeX for formulas ($...$). Highlight important results and concepts with <mark class="highlight">...</mark>. If an image is provided, analyze it to solve the problem shown.`;

  try {
    const contents = buildContentParts(question, image, systemInstruction);
    const reply = await callGeminiModel(contents[contents.length - 1].parts); // Gửi phần user mới nhất
    res.json({ response: reply });
  } catch (error) {
    console.error("Lỗi xử lý toán:", error);
    res.status(500).json({ response: "❌ Lỗi xử lý dữ liệu toán trên server." });
  }
});


// ============================================================
// 🚀 KHỞI ĐỘNG SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT} (Model: ${GEMINI_MODEL})`);
  if (!GEMINI_API_KEY) console.warn("⚠️ GEMINI_API_KEY chưa được thiết lập. Các tính năng AI sẽ không hoạt động!");
});
server.timeout = 600000; // Tăng timeout của server lên 10 phút để xử lý video