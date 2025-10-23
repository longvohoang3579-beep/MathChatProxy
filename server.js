import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
// ✅ FIX: Correct import path for YoutubeLoader based on package structure changes
import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";

dotenv.config();
const app = express();

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static(".")); // Serve static files (like index.html)

// --- Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash"; // Supports images
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY is not set!");
}

// --- Helper Functions ---

/**
 * Calls the Gemini API.
 * @param {Array} contents - The content array for the Gemini API request.
 * @returns {Promise<string>} - The AI's response text or an error message.
 */
async function callGeminiAPI(contents) {
    if (!GEMINI_API_KEY) return "❌ Error: GEMINI_API_KEY is missing.";
    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents }),
        });
        const data = await response.json();

        if (!response.ok) {
            console.error("❌ Gemini API Error:", data);
            const errorMsg = data.error?.message || 'Check API Key & ensure "Vertex AI API" + Billing are enabled in Google Cloud.';
            return `❌ HTTP Error ${response.status}: ${errorMsg}`;
        }
        if (data.candidates && data.candidates[0].finishReason === 'SAFETY') {
            return "❌ Response blocked due to safety concerns.";
        }
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "❌ No valid response.";
    } catch (error) {
        console.error("🔥 Gemini Connection Error:", error);
        return "❌ Connection error to Google Gemini.";
    }
}

/**
 * Builds the content array for the Gemini API, including image data if provided.
 * @param {string} text - The user's text input.
 * @param {string|null} image - Base64 encoded image data URL or null.
 * @param {string} systemInstruction - The specific instructions for the AI.
 * @returns {Array} - The content parts array.
 */
function buildGeminiContent(text, image, systemInstruction) {
  let parts = [{ text: `${systemInstruction}\n\nUser Input: "${text || "No text provided."}"` }];
  if (image) {
    const match = image.match(/data:(image\/.+);base64,(.*)/);
    if (match) {
      const [, mimeType, data] = match;
      parts.push({ inlineData: { mimeType, data } });
    } else {
      console.warn("⚠️ Invalid image data format provided.");
      parts.push({ text: "[Image data format invalid]" });
    }
  }
  return [{ role: "user", parts }];
}

/**
 * Translates text to English using Google Translate's public endpoint.
 * @param {string} text - Text to translate.
 * @returns {Promise<string>} - Translated text or original text on error.
 */
async function translateToEnglish(text) {
    if (!text || /^[a-zA-Z0-9\s.,?!'-]*$/.test(text)) return text;
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!response.ok) throw new Error(`Translate API error: ${response.status}`);
        const data = await response.json();
        return data[0]?.map(item => item[0]).join('') || text;
    } catch (error) {
        console.error("❌ Translation Error:", error.message);
        return text; // Fallback to original
    }
}

// --- API Endpoints ---

// Handles Gemini requests for Chat, Math, Image Editing (description generation), and Notetaker
async function handleGeminiRequest(req, res, systemInstruction) {
    const { message, question, textToSummarize, image } = req.body;
    const text = message || question || textToSummarize; // Consolidate text input
    // Image editing requires both image and text
    if (req.path === '/api/edit-image' && (!image || !text)) {
         return res.status(400).json({ response: "Image editing requires both an image and a description." });
    }
     // Other modes require at least text or image
    if (req.path !== '/api/edit-image' && !text && !image) {
        return res.status(400).json({ response: "Missing text or image content." });
    }

    try {
        const contents = buildGeminiContent(text, image, systemInstruction);
        const reply = await callGeminiAPI(contents);
        res.json({ response: reply });
    } catch (error) {
        console.error(`Error processing ${req.path}:`, error);
        res.status(500).json({ response: `Server error processing request: ${error.message}` });
    }
}

// CHAT (Gemini)
app.post("/api/chat", (req, res) => {
    const langName = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' }[req.body.language] || 'Tiếng Việt';
    const instruction = `You are a helpful AI assistant. Respond in **${langName}**. Keep answers concise, use markdown, highlight keys with <mark class="highlight">...</mark>. Analyze image if provided.`;
    handleGeminiRequest(req, res, instruction);
});

// MATH (Gemini)
app.post("/api/math", (req, res) => {
    const instruction = `Solve the math problem in Vietnamese. Show main steps & final result. Use LaTeX ($...$) and <mark class="highlight">...</mark> for results. Analyze image if provided.`;
    handleGeminiRequest(req, res, instruction);
});

// IMAGE EDITING - Step 1: Generate Description (Gemini)
app.post("/api/edit-image", (req, res) => {
    const instruction = `You are an image editing assistant. Analyze the provided image and user's text instructions. Generate ONLY a detailed, descriptive prompt (in English) suitable for an image generation model (like Pollinations) to create the described edited image.`;
    handleGeminiRequest(req, res, instruction);
});

// NOTETAKER (Gemini)
app.post("/api/summarize-text", (req, res) => {
    const instruction = `You are a professional notetaker. From the text provided, extract key decisions, action items, and main topics. Format output in Vietnamese with clear headings (## Decisions, ## Action Items, ## Topics) using bullet points.`;
    handleGeminiRequest(req, res, instruction);
});

// YOUTUBE SUMMARY (Langchain + Gemini)
app.post("/api/summarize-youtube", async (req, res) => {
    const { youtubeUrl } = req.body;
    if (!youtubeUrl) return res.status(400).json({ response: "YouTube URL required." });
    try {
        const loader = YoutubeLoader.createFromUrl(youtubeUrl, { language: "en", addVideoInfo: true });
        const docs = await loader.load();
        let videoInfo = "";
        if (docs[0]?.metadata?.title && docs[0]?.metadata?.author) {
            videoInfo = `Video Title: ${docs[0].metadata.title}\nChannel: ${docs[0].metadata.author}\n\n`;
        }
        const transcript = docs.map(doc => doc.pageContent).join("\n");
        if (!transcript) return res.status(500).json({ response: "Could not get transcript." });

        const instruction = "Summarize the key points of the following YouTube video transcript in concise Vietnamese. Start with the title and channel (if provided).";
        const contents = buildGeminiContent(videoInfo + "Transcript:\n" + transcript.substring(0, 15000), null, instruction); // Limit transcript length

        const summary = await callGeminiAPI(contents);
        res.json({ response: summary });
    } catch (error) {
        console.error("❌ YouTube Summarize Error:", error);
        res.status(500).json({ response: `Error summarizing video: ${error.message}` });
    }
});

// IMAGE GENERATION (Pollinations)
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

// VIDEO FRAMES (Pollinations - Placeholder Logic)
app.post("/api/pollinations-frames", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: "A description is required." });
    try {
        const translatedPrompt = await translateToEnglish(prompt);
        const frames = []; // Needs actual logic to call Pollinations multiple times
        console.warn("⚠️ /api/pollinations-frames needs implementation to fetch multiple frames.");
        // --- Placeholder ---
        // Generate a single image URL as a fallback for now
         const safePrompt = encodeURIComponent(translatedPrompt + ", animation frame");
         const frameUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=512&height=512`;
         // In real implementation: Fetch this URL, convert to base64, repeat 10-12 times with variations
         // For now, just return empty to avoid breaking the client expecting an array
         // --- End Placeholder ---

        if (frames.length < 8) { // If actual fetching logic fails or is placeholder
             // Return an error or a single frame if desired for testing
             // return res.status(501).json({ message: "Frame generation not fully implemented." });
             res.json({ frames: [] }); // Return empty array to avoid client error
        } else {
             res.json({ frames });
        }
    } catch (error) {
        console.error("Pollinations Frames Error:", error);
        res.status(500).json({ message: "Could not create video frames." });
    }
});


// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));