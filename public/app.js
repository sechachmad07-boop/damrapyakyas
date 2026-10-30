const $ = (id) => document.getElementById(id);
let currentFile = null;
let currentInfo = null;
let watermarkedBlob = null;
let watermarkedDataURL = null;

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function setupDrop(zone, input, onFile) {
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) onFile(e.target.files[0]);
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('drag');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
  });
}

async function analyzeFile(file) {
  currentFile = file;
  const url = URL.createObjectURL(file);
  const img = $('previewImg');
  img.src = url;
  img.onload = () => {};
  $('previewCard').style.display = '';
  const fd = new FormData();
  fd.append('image', file, file.name);
  try {
    const res = await fetch('/api/analyze', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Gagal analisis');
    currentInfo = json;
    renderInfo(json);
    toast('Foto berhasil dianalisis', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderInfo(j) {
  const rows = [
    ['Nama file', currentFile.name],
    ['Format', (j.format || '').toUpperCase()],
    ['Lebar (width)', j.width + ' px'],
    ['Tinggi (height)', j.height + ' px'],
    ['Megapiksel', j.megapixels + ' MP'],
    ['Rasio aspek', j.aspect],
    ['Ukuran file', (j.sizeBytes / 1024).toFixed(1) + ' KB'],
    ['Blok DCT 8×8', j.blocks],
    ['Kapasitas nama', j.capacity.rep3 + ' karakter'],
  ];
  $('infoTable').innerHTML = rows.map(([k, v]) =>
    `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
}

setupDrop($('dropZone'), $('fileInput'), analyzeFile);

$('processBtn').addEventListener('click', async () => {
  const username = $('username').value.trim();
  if (!username) { toast('Masukkan nama pengguna terlebih dahulu', 'error'); return; }
  if (!currentFile) { toast('Upload foto terlebih dahulu', 'error'); return; }
  if (currentInfo && username.length > currentInfo.capacity.rep3) {
    toast('Nama terlalu panjang untuk foto ini (maks ' + currentInfo.capacity.rep3 + ' karakter)', 'error');
    return;
  }
  const fd = new FormData();
  fd.append('image', currentFile, currentFile.name);
  fd.append('text', username);
  fd.append('strength', '50');
  fd.append('rep', '3');
  try {
    const res = await fetch('/api/embed', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Gagal menyisipkan');
    watermarkedDataURL = json.image;
    watermarkedBlob = dataURLtoBlob(json.image);
    $('resultImg').src = json.image;
    $('resultCard').style.display = '';
    const rows = [
      ['Nama pengguna', username],
      ['Lebar', json.width + ' px'],
      ['Tinggi', json.height + ' px'],
      ['PSNR (kualitas)', json.psnr + ' dB'],
      ['MSE', json.mse],
      ['Status', 'Watermark tak kasat mata tersisip'],
    ];
    $('resultTable').innerHTML = rows.map(([k, v]) =>
      `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    $('downloadBtn').href = json.image;
    $('downloadBtn').download = 'watermarked_' + username.replace(/[^a-z0-9]/gi, '_') + '.png';
    toast('Berhasil! Nama tersisip & siap diunduh', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
});

$('verifyBtn').addEventListener('click', async () => {
  if (!watermarkedBlob) { toast('Belum ada hasil', 'error'); return; }
  const fd = new FormData();
  fd.append('image', watermarkedBlob, 'watermarked.png');
  fd.append('rep', '3');
  try {
    const res = await fetch('/api/extract', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Gagal verifikasi');
    const username = $('username').value.trim();
    const ok = (json.text === username);
    $('verifyBox').style.display = '';
    $('verifyBox').innerHTML = `
      <div class="label">Teks terdeteksi:</div>
      <div class="value ${ok ? 'ok' : 'bad'}">"${escapeHtml(json.text)}"</div>
      <div class="label" style="margin-top:.6rem;">${ok ? '✅ Verifikasi berhasil — nama cocok' : '⚠️ Tidak cocok'}</div>`;
    toast(ok ? 'Verifikasi berhasil' : 'Verifikasi gagal', ok ? 'success' : 'error');
  } catch (e) {
    $('verifyBox').style.display = '';
    $('verifyBox').innerHTML = `<div class="value bad">${escapeHtml(e.message)}</div>`;
    toast(e.message, 'error');
  }
});

function dataURLtoBlob(dataURL) {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}