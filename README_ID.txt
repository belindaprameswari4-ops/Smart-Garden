SMART PLANT WATERING SYSTEM — CARA MEMASANG

STRUKTUR:
- server.js
- package.json
- .env.example  -> salin menjadi .env
- public/index.html
- public/style.css
- public/app.js
- ESP32_Smart_Plant_Watering.ino

1. PENTING UNTUK KEAMANAN
Token Blynk dan kata sandi Wi-Fi yang sebelumnya terkirim di chat sebaiknya diganti.
Buat token Blynk baru, lalu masukkan token baru ke .env dan sketch ESP32.
Jangan kirim token baru ke chat atau commit .env ke Git.

2. FIREBASE
Firebase Console > Project settings > General > Your apps.
Buat/ambil konfigurasi aplikasi Web lalu isi firebaseConfig pada public/app.js:
apiKey, authDomain, projectId, messagingSenderId, appId.
Project ID yang dipakai server default: smart-garden-bb510.
Aktifkan Authentication > Sign-in method > Email/Password dan Google.
Pada Authentication > Settings > Authorized domains, tambahkan localhost untuk tes lokal
dan domain website jika di-hosting.

3. BLYNK
Pastikan template memiliki datastream:
V1 soil moisture (%), V2 humidity (%), V3 mode (0/1), V4 pump (0/1),
V5 temperature, V6 schedule time (String HH:MM), V7 duration (Integer 1-30),
V8 schedule enable (0/1).
Tipe V6 harus mendukung String/Text. Jika V6 di Blynk dibuat sebagai Integer,
ubah datastream menjadi String/Text. Pastikan widget dan pin virtual sesuai.

4. JALANKAN SERVER
Install Node.js 20 atau lebih baru.
Di folder proyek:
  npm install
Salin .env.example menjadi .env dan isi BLYNK_AUTH_TOKEN baru.
Lalu:
  npm start
Buka http://localhost:3000

5. ESP32
Buka file ESP32_Smart_Plant_Watering.ino di Arduino IDE.
Ganti PASTE_NEW_BLYNK_TOKEN_HERE, YOUR_WIFI_NAME, dan YOUR_WIFI_PASSWORD.
Install library Blynk, DHT sensor library, LiquidCrystal_I2C yang kompatibel.
Upload ke ESP32.

6. CATATAN
- Aplikasi menyimpan autentikasi di Firebase Authentication. Kode ini tidak menyimpan profil/jadwal ke Firestore; jadwal dikirim ke datastream Blynk V6-V8.
- Endpoint Blynk getAll dapat mengembalikan struktur yang berbeda menurut API/perangkat. Jika nilai dashboard tetap "—", periksa respons /api/device di Developer Tools/Network dan sesuaikan pemetaan pin di findPin() pada app.js.
- Mode otomatis pada sketch mengendalikan pompa berdasarkan ambang soil 40%. Jadwal berjalan saat mode AUTO dan V8 aktif.
- Pastikan relay active-low sesuai modul fisik. Uji pompa dengan aman sebelum ditinggal berjalan.
