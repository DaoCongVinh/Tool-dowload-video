Trình tải video đa nền tảng (Python + Flask + yt-dlp)
======================================================

Ứng dụng web giúp tải video/âm thanh bằng cách dán URL từ: Facebook, Instagram, Threads, TikTok, YouTube, Reddit (và nhiều nền tảng khác được yt-dlp hỗ trợ).

Yêu cầu
------
- Python 3.10+
- Windows 10/11 (PowerShell)

Cài đặt (Windows)
------------------
```powershell
cd D:\Tool-FB\udemy-topic
python -m venv .venv
. .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```
Mở `http://localhost:5000` trên trình duyệt.

Nếu gặp lỗi khi trích xuất MP3, cài FFmpeg và thêm vào PATH:
```powershell
winget install Gyan.FFmpeg
```

Sử dụng
-------
- Dán liên kết video → chọn "Video" hoặc "Âm thanh" → bấm Tải xuống.
- Ứng dụng trả về tệp đã xử lý để lưu về máy.

Cấu trúc dự án
--------------
```
udemy-topic/
├─ app.py
├─ requirements.txt
├─ templates/
│  └─ index.html
└─ static/
   ├─ style.css
   └─ app.js
```

Ghi chú
------
- Tôn trọng bản quyền và điều khoản nền tảng.
- Video riêng tư/cần đăng nhập có thể không tải được.
- Hỗ trợ nền tảng phụ thuộc vào phiên bản `yt-dlp`. Cập nhật định kỳ:
  ```powershell
  pip install -U yt-dlp
  ```

