#!/usr/bin/env node
/**
 * PDF Studio Pro - Node.js Server
 * Replaces backend.py + server.py + launch.py
 * 
 * Install dependencies:
 *   npm install
 * 
 * Run:
 *   node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 8765;

// ─── Try loading PDF libraries ────────────────────────────────────────────────
let PDFLib, pdfLibOk = false;
try {
  PDFLib = require('pdf-lib');
  pdfLibOk = true;
} catch(e) { console.warn('[WARN] pdf-lib not found. Install: npm install pdf-lib'); }

let PDFDocument, pdfplumberOk = false;
// pdfplumber equivalent for Node: pdf-parse
let pdfParse, pdfParseOk = false;
try {
  pdfParse = require('pdf-parse');
  pdfParseOk = true;
} catch(e) { console.warn('[WARN] pdf-parse not found. Install: npm install pdf-parse'); }

let sharp, sharpOk = false;
try {
  sharp = require('sharp');
  sharpOk = true;
} catch(e) { console.warn('[WARN] sharp not found. Install: npm install sharp'); }

let archiver, archiverOk = false;
try {
  archiver = require('archiver');
  archiverOk = true;
} catch(e) { console.warn('[WARN] archiver not found. Install: npm install archiver'); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function respond(res, success, message, data = null, fileBuffer = null, filename = null) {
  const result = { success, message };
  if (data) result.data = data;
  if (fileBuffer && filename) {
    result.file_b64 = fileBuffer.toString('base64');
    result.filename = filename;
  }
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(result));
}

function b64ToBuffer(b64) {
  return Buffer.from(b64, 'base64');
}

// ─── PDF Operations ───────────────────────────────────────────────────────────

async function mergePdfs(res, filesB64) {
  if (!pdfLibOk) return respond(res, false, 'pdf-lib not installed. Run: npm install pdf-lib');
  const { PDFDocument } = PDFLib;
  const merged = await PDFDocument.create();
  for (const fb64 of filesB64) {
    const srcDoc = await PDFDocument.load(b64ToBuffer(fb64));
    const pages = await merged.copyPages(srcDoc, srcDoc.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }
  const bytes = await merged.save();
  respond(res, true, `Merged ${filesB64.length} PDFs successfully!`, null, Buffer.from(bytes), 'merged.pdf');
}

async function splitPdf(res, fileB64) {
  if (!pdfLibOk) return respond(res, false, 'pdf-lib not installed. Run: npm install pdf-lib');
  if (!archiverOk) return respond(res, false, 'archiver not installed. Run: npm install archiver');
  const { PDFDocument } = PDFLib;
  const srcDoc = await PDFDocument.load(b64ToBuffer(fileB64));
  const totalPages = srcDoc.getPageCount();

  const chunks = [];
  const archive = archiver('zip');
  archive.on('data', chunk => chunks.push(chunk));

  for (let i = 0; i < totalPages; i++) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(srcDoc, [i]);
    doc.addPage(page);
    const bytes = await doc.save();
    archive.append(Buffer.from(bytes), { name: `page_${i + 1}.pdf` });
  }

  await archive.finalize();
  await new Promise(r => archive.on('end', r));

  const zipBuf = Buffer.concat(chunks);
  respond(res, true, `Split into ${totalPages} pages!`, null, zipBuf, 'split_pages.zip');
}

async function removePages(res, fileB64, pagesToRemove) {
  if (!pdfLibOk) return respond(res, false, 'pdf-lib not installed. Run: npm install pdf-lib');
  const { PDFDocument } = PDFLib;
  const srcDoc = await PDFDocument.load(b64ToBuffer(fileB64));
  const removeSet = new Set(pagesToRemove.map(p => parseInt(p) - 1));
  const keepIndices = srcDoc.getPageIndices().filter(i => !removeSet.has(i));
  const newDoc = await PDFDocument.create();
  const pages = await newDoc.copyPages(srcDoc, keepIndices);
  pages.forEach(p => newDoc.addPage(p));
  const bytes = await newDoc.save();
  respond(res, true, `Removed ${removeSet.size} pages, kept ${keepIndices.length}.`, null, Buffer.from(bytes), 'removed_pages.pdf');
}

async function extractPages(res, fileB64, pagesToExtract) {
  if (!pdfLibOk) return respond(res, false, 'pdf-lib not installed. Run: npm install pdf-lib');
  const { PDFDocument } = PDFLib;
  const srcDoc = await PDFDocument.load(b64ToBuffer(fileB64));
  const total = srcDoc.getPageCount();
  const indices = pagesToExtract.map(p => parseInt(p) - 1).filter(i => i >= 0 && i < total);
  const newDoc = await PDFDocument.create();
  const pages = await newDoc.copyPages(srcDoc, indices);
  pages.forEach(p => newDoc.addPage(p));
  const bytes = await newDoc.save();
  respond(res, true, `Extracted ${indices.length} pages.`, null, Buffer.from(bytes), 'extracted_pages.pdf');
}

async function compressPdf(res, fileB64) {
  if (!pdfLibOk) return respond(res, false, 'pdf-lib not installed. Run: npm install pdf-lib');
  const { PDFDocument } = PDFLib;
  const origBuf = b64ToBuffer(fileB64);
  const srcDoc = await PDFDocument.load(origBuf, { ignoreEncryption: true });
  // pdf-lib compresses on save with useObjectStreams
  const bytes = await srcDoc.save({ useObjectStreams: true, addDefaultPage: false });
  const reduction = Math.round((1 - bytes.length / origBuf.length) * 100 * 10) / 10;
  respond(res, true, `Compressed! Size reduced by ~${reduction >= 0 ? reduction : 0}%`, null, Buffer.from(bytes), 'compressed.pdf');
}

async function rotatePdf(res, fileB64, angle) {
  if (!pdfLibOk) return respond(res, false, 'pdf-lib not installed. Run: npm install pdf-lib');
  const { PDFDocument, degrees } = PDFLib;
  const srcDoc = await PDFDocument.load(b64ToBuffer(fileB64));
  const angleDeg = parseInt(String(angle).replace('°', '').trim()) || 90;
  srcDoc.getPages().forEach(p => p.setRotation(degrees((p.getRotation().angle + angleDeg) % 360)));
  const bytes = await srcDoc.save();
  respond(res, true, `Rotated all pages by ${angleDeg}°!`, null, Buffer.from(bytes), 'rotated.pdf');
}

async function addWatermark(res, fileB64, text) {
  if (!pdfLibOk) return respond(res, false, 'pdf-lib not installed. Run: npm install pdf-lib');
  const { PDFDocument, rgb, degrees } = PDFLib;
  const srcDoc = await PDFDocument.load(b64ToBuffer(fileB64));
  const pages = srcDoc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();
    page.drawText(text || 'WATERMARK', {
      x: width / 2 - (text.length * 14),
      y: height / 2,
      size: 52,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.25,
      rotate: degrees(45),
    });
  }
  const bytes = await srcDoc.save();
  respond(res, true, `Watermark "${text}" added!`, null, Buffer.from(bytes), 'watermarked.pdf');
}

async function addPageNumbers(res, fileB64, position) {
  if (!pdfLibOk) return respond(res, false, 'pdf-lib not installed. Run: npm install pdf-lib');
  const { PDFDocument, rgb } = PDFLib;
  const srcDoc = await PDFDocument.load(b64ToBuffer(fileB64));
  const pages = srcDoc.getPages();
  pages.forEach((page, i) => {
    const { width, height } = page.getSize();
    const y = position === 'top' ? height - 22 : 14;
    page.drawText(String(i + 1), {
      x: width / 2 - 6,
      y,
      size: 11,
      color: rgb(0.3, 0.3, 0.3),
      opacity: 0.85,
    });
  });
  const bytes = await srcDoc.save();
  respond(res, true, 'Page numbers added!', null, Buffer.from(bytes), 'numbered.pdf');
}

async function protectPdf(res, fileB64, password) {
  if (!pdfLibOk) return respond(res, false, 'pdf-lib not installed. Run: npm install pdf-lib');
  // pdf-lib doesn't support encryption natively; we use a workaround via copy
  // We'll respond with a clear message and still deliver the PDF (without real encryption)
  // For real encryption you'd use qpdf CLI or hummus
  const { PDFDocument } = PDFLib;
  const srcDoc = await PDFDocument.load(b64ToBuffer(fileB64));
  // Note: pdf-lib does not support AES encryption. For real password protection,
  // install qpdf: https://qpdf.sourceforge.io/
  try {
    execSync('qpdf --version', { stdio: 'ignore' });
    // qpdf available
    const os = require('os');
    const tmpIn = path.join(os.tmpdir(), `in_${Date.now()}.pdf`);
    const tmpOut = path.join(os.tmpdir(), `out_${Date.now()}.pdf`);
    fs.writeFileSync(tmpIn, b64ToBuffer(fileB64));
    execSync(`qpdf --encrypt "${password}" "${password}" 256 -- "${tmpIn}" "${tmpOut}"`);
    const outBuf = fs.readFileSync(tmpOut);
    fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut);
    respond(res, true, 'PDF protected with password! (AES-256 via qpdf)', null, outBuf, 'protected.pdf');
  } catch(e) {
    // qpdf not available — deliver unencrypted with warning
    const bytes = await srcDoc.save();
    respond(res, false, 'Password protection requires qpdf. Install from https://qpdf.sourceforge.io/ and retry. PDF delivered unencrypted.');
  }
}

async function unlockPdf(res, fileB64, password) {
  if (!pdfLibOk) return respond(res, false, 'pdf-lib not installed. Run: npm install pdf-lib');
  try {
    const { PDFDocument } = PDFLib;
    const buf = b64ToBuffer(fileB64);
    const srcDoc = await PDFDocument.load(buf, { password, ignoreEncryption: false });
    const bytes = await srcDoc.save();
    respond(res, true, 'PDF unlocked successfully!', null, Buffer.from(bytes), 'unlocked.pdf');
  } catch(e) {
    // Try qpdf
    try {
      execSync('qpdf --version', { stdio: 'ignore' });
      const os = require('os');
      const tmpIn = path.join(os.tmpdir(), `in_${Date.now()}.pdf`);
      const tmpOut = path.join(os.tmpdir(), `out_${Date.now()}.pdf`);
      fs.writeFileSync(tmpIn, b64ToBuffer(fileB64));
      execSync(`qpdf --password="${password}" --decrypt "${tmpIn}" "${tmpOut}"`);
      const outBuf = fs.readFileSync(tmpOut);
      fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut);
      respond(res, true, 'PDF unlocked successfully!', null, outBuf, 'unlocked.pdf');
    } catch(e2) {
      respond(res, false, 'Could not unlock PDF. Wrong password or try installing qpdf.');
    }
  }
}

async function getPdfInfo(res, fileB64) {
  if (!pdfLibOk) return respond(res, false, 'pdf-lib not installed. Run: npm install pdf-lib');
  const { PDFDocument } = PDFLib;
  const buf = b64ToBuffer(fileB64);
  const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const info = {
    pages: srcDoc.getPageCount(),
    encrypted: false,
    size: `${(buf.length / 1024).toFixed(1)} KB`,
    metadata: {
      title: srcDoc.getTitle() || '',
      author: srcDoc.getAuthor() || '',
      subject: srcDoc.getSubject() || '',
      creator: srcDoc.getCreator() || '',
    }
  };
  // Check if encrypted
  try {
    await PDFDocument.load(buf, { ignoreEncryption: false });
  } catch(e) {
    if (e.message && e.message.includes('encrypt')) info.encrypted = true;
  }
  respond(res, true, 'PDF info retrieved.', info);
}

async function extractText(res, fileB64) {
  if (!pdfParseOk) return respond(res, false, 'pdf-parse not installed. Run: npm install pdf-parse');
  const buf = b64ToBuffer(fileB64);
  const data = await pdfParse(buf);
  respond(res, true, 'Text extracted!', { text: data.text.substring(0, 5000) });
}

async function jpgToPdf(res, filesB64) {
  if (!pdfLibOk) return respond(res, false, 'pdf-lib not installed. Run: npm install pdf-lib');
  const { PDFDocument } = PDFLib;
  const newDoc = await PDFDocument.create();
  for (const fb64 of filesB64) {
    const imgBuf = b64ToBuffer(fb64);
    // Detect JPEG vs PNG by magic bytes
    let img;
    if (imgBuf[0] === 0xFF && imgBuf[1] === 0xD8) {
      img = await newDoc.embedJpg(imgBuf);
    } else {
      img = await newDoc.embedPng(imgBuf);
    }
    const page = newDoc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const bytes = await newDoc.save();
  respond(res, true, `Converted ${filesB64.length} images to PDF!`, null, Buffer.from(bytes), 'images.pdf');
}

async function pdfToJpg(res, fileB64) {
  // Requires system poppler (pdftoppm) or sharp with pdf support
  // Try pdftoppm first (most reliable on Linux/Mac)
  try {
    execSync('pdftoppm -v 2>&1', { stdio: 'ignore' });
  } catch(e) {
    return respond(res, false, 'PDF to JPG requires poppler-utils. Install: sudo apt install poppler-utils (Linux) or brew install poppler (Mac)');
  }
  if (!archiverOk) return respond(res, false, 'archiver not installed. Run: npm install archiver');

  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfjpg_'));
  const tmpIn = path.join(tmpDir, 'input.pdf');
  fs.writeFileSync(tmpIn, b64ToBuffer(fileB64));

  execSync(`pdftoppm -jpeg -r 150 "${tmpIn}" "${path.join(tmpDir, 'page')}"`);

  const jpgFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jpg')).sort();
  const chunks = [];
  const archive = archiver('zip');
  archive.on('data', chunk => chunks.push(chunk));

  for (const f of jpgFiles) {
    archive.file(path.join(tmpDir, f), { name: f });
  }
  await archive.finalize();
  await new Promise(r => archive.on('end', r));

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true });

  const zipBuf = Buffer.concat(chunks);
  respond(res, true, `Converted ${jpgFiles.length} pages to JPG!`, null, zipBuf, 'pdf_pages.zip');
}

async function ocrPdf(res, fileB64) {
  // Requires tesseract + poppler
  try { execSync('tesseract --version', { stdio: 'ignore' }); } catch(e) {
    return respond(res, false, 'OCR requires Tesseract. Install: sudo apt install tesseract-ocr poppler-utils (Linux) or brew install tesseract poppler (Mac)');
  }
  try { execSync('pdftoppm -v 2>&1', { stdio: 'ignore' }); } catch(e) {
    return respond(res, false, 'OCR requires poppler. Install: sudo apt install poppler-utils (Linux) or brew install poppler (Mac)');
  }

  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr_'));
  const tmpIn = path.join(tmpDir, 'input.pdf');
  fs.writeFileSync(tmpIn, b64ToBuffer(fileB64));

  execSync(`pdftoppm -r 200 "${tmpIn}" "${path.join(tmpDir, 'page')}"`);
  const imgFiles = fs.readdirSync(tmpDir).filter(f => f.startsWith('page') && !f.endsWith('.pdf')).sort();

  let fullText = '';
  for (let i = 0; i < imgFiles.length; i++) {
    const imgPath = path.join(tmpDir, imgFiles[i]);
    const txtOut = path.join(tmpDir, `out_${i}`);
    execSync(`tesseract "${imgPath}" "${txtOut}" quiet`);
    const txt = fs.existsSync(txtOut + '.txt') ? fs.readFileSync(txtOut + '.txt', 'utf8') : '';
    fullText += `--- Page ${i + 1} ---\n${txt}\n\n`;
  }

  fs.rmSync(tmpDir, { recursive: true });

  const txtBuf = Buffer.from(fullText, 'utf8');
  respond(res, true, `OCR complete! Extracted text from ${imgFiles.length} pages.`, null, txtBuf, 'ocr_output.txt');
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // Serve static files
  if (req.method === 'GET') {
    const staticFiles = {
      '/': 'index.html',
      '/index.html': 'index.html',
      '/style.css': 'style.css',
    };
    const filePath = staticFiles[req.url];
    if (filePath) {
      const fullPath = path.join(__dirname, filePath);
      if (fs.existsSync(fullPath)) {
        const ext = path.extname(filePath);
        const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
        return res.end(fs.readFileSync(fullPath));
      }
    }
    res.writeHead(404);
    return res.end('Not Found');
  }

  // Handle PDF operations
  if (req.method === 'POST' && req.url === '/process') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch(e) { return respond(res, false, 'Invalid JSON'); }

      const { action } = payload;
      try {
        switch (action) {
          case 'merge':         return await mergePdfs(res, payload.files);
          case 'split':         return await splitPdf(res, payload.file);
          case 'remove_pages':  return await removePages(res, payload.file, payload.pages);
          case 'extract_pages': return await extractPages(res, payload.file, payload.pages);
          case 'compress':      return await compressPdf(res, payload.file);
          case 'ocr':           return await ocrPdf(res, payload.file);
          case 'jpg_to_pdf':    return await jpgToPdf(res, payload.files);
          case 'pdf_to_jpg':    return await pdfToJpg(res, payload.file);
          case 'rotate':        return await rotatePdf(res, payload.file, payload.angle || 90);
          case 'watermark':     return await addWatermark(res, payload.file, payload.text || 'WATERMARK');
          case 'page_numbers':  return await addPageNumbers(res, payload.file, payload.position || 'bottom');
          case 'protect':       return await protectPdf(res, payload.file, payload.password);
          case 'unlock':        return await unlockPdf(res, payload.file, payload.password || '');
          case 'info':          return await getPdfInfo(res, payload.file);
          case 'extract_text':  return await extractText(res, payload.file);
          default:              return respond(res, false, `Unknown action: ${action}`);
        }
      } catch (err) {
        respond(res, false, `Error: ${err.message}`);
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, 'localhost', () => {
  console.log(`
╔══════════════════════════════════════════╗
║       PDF Studio Pro - Node.js Server    ║
╠══════════════════════════════════════════╣
║  ✅  Running on http://localhost:${PORT}    ║
║  🛑  Press Ctrl+C to stop                ║
╚══════════════════════════════════════════╝
  `);
  // Auto-open browser
  const { exec } = require('child_process');
  const url = `http://localhost:${PORT}`;
  const cmd = process.platform === 'win32' ? `start ${url}` :
              process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
  exec(cmd);
});

process.on('SIGINT', () => {
  console.log('\n⏹  PDF Studio stopped.');
  process.exit(0);
});
