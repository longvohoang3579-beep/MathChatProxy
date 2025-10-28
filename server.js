import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
// Import đã sửa lỗi
import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";

dotenv.config();
const app = express();

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static(".")); // Phục vụ file tĩnh từ thư mục gốc

// --- Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash"; // Model hỗ trợ ảnh
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) console.warn("⚠️ WARNING: GEMINI_API_KEY is not set!");

// --- Helper Functions ---

async function callGeminiAPI(contents, useWebSearch = false) {
    if (!GEMINI_API_KEY) return "❌ Error: GEMINI_API_KEY is missing.";
    try {
        const tools = useWebSearch ? [{ "google_search_retrieval": {} }] : undefined;
        const body = JSON.stringify({ contents, tools });

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: body,
        });
        const data = await response.json();

        // Xử lý Function Calling (nếu Gemini yêu cầu tìm kiếm)
        const functionCallPart = data.candidates?.[0]?.content?.parts?.find(part => part.functionCall);
        if (functionCallPart && functionCallPart.functionCall.name === 'google_search_retrieval') {
             console.log("Gemini requested function call (web search), responding automatically...");
             const functionResponse = { functionResponse: { name: functionCallPart.functionCall.name, response: { name: functionCallPart.functionCall.name, content: "Web search performed." } } };
             contents.push({ role: "function", parts: [functionResponse] });
             // Gọi lại API lần 2
             const response2 = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents }),
             });
             const data2 = await response2.json();
             if (!response2.ok) throw new Error(data2.error?.message || `Gemini Function Response Error ${response2.status}`);
             if (data2.candidates && data2.candidates[0].finishReason === 'SAFETY') return "❌ Phản hồi bị chặn vì lý do an toàn sau khi tìm kiếm.";
             return data2.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Không có phản hồi hợp lệ sau khi tìm kiếm.";
        }

        // Xử lý phản hồi thông thường
        if (!response.ok) {
            console.error("❌ Gemini API Error:", data);
            const errorMsg = data.error?.message || 'Check API Key & ensure "Vertex AI API" + Billing are enabled.';
            return `❌ HTTP Error ${response.status}: ${errorMsg}`;
        }
        if (data.candidates && data.candidates[0].finishReason === 'SAFETY') return "❌ Phản hồi bị chặn vì lý do an toàn.";
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Không có phản hồi hợp lệ.";
    } catch (error) {
        console.error("🔥 Gemini Connection/Processing Error:", error);
        return `❌ Lỗi kết nối/xử lý Gemini: ${error.message}`;
    }
}


function buildGeminiContent(text, image, systemInstruction) {
  let parts = [{ text: `${systemInstruction}\n\nUser Input: "${text || "No text provided."}"` }];
  if (image) {
    const match = image.match(/data:(image\/.+);base64,(.*)/);
    if (match && match[1] && match[2]) {
      const mimeType = match[1];
      const data = match[2];
      parts.push({ inlineData: { mimeType, data } });
    } else {
        console.warn("⚠️ Invalid image data format provided. Expected data:image/...;base64,...");
        parts.push({ text: "[Invalid Image Data Format]" });
    }
  }
  return [{ role: "user", parts }];
}

async function translateToEnglish(text) {
    if (!text || /^[a-zA-Z0-9\s.,?!'-]*$/.test(text)) return text;
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!response.ok) throw new Error(`Translate API error: ${response.status}`);
        const data = await response.json();
        return data[0]?.map(item => item[0]).join('') || text;
    } catch (error) { console.error("❌ Translation Error:", error.message); return text; }
}

async function handleGeminiRequest(req, res, systemInstruction, inputField = 'message', useWebSearch = false) {
    const { image } = req.body;
    const text = req.body[inputField] || req.body['message'] || req.body['question'] || req.body['textToSummarize'] || req.body['textToConvert'] || req.body['stockSymbol'];
    try {
        const finalSystemInstruction = req.body.systemInstruction || systemInstruction;
        const contents = buildGeminiContent(text, image, finalSystemInstruction);
        const reply = await callGeminiAPI(contents, useWebSearch);
        res.json({ response: reply });
    } catch (error) {
         console.error(`Error in handleGeminiRequest (${req.path}):`, error);
         res.status(500).json({ response: `Server error: ${error.message}` });
    }
}


// --- API Endpoints ---
app.post("/api/chat", (req, res) => {
    const langName = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' }[req.body.language] || 'Tiếng Việt';
    const baseInstruction = `You are a helpful AI assistant. Respond in **${langName}**. Be concise, use markdown, highlight <mark class="highlight">...</mark>. Analyze image if provided.`;
    handleGeminiRequest(req, res, baseInstruction, 'message');
});

app.post("/api/math", (req, res) => {
    const instruction = `Solve math in Vietnamese. Show steps & final result. Use LaTeX ($...$) and <mark class="highlight">...</mark>. Analyze image if provided.`;
    handleGeminiRequest(req, res, instruction, 'question');
});

app.post("/api/edit-image", (req, res) => {
    const instruction = `Analyze image and user text. Generate ONLY a detailed English prompt for an image generation model (like Pollinations) to create the edited image.`;
    handleGeminiRequest(req, res, instruction, 'message');
});

app.post("/api/summarize-text", (req, res) => {
    const instruction = "You are a notetaker. Extract key decisions, action items, main topics from the text. Format in Vietnamese with headings (## Decisions, ## Actions, ## Topics) and bullet points.";
    handleGeminiRequest(req, res, instruction, 'textToSummarize');
});

app.post("/api/generate-flashcards", (req, res) => {
    const instruction = "Based on the provided text, create flashcards in Vietnamese. Format clearly: 'Q: [Question]\\nA: [Answer]' separated by TWO newlines.";
    handleGeminiRequest(req, res, instruction, 'textToConvert');
});

app.post("/api/generate-mindmap", (req, res) => {
    const instruction = "Based on the provided text, generate a mind map structure in Vietnamese using markdown hierarchical lists (* Topic\n  * Subtopic\n    * Detail). Make it concise and logical.";
    handleGeminiRequest(req, res, instruction, 'textToConvert');
});

app.post("/api/summarize-youtube", async (req, res) => {
    const { youtubeUrl } = req.body;
    if (!youtubeUrl) return res.status(400).json({ response: "YouTube URL required." });
    try {
        const loader = YoutubeLoader.createFromUrl(youtubeUrl, { language: "en", addVideoInfo: true });
        const docs = await loader.load();
        let videoInfo = docs[0]?.metadata?.title ? `Video Title: ${docs[0].metadata.title}\nChannel: ${docs[0].metadata.author}\n\n` : "";
        const transcript = docs.map(doc => doc.pageContent).join("\n");
        if (!transcript) return res.status(500).json({ response: "Could not get transcript." });
        const instruction = "Summarize key points of the YouTube transcript in Vietnamese. Start with title/channel.";
        const contents = buildGeminiContent(videoInfo + "Transcript:\n" + transcript.substring(0, 15000), null, instruction);
        const summary = await callGeminiAPI(contents);
        res.json({ response: summary });
    } catch (error) {
        console.error("❌ YouTube Summarize Error:", error);
        const errorMsg = error.message.includes('transcript disabled') ? "Transcript disabled." : error.message.includes('404') ? "Video not found." : error.message;
        res.status(500).json({ response: `Error summarizing video: ${errorMsg}` });
    }
});

app.post("/api/analyze-stock", (req, res) => {
    const instruction = `
You are a stock analyst AI. Analyze the symbol based on knowledge and recent web search.
Provide (in Vietnamese):
1.  **Trend:** Recent trend & timeframe.
2.  **Factors:** 1-2 key influencing factors.
3.  **Related:** Suggest 1-2 similar stocks.
4.  **Chart Concept:** Suggest search query for a *general illustrative chart* (e.g., "stock chart uptrend example").
5.  **Disclaimer:** MUST include: "**Disclaimer:** AI analysis, not financial advice. Consult a professional."`;
    handleGeminiRequest(req, res, instruction, 'stockSymbol', true);
});

app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "A description is required." });
  try {
    const translatedPrompt = await translateToEnglish(prompt);
    const safePrompt = encodeURIComponent(translatedPrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=1024&height=1024`;
    res.json({ imageUrl });
  } catch (error) {
      console.error("Pollinations Image Error:", error);
    res.status(500).json({ message: "Could not create image via Pollinations." });
  }
});

app.post("/api/pollinations-frames", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: "A description is required." });
    try {
        const translatedPrompt = await translateToEnglish(prompt);
        // Logic tạo frames (placeholder)
        console.warn("⚠️ /api/pollinations-frames needs implementation.");
        res.json({ frames: [] });
    } catch (error) {
        res.status(500).json({ message: "Could not create video frames." });
    }
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));