// watermark.js - Embed & ekstrak watermark teks pada channel luminance (Y)
const { N, dct2d, idct2d } = require('./dct');

function rgbToYcbcr(r, g, b) {
  const Y  =  0.299   * r + 0.587   * g + 0.114   * b;
  const Cb = -0.168736 * r - 0.331264 * g + 0.5     * b + 128;
  const Cr =  0.5     * r - 0.418688 * g - 0.081312 * b + 128;
  return { Y, Cb, Cr };
}
function ycbcrToRgb(Y, Cb, Cr) {
  const r = Y + 1.402 * (Cr - 128);
  const g = Y - 0.344136 * (Cb - 128) - 0.714136 * (Cr - 128);
  const b = Y + 1.772 * (Cb - 128);
  return { r, g, b };
}
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function embed(rgbBuf, W, H, text, strength, rep) {
  rep = Math.max(1, Math.floor(rep || 1));
  const nPix = W * H;
  const Y  = new Float64Array(nPix);
  const Cb = new Float64Array(nPix);
  const Cr = new Float64Array(nPix);

  for (let i = 0; i < nPix; i++) {
    const r = rgbBuf[i * 3];
    const g = rgbBuf[i * 3 + 1];
    const b = rgbBuf[i * 3 + 2];
    const c = rgbToYcbcr(r, g, b);
    Y[i] = c.Y; Cb[i] = c.Cb; Cr[i] = c.Cr;
  }

  const bytes = Buffer.from(text, 'utf8');
  const len = bytes.length;
  const bits = [];
  for (let i = 15; i >= 0; i--) bits.push((len >> i) & 1);
  for (let k = 0; k < bytes.length; k++) {
    for (let i = 7; i >= 0; i--) bits.push((bytes[k] >> i) & 1);
  }
  const totalBits = bits.length;

  const blocksX = Math.floor(W / N);
  const blocksY = Math.floor(H / N);
  const totalBlocks = blocksX * blocksY;
  const needed = totalBits * rep;
  if (needed > totalBlocks) {
    throw new Error('Pesan terlalu panjang. Kapasitas: ' +
      Math.floor((totalBlocks / rep - 16) / 8) + ' karakter (redundansi ' + rep + 'x).');
  }

  let blockCounter = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const mi = Math.floor(blockCounter / rep);
      if (mi < totalBits) {
        const bit = bits[mi];
        const blk = Array.from({ length: N }, () => new Array(N).fill(0));
        for (let x = 0; x < N; x++) {
          for (let y = 0; y < N; y++) {
            blk[x][y] = Y[(by * N + x) * W + (bx * N + y)] - 128;
          }
        }
        const coeffs = dct2d(blk);
        const a = coeffs[2][1];
        const b = coeffs[1][2];
        const mid = (a + b) / 2;
        const half = strength / 2;
        if (bit === 1) {
          coeffs[2][1] = mid + half;
          coeffs[1][2] = mid - half;
        } else {
          coeffs[2][1] = mid - half;
          coeffs[1][2] = mid + half;
        }
        const outBlk = idct2d(coeffs);
        for (let x = 0; x < N; x++) {
          for (let y = 0; y < N; y++) {
            const idx = (by * N + x) * W + (bx * N + y);
            Y[idx] = clamp(outBlk[x][y] + 128, 0, 255);
          }
        }
      }
      blockCounter++;
    }
  }

  const outBuf = Buffer.alloc(nPix * 3);
  let sse = 0;
  for (let i = 0; i < nPix; i++) {
    const c = ycbcrToRgb(Y[i], Cb[i], Cr[i]);
    const r = clamp(Math.round(c.r), 0, 255);
    const g = clamp(Math.round(c.g), 0, 255);
    const b = clamp(Math.round(c.b), 0, 255);
    outBuf[i * 3]     = r;
    outBuf[i * 3 + 1] = g;
    outBuf[i * 3 + 2] = b;
    const dr = r - rgbBuf[i * 3];
    const dg = g - rgbBuf[i * 3 + 1];
    const db = b - rgbBuf[i * 3 + 2];
    sse += dr * dr + dg * dg + db * db;
  }
  const mse = sse / (nPix * 3);
  const psnr = (mse === 0) ? Infinity : 10 * Math.log10((255 * 255) / mse);
  const capacityChars = Math.floor((totalBlocks / rep - 16) / 8);
  return { buffer: outBuf, width: W, height: H, totalBlocks, bitsUsed: totalBits, capacityChars, psnr, mse };
}

function extract(rgbBuf, W, H, rep) {
  rep = Math.max(1, Math.floor(rep || 1));
  const nPix = W * H;
  const Y = new Float64Array(nPix);
  for (let i = 0; i < nPix; i++) {
    const c = rgbToYcbcr(rgbBuf[i * 3], rgbBuf[i * 3 + 1], rgbBuf[i * 3 + 2]);
    Y[i] = c.Y;
  }

  const blocksX = Math.floor(W / N);
  const blocksY = Math.floor(H / N);
  const totalBlocks = blocksX * blocksY;

  const rawBits = new Array(totalBlocks);
  let bc = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const blk = Array.from({ length: N }, () => new Array(N).fill(0));
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          blk[x][y] = Y[(by * N + x) * W + (bx * N + y)] - 128;
        }
      }
      const coeffs = dct2d(blk);
      rawBits[bc++] = (coeffs[2][1] > coeffs[1][2]) ? 1 : 0;
    }
  }

  function majority(startMsgBit) {
    let ones = 0;
    for (let k = 0; k < rep; k++) {
      const idx = (startMsgBit * rep + k);
      if (idx < totalBlocks) ones += rawBits[idx];
    }
    return (ones * 2 >= rep) ? 1 : 0;
  }

  if (16 * rep > totalBlocks) {
    throw new Error('Gambar terlalu kecil untuk diekstrak.');
  }
  let len = 0;
  for (let i = 0; i < 16; i++) {
    len = (len << 1) | majority(i);
  }
  if (len < 0 || len > 100000 || (16 + len * 8) * rep > totalBlocks) {
    throw new Error('Header panjang tidak valid. Panjang terbaca: ' + len);
  }

  const outBytes = Buffer.alloc(len);
  for (let j = 0; j < len; j++) {
    let byte = 0;
    for (let i = 0; i < 8; i++) {
      const msgBitIndex = 16 + j * 8 + i;
      byte = (byte << 1) | majority(msgBitIndex);
    }
    outBytes[j] = byte;
  }

  let text = '';
  try {
    text = outBytes.toString('utf8');
    if (Buffer.from(text, 'utf8').length !== len) text = outBytes.toString('latin1');
  } catch (e) {
    text = outBytes.toString('latin1');
  }
  if (text.indexOf('\uFFFD') !== -1) {
    text = outBytes.toString('latin1');
  }

  return { text, length: len, totalBlocks, rep };
}

module.exports = { embed, extract, rgbToYcbcr, ycbcrToRgb };