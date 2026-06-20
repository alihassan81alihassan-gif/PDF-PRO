# 📄 PDF Studio Pro — Node.js Edition

Apple-style liquid glass UI wala PDF software — ab poora Node.js mein!

## 📁 Files

| File | Kaam |
|------|------|
| `server.js` | Node.js backend + HTTP server (Python ki jagah) |
| `index.html` | Frontend UI (external CSS se linked) |
| `style.css` | Alag CSS file |
| `package.json` | npm dependencies |

---

## 🚀 Kaise chalayein

### Step 1 — Node.js install karein
https://nodejs.org (v16+ chahiye)

### Step 2 — Dependencies install karein
```bash
npm install
```

### Step 3 — Server start karein
```bash
node server.js
```

Browser automatically `http://localhost:8765` par khulega.

---

## 📦 npm Dependencies

| Package | Kaam |
|---------|------|
| `pdf-lib` | PDF banana, merge, split, rotate, watermark, page numbers |
| `pdf-parse` | Text extract karna |
| `archiver` | ZIP files banana (split/pdf2jpg ke liye) |

---

## 🖥️ System Dependencies (optional)

Kuch features ke liye system tools chahiye:

| Tool | Kaam | Install |
|------|------|---------|
| `poppler-utils` | PDF to JPG, OCR | `sudo apt install poppler-utils` / `brew install poppler` |
| `tesseract` | OCR (scanned PDFs) | `sudo apt install tesseract-ocr` / `brew install tesseract` |
| `qpdf` | Real PDF encryption | `sudo apt install qpdf` / `brew install qpdf` |

---

## ✨ Features

### Organize
- ✅ Merge PDF — Multiple PDFs ek mein
- ✅ Split PDF — Har page alag (ZIP)
- ✅ Remove Pages — Selected pages delete
- ✅ Extract Pages — Specific pages nikalna

### Optimize
- ✅ Compress PDF — Size reduce
- ⚙️ OCR PDF — Tesseract + poppler chahiye

### Convert
- ✅ JPG/PNG to PDF
- ⚙️ PDF to JPG — poppler chahiye
- ✅ PDF to Text

### Edit
- ✅ Rotate PDF (90/180/270°)
- ✅ Add Page Numbers
- ✅ Add Watermark

### Security
- ⚙️ Protect PDF — qpdf chahiye (AES-256)
- ✅ Unlock PDF — pdf-lib se basic, qpdf se advanced

### AI
- ✅ AI Summarizer — Claude API powered

---

## 🔄 Python se Node.js — Kya badla?

| Feature | Python | Node.js |
|---------|--------|---------|
| PDF operations | pypdf + reportlab | pdf-lib |
| Text extraction | pdfplumber | pdf-parse |
| ZIP creation | zipfile | archiver |
| OCR | pytesseract | tesseract CLI |
| PDF to JPG | pdf2image | pdftoppm CLI |
| Server | http.server | http (built-in) |
| Launcher | launch.py | auto browser open in server.js |
