<!DOCTYPE html>

<html lang="vi">

<head>

<meta charset="UTF-8" />

<meta name="viewport" content="width=device-width, initial-scale=1.0" />

<title>AI Assistant Pro</title>

<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />

<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

<style>

body {

  background-color:#0f0f13; color:#fff; font-family:'Segoe UI',sans-serif;

  margin:0; padding:0; overflow:hidden;

}



/* ---------- Intro ---------- */

#intro-screen {

  position: fixed;

  top:0; left:0; width:100%; height:100vh;

  background: radial-gradient(circle at center, #1a1c29 0%, #0a0a0a 80%);

  overflow:hidden;

  display:flex; align-items:center; justify-content:center;

  flex-direction:column; z-index:1000;

  transition:opacity 1.8s ease;

}

#intro-bg {

  position:absolute; top:0; left:0; width:100%; height:100%;

  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.07) 0%, transparent 60%),

              radial-gradient(circle at 70% 70%, rgba(255,255,255,0.05) 0%, transparent 60%),

              radial-gradient(circle at 50% 100%, rgba(122, 255, 255, 0.08) 0%, transparent 70%);

  animation: glowMove 10s ease-in-out infinite alternate;

  filter: blur(50px);

}

@keyframes glowMove {

  0% { transform: scale(1) translate(0, 0); }

  100% { transform: scale(1.2) translate(20px, -20px); }

}

#intro-text {

  position:relative;

  color:#facc15;

  font-size:2.3rem; font-weight:bold;

  text-shadow:0 0 20px rgba(255, 255, 150, 0.8), 0 0 40px rgba(255,255,255,0.4);

  animation: floatText 3s ease-in-out infinite alternate;

}

@keyframes floatText {

  0% { transform: translateY(0); opacity:1; }

  100% { transform: translateY(-10px); opacity:0.95; }

}

#intro-subtext {

  color:#e0e7ff;

  margin-top:1rem;

  font-size:1.1rem;

  opacity:0.85;

  text-shadow:0 0 10px rgba(255,255,255,0.3);

  animation: fadeIn 3s ease-in-out 1.5s forwards;

  opacity:0;

}

@keyframes fadeIn {

  from { opacity:0; }

  to { opacity:1; }

}



/* ---------- Main Container ---------- */

.container {max-width:900px;margin:2rem auto;background:#1a1c29;border-radius:1.5rem;padding:1.5rem;box-shadow:0 15px 30px rgba(0,0,0,0.7);display:none;}

.tabs {display:flex;border-bottom:2px solid #333;margin-bottom:1rem;}

.tab-btn {flex:1;text-align:center;padding:1rem;cursor:pointer;color:#aaa;font-weight:bold;transition:all 0.2s;}

.tab-btn.active {color:#fff;border-bottom:3px solid #facc15;}

.tab-content {display:none;}

.tab-content.active {display:block;}

.chat-box {background:#111827;border-radius:12px;padding:1rem;height:400px;overflow-y:auto;display:flex;flex-direction:column;}

.bubble {max-width:80%;padding:10px 14px;border-radius:12px;margin-bottom:10px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap;}

.user-bubble {background:#2563eb;align-self:flex-end;color:white;border-bottom-right-radius:2px;}

.ai-bubble {background:#374151;align-self:flex-start;color:#e5e7eb;border-bottom-left-radius:2px;}

mark.highlight {background-color:#fde047;color:black;font-weight:bold;padding:0 3px;border-radius:3px;}

textarea,input{width:100%;padding:0.75rem;border-radius:0.75rem;background:#1e1e2a;border:1px solid #333;color:white;resize:none;outline:none;}

button{padding:0.75rem 1rem;border-radius:0.75rem;font-weight:bold;cursor:pointer;transition:all 0.2s;}

#btnCreateImage{background:#10b981;color:#111827;}#btnCreateImage:hover{background:#059669;}

#btnChat{background:#6366f1;color:white;}#btnChat:hover{background:#4f46e5;}

#btnMath{background:#f59e0b;color:#111827;}#btnMath:hover{background:#d97706;}

img.generated-image{border-radius:12px;max-width:100%;margin-top:1rem;}

#settings-btn{position:absolute;top:1rem;right:1rem;font-size:1.5rem;cursor:pointer;color:#facc15;}

#settings-modal{position:absolute;top:3rem;right:1rem;width:200px;background:#1a1c29;border:1px solid #facc15;border-radius:0.75rem;padding:1rem;display:none;}

.pending-preview{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;}

.pending-preview img{width:60px;height:60px;object-fit:cover;border-radius:8px;border:2px solid #475569;}

.input-row{display:flex;align-items:center;gap:6px;margin-top:8px;}

.icon-btn{background:#27293a;padding:8px;border-radius:8px;cursor:pointer;transition:0.2s;}

.icon-btn:hover{background:#3f4259;}

.icon-btn svg{width:22px;height:22px;color:#facc15;}

.send-btn{background:#6366f1;padding:10px;border-radius:50%;display:flex;align-items:center;justify-content:center;}

.send-btn:hover{background:#4f46e5;}

.send-btn svg{width:22px;height:22px;transform:rotate(0deg);}

.generated-video{border-radius:12px;max-width:100%;margin-top:1rem;}

</style>

<script src="https://unpkg.com/gif.js@0.2.0/dist/gif.js"></script>

<script src="https://unpkg.com/gif.js@0.2.0/dist/gif.worker.js"></script>

</head>



<body>

<!-- INTRO -->

<div id="intro-screen">

  <div id="intro-bg"></div>

  <div id="intro-text">🌌 Welcome to <mark class="highlight">AI Assistant Pro</mark> 🌌</div>

  <div id="intro-subtext">Unleash the magic of creativity and intelligence.</div>

</div>



<!-- MAIN -->

<div class="container relative" id="mainApp">

  <div id="settings-btn">⚙️</div>

  <div id="settings-modal">

    <label class="block mb-2">Ngôn ngữ chat:</label>

    <select id="language-select" class="w-full p-2 rounded bg-gray-800 text-white">

      <option value="vi">Tiếng Việt</option>

      <option value="en">English</option>

      <option value="zh-CN">简体中文</option>

    </select>

  </div>



  <div class="tabs">

    <div class="tab-btn active" data-tab="image">🖼️ Tạo Ảnh</div>

    <div class="tab-btn" data-tab="chat">💬 Chat</div>

    <div class="tab-btn" data-tab="math">🧮 Giải Toán</div>

    <div class="tab-btn" data-tab="video">🎞️ Tạo Video</div>

  </div>



  <div class="tab-content active" id="image">

    <div class="chat-box" id="imageBox"></div>

    <textarea id="imagePrompt" rows="2" placeholder="Nhập mô tả ảnh..."></textarea>

    <button id="btnCreateImage" class="mt-2 w-full">Tạo Ảnh</button>

  </div>



  <div class="tab-content" id="chat">

    <div class="chat-box" id="chatBox"></div>

    <div class="pending-preview" id="chatPreview"></div>

    <div class="input-row">

      <label class="icon-btn" for="chatFileInput" title="Tải ảnh hoặc file">📁</label>

      <input type="file" id="chatFileInput" accept="image/*,.pdf,.txt,.docx" hidden />

      <label class="icon-btn" id="chatCameraBtn" title="Chụp ảnh">📷</label>

      <textarea id="chatInput" rows="1" placeholder="Nhập tin nhắn..."></textarea>

      <button id="btnChat" class="send-btn" title="Gửi">

        <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="white" viewBox="0 0 24 24">

          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12l14 7-7-7 7-7-14 7z"/>

        </svg>

      </button>

    </div>

  </div>



  <div class="tab-content" id="math">

    <div class="chat-box" id="mathBox"></div>

    <div class="pending-preview" id="mathPreview"></div>

    <div class="input-row">

      <label class="icon-btn" for="mathFileInput" title="Tải ảnh hoặc file">📁</label>

      <input type="file" id="mathFileInput" accept="image/*,.pdf,.txt,.docx" hidden />

      <label class="icon-btn" id="mathCameraBtn" title="Chụp ảnh">📷</label>

      <textarea id="mathPrompt" rows="1" placeholder="Nhập bài toán..."></textarea>

      <button id="btnMath" class="send-btn" title="Giải">

        <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="white" viewBox="0 0 24 24">

          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12l14 7-7-7 7-7-14 7z"/>

        </svg>

      </button>

    </div>

  </div>



  <div class="tab-content" id="video">

    <div class="chat-box" id="videoBox"></div>

    <div class="pending-preview" id="videoPreview"></div>

    <div class="input-row">

      <label class="icon-btn" for="videoFileInput" title="Tải ảnh hoặc file">📁</label>

      <input type="file" id="videoFileInput" accept="image/*" hidden />

      <label class="icon-btn" id="videoCameraBtn" title="Chụp ảnh">📷</label>

      <textarea id="videoPrompt" rows="1" placeholder="Nhập mô tả video..."></textarea>

      <button id="btnVideo" class="send-btn" title="Tạo Video">

        <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="white" viewBox="0 0 24 24">

          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12l14 7-7-7 7-7-14 7z"/>

        </svg>

      </button>

    </div>

  </div>

</div>



<script>

// Hiệu ứng mở đầu

function playIntro() {

  const intro = document.getElementById("intro-screen");

  const mainApp = document.getElementById("mainApp");



  // Sau 6s ẩn intro và hiện app

  setTimeout(() => {

    intro.style.opacity = "0";

    setTimeout(() => {

      intro.style.display = "none";

      mainApp.style.display = "block";

      document.body.style.overflow = "auto";

    }, 1800);

  }, 6000);

}

playIntro();



/* Tabs */

const tabs=document.querySelectorAll(".tab-btn");

const contents=document.querySelectorAll(".tab-content");

tabs.forEach(tab=>tab.addEventListener("click",()=>{tabs.forEach(t=>t.classList.remove("active"));contents.forEach(c=>c.classList.remove("active"));tab.classList.add("active");document.getElementById(tab.dataset.tab).classList.add("active");}));

</script>

</body>

</html>

đây là mã index // ============================================================

// 🤖 AI PROXY SERVER (Gemini 2.5 Flash + Pollinations + Video)

// ============================================================



import express from "express";

import bodyParser from "body-parser";

import fetch from "node-fetch";

import dotenv from "dotenv";

// Xóa: import fs from "fs";

// Xóa: import path from "path";

// Xóa: import { exec } from "child_process";



dotenv.config();

const app = express();

// Tăng giới hạn payload lên 50MB để chứa ảnh Base64

app.use(bodyParser.json({ limit: "50mb" }));

// Phục vụ file tĩnh (index.html cùng thư mục)

app.use(express.static("."));



// ============================================================

// 🧠 CẤU HÌNH GEMINI

// ============================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL = "gemini-2.5-flash";

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;



if (!GEMINI_API_KEY) {

  console.warn("⚠️ WARNING: GEMINI_API_KEY chưa được thiết lập trong .env. Chat và giải toán sẽ không hoạt động!");

}



// ======== Hàm gọi Gemini API (retry/backoff) ========

async function callGeminiModel(contents) {

  if (!GEMINI_API_KEY) return "❌ Thiếu GEMINI_API_KEY trong .env.";



  try {

    for (let i = 0; i < 3; i++) {

      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ contents }),

      });



      if (response.ok) {

        const data = await response.json();

        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {

          return data.candidates[0].content.parts[0].text;

        }

        if (data.error) {

          console.error("❌ Lỗi API từ Gemini:", data.error);

          return `❌ Lỗi API từ Gemini: ${data.error.message}`;

        }

        return "❌ Không có phản hồi văn bản hợp lệ từ Gemini.";

      }



      const errorText = await response.text();

      console.error(`❌ Lỗi HTTP ${response.status} từ Gemini API: ${errorText}`);



      if (response.status === 429 || response.status >= 500) {

        const delay = Math.pow(2, i) * 1000;

        await new Promise(resolve => setTimeout(resolve, delay));

        continue;

      }

      return `❌ Lỗi HTTP ${response.status} khi gọi Gemini. Vui lòng kiểm tra lại API Key.`;

    }

    return "❌ Đã thử lại nhưng vẫn lỗi khi gọi Gemini.";

  } catch (error) {

    console.error("🔥 Lỗi khi gọi Gemini:", error);

    return "❌ Lỗi khi kết nối đến Google Gemini. (Kiểm tra server/mạng)";

  }

}



// ======== Hàm build content parts (text + inline image) ========

function buildContentParts(text, image, systemInstruction) {

  let userParts = [];

  const textPart = systemInstruction + "\n\nTin nhắn: " + (text || "Vui lòng phân tích và mô tả chi tiết bức ảnh này.");

  userParts.push({ text: textPart });



  if (image) {

    const parts = image.split(',');

    const mimeTypeMatch = parts[0].match(/data:(.*?);/);

    if (mimeTypeMatch && parts.length === 2) {

      userParts.push({

        inlineData: {

          mimeType: mimeTypeMatch[1],

          data: parts[1]

        }

      });

    } else {

      throw new Error("Lỗi định dạng ảnh Base64 không hợp lệ.");

    }

  }

  return userParts;

}



// ======== Dịch sang tiếng Anh (fallback: trả text gốc) ========

async function translateToEnglish(text) {

  if (!text) return "";

  // Nếu có Gemini key, dùng Gemini để dịch (như bạn yêu cầu ban đầu)

  if (GEMINI_API_KEY) {

    try {

      const promptTranslate = `Dịch văn bản sau sang tiếng Anh, chỉ trả về văn bản đã dịch. KHÔNG THÊM BẤT KỲ LỜI NÓI ĐẦU HAY LỜI KẾT NÀO.

Văn bản: "${text}"`;

      const contents = [{ role: "user", parts: [{ text: promptTranslate }] }];

      const response = await callGeminiModel(contents);

      if (response && !response.startsWith("❌")) {

        return response.replace(/^"|"$/g, '').trim();

      } else {

        return text;

      }

    } catch (err) {

      console.error("Lỗi dịch với Gemini:", err);

      return text;

    }

  }



  // Nếu không có GEMINI_API_KEY, fallback bằng MyMemory (miễn phí) — vẫn có thể bị giới hạn

  try {

    const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=vi|en";

    const r = await fetch(url);

    const d = await r.json();

    return d.responseData?.translatedText || text;

  } catch (e) {

    return text;

  }

}



// ============================================================

// 🖼️ API TẠO ẢNH (Pollinations - Có dịch đa ngôn ngữ)

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





// ======== Hàm tải 1 khung hình với Retry (Tối đa 3 lần) ========

async function fetchFrameWithRetry(url, index, maxRetries = 3) {

    for (let attempt = 1; attempt <= maxRetries; attempt++) {

        try {

            const r = await fetch(url);

            if (r.ok) {

                // Lấy ArrayBuffer, chuyển sang Buffer (Node.js)

                const buffer = Buffer.from(await r.arrayBuffer());

                // Chuyển Buffer sang Base64 Data URL (Mime type JPEG)

                return `data:image/jpeg;base64,${buffer.toString("base64")}`;

            }

            // Nếu response không OK (e.g., 404, 500)

            if (attempt < maxRetries) {

                console.warn(`⚠️ Cảnh báo: Khung hình ${index} lỗi (HTTP ${r.status}). Thử lại lần ${attempt}/${maxRetries}.`);

                // Thử lại sau 1-3 giây

                await new Promise(resolve => setTimeout(resolve, 1000 + (500 * attempt))); 

            } else {

                console.error(`❌ Lỗi tải khung hình ${index} sau ${maxRetries} lần thử (HTTP ${r.status}). Bỏ qua khung hình này.`);

            }

        } catch (e) {

            // Lỗi mạng/kết nối

            if (attempt < maxRetries) {

                console.warn(`⚠️ Cảnh báo: Khung hình ${index} lỗi mạng. Thử lại lần ${attempt}/${maxRetries}. Chi tiết: ${e.message}`);

                // Thử lại sau 1-3 giây

                await new Promise(resolve => setTimeout(resolve, 1000 + (500 * attempt)));

            } else {

                console.error(`❌ Lỗi tải khung hình ${index} sau ${maxRetries} lần thử: ${e.message}. Bỏ qua khung hình này.`);

            }

        }

    }

    return null; // Thất bại sau tất cả các lần thử

}



// ============================================================

// 🖼️/🎞️ API TẠO KHUNG HÌNH (Pollinations -> 12 frames Base64)

// Giảm số khung hình từ 20 xuống 12 để giảm thời gian render GIF trên client.

// ============================================================

app.post("/api/pollinations-frames", async (req, res) => {

  const { prompt } = req.body;

  if (!prompt) return res.status(400).json({ message: "Vui lòng nhập mô tả." });



  try {

    // 1. Dịch prompt

    const translatedPrompt = await translateToEnglish(prompt);

    const framesCount = 12; // GIẢM TỪ 20 XUỐNG 12

    console.log(`Bắt đầu tải ${framesCount} khung hình cho prompt: ${translatedPrompt}`);



    // 2. Tạo 12 promises để fetch và convert Base64

    const downloadPromises = [];

    for (let i = 0; i < framesCount; i++) {

      const variation = `${translatedPrompt}, motion frame ${i + 1} of ${framesCount}, cinematic, high detail`;

      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(variation)}?nologo=true&width=512&height=512`;

      

      // SỬ DỤNG HÀM THỬ LẠI MỚI Ở ĐÂY

      downloadPromises.push(fetchFrameWithRetry(url, i + 1));

    }



    // 3. Chờ tất cả frame tải xong

    const frames = await Promise.all(downloadPromises);

    

    // 4. Lọc bỏ frames lỗi (chỉ trả về frames hợp lệ)

    const validFrames = frames.filter(f => f && typeof f === 'string' && f.startsWith('data:image'));

    

    if (validFrames.length < 8) { // Đặt ngưỡng tối thiểu (GIẢM TỪ 10 XUỐNG 8)

        console.error(`❌ Chỉ tải được ${validFrames.length}/${framesCount} khung hình.`);

        return res.status(500).json({ message: "❌ Không thể tải đủ khung hình để tạo chuyển động mượt mà. Vui lòng thử lại." });

    }

    

    console.log(`✅ Đã tải thành công ${validFrames.length} khung hình.`);

    // 5. Trả về mảng Base64 Data URL

    res.json({ frames: validFrames });



  } catch (error) {

    console.error("❌ Lỗi xử lý chung tạo khung hình Base64:", error);

    // Cải thiện thông báo lỗi chung

    res.status(500).json({ message: "❌ Lỗi xử lý chung trên Server. (Vui lòng kiểm tra console server để biết chi tiết)" });

  }

});



// ============================================================

// 💬 CHAT (giữ nguyên behavior: highlight + short responses controlled by systemInstruction)

// ============================================================

app.post("/api/chat", async (req, res) => {

  const { message, history, language, image } = req.body;

  if (!message && !image) return res.status(400).json({ response: "Thiếu nội dung chat hoặc ảnh." });



  const languageMap = { 'vi': 'Tiếng Việt', 'en': 'English (Tiếng Anh)', 'zh-CN': '简体中文 (Tiếng Trung Giản thể)' };

  const langName = languageMap[language] || languageMap['vi'];



  const systemInstruction = `

Bạn là trợ lý AI thông minh, thân thiện. Hãy trả lời bằng **${langName}**.

- Trả lời **NGẮN GỌN, TRỌNG TÂM**, chỉ tập trung vào câu hỏi của người dùng.

- Nếu có ý chính/kết quả, hãy bọc trong <mark class="highlight">...</mark>.

- KHÔNG thêm giới thiệu/đoạn lan man.

- Nếu người dùng gửi ảnh, phân tích ảnh và trả lời dựa trên nội dung ảnh.

`;



  let contents = [];

  if (Array.isArray(history)) {

    history.forEach(item => {

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

// 🧮 GIẢI TOÁN (Ngắn gọn, LaTeX, Highlight, hỗ trợ ảnh)

// ============================================================

app.post("/api/math", async (req, res) => {

  const { question, image } = req.body;

  if (!question && !image) return res.status(400).json({ response: "Thiếu đề toán hoặc ảnh bài toán." });



  const systemInstruction = `

Hãy giải bài toán sau **ngắn gọn nhất có thể**, bằng tiếng Việt dễ hiểu.

- Chỉ hiển thị **bước chính** và **kết quả cuối cùng**.

- Viết công thức bằng LaTeX (dấu $...$).

- Tô màu vàng các kết quả và ý quan trọng bằng <mark class="highlight">...</mark>.

- Nếu có ảnh, hãy phân tích ảnh để giải bài toán trong ảnh.

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
const HOST = '0.0.0.0'; // Lắng nghe trên tất cả các địa chỉ IP

const server = app.listen(PORT, HOST, () => {
  console.log(`✅ Server is running on host ${HOST} and port ${PORT} (Model: ${GEMINI_MODEL})`);
  if (!GEMINI_API_KEY) {
    console.warn("⚠️ GEMINI_API_KEY not set. Chat and Math features will not work!");
  }
});

server.timeout = 300000;