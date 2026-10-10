# RZAASTR — WA Bot Panel

Panel manajemen bot WhatsApp dengan tampilan dark dan background circuit.

---

## Struktur Folder

```
rzaastr/
├── index.js           → server utama (Express)
├── package.json       → dependency
├── database.json      → data user (auto-generate)
├── bots.json          → data bot (auto-generate)
├── logs.json          → activity log (auto-generate)
├── views/
│   ├── login.html     → halaman login
│   └── dashboard.html → halaman dashboard
├── public/            → static assets (opsional)
└── README.md
```

---

## Cara Deploy di VPS

### 1. Upload file ke VPS
```bash
# Upload folder rzaastr ke VPS
scp -r rzaastr/ user@IP_VPS:/home/user/
```

### 2. Install Node.js (jika belum ada)
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Install dependency
```bash
cd rzaastr
npm install
```

### 4. Jalankan server
```bash
# Run biasa
node index.js

# Run background dengan PM2 (rekomendasi)
npm install -g pm2
pm2 start index.js --name rzaastr
pm2 save
pm2 startup
```

### 5. Akses panel
```
http://IP_VPS:3000
```

---

## Cara Deploy di Panel Hosting (Railway / Render / dll)

1. Upload semua file ke repo GitHub
2. Connect ke Railway/Render
3. Set environment variables:
   - `PORT` = 3000 (atau auto)
   - `SESSION_SECRET` = isi dengan string random panjang
4. Deploy

---

## Login Default

```
Username : admin
Password : admin123
```

> Ganti password setelah login pertama melalui User Manager!

---

## Fitur Panel

- **Overview** — statistik total bot, online, offline, pesan
- **Manajemen Bot** — tambah, edit, hapus, start/stop bot
- **User Manager** — tambah, hapus user (admin only)
- **Activity Logs** — log semua aksi di panel

---

## Keamanan

- Session-based auth dengan httpOnly cookie
- Rate limit login (10x per 15 menit, anti brute force)
- Helmet.js untuk secure HTTP headers
- Password di-hash dengan bcrypt
- Input di-escape untuk mencegah XSS

---

## Environment Variables (opsional)

Buat file `.env` di root folder:

```env
PORT=3000
SESSION_SECRET=ganti_ini_dengan_random_string_panjang
ORIGIN=https://domainmu.com
```

Install dotenv jika pakai `.env`:
```bash
npm install dotenv
```
Lalu tambahkan di atas `index.js`:
```js
require('dotenv').config();
```
