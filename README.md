# FAMS

FAMS adalah aplikasi web pengelolaan aset dan alur peminjaman untuk lingkungan kampus atau organisasi. Antarmuka landing page, autentikasi, dan menu dashboard yang ada dipertahankan selama migrasi ke Next.js.

> **Status:** Manajemen Pengguna, Data Organisasi, Lokasi, Ruangan, Barang, dan Aset sudah memiliki CRUD MongoDB.

## Teknologi

- Node.js 22+, Next.js 16, React 19, dan TypeScript.
- Tailwind CSS 4.
- MongoDB (database `FAMS` secara default).
- API Routes Next.js untuk login, pendaftaran, reset password, dan logout.
- Dapat dibangun dan dijalankan di Vercel.

## Menjalankan lokal

1. Install Node.js 22 atau lebih baru dan jalankan MongoDB lokal.
2. Salin `.env.example` menjadi `.env.local`:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Buat nilai rahasia sesi dan isi `SESSION_SECRET` di `.env.local`:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

4. Pastikan variabel MongoDB menunjuk ke database lokal:

   ```dotenv
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DB=FAMS
   ```

5. Install dependensi dan jalankan aplikasi:

   ```powershell
   npm install
   npm run dev
   ```

   Buka `http://localhost:3000`.

## Environment

| Variabel | Kegunaan |
|---|---|
| `MONGODB_URI` | URI MongoDB. URL lokal hanya untuk pengembangan lokal. |
| `MONGODB_DB` | Nama database, default `FAMS`. |
| `SESSION_SECRET` | Rahasia acak minimal 32 karakter untuk menandatangani sesi. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Kredensial SMTP untuk pengiriman kode reset password. |

Reset password membutuhkan SMTP yang valid. Jika SMTP belum diatur, halaman akan menampilkan pesan bahwa kode belum dapat dikirim.

Untuk deploy ke Vercel, tambahkan variabel lingkungan di pengaturan proyek Vercel. Gunakan URI MongoDB yang dapat diakses dari Vercel (misalnya MongoDB Atlas), bukan `mongodb://localhost:27017`, karena `localhost` di Vercel bukan komputer lokal pengembang. Jangan commit file `.env.local` atau rahasia.

## Autentikasi dan data

- Pendaftaran publik membuat akun dengan peran `peminjam`.
- Akses `admin` dan `pengelola` tetap dibatasi sesuai menu/peran yang telah ada; pendaftaran publik tidak dapat membuat peran tersebut.
- Password dan kode reset disimpan dalam bentuk hash. Sesi ditandatangani, memakai cookie `HttpOnly`, dan dicatat di MongoDB agar logout dapat mencabut sesi.
- Form Data Pengguna mengikuti field dan aturan kondisional register (kategori peminjam, identitas, unit/jabatan, konteks organisasi, dan lainnya). Admin juga dapat menetapkan role `admin`, `pengelola`, atau `peminjam`; register publik selalu membuat role `peminjam`.
- Administrator dapat mengelola akun pengguna dan organisasi melalui menu Manajemen Pengguna serta lokasi, ruangan, barang, dan aset melalui menu Manajemen Aset. Setiap barang dan ruangan terhubung ke lokasi terdaftar. Data aset mereferensikan satu data barang atau ruangan; nama, lokasi, RFID, dan foto aset mengikuti sumber yang dipilih.
- Koleksi MongoDB yang digunakan meliputi `users`, `organizations`, `locations`, `rooms`, `items`, `assets`, `password_reset_codes`, `auth_sessions`, `auth_rate_limits`, dan `profile_photo_uploads`. Potongan foto pendaftaran sementara dibersihkan otomatis.
- Foto profil, logo, serta maksimal 10 foto per lokasi, ruangan, dan barang disimpan sebagai file di `public/assets/uploads/management/`; MongoDB hanya menyimpan path file. Kode RFID barang dan ruangan divalidasi agar tidak bentrok. File upload lokal tidak ikut Git.
- Penyimpanan foto tersebut sementara hanya untuk pengembangan lokal. Filesystem runtime Vercel tidak persisten/tersedia untuk upload ini; integrasikan vendor object storage sebelum mengaktifkan upload foto pada deployment.
- Migrasi ini memindahkan backend aplikasi ke MongoDB, tetapi **tidak menyalin otomatis** record dari database Laravel/MySQL lama. Data lama perlu diekspor dan dimigrasikan secara terpisah jika masih dibutuhkan.

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Menjalankan server pengembangan Next.js. |
| `npm run types:check` | Memeriksa tipe TypeScript. |
| `npm run build` | Membuat build produksi untuk Next.js/Vercel. |
| `npm start` | Menjalankan build produksi secara lokal. |

## Struktur

```text
app/
  api/admin/      CRUD admin pengguna dan organisasi
  api/auth/       Endpoint autentikasi dan reset password
  api/profile/    Endpoint foto profil
  layout.tsx      Root layout dan stylesheet
  [[...segments]]/ Rute halaman
resources/js/
  components/     Komponen UI dan dashboard React yang dipertahankan
  pages/          Halaman landing, autentikasi, dan dashboard
  lib/server/     Koneksi MongoDB, sesi, dan rate limit
resources/css/    Tema Tailwind yang sudah ada
```
