import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";

dotenv.config();
const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static("."));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// ✅ SỬA LỖI: Sử dụng model mới nhất hỗ trợ ảnh và API v1beta
const GEMINI_MODEL = "gemini-1.5-flash"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY is not set!");
}

async function callGeminiModel(contents) {
    if (!GEMINI_API_KEY) return "❌ Error: GEMINI_API_KEY is not provided in the .env file.";
    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents }),
        });
        const data = await response.json();
        if (!response.ok) {
            console.error("❌ Error from Gemini API:", data);
            const errorMessage = data.error?.message || 'No details provided. Ensure your API Key is correct and the Google Cloud Project has the "Vertex AI API" enabled and a billing account linked.';
            return `❌ HTTP Error ${response.status}: ${errorMessage}`;
        }
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        }
        return "❌ No valid response received from Gemini.";
    } catch (error) {
        console.error("🔥 Connection error to Gemini:", error);
        return "❌ Connection error to Google Gemini. Please check the server's network connection.";
    }
}

function buildContentParts(text, image, systemInstruction) {
  let parts = [{ text: `${systemInstruction}\n\nUser query: ${text || "Please analyze this image."}` }];
  if (image) {
    const match = image.match(/data:(.*?);(.*?),(.*)/);
    if (match) {
      const [, mimeType, , data] = match;
      parts.push({ inlineData: { mimeType, data } });
    }
  }
  return parts;
}

async function translateToEnglish(text) {
    if (!text || /^[a-zA-Z0-9\s.,?!'-]*$/.test(text)) {
        return text;
    }
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const data = await response.json();
        const translatedText = data[0].map(item => item[0]).join('');
        if(translatedText) return translatedText;
        throw new Error("Empty translation result.");
    } catch (error) {
        console.error("❌ Translation error, using original text:", error.message);
        return text;
    }
}

// ===================================
// === API ENDPOINTS
// ===================================

app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "A description is required." });
  try {
    const translatedText = await translateToEnglish(prompt);
    const safePrompt = encodeURIComponent(translatedText);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=1024&height=1024`;
    res.json({ imageUrl });
  } catch (error) {
    res.status(500).json({ message: "Could not create image." });
  }
});

async function handleGeminiRequest(req, res, systemInstruction) {
    const { message, question, image } = req.body;
    const text = message || question;
    if (!text && !image) return res.status(400).json({ response: "Missing content." });
    try {
        const userParts = buildContentParts(text, image, systemInstruction);
        const contents = [{ role: "user", parts: userParts }];
        const reply = await callGeminiModel(contents);
        res.json({ response: reply });
    } catch (error) {
        res.status(500).json({ response: "Error processing data on the server." });
    }
}

app.post("/api/chat", (req, res) => {
    const { language } = req.body;
    const langName = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' }[language] || 'Tiếng Việt';
    const systemInstruction = `You are an AI assistant. Respond in **${langName}**. Keep answers **CONCISE**, use markdown, and highlight key points with <mark class="highlight">...</mark>.`;
    handleGeminiRequest(req, res, systemInstruction);
});

app.post("/api/math", (req, res) => {
    const systemInstruction = `Solve the math problem in Vietnamese. Show only the **main steps** and the **final result**. Use LaTeX for formulas ($...$) and <mark class="highlight">...</mark> for the result.`;
    handleGeminiRequest(req, res, systemInstruction);
});

// THÊM MỚI: API TÓM TẮT YOUTUBE
app.post("/api/summarize-youtube", async (req, res) => {
    const { youtubeUrl } = req.body;
    if (!youtubeUrl) {
        return res.status(400).json({ response: "Vui lòng cung cấp URL YouTube." });
    }
    try {
        const loader = YoutubeLoader.createFromUrl(youtubeUrl, {
            language: "en",
            addVideoInfo: true,
        });
        const docs = await loader.load();
        const transcript = docs.map(doc => doc.pageContent).join("\n");
        if (!transcript) {
            return res.status(500).json({ response: "Không thể lấy được phụ đề từ video này. Video có thể không có phụ đề hoặc bị giới hạn." });
        }

        const systemInstruction = "Bạn là một chuyên gia tóm tắt nội dung. Dựa vào bản ghi phụ đề (transcript) của video YouTube được cung cấp, hãy tóm tắt nội dung chính một cách ngắn gọn, rõ ràng bằng tiếng Việt. Bắt đầu bằng tiêu đề video và kênh, sau đó trình bày các ý chính theo gạch đầu dòng.";
        const contents = [{
            role: "user",
            parts: [{ text: `${systemInstruction}\n\nTranscript:\n${transcript}` }]
        }];
        
        const summary = await callGeminiModel(contents);
        res.json({ response: summary });
    } catch (error) {
        console.error("Youtube Summarize Error:", error);
        res.status(500).json({ response: `Lỗi khi tóm tắt video: ${error.message}`});
    }
});

// Endpoint này không thay đổi
app.post("/api/pollinations-frames", (req, res) => {
    // Logic tạo video của bạn ở đây
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});