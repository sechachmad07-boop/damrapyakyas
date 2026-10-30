// server.js - Express API server
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { embed, extract } = require('./watermark');

const app = express();
const PORT = process.env.PORT || 3000;

// multer: simpan di memori (tidak ke disk) -> nama file asli tidak berubah/garbled
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

// ---------- Helper: decode gambar -> raw RGB + metadata ----------
async function decodeImage(buffer) {
  // rotate() menerapkan orientasi EXIF agar dimensi sesuai tampilan
  const base = sharp(buffer).rotate();
  const meta = await base.clone().metadata();
  const { data, info } = await base
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height) {
    throw new Error('Gambar tidak valid.');
  }
  return { data, info, meta };
}

// ---------- POST /api/analyze ----------
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Tidak ada file gambar.' });
    const { data, info, meta } = await decodeImage(req.file.buffer);
    const W = info.width, H = info.height;
    const blocks = Math.floor(W / 8) * Math.floor(H / 8);
    const cap1 = Math.floor((blocks / 1 - 16) / 8);
    const cap3 = Math.floor((blocks / 3 - 16) / 8);
    res.json({
      width: W, height: H,
      format: meta.format,
      channels: info.channels,
      sizeBytes: req.file.size,
      megapixels: +(W * H / 1e6).toFixed(2),
      aspect: (W / H).toFixed(3),
      hasAlpha: !!meta.hasAlpha,
      blocks,
      capacity: { rep1: Math.max(0, cap1), rep3: Math.max(0, cap3) }
    });
  } catch (e) {
    res.status(500).json({ error: 'Gagal menganalisis gambar: ' + e.message });
  }
});

// ---------- POST /api/embed ----------
app.post('/api/embed', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Tidak ada file gambar.' });
    const text = (req.body.text || '').toString();
    if (!text.trim()) return res.status(400).json({ error: 'Teks watermark tidak boleh kosong.' });
    const strength = Math.min(100, Math.max(5, parseFloat(req.body.strength) || 50));
    const rep = Math.min(5, Math.max(1, parseInt(req.body.rep) || 3));

    const { data, info } = await decodeImage(req.file.buffer);
    const W = info.width, H = info.height;

    const result = embed(data, W, H, text, strength, rep);

    // encode ke PNG (lossless) untuk download
    const pngBuf = await sharp(result.buffer, { raw: { width: W, height: H, channels: 3 } })
      .png({ compressionLevel: 9 })
      .toBuffer();

    res.json({
      image: 'data:image/png;base64,' + pngBuf.toString('base64'),
      width: W, height: H,
      bitsUsed: result.bitsUsed,
      totalBlocks: result.totalBlocks,
      capacityChars: result.capacityChars,
      psnr: (result.psnr === Infinity) ? 999 : +result.psnr.toFixed(2),
      mse: +result.mse.toFixed(4),
      strength, rep
    });
  } catch (e) {
    res.status(500).json({ error: 'Gagal menyisipkan watermark: ' + e.message });
  }
});

// ---------- POST /api/extract ----------
app.post('/api/extract', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Tidak ada file gambar.' });
    const rep = Math.min(5, Math.max(1, parseInt(req.body.rep) || 3));
    const { data, info } = await decodeImage(req.file.buffer);
    const W = info.width, H = info.height;
    const result = extract(data, W, H, rep);
    res.json({ text: result.text, length: result.length, totalBlocks: result.totalBlocks, rep });
  } catch (e) {
    res.status(500).json({ error: 'Gagal mengekstrak: ' + e.message });
  }
});

app.listen(PORT, () => {
  console.log('Server berjalan di http://localhost:' + PORT);
});