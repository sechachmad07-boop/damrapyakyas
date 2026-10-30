# Takasatmata — Watermark Nama Kreator (Tak Kasat Mata)

Sisipkan nama kreator ke dalam foto secara tidak terlihat (invisible) dan tahan kompresi JPEG.
Versi ini berjalan 100% di browser (client-side), sehingga bisa di-deploy ke Cloudflare Pages tanpa backend.

## Struktur
```
takasatmata/
├── package.json
├── server.js          # opsional, untuk dev lokal
├── dct.js / watermark.js  # referensi algoritma (backend)
└── public/            # <-- folder yang di-deploy ke Cloudflare
    ├── index.html
    ├── style.css
    └── app.js
```

## Deploy ke Cloudflare Pages
1. Push repo ke GitHub.
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
npm start   # http://localhost:3000
```

## Alur Penggunaan
1. Masukkan nama pengguna/kreator.
2. Upload foto (JPG/PNG/WEBP).
3. Lihat informasi foto: format, lebar, tinggi, megapiksel, rasio aspek, ukuran file, blok DCT, kapasitas nama.
4. Klik "Sisipkan Nama & Download" → file PNG watermarked siap diunduh.
5. (Opsional) "Verifikasi" untuk mengecek nama dapat diekstrak kembali.