import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
// Only import the necessary loader from @langchain/community
import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";

dotenv.config();
const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static("."));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Use the model compatible with v1beta and image input
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY is not set!");
}

async function callGeminiModel(contents) {
    if (!GEMINI_API_KEY) return "❌ Error: GEMINI_API_KEY is not provided.";
    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents }),
        });
        const data = await response.json();
        if (!response.ok) {
            console.error("❌ Gemini API Error:", data);
            const errorMessage = data.error?.message || 'Check API Key and ensure "Vertex AI API" is enabled with billing in your Google Cloud Project.';
            // Return the specific error from Gemini
            return `❌ HTTP Error ${response.status}: ${errorMessage}`;
        }
        // Check for safety ratings block before returning text
        if (data.candidates && data.candidates[0].finishReason === 'SAFETY') {
            return "❌ Nội dung bị chặn vì lý do an toàn.";
        }
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Không nhận được phản hồi hợp lệ.";
    } catch (error) {
        console.error("🔥 Connection Error:", error);
        return "❌ Connection error to Google Gemini.";
    }
}


function buildContentParts(text, image, systemInstruction) {
  let parts = [{ text: `${systemInstruction}\n\nUser Input: "${text || "No text provided."}"` }];
  if (image) {
    // Ensure correct parsing for base64 data URL
    const match = image.match(/data:(image\/.+);base64,(.*)/);
    if (match) {
      const [, mimeType, data] = match;
      parts.push({ inlineData: { mimeType, data } });
    } else {
        console.warn("⚠️ Could not parse image data URL correctly.");
        parts.push({ text: "[Image data could not be parsed]" });
    }
  }
  return parts;
}


async function translateToEnglish(text) {
    if (!text || /^[a-zA-Z0-9\s.,?!'-]*$/.test(text)) return text; // Basic check if already English-like
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!response.ok) throw new Error(`Google Translate API error: ${response.status}`);
        const data = await response.json();
        const translatedText = data[0].map(item => item[0]).join('');
        return translatedText || text; // Fallback to original text if translation is empty
    } catch (error) {
        console.error("❌ Translation error, using original text:", error.message);
        return text; // Return original text on any error
    }
}

// === API ENDPOINTS ===

app.post("/api/pollinations-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ message: "A description is required." });
  try {
    const translatedPrompt = await translateToEnglish(prompt);
    console.log(`- Translated prompt for Pollinations: "${translatedPrompt}"`); // Log translation
    const safePrompt = encodeURIComponent(translatedPrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=1024&height=1024`;
    res.json({ imageUrl });
  } catch (error) {
      console.error("Pollinations API Error:", error);
    res.status(500).json({ message: "Could not create image." });
  }
});

// General handler for Gemini requests
async function handleGeminiRequest(req, res, systemInstruction) {
    // Destructure all potential fields from body
    const { message, question, image, textToSummarize } = req.body;
    // Determine the primary text input based on expected fields for different modes
    const text = message || question || textToSummarize;

    // Check if at least text or image is present
    if (!text && !image) return res.status(400).json({ response: "Missing text or image content." });

    try {
        // Build parts using the determined text and potentially an image
        const userParts = buildContentParts(text, image, systemInstruction);
        const contents = [{ role: "user", parts: userParts }];
        const reply = await callGeminiModel(contents);
        res.json({ response: reply }); // Send the raw reply back
    } catch (error) {
        // Catch errors during part building or if callGeminiModel throws unexpectedly
        console.error("Error processing Gemini request:", error);
        res.status(500).json({ response: `Server error processing request: ${error.message}` });
    }
}


app.post("/api/chat", (req, res) => {
    const langName = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' }[req.body.language] || 'Tiếng Việt';
    const systemInstruction = `You are a helpful AI assistant. Respond in **${langName}**. Keep answers concise, use markdown, highlight key points with <mark class="highlight">...</mark>.`;
    // Pass image explicitly if present
    handleGeminiRequest(req, res, systemInstruction);
});

app.post("/api/math", (req, res) => {
    const systemInstruction = `Solve the math problem in Vietnamese. Show main steps and the final result. Use LaTeX ($...$) for formulas and <mark class="highlight">...</mark> for the result. Analyze the image if provided.`;
     // Pass image explicitly if present
    handleGeminiRequest(req, res, systemInstruction);
});

app.post("/api/summarize-youtube", async (req, res) => {
    const { youtubeUrl } = req.body;
    if (!youtubeUrl) return res.status(400).json({ response: "YouTube URL is required." });
    try {
        const loader = YoutubeLoader.createFromUrl(youtubeUrl, {
             language: "en", // Attempt to get English transcript first
             addVideoInfo: true // Include video title etc.
        });
        const docs = await loader.load();

        // Check if video info is available and extract title/author
        let videoInfo = "";
        if (docs[0]?.metadata?.title && docs[0]?.metadata?.author) {
            videoInfo = `Video Title: ${docs[0].metadata.title}\nChannel: ${docs[0].metadata.author}\n\n`;
        }

        const transcript = docs.map(doc => doc.pageContent).join("\n");
        if (!transcript) return res.status(500).json({ response: "Could not get transcript. Video might lack subtitles or be restricted." });

        console.log(`- Transcript length for summarization: ${transcript.length}`); // Log transcript length

        const systemInstruction = "You are a content summarizer. Based on the provided YouTube video transcript, summarize the main content in clear, concise Vietnamese. Start with the video title and channel (if provided), then list the key points using bullet points.";
        // Include videoInfo in the text passed to Gemini
        const contents = [{ role: "user", parts: [{ text: `${systemInstruction}\n\n${videoInfo}Transcript:\n${transcript.substring(0, 10000)}` }] }]; // Limit transcript length if needed

        const summary = await callGeminiModel(contents);
        res.json({ response: summary });
    } catch (error) {
        console.error("❌ YouTube Summarize Error:", error);
        res.status(500).json({ response: `Error summarizing video: ${error.message}`});
    }
});

app.post("/api/summarize-text", (req, res) => {
    const systemInstruction = "You are a professional notetaker. From the text provided, extract key decisions, action items, and main topics. Format the output in Vietnamese with clear headings (e.g., ## Quyết định chính, ## Việc cần làm, ## Chủ đề chính). Use bullet points for details.";
    // Rename 'message' to 'textToSummarize' conceptually for clarity, though handleGeminiRequest uses 'text'
    handleGeminiRequest(req, res, systemInstruction);
});

// Endpoint for image editing (uses Gemini's image understanding)
app.post("/api/edit-image", (req, res) => {
    const systemInstruction = `You are an image editing assistant. Analyze the provided image and the user's instructions. Describe the edited image based on the instructions. Provide a detailed prompt suitable for an image generation model (like Pollinations) to create the described image. Focus ONLY on generating the new prompt.`;
    handleGeminiRequest(req, res, systemInstruction);
});


// Fallback for video frames (uses Pollinations, ensure translation works)
app.post("/api/pollinations-frames", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: "A description is required." });
    try {
        const translatedPrompt = await translateToEnglish(prompt);
        console.log(`- Translated prompt for Pollinations frames: "${translatedPrompt}"`);
        const frames = []; // Placeholder - Add logic to fetch multiple frames from Pollinations
        // Example: loop and call Pollinations API with variations
        // const safePromptBase = encodeURIComponent(translatedPrompt);
        // for (let i = 0; i < 10; i++) {
        //     const framePrompt = encodeURIComponent(`${translatedPrompt}, frame ${i+1}`);
        //     const frameUrl = `https://image.pollinations.ai/prompt/${framePrompt}?nologo=true&width=512&height=512`;
        //     // Fetch image, convert to base64, add to frames array
        // }
        if (frames.length === 0) { // Simulate fetching frames
             console.warn("⚠️ Frame generation logic not fully implemented in /api/pollinations-frames");
             return res.status(501).json({message: "Frame generation not implemented yet."})
        }

        res.json({ frames });
    } catch (error) {
        console.error("Pollinations Frames API Error:", error);
        res.status(500).json({ message: "Could not create video frames." });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server is running at http://localhost:${PORT}`));