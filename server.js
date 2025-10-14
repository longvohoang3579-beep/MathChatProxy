// ============================================================
// 🤖 AI PROXY SERVER (Gemini 2.5 Flash + Pollinations + Video)
// ============================================================

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();

// ===== Cho phép frontend kết nối (CORS) =====
app.use(cors());

// ===== Cấu hình nhận dữ liệu lớn =====
app.use(bodyParser.json({ limit: "50mb" }));

// ===== Thêm static để load được chat.html, index.html,... =====
app.use(express.static("./"));

// ============================================================
// 🧠 CẤU HÌNH GEMINI
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY chưa được thiết lập!");
}

// ===== Gọi Gemini API =====
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
      console.error(`❌ Lỗi HTTP ${response.status}: ${errorText}`);
      return `❌ Lỗi HTTP ${response.status} khi gọi Gemini.`;
    }

    const data = await response.json();
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
    if (data.candidates?.[0]?.finishReason === "SAFETY") {
      return "❌ Gemini đã chặn phản hồi do vi phạm chính sách an toàn.";
    }
    return "❌ Không có phản hồi văn bản hợp lệ từ Gemini.";
  } catch (error) {
    console.error("🔥 Lỗi khi gọi Gemini:", error);
    return "❌ Lỗi khi kết nối đến Google Gemini.";
  }
}

// ===== Chuẩn bị dữ liệu người dùng =====
function buildContentParts(text, image, systemInstruction) {
  let userParts = [];
  const textPart =
    systemInstruction +
    "\n\nTin nhắn: " +
    (text || "Vui lòng phân tích và mô tả chi tiết bức ảnh này.");
  userParts.push({ text: textPart });

  if (image) {
    const parts = image.split(",");
    const mimeTypeMatch = parts[0].match(/data:(.*?);/);
    if (mimeTypeMatch && parts.length === 2) {
      userParts.push({
        inlineData: { mimeType: mimeTypeMatch[1], data: parts[1] },
      });
    } else {
      throw new Error("Lỗi định dạng ảnh Base64 không hợp lệ.");
    }
  }
  return userParts;
}

// ===== Dịch sang tiếng Anh =====
async function translateToEnglish(text) {
  if (!text) return "";
  if (GEMINI_API_KEY) {
    try {
      const promptTranslate = `Dịch văn bản sau sang tiếng Anh, chỉ trả về văn bản đã dịch. KHÔNG THÊM BẤT KỲ LỜI NÓI ĐẦU HAY LỜI KẾT NÀO. Văn bản: "${text}"`;
      const contents = [{ role: "user", parts: [{ text: promptTranslate }] }];
      const response = await callGeminiModel(contents);
      if (response && !response.startsWith("❌")) {
        return response.replace(/^"|"$/g, "").trim();
      }
      return text;
    } catch (err) {
      console.error("Lỗi dịch với Gemini:", err);
      return text;
    }
  }
  try {
    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) +
      "&langpair=vi|en";
    const r = await fetch(url);
    const d = await r.json();
    return d.responseData?.translatedText || text;
  } catch (e) {
    return text;
  }
}

// ============================================================
// 🖼️ API TẠO ẢNH
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

// ===== Tải khung hình =====
async function fetchFrameWithRetry(url, index, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const r = await fetch(url, { timeout: 45000 });
      if (r.ok) {
        const buffer = Buffer.from(await r.arrayBuffer());
        return `data:image/jpeg;base64,${buffer.toString("base64")}`;
      }
      if (attempt < maxRetries)
        await new Promise((r) => setTimeout(r, 1500 * attempt));
    } catch (e) {
      console.warn(`⚠️ Khung hình ${index} lỗi mạng (${e.name}). Thử lại lần ${attempt}/${maxRetries}.`);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  console.error(`❌ Lỗi tải khung hình ${index} sau ${maxRetries} lần thử. Bỏ qua.`);
  return null;
}

// ===== API TẠO KHUNG HÌNH =====
app.post("/api/pollinations-frames", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả." });

  try {
    const translatedPrompt = await translateToEnglish(prompt);
    const framesCount = 12;
    const batchSize = 4;
    const allFrames = [];

    console.log(`Bắt đầu tải ${framesCount} khung hình cho prompt: "${translatedPrompt}"`);

    for (let i = 0; i < framesCount; i += batchSize) {
      const batchPromises = [];
      for (let j = i; j < i + batchSize && j < framesCount; j++) {
        const variation = `${translatedPrompt}, motion frame ${j + 1} of ${framesCount}, cinematic`;
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
          variation
        )}?nologo=true&width=512&height=512`;
        batchPromises.push(fetchFrameWithRetry(url, j + 1));
      }
      const batchResults = await Promise.all(batchPromises);
      allFrames.push(...batchResults);
    }

    const validFrames = allFrames.filter((f) => f);
    if (validFrames.length < 8) {
      return res
        .status(500)
        .json({ message: `Không thể tải đủ khung hình (${validFrames.length}/${framesCount}).` });
    }

    console.log(`✅ Tải thành công ${validFrames.length} khung hình.`);
    res.json({ frames: validFrames });
  } catch (error) {
    console.error("❌ Lỗi xử lý khung hình:", error);
    res.status(500).json({ message: "Lỗi xử lý chung trên Server." });
  }
});

// ============================================================
// 💬 CHAT
// ============================================================
app.post("/api/chat", async (req, res) => {
  const { message, history, language, image } = req.body;
  if (!message && !image)
    return res.status(400).json({ response: "Thiếu nội dung chat hoặc ảnh." });

  const languageMap = {
    vi: "Tiếng Việt",
    en: "English (Tiếng Anh)",
    "zh-CN": "简体中文 (Tiếng Trung Giản thể)",
  };
  const langName = languageMap[language] || languageMap["vi"];

  const systemInstruction = `
Bạn là trợ lý AI thông minh, thân thiện. Hãy trả lời bằng **${langName}**.
- Trả lời **NGẮN GỌN, TRỌNG TÂM**, chỉ tập trung vào câu hỏi.
- Nếu có ý chính/kết quả, bọc trong <mark class="highlight">...</mark>.
- KHÔNG thêm giới thiệu hay đoạn lan man.
- Nếu có ảnh, phân tích và trả lời dựa trên nội dung ảnh.
`;

  let contents = [];
  if (Array.isArray(history)) {
    history.forEach((item) => {
      const role = item.role === "assistant" ? "model" : item.role;
      contents.push({ role: role, parts: [{ text: item.text }] });
    });
  }

  try {
    const userParts = buildContentParts(message, image, systemInstruction);
    contents.push({ role: "user", parts: userParts });
    const reply = await callGeminiModel(contents);
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
  if (!question && !image)
    return res.status(400).json({ response: "Thiếu đề toán hoặc ảnh bài toán." });

  const systemInstruction = `
Hãy giải bài toán sau **ngắn gọn nhất có thể**, bằng tiếng Việt dễ hiểu.
- Chỉ hiển thị **bước chính** và **kết quả cuối cùng**.
- Viết công thức bằng LaTeX (dấu $...$).
- Tô vàng các kết quả/ý chính bằng <mark class="highlight">...</mark>.
- Nếu có ảnh, phân tích ảnh để giải bài toán trong ảnh.
`;

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
});
server.timeout = 300000;
