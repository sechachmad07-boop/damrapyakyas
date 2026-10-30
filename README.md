# Takasatmata — Watermark Nama Kreator (Tak Kasat Mata)

Sisipkan nama kreator ke dalam foto secara tidak terlihat (invisible) dan tahan kompresi JPEG.

## Struktur Folder
```
takasatmata/
├── package.json
├── server.js          # Express API server
├── dct.js             # DCT 2D 8x8
├── watermark.js       # embed & extract (channel Y)
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## Cara Menjalankan
1. Install dependencies (jika belum):
   ```
   npm install
   ```
2. Jalankan server:
   ```
   npm start
   ```
3. Buka browser: http://localhost:3000

## Alur Penggunaan
1. Masukkan nama pengguna/kreator.
2. Upload foto (JPG/PNG/WEBP, maks 15 MB, maks 4 MP).
3. Lihat informasi foto: format, lebar, tinggi, megapiksel, rasio aspek, ukuran file, jumlah blok DCT, kapasitas nama.
4. Klik "Sisipkan Nama & Download" -> nama disisipkan tak kasat mata, file PNG watermarked siap diunduh.
5. (Opsional) Klik "Verifikasi" untuk mengecek bahwa nama dapat diekstrak kembali.

## Catatan Teknis
- Embed pada channel Y (luminance) agar tahan subsampling chroma JPEG.
- Pasangan koefisien mid-frekuensi (2,1)&(1,2) dengan quantization step kecil.
- Redundansi bit 3x + majority voting meningkatkan ketahanan.
- Strength (alpha) = 50 (seimbang kualitas vs ketahanan).