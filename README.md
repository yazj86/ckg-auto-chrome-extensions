# CKG Auto Extensions

--CKG Auto Extensions-- adalah Chrome Extension otomatisasi untuk membantu proses entri data di aplikasi --Sehat Indonesiaku (CKG)--.

## Instalasi (Developer Mode)

Karena ini adalah ekstensi khusus, instalasi dilakukan melalui **Developer Mode** di Google Chrome:

1. --Download / Clone-- repository ini ke komputer Anda dan ekstrak jika berupa file ZIP.
2. cari file updater.exe lalu klik 2x akan melakukan update terlebih dulu untuk pembaruan file (jika ada) tunggu update selesai lalu tekan enter untuk close.
3. Buka --Google Chrome--.
4. Masuk ke halaman ekstensi dengan cara:
   - Klik ikon `⋮` (Menu) → `Extensions` → `Manage Extensions`
   - Atau langsung akses tautan: [chrome://extensions/](chrome://extensions/)
5. Aktifkan **Developer Mode** melalui tombol _toggle_ di kanan atas halaman.
6. Klik tombol --Load unpacked-- di kiri atas.
7. Pilih folder proyek ini (folder yang berisi file `manifest.json`).
8. Ekstensi --CKG Robot-- akan muncul dan siap digunakan.

### Cara Penggunaan

1. Buka aplikasi --Sehat Indonesiaku-- dan pastikan Anda sudah login.
2. Klik ikon --CKG Auto Extensions-- pada daftar ekstensi Chrome Anda (bisa di-pin agar mudah diakses).
3. Klik tombol untuk --Load Data-- dan pilih file Excel Anda.
4. Lakukan pemetaan (mapping) kolom dari Excel ke kolom input sistem yang sesuai.
5. Pilih proses yang ingin dijalankan:
   --Jalankan Pendaftaran dan Kehadiran-- → Untuk otomatis mendaftar & menyatakan hadir.
   --Jalankan Pemeriksaan-- → Untuk otomatis input data pemeriksaan default & kirim rapor.
6. Pantau status yang muncul di layar dan tunggu hingga proses selesai.
7. Unduh hasil --History & Logs-- dalam format Excel untuk arsip laporan Anda.

#### Troubleshooting

--Tombol atau UI Ekstensi Tidak Muncul:-- Coba refresh (F5) halaman utama aplikasi Sehat Indonesiaku.
--Data Excel Gagal Terbaca:-- Pastikan file tidak dalam keadaan _corrupt_ atau terkunci (password). Periksa kembali pemetaan kolom saat me-load file.
--Proses Berhenti di Tengah Jalan:-- Periksa stabilitas koneksi internet Anda, lalu coba jalankan ulang proses dari baris data yang belum terinput.
