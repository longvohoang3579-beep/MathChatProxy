// ============================================================
// 🤖 AI PROXY SERVER (Gemini 2.5 Flash + Pollinations)
// ============================================================

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
// Tăng giới hạn payload lên 50MB để chứa ảnh Base64. Đây là thay đổi quan trọng
// để tránh lỗi ngắt kết nối khi gửi ảnh dung lượng lớn.
app.use(bodyParser.json({ limit: "50mb" }));

// 🧩 Phục vụ file tĩnh (index.html cùng thư mục)
app.use(express.static("."));

// ============================================================
// 🧠 CẤU HÌNH GEMINI 2.5 FLASH
// ============================================================
// Lưu ý: Cần sử dụng model hỗ trợ Vision (ví dụ: gemini-2.5-flash)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; // Hỗ trợ đa phương thức
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

// Cảnh báo nếu thiếu API key
if (!GEMINI_API_KEY) {
  console.warn(
    "⚠️ WARNING: GEMINI_API_KEY chưa được thiết lập trong .env. Chat và giải toán sẽ không hoạt động!"
  );
}

// ======== 🔹 Hàm gọi Gemini API (Có Retry/Exponential Backoff) ========
/**
 * Hàm gọi chung API Gemini.
 * @param {Array} contents Mảng lịch sử chat (bao gồm cả ảnh).
 * @returns {Promise<string>} Phản hồi từ model hoặc thông báo lỗi.
 */
async function callGeminiModel(contents) { 
  if (!GEMINI_API_KEY) return "❌ Thiếu GEMINI_API_KEY trong .env.";

  try {
    // Thử lại (exponential backoff) nếu có lỗi mạng hoặc lỗi server
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
        return "❌ Không có phản hồi văn bản hợp lệ từ Gemini.";
      }

      const errorText = await response.text();
      console.error(`❌ Lỗi HTTP ${response.status} từ Gemini API: ${errorText}`);

      // Nếu là lỗi 429 (Rate Limit) hoặc lỗi server (5xx), thử lại
      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Lỗi khác (4xx), thoát
      return `❌ Lỗi HTTP ${response.status} khi gọi Gemini. Vui lòng kiểm tra lại API Key.`;
    }
    return "❌ Đã thử lại nhưng vẫn lỗi khi gọi Gemini.";
  } catch (error) {
    console.error("🔥 Lỗi khi gọi Gemini:", error);
    return "❌ Lỗi khi kết nối đến Google Gemini. (Kiểm tra server/mạng)";
  }
}

// ======== 🔹 Hàm xây dựng nội dung đa phương thức (Ảnh và Text) ========
/**
 * Xây dựng mảng parts cho yêu cầu Gemini, bao gồm text (với systemInstruction) và ảnh Base64.
 */
function buildContentParts(text, image, systemInstruction) {
  let userParts = [];

  // 1. Thêm System Instruction + Tin nhắn văn bản
  const textPart = systemInstruction + "\n\nTin nhắn: " + (text || "Vui lòng phân tích và mô tả chi tiết bức ảnh này.");
  userParts.push({ text: textPart });
  
  // 2. Thêm ảnh (nếu có)
  if (image) {
    const parts = image.split(',');
    const mimeTypeMatch = parts[0].match(/data:(.*?);/);
    
    if (mimeTypeMatch && parts.length === 2) {
      userParts.push({
        inlineData: {
          mimeType: mimeTypeMatch[1],
          data: parts[1] // Raw Base64 data
        }
      });
    } else {
      throw new Error("Lỗi định dạng ảnh Base64 không hợp lệ.");
    }
  }
  return userParts;
}


// ============================================================
// 🖼️ API TẠO ẢNH (Pollinations)
// ============================================================
app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });

  try {
    const safePrompt = encodeURIComponent(prompt);
    // Pollinations API: Tạo ảnh dựa trên prompt, không logo, kích thước 1024x1024
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=1024&height=1024`;
    res.json({ imageUrl });
  } catch (error) {
    console.error("Lỗi Pollinations:", error);
    res.status(500).json({ message: "Không thể tạo ảnh." });
  }
});

// ============================================================
// 💬 CHAT TỔNG HỢP (Hỗ trợ Chat Liên tục, Highlight VÀ ẢNH)
// ============================================================
app.post("/api/chat", async (req, res) => {
  const { message, history, language, image } = req.body; 
  if (!message && !image) return res.status(400).json({ response: "Thiếu nội dung chat hoặc ảnh." });

  // 1. Định nghĩa System Instruction
  const languageMap = {
    'vi': 'Tiếng Việt',
    'en': 'English (Tiếng Anh)',
    'zh-CN': '简体中文 (Tiếng Trung Giản thể)'
  };
  
  const langName = languageMap[language] || languageMap['vi'];
  
  const systemInstruction = `
  Bạn là trợ lý AI thông minh, thân thiện. Hãy trả lời bằng **${langName}**.
  Hãy trả lời một cách **mở rộng, chi tiết và cung cấp thêm thông tin liên quan** thay vì chỉ trả lời ngắn gọn.
  Cố gắng viết ít nhất 3-4 đoạn văn cho mỗi câu trả lời.
  Nếu có ý chính/kết quả, hãy bọc trong <mark class="highlight">...</mark> để tô màu vàng.
  Nếu người dùng gửi ảnh, hãy phân tích ảnh và trả lời dựa trên nội dung ảnh.
  `;
  
  // 2. Xử lý lịch sử chat: Đảm bảo chuyển đổi đúng định dạng (chỉ text)
  let contents = [];
  if (Array.isArray(history)) {
    history.forEach(item => {
      const role = item.role === "assistant" ? "model" : item.role;
      contents.push({
        role: role,
        parts: [{ text: item.text }] 
      });
    });
  }

  // 3. Xây dựng parts cho tin nhắn người dùng hiện tại (có thể chứa ảnh)
  try {
    const userParts = buildContentParts(message, image, systemInstruction);

    // Thêm tin nhắn/ảnh hiện tại vào lịch sử chat
    contents.push({
      role: "user",
      parts: userParts
    });
    
    const reply = await callGeminiModel(contents);
    res.json({ response: reply });
  } catch (error) {
    console.error("Lỗi xử lý chat:", error);
    res.status(500).json({ response: "❌ Lỗi xử lý dữ liệu chat trên server." });
  }
});

// ============================================================
// 🧮 GIẢI TOÁN (Ngắn gọn, LaTeX, Highlight, hỗ trợ Ảnh)
// ============================================================
app.post("/api/math", async (req, res) => {
  const { question, image } = req.body;
  if (!question && !image) return res.status(400).json({ response: "Thiếu đề toán hoặc ảnh bài toán." });

  // 💡 YÊU CẦU NGẮN GỌN VÀ CHỈ TẬP TRUNG VÀO TRỌNG TÂM
  const systemInstruction = `
  Hãy giải bài toán sau **ngắn gọn nhất có thể**, bằng tiếng Việt dễ hiểu. 
  - Chỉ hiển thị **bước chính** và **kết quả cuối cùng**. KHÔNG MỞ RỘNG.
  - Viết công thức bằng LaTeX (dấu $...$).
  - Tô màu vàng các kết quả và ý quan trọng bằng <mark class="highlight">...</mark>.
  - Nếu có ảnh, hãy phân tích ảnh để giải bài toán trong ảnh.
  `;
    
  // Tạo cấu trúc contents cho prompt đơn
  try {
    const userParts = buildContentParts(question, image, systemInstruction);
    const contents = [{ role: "user", parts: userParts }];

    const reply = await callGeminiModel(contents);
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
  if (!GEMINI_API_KEY)
    console.warn(
      "⚠️ GEMINI_API_KEY chưa được thiết lập. Chat và giải toán sẽ không hoạt động!"
    );
});

// ** Sửa lỗi: Tăng thời gian chờ (timeout) cho server **
// Đã tăng lên 5 phút (300,000ms) để xử lý payload ảnh lớn, giải quyết lỗi "Lỗi kết nối server" trước đó.
server.timeout = 300000; 