// app.js - client-side, tanpa backend
const $ = (id) => document.getElementById(id);
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
function ycbcrToRgb(Y,Cb,Cr){return{r:Y+1.402*(Cr-128),g:Y-0.344136*(Cb-128)-0.714136*(Cr-128),b:Y+1.772*(Cb-128)};}
function clamp(v,lo,hi){return v<lo?lo:(v>hi?hi:v);}
// Hamming(7,4) ECC
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

let currentImageData=null, currentFileName='', watermarkedImageData=null, watermarkedDataURL=null, watermarkedBlob=null;
let detectImageData=null, detectFileName='';

function toast(msg,type=''){const t=$('toast');t.textContent=msg;t.className='toast show '+type;clearTimeout(t._timer);t._timer=setTimeout(()=>{t.className='toast';},3200);}

function setupDrop(zone,input,onFile){
  if (zone.tagName !== 'LABEL') {
    zone.addEventListener('click',()=>input.click());
  }
  input.addEventListener('change',(e)=>{if(e.target.files&&e.target.files[0])onFile(e.target.files[0]);});
  zone.addEventListener('dragover',(e)=>{e.preventDefault();zone.classList.add('drag');});
  zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));
  zone.addEventListener('drop',(e)=>{e.preventDefault();zone.classList.remove('drag');if(e.dataTransfer.files&&e.dataTransfer.files[0])onFile(e.dataTransfer.files[0]);});
}

function hasAlphaChannel(data){for(let i=3;i<data.length;i+=40)if(data[i]<255)return true;return false;}

function analyzeFile(file){
  currentFileName=file.name;
  const url=URL.createObjectURL(file);
  const img=new Image();
  img.onload=()=>{
    // tampilkan preview dulu agar terlihat di mobile
    $('previewImg').src=url;
    $('previewCard').style.display='';
    let canvas,ctx;
    try {
      canvas=document.createElement('canvas');
      canvas.width=img.width;canvas.height=img.height;
      ctx=canvas.getContext('2d',{colorSpace:'srgb'});ctx.drawImage(img,0,0);
      currentImageData=ctx.getImageData(0,0,img.width,img.height);
    } catch(e) {
      toast('Gagal memproses gambar: '+e.message,'error');
      return;
    }
    const W=img.width,H=img.height;
    const blocks=Math.floor(W/8)*Math.floor(H/8);
    const cap3=Math.max(0,Math.floor((blocks/3-16)/8));
    const rows=[
      ['Nama file',file.name],
      ['Format',(file.type||'image').toUpperCase().replace('IMAGE/','')],
      ['Lebar (width)',W+' px'],
      ['Tinggi (height)',H+' px'],
      ['Megapiksel',(W*H/1e6).toFixed(2)+' MP'],
      ['Rasio aspek',(W/H).toFixed(3)],
      ['Ukuran file',(file.size/1024).toFixed(1)+' KB'],
      ['Transparansi (alpha)',hasAlphaChannel(currentImageData.data)?'Ya':'Tidak'],
      ['Blok DCT 8×8',blocks],
      ['Kapasitas nama (3x)',cap3+' karakter'],
    ];
    $('infoTable').innerHTML=rows.map(([k,v])=>`<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    toast('Foto berhasil dianalisis','success');
  };
  img.onerror=()=>toast('Gagal memuat gambar','error');
  img.src=url;
}
setupDrop($('dropZone'),$('fileInput'),analyzeFile);

function embedImageData(imageData,text,strength,rep){
  const W=imageData.width,H=imageData.height;
  const data=imageData.data;
  const nPix=W*H;
  const Y=new Float64Array(nPix),Cb=new Float64Array(nPix),Cr=new Float64Array(nPix),Alpha=new Uint8Array(nPix);
  for(let i=0;i<nPix;i++){
    const r=data[i*4],g=data[i*4+1],b=data[i*4+2],a=data[i*4+3];
    const c=rgbToYcbcr(r,g,b);Y[i]=c.Y;Cb[i]=c.Cb;Cr[i]=c.Cr;Alpha[i]=a;
  }
  const bytes=new TextEncoder().encode(text);
  const len=bytes.length;
  const bits=[];
  for(let i=15;i>=0;i--)bits.push((len>>i)&1);
  for(let k=0;k<bytes.length;k++)for(let i=7;i>=0;i--)bits.push((bytes[k]>>i)&1);
  // pad to multiple of 4 for Hamming
  while(bits.length % 4 !== 0) bits.push(0);
  const eccBits = hammingEncode(bits);
  const totalBits = eccBits.length;
  const blocksX=Math.floor(W/8),blocksY=Math.floor(H/8),totalBlocks=blocksX*blocksY;
  const needed=totalBits*rep;
  if(needed>totalBlocks)throw new Error('Nama terlalu panjang. Kapasitas: '+Math.floor((totalBlocks/rep*4/7-16)/8)+' karakter.');
  let blockCounter=0;
  for(let by=0;by<blocksY;by++)for(let bx=0;bx<blocksX;bx++){
    const mi=Math.floor(blockCounter/rep);
    if(mi<totalBits){
      const bit=eccBits[mi];
      const blk=Array.from({length:N},()=>new Array(N).fill(0));
      for(let x=0;x<N;x++)for(let y=0;y<N;y++)blk[x][y]=Y[(by*N+x)*W+(bx*N+y)]-128;
      const coeffs=dct2d(blk);
      const a=coeffs[2][1],b=coeffs[1][2];
      const mid=(a+b)/2,half=strength/2;
      if(bit===1){coeffs[2][1]=mid+half;coeffs[1][2]=mid-half;}
      else{coeffs[2][1]=mid-half;coeffs[1][2]=mid+half;}
      const outBlk=idct2d(coeffs);
      for(let x=0;x<N;x++)for(let y=0;y<N;y++){const idx=(by*N+x)*W+(bx*N+y);Y[idx]=clamp(outBlk[x][y]+128,0,255);}
    }
    blockCounter++;
  }
  const out=new Uint8ClampedArray(nPix*4);
  let sse=0;
  for(let i=0;i<nPix;i++){
    const c=ycbcrToRgb(Y[i],Cb[i],Cr[i]);
    const r=clamp(Math.round(c.r),0,255),g=clamp(Math.round(c.g),0,255),b=clamp(Math.round(c.b),0,255);
    out[i*4]=r;out[i*4+1]=g;out[i*4+2]=b;out[i*4+3]=Alpha[i];
    const dr=r-data[i*4],dg=g-data[i*4+1],db=b-data[i*4+2];sse+=dr*dr+dg*dg+db*db;
  }
  const mse=sse/(nPix*3);
  const psnr=(mse===0)?999:10*Math.log10((255*255)/mse);
  return{imageData:new ImageData(out,W,H),psnr:+psnr.toFixed(2),mse:+mse.toFixed(4),bitsUsed:totalBits,totalBlocks};
}

function extractImageData(imageData,rep,useECC=true,ox=0,oy=0){
  const W=imageData.width,H=imageData.height;
  const data=imageData.data;
  const nPix=W*H;
  const Y=new Float64Array(nPix);
  for(let i=0;i<nPix;i++){const c=rgbToYcbcr(data[i*4],data[i*4+1],data[i*4+2]);Y[i]=c.Y;}
  const startX=ox, startY=oy;
  const blocksX=Math.floor((W-startX)/8),blocksY=Math.floor((H-startY)/8),totalBlocks=blocksX*blocksY;
  if(totalBlocks<1) throw new Error('Gambar terlalu kecil.');
  const rawBits=new Array(totalBlocks);let bc=0;
  for(let by=0;by<blocksY;by++)for(let bx=0;bx<blocksX;bx++){
    const blk=Array.from({length:N},()=>new Array(N).fill(0));
    for(let x=0;x<N;x++)for(let y=0;y<N;y++){
      const px=oy+by*N+x, py=ox+bx*N+y;
      if(px<H && py<W) blk[x][y]=Y[px*W+py]-128;
    }
    const coeffs=dct2d(blk);
    rawBits[bc++]=(coeffs[2][1]>coeffs[1][2])?1:0;
  }
  function majority(i){let ones=0;for(let k=0;k<rep;k++){const idx=i*rep+k;if(idx<totalBlocks)ones+=rawBits[idx];}return (ones*2>=rep)?1:0;}

  // ECC path: decode length (4 codewords=28 bits) then data
  if(useECC){
    const lenCodewordBits = 4*7; // 28
    if(lenCodewordBits*rep > totalBlocks) throw new Error('Gambar terlalu kecil.');
    const lenCW=[];
    for(let i=0;i<lenCodewordBits;i++) lenCW.push(majority(i));
    const lenData=hammingDecode(lenCW); // 16 bits
    let len=0;
    for(let i=0;i<16;i++) len=(len<<1)|lenData[i];
    if(len<0||len>200) throw new Error('Header panjang tidak valid (ECC). Panjang terbaca: '+len);
    const dataBitsCount = len*8;
    const dataCodewords = Math.ceil(dataBitsCount/4);
    const dataCWBits = dataCodewords*7;
    if((lenCodewordBits+dataCWBits)*rep > totalBlocks) throw new Error('Gambar terlalu kecil untuk pesan ini.');
    const dataCW=[];
    for(let i=0;i<dataCWBits;i++) dataCW.push(majority(lenCodewordBits+i));
    const decoded=hammingDecode(dataCW);
    // trim to dataBitsCount
    const bits=decoded.slice(0,dataBitsCount);
    const outBytes=new Uint8Array(len);
    for(let j=0;j<len;j++){let byte=0;for(let i=0;i<8;i++)byte=(byte<<1)|bits[j*8+i];outBytes[j]=byte;}
    const text=new TextDecoder('utf-8').decode(outBytes);
    if(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(text)) throw new Error('Teks tidak valid (ECC).');
    return text;
  }

  // Fallback raw (tanpa ECC, untuk watermark lama)
  if(16*rep>totalBlocks)throw new Error('Gambar terlalu kecil.');
  let len=0;for(let i=0;i<16;i++)len=(len<<1)|majority(i);
  if(len<0||len>100000||(16+len*8)*rep>totalBlocks)throw new Error('Header panjang tidak valid. Panjang terbaca: '+len);
  const outBytes=new Uint8Array(len);
  for(let j=0;j<len;j++){let byte=0;for(let i=0;i<8;i++){const mi=16+j*8+i;byte=(byte<<1)|majority(mi);}outBytes[j]=byte;}
  const text=new TextDecoder('utf-8').decode(outBytes);
  if(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(text)) throw new Error('Teks tidak valid.');
  return text;
}
function imageDataToBlob(imageData){
  return new Promise((resolve,reject)=>{
    const canvas=document.createElement('canvas');
    canvas.width=imageData.width;canvas.height=imageData.height;
    const ctx=canvas.getContext('2d',{colorSpace:'srgb'});ctx.putImageData(imageData,0,0);
    canvas.toBlob((b)=>{ if(b) resolve(b); else reject(new Error('Gagal membuat blob gambar')); },'image/png');
  });
}
function imageDataToDataURLFallback(imageData){const c=document.createElement('canvas');c.width=imageData.width;c.height=imageData.height;const ctx=c.getContext('2d',{colorSpace:'srgb'});ctx.putImageData(imageData,0,0);return c.toDataURL('image/png');}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

$('processBtn').addEventListener('click',()=>{
  const username=$('username').value.trim();
  if(!username){toast('Masukkan nama pengguna terlebih dahulu','error');return;}
  if(!currentImageData){toast('Upload foto terlebih dahulu','error');return;}
  const W=currentImageData.width,H=currentImageData.height;
  const blocks=Math.floor(W/8)*Math.floor(H/8);
  const cap3=Math.max(0,Math.floor((blocks/3-16)/8));
  if(username.length>cap3){toast('Nama terlalu panjang (maks '+cap3+' karakter)','error');return;}
  $('processBtn').disabled=true;
  $('processBtn').textContent='⏳ Memproses...';
  setTimeout(async ()=>{
    try{
      const result=embedImageData(currentImageData,username,100,7);
      watermarkedImageData=result.imageData;
      let url, blob;
      try { blob=await imageDataToBlob(result.imageData); url=URL.createObjectURL(blob); }
      catch(e){ blob=null; url=imageDataToDataURLFallback(result.imageData); }
      watermarkedBlob=blob;
      if(watermarkedDataURL && watermarkedDataURL.startsWith('blob:')) URL.revokeObjectURL(watermarkedDataURL);
      watermarkedDataURL=url;
      $('resultImg').src=url;
      $('resultCard').style.display='';
      const rows=[
        ['Nama pengguna',username],
        ['Lebar',result.imageData.width+' px'],
        ['Tinggi',result.imageData.height+' px'],
        ['PSNR (kualitas)',result.psnr+' dB'],
        ['MSE',result.mse],
        ['Status','Watermark tak kasat mata tersisip'],
      ];
      $('resultTable').innerHTML=rows.map(([k,v])=>`<tr><td>${k}</td><td>${v}</td></tr>`).join('');
      $('downloadBtn').href=url;
      $('downloadBtn').download='watermarked_'+username.replace(/[^a-z0-9]/gi,'_')+'.png';
      toast('Berhasil! Nama tersisip & siap diunduh','success');
    }catch(e){toast(e.message,'error');}
    finally{$('processBtn').disabled=false;$('processBtn').textContent='💧 Sisipkan Nama & Download';}
  },50);
});

$('verifyBtn').addEventListener('click',()=>{
  if(!watermarkedImageData){toast('Belum ada hasil','error');return;}
  $('verifyBtn').disabled=true;
  $('verifyBtn').textContent='⏳ Memverifikasi...';
  $('verifyBox').style.display='';
  $('verifyBox').innerHTML='<div class="label">Memproses...</div>';
  setTimeout(()=>{
    // coba beberapa redundansi (embed pakai rep 5), pilih hasil terbaik
    let bestText=null;
    outer2: for (const useECC of [true,false]) {
      for (const r of [7,5,3,1]) {
        try {
          const t=extractImageData(watermarkedImageData,r,useECC);
          if(t && t.length>0 && !/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(t)){
            bestText=t; break outer2;
          }
          if(bestText===null && t && t.length>0) bestText=t;
        } catch(e){/* coba lain */}
      }
    }
    try{
      const username=$('username').value.trim();
      const text=bestText!==null?bestText:'';
      const ok=(text===username);
      $('verifyBox').innerHTML=`
        <div class="label">Teks terdeteksi:</div>
        <div class="value ${ok?'ok':'bad'}">"${escapeHtml(text)}"</div>
        <div class="label" style="margin-top:.6rem;">${ok?'✅ Verifikasi berhasil — nama cocok':'⚠️ Tidak cocok'}</div>`;
      toast(ok?'Verifikasi berhasil':'Verifikasi gagal',ok?'success':'error');
    }catch(e){
      $('verifyBox').innerHTML=`<div class="value bad">${escapeHtml(e.message)}</div>`;
      toast(e.message,'error');
    }finally{
      $('verifyBtn').disabled=false;
      $('verifyBtn').textContent='🔍 Verifikasi';
    }
  },50);
});

// ---------- Deteksi Watermark ----------
function analyzeDetectFile(file) {
  detectFileName = file.name;
  const url = URL.createObjectURL(file);
  // tampilkan card segera agar user melihat proses
  $('detectPreviewImg').src = url;
  $('detectPreviewCard').style.display = '';
  $('detectInfoTable').innerHTML = '<tr><td colspan="2">Memuat gambar...</td></tr>';
  const img = new Image();
  let loaded = false;
  const timer = setTimeout(() => {
    if (!loaded) {
      toast('Gagal memuat gambar (timeout). Coba format JPG/PNG.', 'error');
      $('detectInfoTable').innerHTML = '<tr><td colspan="2">Gagal memuat gambar. Coba format JPG/PNG.</td></tr>';
    }
  }, 10000);
  img.onload = () => {
    loaded = true;
    clearTimeout(timer);
    let canvas, ctx;
    try {
      canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      ctx = canvas.getContext('2d', {colorSpace:'srgb'}); ctx.drawImage(img, 0, 0);
      detectImageData = ctx.getImageData(0, 0, img.width, img.height);
    } catch (e) {
      toast('Gagal memproses gambar: ' + e.message, 'error');
      $('detectInfoTable').innerHTML = '<tr><td colspan="2">Gagal memproses: ' + escapeHtml(e.message) + '</td></tr>';
      return;
    }
    const W = img.width, H = img.height;
    const blocks = Math.floor(W / 8) * Math.floor(H / 8);
    const rows = [
      ['Nama file', file.name],
      ['Format', (file.type || 'image').toUpperCase().replace('IMAGE/', '')],
      ['Lebar (width)', W + ' px'],
      ['Tinggi (height)', H + ' px'],
      ['Megapiksel', (W * H / 1e6).toFixed(2) + ' MP'],
      ['Rasio aspek', (W / H).toFixed(3)],
      ['Ukuran file', (file.size / 1024).toFixed(1) + ' KB'],
      ['Blok DCT 8×8', blocks],
    ];
    $('detectInfoTable').innerHTML = rows.map(([k, v]) =>
      `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    toast('Foto siap dideteksi', 'success');
  };
  img.onerror = () => toast('Gagal memuat gambar', 'error');
  img.src = url;
}
setupDrop($('detectDropZone'), $('detectFileInput'), analyzeDetectFile);

$('detectBtn').addEventListener('click', () => {
  if (!detectImageData) { toast('Upload foto terlebih dahulu', 'error'); return; }
  $('detectBtn').disabled = true;
  $('detectBtn').textContent = '⏳ Mendeteksi...';
  $('detectResult').style.display = '';
  $('detectResult').innerHTML = '<div class="label">Memproses...</div>';
  setTimeout(() => {
    // coba beberapa redundansi, pilih hasil dengan skor terbaik (paling banyak karakter terbaca)
    // coba rep 5 dulu (sesuai embed), baru fallback ke 3/1
    let bestText = null, bestRep = null, bestValid = false;
    // 1. offset (0,0) dengan semua rep/ECC
    outer: for (const useECC of [true, false]) {
      for (const r of [7, 5, 3, 1]) {
        try {
          const t = extractImageData(detectImageData, r, useECC, 0, 0);
          if (t && t.length > 0) {
            const hasBad = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(t);
            if (!hasBad) {
              bestText = t; bestRep = r; bestValid = true;
              break outer;
            }
            if (bestText === null) { bestText = t; bestRep = r; bestValid = false; }
          }
        } catch (e) { /* coba lain */ }
      }
    }
    // 2. jika gagal, coba offset 0..3 (untuk screenshot/crop kecil)
    if (bestText === null || !bestValid) {
      outer2: for (let oy = 0; oy <= 3; oy++) {
        for (let ox = 0; ox <= 3; ox++) {
          if (ox === 0 && oy === 0) continue;
          try {
            const t = extractImageData(detectImageData, 7, true, ox, oy);
            if (t && t.length > 0) {
              const hasBad = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(t);
              if (!hasBad) {
                bestText = t; bestRep = 7; bestValid = true;
                break outer2;
              }
              if (bestText === null) { bestText = t; bestRep = 7; bestValid = false; }
            }
          } catch (e) { /* coba lain */ }
        }
      }
    }
    const found = bestText, usedRep = bestRep;
    try {
      if (found !== null) {
        const cls = bestValid ? 'ok' : 'bad';
        const msg = bestValid ? '✅ Deteksi berhasil' : '⚠️ Hasil tidak pasti (mungkin terdistorsi)';
        $('detectResult').innerHTML = `
          <div class="label">Watermark terdeteksi (redundansi ${usedRep}x):</div>
          <div class="value ${cls}">"${escapeHtml(found)}"</div>
          <div class="label" style="margin-top:.6rem;">${msg}</div>`;
        toast(bestValid ? 'Deteksi berhasil' : 'Deteksi tidak pasti', bestValid ? 'success' : 'error');
      } else {
        $('detectResult').innerHTML = `
          <div class="value bad">Tidak terdeteksi watermark yang valid pada foto ini.</div>
          <div class="label" style="margin-top:.6rem;">Tips: gunakan foto hasil download (PNG) dari aplikasi ini. Screenshot/kompresi dapat merusak watermark. Jika tetap gagal, coba di browser yang sama dengan saat watermark dibuat.</div>`;
        toast('Tidak terdeteksi watermark', 'error');
      }
    } catch (e) {
      $('detectResult').innerHTML = `<div class="value bad">${escapeHtml(e.message)}</div>`;
      toast(e.message, 'error');
    } finally {
      $('detectBtn').disabled = false;
      $('detectBtn').textContent = '🔍 Deteksi Watermark';
    }
  }, 50);
});

// ---------- Download (iOS-friendly) ----------
$('downloadBtn').addEventListener('click', async () => {
  if (!watermarkedDataURL) { toast('Belum ada hasil', 'error'); return; }
  const filename = 'watermarked_' + ($('username').value.trim().replace(/[^a-z0-9]/gi, '_') || 'foto') + '.png';
  // iOS/Safari: gunakan Web Share API jika tersedia (lebih andal untuk simpan gambar)
  if (watermarkedBlob && navigator.share && navigator.canShare && navigator.canShare({ files: [new File([watermarkedBlob], filename, { type: 'image/png' })] })) {
    try {
      await navigator.share({ files: [new File([watermarkedBlob], filename, { type: 'image/png' })], title: 'Watermarked' });
      toast('Pilih "Simpan Gambar" di menu share', 'success');
      return;
    } catch (e) {
      if (e.name !== 'AbortError') toast('Gagal share: ' + e.message, 'error');
    }
  }
  // Fallback: anchor download (desktop/Android)
  const a = document.createElement('a');
  a.href = watermarkedDataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast('Download dimulai', 'success');
});