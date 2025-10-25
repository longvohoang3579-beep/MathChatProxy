import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
// Removed YoutubeLoader import

dotenv.config();
const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static("."));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash"; // Supports images
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) console.warn("⚠️ WARNING: GEMINI_API_KEY is not set!");

async function callGeminiAPI(contents) {
    if (!GEMINI_API_KEY) return "❌ Error: GEMINI_API_KEY is missing.";
    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents }),
        });
        const data = await response.json();
        if (!response.ok) {
            console.error("❌ Gemini API Error:", data);
            const errorMsg = data.error?.message || 'Check API Key & ensure "Vertex AI API" + Billing are enabled.';
            return `❌ HTTP Error ${response.status}: ${errorMsg}`;
        }
        if (data.candidates && data.candidates[0].finishReason === 'SAFETY') return "❌ Response blocked due to safety concerns.";
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "❌ No valid response.";
    } catch (error) {
        console.error("🔥 Gemini Connection Error:", error);
        return "❌ Connection error to Google Gemini.";
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

async function handleGeminiRequest(req, res, systemInstruction, inputField = 'message') {
    const { image } = req.body;
    const text = req.body[inputField] || req.body['message'] || req.body['question'] || req.body['textToSummarize'] || req.body['textToConvert'];
    try {
        const contents = buildGeminiContent(text, image, systemInstruction);
        const reply = await callGeminiAPI(contents);
        res.json({ response: reply });
    } catch (error) { res.status(500).json({ response: `Server error: ${error.message}` }); }
}

// --- API Endpoints ---
app.post("/api/chat", (req, res) => {
    const langName = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' }[req.body.language] || 'Tiếng Việt';
    const instruction = `Respond in **${langName}**. Be concise, use markdown, highlight with <mark class="highlight">...</mark>. Analyze image if provided.`;
    handleGeminiRequest(req, res, instruction, 'message');
});

app.post("/api/math", (req, res) => {
    const instruction = `Solve math in Vietnamese. Show steps & final result. Use LaTeX ($...$) and <mark class="highlight">...</mark>. Analyze image if provided.`;
    handleGeminiRequest(req, res, instruction, 'question');
});

app.post("/api/edit-image", (req, res) => {
    const instruction = `Analyze image and user text. Generate ONLY a detailed English prompt for an image generation model (like Pollinations) to create the edited image.`;
    handleGeminiRequest(req, res, instruction, 'message');
});

app.post("/api/summarize-text", (req, res) => { // Notetaker
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

// Removed /api/summarize-youtube endpoint

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

app.post("/api/pollinations-frames", async (req, res) => { /* Giữ nguyên placeholder */ });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));