# StudyPulse - Study Habit & Productivity Analyzer

StudyPulse adalah aplikasi manajemen kebiasaan dan produktivitas belajar mahasiswa berbasis desktop (Python + Eel + Supabase PostgreSQL / SQLite + Web UI Modern).

---

## Fitur Utama

1. **Dashboard Komprehensif (Mirip Desain Mockup)**
   - 4 Kartu Metrik Utama: Total Jam Belajar (+% tren), Jumlah Sesi, Target Mingguan (%), Mata Pelajaran Terbanyak.
   - Grafik Durasi Belajar per Hari (Bar Chart dengan Chart.js).
   - Grafik Proporsi Waktu per Mata Pelajaran (Donut Chart dengan indikator total durasi di tengah).
   - Daftar Sesi Belajar Terakhir dengan badge durasi.
   - Kotak Rekomendasi Waktu Belajar otomatis (jam belajar optimal, hari paling produktif, mapel evaluasi).

2. **Database Engine (SQLite Lokal Mandiri)**
   - Menggunakan database lokal SQLite (`studypulse.db`) yang cepat, aman, dan tanpa perlu instalasi DBMS eksternal.
   - Menyimpan seluruh data: Akun Pengguna, Riwayat Sesi Belajar, Jadwal (Timetable), serta Materi Belajar.
   - Status indikator koneksi database lokal langsung di topbar dan menu Settings.

3. **CRUD Lengkap Aktivitas Belajar (Study Activity)**
   - **Create**: Tambah aktivitas belajar dengan form pop-up modal.
   - **Read**: Tabel riwayat belajar dengan pencarian teks (search), filter mata pelajaran, dan penomoran halaman (pagination).
   - **Update**: Edit mata pelajaran, topik, durasi, tanggal, tingkat fokus, dan catatan.
   - **Delete**: Hapus sesi belajar dengan konfirmasi aman.

4. **Upload Foto Profil (Upload Image)**
   - Ganti foto profil langsung dari komputer (format PNG, JPG, JPEG, WebP).
   - Pratinjau instan dan penyimpanan Base64 Data URL aman di database.
   - Ditampilkan pada Sidebar, Topbar, Halaman Profil, dan Leaderboard.

5. **Import & Export CSV**
   - **Export CSV**: Unduh seluruh riwayat belajar dalam format `.csv` standar UTF-8.
   - **Import CSV**: Unggah file `.csv` dengan pemindaian otomatis delimiter (koma atau titik koma), validasi baris demi baris, dan pratinjau tabel sebelum impor.
   - **Template CSV**: Tombol unduh template CSV bawaan.

6. **Validasi Input Menyeluruh**
   - Validasi sisi klien dan server untuk durasi (1 - 720 menit), tingkat fokus (1 - 5), format tanggal/waktu ISO, email, panjang password (minimal 6 karakter), format file gambar (< 5 MB), dan format dokumen materi (< 10 MB).

7. **Study Timer (Pomodoro & Stopwatch)**
   - Mode Pomodoro (siklus 25 menit fokus) dan mode Stopwatch bebas.
   - Visual ring animasi circular SVG.
   - Form pencatatan langsung ke database setelah sesi selesai.
   - Riwayat sesi belajar yang diselesaikan hari ini.

8. **Study Planner (Weekly Timetable Grid)**
   - Tampilan jadwal mingguan berformat tabel grid jam 07:00 - 21:00 (Senin s.d. Minggu).
   - Blok jadwal berwarna (color-coded) sesuai mata pelajaran.
   - CRUD jadwal belajar terencana.

9. **Leaderboard & Gamifikasi (Tantangan Durasi Belajar)**
   - Papan peringkat mahasiswa berdasarkan akumulasi jam belajar terverifikasi dan streak.
   - Podium juara: Juara 1 (🥇 Mahkota Emas & Tier Grandmaster), Juara 2 (🥈 Perak), Juara 3 (🥉 Perunggu).
   - Banner tantangan interaktif yang menghitung selisih jam belajar untuk menyalip peringkat di atasnya.
   - Baris pengguna aktif ditandai secara khusus.

10. **Autentikasi Multi-User (Login & Register)**
    - Modal Login dengan validasi kredensial (Username/Email/NIM dan Password).
    - Fitur Registrasi akun baru dengan enkripsi kata sandi (PBKDF2-HMAC-SHA256).
    - Fitur "Ingat Saya" dan Logout.

11. **Bentuk EXE (Standalone Windows Executable)**
    - Aplikasi dapat langsung dijalankan dalam bentuk file `.exe` mandiri tanpa instalasi Python di komputer pengguna.
    - File hasil kompilasi tersedia di folder `dist/StudyPulse/StudyPulse.exe`.

---

## Cara Menjalankan

### Opsi 1: Menjalankan Langsung File EXE
Buka file:
```
dist\StudyPulse\StudyPulse.exe
```

### Opsi 2: Menjalankan via Python
Pastikan Python 3.10+ terpasang, lalu:
```powershell
pip install -r requirements.txt
python main.py
```

### Cara Kompilasi Ulang File EXE
Untuk membuat atau memperbarui file eksekusi `.exe`:
```powershell
python build_exe.py
```
File EXE akan otomatis dibuat di folder `dist/StudyPulse/StudyPulse.exe`.
