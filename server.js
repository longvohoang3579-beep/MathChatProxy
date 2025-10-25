import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
// Correct import path might vary slightly based on installed version, this is common
import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";

dotenv.config();
const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static("."));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash"; // Supports images + function calling needed for advanced features if added later
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) console.warn("⚠️ WARNING: GEMINI_API_KEY is not set!");

async function callGeminiAPI(contents) {
    // ... (Keep the callGeminiAPI function exactly the same as the previous version) ...
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
    // ... (Keep the buildGeminiContent function exactly the same as the previous version) ...
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
    // ... (Keep the translateToEnglish function exactly the same as the previous version) ...
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
    // ... (Keep the handleGeminiRequest function exactly the same as the previous version) ...
    const { image } = req.body;
    const text = req.body[inputField] || req.body['message'] || req.body['question'] || req.body['textToSummarize'] || req.body['textToConvert']; // More robust text extraction
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

app.post("/api/summarize-text", (req, res) => {
    const instruction = "You are a notetaker. Extract key decisions, action items, main topics from the text. Format in Vietnamese with headings (## Decisions, ## Actions, ## Topics) and bullet points.";
    handleGeminiRequest(req, res, instruction, 'textToSummarize');
});

// NEW Endpoints for Flashcards and Mindmap
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
        // Ensure loader is imported correctly at the top
        const loader = YoutubeLoader.createFromUrl(youtubeUrl, { language: "en", addVideoInfo: true });
        const docs = await loader.load();
        let videoInfo = docs[0]?.metadata?.title ? `Video Title: ${docs[0].metadata.title}\nChannel: ${docs[0].metadata.author}\n\n` : "";
        const transcript = docs.map(doc => doc.pageContent).join("\n");
        if (!transcript) return res.status(500).json({ response: "Could not get transcript." });

        const instruction = "Summarize key points of the YouTube transcript in Vietnamese. Start with title/channel.";
        const contents = buildGeminiContent(videoInfo + "Transcript (first 15k chars):\n" + transcript.substring(0, 15000), null, instruction);

        const summary = await callGeminiAPI(contents);
        res.json({ response: summary });
    } catch (error) {
        console.error("❌ YouTube Summarize Error:", error);
        // Provide more specific error if known, e.g., from youtube-transcript
        const errorMsg = error.message.includes('transcript disabled') ? "Transcript is disabled for this video." :
                         error.message.includes('404') ? "Video not found or private." :
                         error.message;
        res.status(500).json({ response: `Error summarizing video: ${errorMsg}` });
    }
});

app.post("/api/pollinations-image", async (req, res) => { /* Keep previous version */ });
app.post("/api/pollinations-frames", async (req, res) => { /* Keep previous version */ });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));