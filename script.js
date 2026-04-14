const promptInput = document.getElementById('prompt');
const generateBtn = document.getElementById('generate-btn');
const statusEl = document.getElementById('status');
const gifOutput = document.getElementById('gif-output');

if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
        const prompt = promptInput.value;
        if (!prompt) return alert('Nhập mô tả!');

        try {
            generateBtn.disabled = true;
            statusEl.textContent = 'Đang tạo khung hình...';

            // Gọi API tạo ảnh liên tục để tạo cảm giác video
            const response = await fetch('/api/pollinations-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt }),
            });

            const data = await response.json();
            gifOutput.src = data.imageUrl;
            statusEl.textContent = '✅ Đã tạo ảnh thành công!';
        } catch (error) {
            statusEl.textContent = 'Lỗi tạo khung hình.';
        } finally {
            generateBtn.disabled = false;
        }
    });
}
