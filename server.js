// ============================================================
// 🤖 MATH CHAT PROXY SERVER (Gemini 2.5 Flash + Pollinations)
// ============================================================

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(bodyParser.json());

// 🧩 Phục vụ file tĩnh (index.html cùng thư mục)
app.use(express.static("."));

// ============================================================
// 🧠 CẤU HÌNH GEMINI 2.5 FLASH
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

// Cảnh báo nếu thiếu API key
if (!GEMINI_API_KEY) {
  console.warn(
    "⚠️ WARNING: GEMINI_API_KEY chưa được thiết lập trong .env. Chat và giải toán sẽ không hoạt động!"
  );
}

// ======== 🔹 Hàm gọi Gemini API ========
/**
 * Hàm gọi chung API Gemini.
 * @param {Array} contents Mảng lịch sử chat hoặc prompt đơn.
 * @returns {Promise<string>} Phản hồi từ model hoặc thông báo lỗi.
 */
async function callGeminiModel(contents) { 
  if (!GEMINI_API_KEY) return "❌ Thiếu GEMINI_API_KEY trong .env.";

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }), // Gửi mảng contents
    });

    // Xử lý lỗi HTTP (ví dụ: 404, 403, 500)
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Lỗi HTTP ${response.status} từ Gemini API: ${errorText}`);
      return `❌ Lỗi HTTP ${response.status} khi gọi Gemini. Vui lòng kiểm tra lại API Key.`;
    }

    const data = await response.json();

    // Trích xuất văn bản an toàn
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    } 
    
    // Xử lý lỗi API trong phản hồi JSON
    if (data.error) {
      console.error("❌ Lỗi API từ Gemini:", data.error);
      return `❌ Lỗi API từ Gemini: ${data.error.message}`;
    }

    console.log("Phản hồi Gemini không hợp lệ (Debug):", JSON.stringify(data, null, 2));
    return "❌ Không có phản hồi văn bản hợp lệ từ Gemini.";

  } catch (error) {
    console.error("🔥 Lỗi khi gọi Gemini:", error);
    // Lỗi kết nối đến server sẽ bị bắt ở đây.
    return "❌ Lỗi khi kết nối đến Google Gemini. (Kiểm tra server/mạng)";
  }
}

// ============================================================
// 🖼️ API TẠO ẢNH (Pollinations - Giữ nguyên)
// ============================================================
app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả ảnh." });

  try {
    const safePrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=1024&height=1024`;
    res.json({ imageUrl });
  } catch (error) {
    console.error("Lỗi Pollinations:", error);
    res.status(500).json({ message: "Không thể tạo ảnh." });
  }
});

// ============================================================
// 💬 CHAT TỔNG HỢP (Đã sửa lỗi và tối ưu hóa)
// ============================================================
app.post("/api/chat", async (req, res) => {
  const { message, history } = req.body; 
  if (!message) return res.status(400).json({ response: "Thiếu nội dung chat." });

  // 1. Định nghĩa System Instruction
  const systemInstruction = `
  Bạn là trợ lý AI thông minh, trả lời bằng tiếng Việt, thân thiện. 
  Hãy trả lời **cực kỳ ngắn gọn**, chỉ tập trung vào **trọng tâm** của câu hỏi.
  Nếu có ý chính/kết quả, hãy bọc trong <mark class="highlight">...</mark> để tô màu vàng.
  `;
  
  // 2. Xử lý lịch sử chat: Đảm bảo chuyển đổi đúng định dạng
  let contents = [];
  
  if (Array.isArray(history)) {
    history.forEach(item => {
      // API Gemini sử dụng "model" thay vì "assistant" cho AI
      const role = item.role === "assistant" ? "model" : item.role;
      
      // Thêm các tin nhắn cũ vào lịch sử
      contents.push({
        role: role,
        parts: [{ text: item.text }]
      });
    });
  }

  // 3. Gắn System Instruction vào tin nhắn người dùng cuối cùng
  // Tin nhắn mới nhất (message) đã được thêm vào cuối mảng 'history' ở client.
  
  const lastMessageEntry = contents[contents.length - 1];

  if (lastMessageEntry && lastMessageEntry.role === "user") {
    // Thêm System Instruction vào tin nhắn cuối cùng của user
    lastMessageEntry.parts[0].text = systemInstruction + "\n\nTin nhắn: " + message;
  } else {
    // Trường hợp dự phòng nếu mảng history rỗng hoặc sai cấu trúc
    contents = [{ 
      role: "user", 
      parts: [{ text: systemInstruction + "\n\nTin nhắn: " + message }]
    }];
  }


  try {
    const reply = await callGeminiModel(contents);
    res.json({ response: reply });
  } catch (error) {
    console.error("Lỗi xử lý chat:", error);
    res.status(500).json({ response: "❌ Lỗi xử lý dữ liệu chat trên server." });
  }
});

// ============================================================
// 🧮 GIẢI TOÁN (ngắn gọn, LaTeX, highlight vàng - Giữ nguyên)
// ============================================================
app.post("/api/math", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ response: "Thiếu đề toán." });

  const prompt = `
  Hãy giải bài toán sau **ngắn gọn nhất có thể**, bằng tiếng Việt dễ hiểu. 
  - Chỉ hiển thị **bước chính** và **kết quả cuối cùng**.
  - Viết công thức bằng LaTeX (dấu $...$).
  - Tô màu vàng các kết quả và ý quan trọng bằng <mark class="highlight">...</mark>.
  Bài toán: ${question}
  `;
    
  // Tạo cấu trúc contents cho prompt đơn (Toán không cần lịch sử)
  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  const reply = await callGeminiModel(contents);
  res.json({ response: reply });
});

// ============================================================
// 🚀 KHỞI ĐỘNG SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT} (Model: ${GEMINI_MODEL})`);
  if (!GEMINI_API_KEY)
    console.warn(
      "⚠️ GEMINI_API_KEY chưa được thiết lập. Chat và giải toán sẽ không hoạt động!"
    );
});