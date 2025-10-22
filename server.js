import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import { ChatOpenAI } from '@langchain/openai'; // Thay vì '@langchain/community'
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import multer from 'multer'; // Thư viện xử lý upload file

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Cấu hình OpenAI và LangChain
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const chatModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-4o', // Hoặc model bạn muốn sử dụng
  temperature: 0.7,
});

// Cấu hình Multer cho upload file (Ảnh)
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(bodyParser.json());
app.use(express.static('public')); // Cung cấp file tĩnh như index.html

// --- CHỨC NĂNG CHÍNH: CHAT (General) ---
app.post('/api/chat', async (req, res) => {
  const { messages, mode } = req.body;
  
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: 'Không có tin nhắn nào.' });
  }

  const userMessage = messages[messages.length - 1].content;
  
  try {
    let systemPrompt = '';
    switch (mode) {
      case 'chat':
        systemPrompt = "Bạn là AI Assistant Pro, một trợ lý trò chuyện thân thiện và thông minh, sẵn sàng giúp đỡ mọi thứ.";
        break;
      case 'summarizer':
        systemPrompt = "Bạn là AI Tóm Tắt. Hãy tóm tắt nội dung được cung cấp một cách ngắn gọn, súc tích và chính xác nhất.";
        break;
      case 'video_creator':
        systemPrompt = "Bạn là AI Tạo Kịch Bản Video. Người dùng sẽ mô tả ý tưởng và bạn sẽ tạo ra một kịch bản video chi tiết, chuyên nghiệp. Không tạo video thật, chỉ tạo kịch bản.";
        break;
      case 'image_editor':
        systemPrompt = "Bạn là AI Xử Lý Ảnh. Người dùng sẽ yêu cầu chỉnh sửa ảnh. Hãy mô tả các bước chỉnh sửa hoặc thông báo rằng bạn đã sẵn sàng nhận ảnh và yêu cầu chỉnh sửa (do bạn không thể thực hiện chỉnh sửa ảnh thực tế).";
        break;
      case 'notetaker':
        systemPrompt = "Bạn là AI Ghi Chú Cuộc Họp. Người dùng sẽ cung cấp nội dung cuộc họp hoặc link (tượng trưng). Hãy phân tích nội dung đó và ghi lại các điểm chính, quyết định, và hành động cụ thể (Action Items) theo định dạng rõ ràng.";
        break;
      default:
        systemPrompt = "Bạn là AI Assistant Pro.";
    }
    
    // Xây dựng prompt cho LangChain (LangChain sử dụng mảng role/content)
    const chatMessages = [
      ["system", systemPrompt],
      ...messages.map(msg => [msg.role, msg.content])
    ];

    const prompt = ChatPromptTemplate.fromMessages(chatMessages);
    const chain = prompt.pipe(chatModel);
    
    const response = await chain.invoke({});
    
    res.json({ reply: response.content });

  } catch (error) {
    console.error('Lỗi khi gọi API:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi xử lý yêu cầu.' });
  }
});

// --- CHỨC NĂNG MỚI: CHỈNH SỬA ẢNH (Image Edit - API Mock) ---
// Lưu ý: Chức năng này chỉ là mô phỏng. Việc chỉnh sửa ảnh thực tế yêu cầu xử lý file và API của các dịch vụ như DALL-E (với prompt) hoặc các thư viện xử lý ảnh khác (như Sharp, Jimp).
app.post('/api/image-edit', upload.single('image'), async (req, res) => {
  const { prompt } = req.body;
  const imageFile = req.file;

  if (!imageFile || !prompt) {
    return res.status(400).json({ error: 'Vui lòng cung cấp cả ảnh và mô tả chỉnh sửa.' });
  }

  try {
    // TẠM THỜI: GỌI DALL-E TẠO ẢNH MỚI (Mô phỏng chỉnh sửa)
    // Trong một ứng dụng thực, bạn sẽ dùng prompt và ảnh gốc để gọi API chỉnh sửa.
    
    // Ghi chú: DALL-E 3 chỉ hỗ trợ tạo mới/chỉnh sửa dựa trên prompt, không phải chỉnh sửa file ảnh trực tiếp.
    // Nếu muốn chỉnh sửa một phần của ảnh, cần DALL-E 2 và một mask.
    // Dưới đây là ví dụ đơn giản tạo ảnh mới dựa trên prompt chỉnh sửa.
    
    const image = await openai.images.generate({
      model: "dall-e-3", // Hoặc "dall-e-2" cho chỉnh sửa chi tiết hơn
      prompt: `Ảnh gốc là: ${imageFile.originalname}. Yêu cầu chỉnh sửa: ${prompt}. Tạo ra một hình ảnh mới mô phỏng kết quả chỉnh sửa.`,
      n: 1,
      size: "1024x1024",
      response_format: 'url',
    });

    // Xóa file tạm sau khi xử lý (QUAN TRỌNG)
    // import fs from 'fs/promises';
    // await fs.unlink(imageFile.path); 

    res.json({ 
      imageUrl: image.data[0].url, 
      message: `Đã hoàn thành chỉnh sửa mô phỏng. Ảnh gốc: ${imageFile.originalname}. Yêu cầu: ${prompt}`
    });

  } catch (error) {
    console.error('Lỗi khi chỉnh sửa ảnh:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi xử lý yêu cầu chỉnh sửa ảnh.' });
  }
});

// --- CHỨC NĂNG MỚI: NOTETAKER (API Mock - Xử lý văn bản) ---
app.post('/api/notetaker', async (req, res) => {
  const { content } = req.body; // Có thể là text cuộc họp, hoặc link (tượng trưng)

  if (!content) {
    return res.status(400).json({ error: 'Vui lòng cung cấp nội dung cuộc họp hoặc link (tượng trưng) để ghi chú.' });
  }

  try {
    // Mô phỏng việc xử lý nội dung dài
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
    const docs = await textSplitter.createDocuments([content]);
    
    const context = docs.map(doc => doc.pageContent).join('\n---\n');

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "Bạn là AI Ghi Chú Chuyên Nghiệp. Phân tích nội dung sau và trích xuất các thông tin chính, quyết định đã được đưa ra, và các mục hành động cần thực hiện (Action Items). Format kết quả như sau: \n\n## Ghi Chú Cuộc Họp\n\n### 1. Thông Tin Chính\n- \n- \n\n### 2. Quyết Định\n- \n- \n\n### 3. Mục Hành Động (Action Items)\n- [Ai] Cần làm gì (Deadline)\n- [Ai] Cần làm gì (Deadline)"],
      ["user", `Nội dung cuộc họp cần ghi chú:\n${context}`]
    ]);

    const chain = prompt.pipe(chatModel);
    const response = await chain.invoke({});
    
    res.json({ notes: response.content });

  } catch (error) {
    console.error('Lỗi khi ghi chú:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi xử lý yêu cầu ghi chú.' });
  }
});


// --- CHỨC NĂNG: TÓM TẮT (Summarizer - Tách text riêng nếu cần) ---
// Có thể xử lý trong /api/chat với mode 'summarizer' hoặc tách ra endpoint riêng.
// Hiện tại đang xử lý trong /api/chat.

// Lắng nghe cổng
app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
});