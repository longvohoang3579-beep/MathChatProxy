import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
// Đã thay thế import LangChain bằng thư viện youtube-transcript
import { YoutubeTranscript } from 'youtube-transcript'; 

dotenv.config();
const app = express();

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static("."));

// --- Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Đã sử dụng 2.5-flash ổn định
const GEMINI_MODEL = "gemini-2.5-flash"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) console.warn("⚠️ WARNING: GEMINI_API_KEY is not set!");

// --- Helper Functions ---

// Hàm trợ giúp mới để trích xuất Video ID (Cần cho YoutubeTranscript)
function extractYouTubeID(url) {
    const regex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return (match && match[1]) ? match[1] : null;
}

async function callGeminiAPI(contents, useWebSearch = false) {
    if (!GEMINI_API_KEY) return "❌ Error: GEMINI_API_KEY is missing.";
    try {
        // Fix Chứng khoán: Đổi tên tool từ google_search_retrieval sang googleSearch
        const tools = useWebSearch ? [{ "googleSearch": {} }] : undefined; 
        
        const body = JSON.stringify({ contents, tools });
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: body,
        });
        const data = await response.json();
        
        // Handle function calls (Google Search)
        const functionCallPart = data.candidates?.[0]?.content?.parts?.find(part => part.functionCall);
        if (functionCallPart) {
             console.log("Gemini requested function call, responding automatically...");
             const functionResponse = { functionResponse: { name: functionCallPart.functionCall.name, response: { name: functionCallPart.functionCall.name, content: "Web search performed." } } };
             contents.push({ role: "function", parts: [functionResponse] });
             const response2 = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                 method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents }),
             });
             const data2 = await response2.json();
             if (!response2.ok) {
                 const errorMsg = data2.error?.message || `Gemini Function Response Error ${response2.status}`;
                 throw new Error(`❌ HTTP Error ${response2.status} (Search Tool): ${errorMsg}`);
             }
             if (data2.candidates && data2.candidates[0].finishReason === 'SAFETY') return "❌ Response blocked due to safety concerns.";
             return data2.candidates?.[0]?.content?.parts?.[0]?.text || "❌ No valid response after search.";
        }
        
        if (!response.ok) {
            const errorMsg = data.error?.message || `Check API Key & ensure "Vertex AI API" + Billing are enabled. ${data.error?.message || ''}`;
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
    const text = req.body[inputField] || req.body['message'] || req.body['question'] || req.body['textToSummarize'] || req.body['textToConvert'] || req.body['stockSymbol'] || req.body['marketingTopic'] || req.body['musicTopic'];
    try {
        // Chú ý: systemInstruction từ client (req.body.systemInstruction) sẽ ưu tiên
        const finalSystemInstruction = req.body.systemInstruction || systemInstruction;
        const contents = buildGeminiContent(text, image, finalSystemInstruction);
        const reply = await callGeminiAPI(contents, useWebSearch);
        res.json({ response: reply });
    } catch (error) { res.status(500).json({ response: `Server error: ${error.message}` }); }
}


// --- API Endpoints ---
app.post("/api/chat", (req, res) => {
    const langName = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' }[req.body.language] || 'Tiếng Việt';
    
    // Gợi ý tiếp theo
    const followUpSuggestion = `**At the end of your response, always suggest one logical follow-up topic or question for the user to explore next, enclosed in italics (e.g., *Bạn có muốn xem một ví dụ khác không?*).**`;
    
    const baseInstruction = `You are a helpful AI assistant. Respond in **${langName}**. Be concise, use markdown, highlight <mark class="highlight">...</mark>. Analyze image if provided. ${followUpSuggestion}`;
    handleGeminiRequest(req, res, baseInstruction, 'message');
});

app.post("/api/math", (req, res) => {
    const instruction = `Solve math in Vietnamese. Show steps & final result. Use LaTeX ($...$) and <mark class="highlight">...</mark>.
    **At the end, suggest a related theorem or problem in italics (e.g., *Bạn có muốn xem một bài toán tương tự về định lý Pytago không?*).**`;
    handleGeminiRequest(req, res, instruction, 'question');
});

app.post("/api/edit-image", (req, res) => {
    // Luôn giữ nguyên Instruction này vì client (index.html) đang gửi kèm ảnh
    const instruction = `Analyze image and user text. Generate ONLY a detailed English prompt (max 30 words) for an image generation model (like Midjourney or Pollinations) to create the edited image. DO NOT add any surrounding text.`;
    handleGeminiRequest(req, res, instruction, 'message');
});

app.post("/api/summarize-text", (req, res) => {
    const instruction = `You are a notetaker. Extract key decisions, action items, main topics from the text. Format in Vietnamese with headings.
    **At the end, ALWAYS suggest one key topic from the text to explore deeper in italics.**`;
    handleGeminiRequest(req, res, instruction, 'textToSummarize');
});

app.post("/api/generate-flashcards", (req, res) => {
    const instruction = "Based on the provided text, create flashcards in Vietnamese. Format clearly: 'Q: [Question]\\nA: [Answer]' separated by TWO newlines.";
    handleGeminiRequest(req, res, instruction, 'textToConvert');
});

app.post("/api/generate-mindmap", (req, res) => {
    const instruction = "Based on the provided text, generate a mind map structure in Vietnamese using markdown hierarchical lists (* Topic\\n  * Subtopic\\n    * Detail). Make it concise and logical.";
    handleGeminiRequest(req, res, instruction, 'textToConvert');
});

// FIX: Endpoint tóm tắt YouTube được viết lại để sử dụng youtube-transcript
app.post("/api/summarize-youtube", async (req, res) => {
    const { youtubeUrl, language } = req.body;
    const langName = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' }[language] || 'Tiếng Việt';
    
    if (!youtubeUrl) return res.status(400).json({ response: "YouTube URL required." });

    // Trích xuất Video ID bằng hàm helper
    const videoId = extractYouTubeID(youtubeUrl);
    if (!videoId) {
        return res.status(400).json({ 
            response: "Lỗi: URL YouTube không hợp lệ. Vui lòng kiểm tra lại định dạng URL." 
        });
    }

    try {
        // 1. Lấy phụ đề (Transcript) - Thử lấy theo ngôn ngữ của người dùng (ví dụ: 'vi')
        const transcriptArray = await YoutubeTranscript.fetchTranscript(videoId, { 
            lang: language || 'vi' // Sử dụng ngôn ngữ được chọn hoặc mặc định là Tiếng Việt
        });
        
        if (!transcriptArray || transcriptArray.length === 0) {
            // Trường hợp lỗi: Video không có phụ đề
            return res.status(500).json({ 
                response: `❌ Lỗi tóm tắt video: Video này không có phụ đề hoặc phụ đề đã bị tắt. Vui lòng thử video khác. (Mã lỗi: ${videoId})` 
            });
        }

        // 2. Nối các phần phụ đề lại thành một đoạn văn bản dài
        const fullTranscript = transcriptArray.map(item => item.text).join(' ');

        // 3. Xây dựng System Instruction và nội dung
        const instruction = `Bạn là một trợ lý chuyên tóm tắt video. Tóm tắt các điểm chính từ phụ đề sau bằng ${langName}. Sử dụng Markdown để trình bày rõ ràng.
        **At the end, ALWAYS suggest a related video topic to search for in italics.**`;
        
        // Cắt bớt transcript nếu quá dài (> 15000 ký tự) để tránh lỗi API
        const textForGemini = "Transcript:\n" + fullTranscript.substring(0, 15000);

        const contents = buildGeminiContent(textForGemini, null, instruction);
        
        // 4. Gọi API Gemini để tóm tắt
        const summary = await callGeminiAPI(contents);
        
        res.json({ response: summary });

    } catch (error) {
        console.error("❌ YouTube Summarize Error:", error);
        
        let errorMsg = "Lỗi không xác định khi tóm tắt video.";
        if (error.message.includes('Transcript is disabled')) {
            errorMsg = `Lỗi: Video này đã tắt phụ đề. Không thể tóm tắt. (Mã lỗi: ${videoId})`;
        } else if (error.message.includes('not a valid YouTube URL') || error.message.includes('404')) {
             errorMsg = `Lỗi: Video không khả dụng (URL không hợp lệ, bị xóa hoặc bị chặn theo khu vực).`;
        }
        
        res.status(500).json({ response: `Error summarizing video: ${errorMsg}` });
    }
});


app.post("/api/analyze-stock", (req, res) => {
    // FIX 4: Phân tích Chứng khoán chuyên sâu
    const instruction = `
You are a stock analyst AI. Analyze the symbol based on knowledge and recent web search.
Provide a **deep and specific analysis in Vietnamese** that includes:
1.  **Price Movement (Hôm nay):** Current price and the **exact percentage** increase or decrease today (use Google Search for current data).
2.  **Trend:** Recent trend (short-term and long-term outlook).
3.  **Factors:** 2-3 key influencing factors (macro/micro).
4.  **Highlights:** Use <mark class="highlight">...</mark> to emphasize all key financial numbers and important analysis points.
5.  **Related:** Suggest 1-2 similar stocks.
6.  **Chart Concept:** Suggest search query for a *general illustrative chart* (e.g., "stock chart uptrend example").
7.  **Disclaimer:** MUST include: "**Disclaimer:** AI analysis, not financial advice. Consult a professional."
    **At the end, ALWAYS suggest one related company or metric to check in italics.**`;
    handleGeminiRequest(req, res, instruction, 'stockSymbol', true);
});

app.post("/api/marketing-content", (req, res) => {
    const langName = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' }[req.body.language] || 'Tiếng Việt';
    const instruction = `You are a professional Marketing Content Creator. Respond in **${langName}**.
Generate compelling marketing copy (social media post, ad copy, product description) for the given topic/product.
Format clearly using markdown, lists, and <mark class="highlight">key phrases</mark>. Include emojis.
**At the end, ALWAYS suggest an alternative A/B testing headline in italics.**`;
    handleGeminiRequest(req, res, instruction, 'marketingTopic');
});

app.post("/api/music-generation", (req, res) => {
    const langName = { 'vi': 'Tiếng Việt', 'en': 'English', 'zh-CN': '简体中文' }[req.body.language] || 'Tiếng Việt';
    const instruction = `You are a music composer AI. Respond in **${langName}**.
    
    // Xác nhận giới hạn: Chỉ tạo lời và hợp âm
    **Ghi chú:** Bạn chỉ có thể tạo lời và hợp âm, không thể tạo ra file âm thanh.
    
1.  **Write Lyrics:** Write a short verse (4-6 lines) based on the user's prompt.
2.  **Suggest Chords:** Suggest a simple chord progression (e.g., C - G - Am - F).
3.  **Describe Vibe:** Describe the mood/vibe (e.g., "upbeat pop", "lo-fi chill").
Format the response clearly using markdown.
**At the end, ALWAYS suggest a related musical concept in italics (e.g., *Bạn có muốn biết thêm về lý thuyết âm nhạc không?*).**`;
    handleGeminiRequest(req, res, instruction, 'musicTopic');
});

app.post("/api/pollinations-image", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: "A description is required." });
    try {
        const translatedPrompt = await translateToEnglish(prompt);
        const safePrompt = encodeURIComponent(translatedPrompt);
        // Sử dụng kích thước 512x512 là phổ biến và ổn định hơn 1024x1024 cho Pollinations
        const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?nologo=true&width=512&height=512`;
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
        console.warn("⚠️ /api/pollinations-frames needs implementation.");
        // Giữ nguyên logic trả về frames rỗng vì chưa có API tạo GIF bên Pollinations
        res.json({ frames: [] });
    } catch (error) {
        res.status(500).json({ message: "Could not create video frames." });
    }
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));