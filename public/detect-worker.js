// detect-worker.js - Web Worker untuk deteksi watermark (berjalan di background, tidak freeze halaman)
const N = 8, PI = Math.PI;

function dct2d(block) {
  const out = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let u = 0; u < N; u++) for (let v = 0; v < N; v++) {
    let sum = 0;
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
      sum += block[x][y] * Math.cos((2*x+1)*u*PI/(2*N)) * Math.cos((2*y+1)*v*PI/(2*N));
    }
    const cu = u===0 ? 1/Math.sqrt(2) : 1;
    const cv = v===0 ? 1/Math.sqrt(2) : 1;
    out[u][v] = 0.25 * cu * cv * sum;
  }
  return out;
}
function idct2d(coeffs) {
  const out = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    let sum = 0;
    for (let u = 0; u < N; u++) for (let v = 0; v < N; v++) {
      const cu = u===0 ? 1/Math.sqrt(2) : 1;
      const cv = v===0 ? 1/Math.sqrt(2) : 1;
      sum += cu*cv*coeffs[u][v]*Math.cos((2*x+1)*u*PI/(2*N))*Math.cos((2*y+1)*v*PI/(2*N));
    }
    out[x][y] = 0.25 * sum;
  }
  return out;
}
function rgbToYcbcr(r,g,b){return{Y:0.299*r+0.587*g+0.114*b,Cb:-0.168736*r-0.331264*g+0.5*b+128,Cr:0.5*r-0.418688*g-0.081312*b+128};}
function clamp(v,lo,hi){return v<lo?lo:(v>hi?hi:v);}
function hammingEncode(bits){
  const out=[];
  for(let i=0;i<bits.length;i+=4){
    const d1=bits[i],d2=bits[i+1],d3=bits[i+2],d4=bits[i+3];
    const p1=d1^d2^d4, p2=d1^d3^d4, p3=d2^d3^d4;
    out.push(p1,p2,d1,p3,d2,d3,d4);
  }
  return out;
}
function hammingDecode(cw){
  const data=[];
  for(let i=0;i<cw.length;i+=7){
    const r=cw.slice(i,i+7);
    if(r.length<7) break;
    const s1=r[0]^r[2]^r[4]^r[6];
    const s2=r[1]^r[2]^r[5]^r[6];
    const s3=r[3]^r[4]^r[5]^r[6];
    const syn=(s3<<2)|(s2<<1)|s1;
    if(syn!==0 && syn<=7) r[syn-1]^=1;
    data.push(r[2],r[4],r[5],r[6]);
  }
  return data;
}

function extractImageData(imageData, rep, useECC, ox, oy) {
  const W = imageData.width, H = imageData.height;
  const data = imageData.data;
  const nPix = W * H;
  const Y = new Float64Array(nPix);
  for (let i = 0; i < nPix; i++) {
    const c = rgbToYcbcr(data[i*4], data[i*4+1], data[i*4+2]);
    Y[i] = c.Y;
  }
  const startX = ox, startY = oy;
  const blocksX = Math.floor((W - startX) / 8), blocksY = Math.floor((H - startY) / 8);
  const totalBlocks = blocksX * blocksY;
  if (totalBlocks < 1) throw new Error('Gambar terlalu kecil.');
  const rawBits = new Array(totalBlocks); let bc = 0;
  for (let by = 0; by < blocksY; by++) for (let bx = 0; bx < blocksX; bx++) {
    const blk = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
      const px = oy + by*N + x, py = ox + bx*N + y;
      if (px < H && py < W) blk[x][y] = Y[px*W + py] - 128;
    }
    const coeffs = dct2d(blk);
    rawBits[bc++] = (coeffs[2][1] > coeffs[1][2]) ? 1 : 0;
  }
  function majority(i) {
    let ones = 0;
    for (let k = 0; k < rep; k++) {
      const idx = i * rep + k;
      if (idx < totalBlocks) ones += rawBits[idx];
    }
    return (ones * 2 >= rep) ? 1 : 0;
  }
  if (useECC) {
    const lenCodewordBits = 4 * 7;
    if (lenCodewordBits * rep > totalBlocks) throw new Error('Gambar terlalu kecil.');
    const lenCW = [];
    for (let i = 0; i < lenCodewordBits; i++) lenCW.push(majority(i));
    const lenData = hammingDecode(lenCW);
    let len = 0;
    for (let i = 0; i < 16; i++) len = (len << 1) | lenData[i];
    if (len < 0 || len > 200) throw new Error('Header panjang tidak valid.');
    const dataBitsCount = len * 8;
    const dataCodewords = Math.ceil(dataBitsCount / 4);
    const dataCWBits = dataCodewords * 7;
    if ((lenCodewordBits + dataCWBits) * rep > totalBlocks) throw new Error('Gambar terlalu kecil untuk pesan.');
    const dataCW = [];
    for (let i = 0; i < dataCWBits; i++) dataCW.push(majority(lenCodewordBits + i));
    const decoded = hammingDecode(dataCW);
    const bits = decoded.slice(0, dataBitsCount);
    const outBytes = new Uint8Array(len);
    for (let j = 0; j < len; j++) {
      let byte = 0;
      for (let i = 0; i < 8; i++) byte = (byte << 1) | bits[j * 8 + i];
      outBytes[j] = byte;
    }
    const text = new TextDecoder('utf-8').decode(outBytes);
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(text)) throw new Error('Teks tidak valid.');
    return text;
  }
  if (16 * rep > totalBlocks) throw new Error('Gambar terlalu kecil.');
  let len = 0;
  for (let i = 0; i < 16; i++) len = (len << 1) | majority(i);
  if (len < 0 || len > 100000 || (16 + len * 8) * rep > totalBlocks) throw new Error('Header panjang tidak valid.');
  const outBytes = new Uint8Array(len);
  for (let j = 0; j < len; j++) {
    let byte = 0;
    for (let i = 0; i < 8; i++) {
      const mi = 16 + j * 8 + i;
      byte = (byte << 1) | majority(mi);
    }
    outBytes[j] = byte;
  }
  const text = new TextDecoder('utf-8').decode(outBytes);
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(text)) throw new Error('Teks tidak valid.');
  return text;
}

async function runDetection(buffer) {
  const MAX_DIM = 1024;
  const blob = new Blob([buffer], { type: 'image/jpeg' });
  const imgBitmap = await createImageBitmap(blob);
  let w = imgBitmap.width, h = imgBitmap.height;
  if (Math.max(w, h) > MAX_DIM) {
    const scale = MAX_DIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgBitmap, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

  // Early exit: coba kombinasi terbaik dulu (rep 7 ECC true, offset 0,0)
  const combos = [
    { rep: 7, ecc: true, ox: 0, oy: 0 },
    { rep: 5, ecc: true, ox: 0, oy: 0 },
    { rep: 3, ecc: true, ox: 0, oy: 0 },
    { rep: 1, ecc: true, ox: 0, oy: 0 },
  ];
  // lalu offset kecil kalau yang di atas gagal
  for (let oy = 0; oy <= 3; oy++) {
    for (let ox = 0; ox <= 3; ox++) {
      if (ox === 0 && oy === 0) continue;
      combos.push({ rep: 7, ecc: true, ox, oy });
    }
  }

  let bestText = null, bestRep = null, bestValid = false;
  for (const c of combos) {
    try {
      const t = extractImageData(imageData, c.rep, c.ecc, c.ox, c.oy);
      if (t && t.length > 0 && !/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(t)) {
        bestText = t; bestRep = c.rep; bestValid = true;
        break; // early exit - pertama yang valid langsung keluar
      }
      if (bestText === null && t && t.length > 0) {
        bestText = t; bestRep = c.rep; bestValid = false;
      }
    } catch (e) { /* coba kombinasi berikutnya */ }
  }

  return { found: bestText, rep: bestRep, valid: bestValid, w, h };
}

self.onmessage = async (e) => {
  const { buffer } = e.data;
  try {
    const result = await runDetection(buffer);
    self.postMessage({ ok: true, ...result });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
