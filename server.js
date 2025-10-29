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
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) console.warn("⚠️ WARNING: GEMINI_API_KEY is not set!");

async function callGeminiAPI(contents, useWebSearch = false) {
    if (!GEMINI_API_KEY) return "❌ Error: GEMINI_API_KEY is missing.";
    try {
        const tools = useWebSearch ? [{ "google_search_retrieval": {} }] : undefined;
        const body = JSON.stringify({ contents, tools });

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: body,
        });
        const data = await response.json();

        const functionCallPart = data.candidates?.[0]?.content?.parts?.find(part => part.functionCall);
        if (functionCallPart) {
             console.log("Gemini requested function call, responding automatically...");
             const functionResponse = { functionResponse: { name: functionCallPart.functionCall.name, response: { name: functionCallPart.functionCall.name, content: "Web search performed." } } };
             contents.push({ role: "function", parts: [functionResponse] });
             const response2 = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents }),
             });
             const data2 = await response2.json();
             if (!response2.ok) throw new Error(data2.error?.message || `Gemini Function Response Error ${response2.status}`);
             if (data2.candidates && data2.candidates[0].finishReason === 'SAFETY') return "❌ Response blocked due to safety concerns.";
             return data2.candidates?.[0]?.content?.parts?.[0]?.text || "❌ No valid response after search.";
        }

        if (!response.ok) {
            const errorMsg = data.error?.message || 'Check API Key & ensure "Vertex AI API" + Billing are enabled.';
            return `❌ HTTP Error ${response.status}: ${errorMsg}`;
        }
        if (data.candidates && data.candidates[0].finishReason === 'SAFETY') return "❌ Response blocked due to safety concerns.";
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "❌ No valid response.";
    } catch (error) {
        console.error("🔥 Gemini Connection/Processing Error:", error);
        return `❌ Connection/Processing error: ${error.message}`;
    }
}

function buildGeminiContent(text, image, systemInstruction) {
  let parts = [{ text: `${systemInstruction}\n\nUser Input: "${text || "No text provided."}"` }];
  if (image) {
    const match = image.match(/data:(image\/.+);base64,(.*)/);
    if (match) {
      const [, mimeType, data] = match;
      parts.push({ inlineData: { mimeType, data } });
    } else parts.push({ text: "[Image data format invalid]" });
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
        // Ưu tiên systemInstruction gửi từ client (cho personality)
        const finalSystemInstruction = req.body.systemInstruction || systemInstruction;
        const contents = buildGeminiContent(text, image, finalSystemInstruction);
        const reply = await callGeminiAPI(contents, useWebSearch);
        res.json({ response: reply });
    } catch (error) { res.status(500).json({ response: `Server error: ${error.message}` }); }
}

// --- API Endpoints ---
app.post("/api/chat", (req, res) => {
    const langName = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' }[req.body.language] || 'Tiếng Việt';
    const baseInstruction = `You are a helpful AI assistant. Respond in **${langName}**. Be concise, use markdown, highlight <mark class="highlight">...</mark>. Analyze image if provided.`;
    handleGeminiRequest(req, res, baseInstruction, 'message'); // Sẽ bị ghi đè bởi client nếu có personality
});

app.post("/api/math", (req, res) => { /* Giữ nguyên */ });
app.post("/api/edit-image", (req, res) => { /* Giữ nguyên */ });
app.post("/api/summarize-text", (req, res) => { /* Giữ nguyên */ });
app.post("/api/generate-flashcards", (req, res) => { /* Giữ nguyên */ });
app.post("/api/generate-mindmap", (req, res) => { /* Giữ nguyên */ });
app.post("/api/summarize-youtube", async (req, res) => { /* Giữ nguyên */ });
app.post("/api/analyze-stock", (req, res) => { /* Giữ nguyên */ });
app.post("/api/pollinations-image", async (req, res) => { /* Giữ nguyên */ });
app.post("/api/pollinations-frames", async (req, res) => { /* Giữ nguyên */ });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));