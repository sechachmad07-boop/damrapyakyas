# Takasatmata — Watermark Nama Kreator (Tak Kasat Mata)

Sisipkan nama kreator ke dalam foto secara tak kasat mata (invisible) dan tahan kompresi JPEG.
Versi ini berjalan 100% di browser (client-side), sehingga bisa di-deploy ke Cloudflare Pages tanpa backend.

## Fitur
- Sisipkan nama kreator ke foto (JPG/PNG/WEBP) secara tak terlihat
- Tahan kompresi JPEG dengan redundansi 7× + Hamming(7,4) ECC
- Perbandingan asli vs watermark dengan slider sebelum-atau-sesudah
- Informasi lengkap foto: format, lebar, tinggi, megapiksel, rasio aspek, ukuran, blok DCT, kapasitas nama
- Atur kekuatan watermark (strength) dan lihat PSNR/kualitas hasil
- Verifikasi nama yang tersisip dan deteksi watermark pada foto lain
- Unduh hasil sebagai PNG (lossless)
- Semua proses di browser, foto tidak pernah keluar dari perangkat

## Struktur
```
takasatmata/
├── package.json
├── server.js          # opsional, untuk dev lokal (backend Express)
├── dct.js / watermark.js  # referensi algoritma (backend)
└── public/            # <-- folder yang di-deploy ke Cloudflare
    ├── index.html
    ├── style.css
    └── app.js
```

## Deploy ke Cloudflare Pages
1. Push repo ke GitHub (branch `main`).
2. Cloudflare Dashboard → Pages → Create project → Connect to Git.
3. Build settings:
   - Framework preset: None
   - Build command: (kosong)
   - Build output directory: `public`
4. Deploy.

Aplikasi langsung jalan, tanpa server.

## Jalankan Lokal
Buka `public/index.html` di browser, atau:
```
npm start   # http://localhost:3000 (via server.js)
```

## Alur Penggunaan
1. Masukkan nama pengguna/kreator dan upload foto.
2. Lihat informasi foto dan atur kekuatan watermark.
3. Klik "Sisipkan Nama & Lihat Hasil", bandingkan dengan slider, lalu unduh PNG.
4. Verifikasi nama atau deteksi watermark pada foto lain.

## Teknologi
JavaScript murni (client-side), transformasi DCT 8×8, ruang warna YCbCr, dan kode koreksi kesalahan Hamming(7,4).
