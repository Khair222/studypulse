"""StudyPulse - Study Habit & Productivity Analyzer (SQLite lokal)."""
import base64
import binascii
import csv
import io
import json
import os
import random
import re
import sys
import urllib.error
import urllib.request
import uuid
from collections import defaultdict
from datetime import datetime, timedelta

import eel

try:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError
except ImportError:
    PdfReader = None
    PdfReadError = ValueError

import database as db

BASE = os.path.dirname(os.path.abspath(__file__))
MATERIALS_DIR = os.path.join(BASE, "materials")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_EXTRACTED_CHARS = 300_000
HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]

# Current active user session in memory (falls back to the first local account).
CURRENT_USER_ID = 1


def get_current_user_id():
    global CURRENT_USER_ID
    return CURRENT_USER_ID


# ----------------------------------------------------
# AUTHENTICATION & USER PROFILE
# ----------------------------------------------------
@eel.expose
def get_current_user():
    """Mengambil informasi profil user yang sedang aktif."""
    uid = get_current_user_id()
    user = db.query_db("""
    SELECT id, username, full_name, nim, major, faculty, university, email,
           avatar_data, daily_target_hours, weekly_target_hours, theme, created_at
    FROM users WHERE id = ?
    """, (uid,), one=True)
    if not user:
        # Fallback ke user pertama
        user = db.query_db("""
        SELECT id, username, full_name, nim, major, faculty, university, email,
               avatar_data, daily_target_hours, weekly_target_hours, theme, created_at
        FROM users ORDER BY id ASC LIMIT 1
        """, one=True)
        if user:
            CURRENT_USER_ID = user["id"]
    return user


@eel.expose
def login(credential, password):
    """Login dengan username, email, atau NIM."""
    global CURRENT_USER_ID
    credential = str(credential).strip()
    password = str(password).strip()

    if not credential:
        return {"ok": False, "error": "Masukkan Email, Username, atau NIM."}
    if not password:
        return {"ok": False, "error": "Masukkan kata sandi."}

    # 1. Cari pengguna di cache lokal SQLite
    user = db.query_db("""
    SELECT * FROM users
    WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR LOWER(nim) = LOWER(?)
    """, (credential, credential, credential), one=True)

    if not user:
        return {"ok": False, "error": "Pengguna tidak ditemukan. Silakan periksa kembali atau daftar akun baru."}

    # 3. Verifikasi kata sandi
    valid_password = db.verify_password(password, user["password_hash"])
    if not valid_password:
        return {"ok": False, "error": "Kata sandi salah. Silakan coba lagi."}

    CURRENT_USER_ID = user["id"]
    return {
        "ok": True,
        "message": f"Selamat datang kembali, {user['full_name']}!",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "nim": user["nim"],
            "email": user["email"]
        }
    }


@eel.expose
def register(username, full_name, nim, email, password):
    """Pendaftaran pengguna baru dengan validasi lengkap."""
    global CURRENT_USER_ID
    username = str(username).strip().lower()
    full_name = str(full_name).strip()
    nim = str(nim).strip()
    email = str(email).strip().lower()
    password = str(password).strip()

    if len(username) < 3:
        return {"ok": False, "error": "Username minimal 3 karakter."}
    if not re.match(r"^[a-zA-Z0-9_.]+$", username):
        return {"ok": False, "error": "Username hanya boleh huruf, angka, titik, dan garis bawah."}
    if len(full_name) < 2:
        return {"ok": False, "error": "Nama lengkap minimal 2 karakter."}
    if email and "@" not in email:
        return {"ok": False, "error": "Format email tidak valid."}
    valid_pwd, pwd_err = db.validate_password_strength(password)
    if not valid_pwd:
        return {"ok": False, "error": pwd_err}

    # Cek apakah username sudah dipakai
    existing = db.query_db("SELECT id FROM users WHERE LOWER(username) = ?", (username,), one=True)
    if existing:
        return {"ok": False, "error": "Username sudah digunakan. Pilih username lain."}

    pwd_hash = db.hash_password(password)
    now_iso = datetime.now().isoformat()

    db.query_db("""
    INSERT INTO users(username, password_hash, full_name, nim, major, faculty, university, email, daily_target_hours, weekly_target_hours, theme, created_at)
    VALUES(?, ?, ?, ?, 'Teknik Informatika', 'Vokasi', 'Universitas Sumatera Utara', ?, 2.0, 16.0, 'coral', ?)
    """, (username, pwd_hash, full_name, nim, email, now_iso), commit=True)

    new_user = db.query_db("SELECT * FROM users WHERE username = ?", (username,), one=True)
    if new_user:
        CURRENT_USER_ID = new_user["id"]
        return {"ok": True, "message": "Pendaftaran berhasil!", "user": new_user}

    return {"ok": False, "error": "Gagal menyimpan akun baru."}


@eel.expose
def update_profile(full_name, nim, major, faculty, university, email, daily_target, weekly_target, theme):
    """Memperbarui informasi profil pengguna."""
    uid = get_current_user_id()
    full_name = str(full_name).strip()
    nim = str(nim).strip()
    major = str(major).strip()
    faculty = str(faculty).strip()
    university = str(university).strip()
    email = str(email).strip()

    try:
        daily_target = float(daily_target)
        weekly_target = float(weekly_target)
    except (ValueError, TypeError):
        return {"ok": False, "error": "Target jam harus berupa angka valid."}

    if not full_name:
        return {"ok": False, "error": "Nama lengkap tidak boleh kosong."}
    if daily_target <= 0 or daily_target > 24:
        return {"ok": False, "error": "Target harian harus antara 0.5 - 24 jam."}
    if weekly_target <= 0 or weekly_target > 168:
        return {"ok": False, "error": "Target mingguan harus antara 1 - 168 jam."}

    db.query_db("""
    UPDATE users
    SET full_name = ?, nim = ?, major = ?, faculty = ?, university = ?, email = ?,
        daily_target_hours = ?, weekly_target_hours = ?, theme = ?
    WHERE id = ?
    """, (full_name, nim, major, faculty, university, email, daily_target, weekly_target, theme, uid), commit=True)

    return {"ok": True, "message": "Profil berhasil diperbarui!"}


@eel.expose
def upload_profile_avatar(encoded_image):
    """Unggah dan simpan foto profil dalam database (format Base64 Data URL)."""
    uid = get_current_user_id()
    if not encoded_image or not isinstance(encoded_image, str):
        return {"ok": False, "error": "Data gambar tidak valid."}

    # Format data URL biasanya data:image/png;base64,...
    if "," in encoded_image:
        header, b64_data = encoded_image.split(",", 1)
    else:
        b64_data = encoded_image

    try:
        raw_bytes = base64.b64decode(b64_data, validate=True)
    except (binascii.Error, ValueError):
        return {"ok": False, "error": "Format gambar rusak atau tidak didukung."}

    if len(raw_bytes) > MAX_IMAGE_BYTES:
        return {"ok": False, "error": "Ukuran gambar maksimal 5 MB."}

    # Simpan kembali sebagai data URL aman
    clean_data_url = encoded_image if encoded_image.startswith("data:image/") else f"data:image/jpeg;base64,{b64_data}"

    db.query_db("UPDATE users SET avatar_data = ? WHERE id = ?", (clean_data_url, uid), commit=True)
    return {"ok": True, "avatar_url": clean_data_url, "message": "Foto profil berhasil diubah!"}


@eel.expose
def remove_profile_avatar():
    """Menghapus foto profil (mengosongkan avatar_data) agar kembali ke avatar inisial."""
    uid = get_current_user_id()
    db.query_db("UPDATE users SET avatar_data = '' WHERE id = ?", (uid,), commit=True)
    return {"ok": True, "message": "Foto profil berhasil dihapus!"}


@eel.expose
def change_password(old_password, new_password):
    """Mengubah kata sandi pengguna aktif."""
    uid = get_current_user_id()
    old_password = str(old_password).strip()
    new_password = str(new_password).strip()

    if not old_password or not new_password:
        return {"ok": False, "error": "Password lama dan baru wajib diisi."}
    valid_pwd, pwd_err = db.validate_password_strength(new_password)
    if not valid_pwd:
        return {"ok": False, "error": pwd_err}

    user = db.query_db("SELECT password_hash FROM users WHERE id = ?", (uid,), one=True)
    if not user or not db.verify_password(old_password, user["password_hash"]):
        return {"ok": False, "error": "Password lama salah."}

    new_hash = db.hash_password(new_password)
    db.query_db("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, uid), commit=True)
    return {"ok": True, "message": "Password berhasil diperbarui!"}


@eel.expose
def logout():
    """Keluar dari sesi saat ini."""
    global CURRENT_USER_ID
    # Jangan kosongkan sama sekali agar tetap ada user default bila dibutuhkan
    first_user = db.query_db("SELECT id FROM users ORDER BY id ASC LIMIT 1", one=True)
    if first_user:
        CURRENT_USER_ID = first_user["id"]
    return {"ok": True}


# ----------------------------------------------------
# STUDY SESSIONS CRUD & VALIDATION
# ----------------------------------------------------
@eel.expose
def get_sessions(limit=50, subject_filter=None, search=None, page=1):
    """Mendapatkan daftar sesi dengan filter dan pagination."""
    uid = get_current_user_id()
    params = [uid]
    where_clauses = ["user_id = ?"]

    if subject_filter and subject_filter != "Semua Mata Pelajaran":
        where_clauses.append("subject = ?")
        params.append(subject_filter)

    if search:
        where_clauses.append("(LOWER(subject) LIKE ? OR LOWER(topic) LIKE ? OR LOWER(note) LIKE ?)")
        term = f"%{search.strip().lower()}%"
        params.extend([term, term, term])

    where_sql = " AND ".join(where_clauses)
    count_row = db.query_db(f"SELECT COUNT(*) as total FROM sessions WHERE {where_sql}", params, one=True)
    total_count = count_row["total"] if count_row else 0

    offset = max(0, (int(page) - 1) * int(limit))
    rows = db.query_db(f"""
    SELECT id, user_id, subject, topic, start, minutes, focus, note, created_at
    FROM sessions
    WHERE {where_sql}
    ORDER BY start DESC
    LIMIT {int(limit)} OFFSET {offset}
    """, params)

    return {
        "sessions": rows or [],
        "total": total_count,
        "page": int(page),
        "limit": int(limit),
        "pages": max(1, (total_count + int(limit) - 1) // int(limit))
    }


@eel.expose
def add_session(subject, topic, start, minutes, focus, note=""):
    """Tambah sesi belajar baru dengan validasi ketat."""
    uid = get_current_user_id()
    subject = str(subject).strip()
    topic = str(topic).strip() if topic else "Umum"
    note = str(note).strip()

    if not subject:
        return {"ok": False, "error": "Nama mata pelajaran wajib diisi."}

    try:
        minutes = int(minutes)
        if not (1 <= minutes <= 720):
            return {"ok": False, "error": "Durasi belajar harus antara 1 sampai 720 menit (12 jam)."}
    except (ValueError, TypeError):
        return {"ok": False, "error": "Durasi harus berupa angka bulat positif."}

    try:
        focus = int(focus)
        if not (1 <= focus <= 5):
            return {"ok": False, "error": "Tingkat fokus harus antara 1 sampai 5."}
    except (ValueError, TypeError):
        return {"ok": False, "error": "Tingkat fokus tidak valid."}

    try:
        datetime.fromisoformat(start)
    except (ValueError, TypeError):
        return {"ok": False, "error": "Format tanggal dan waktu tidak valid."}

    now_iso = datetime.now().isoformat()
    db.query_db("""
    INSERT INTO sessions(user_id, subject, topic, start, minutes, focus, note, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    """, (uid, subject, topic, start, minutes, focus, note, now_iso), commit=True)

    return {"ok": True, "message": "Sesi belajar berhasil disimpan!"}


@eel.expose
def update_session(session_id, subject, topic, start, minutes, focus, note=""):
    """Update sesi belajar yang sudah ada (CRUD Update)."""
    uid = get_current_user_id()
    session_id = int(session_id)
    subject = str(subject).strip()
    topic = str(topic).strip() if topic else "Umum"
    note = str(note).strip()

    if not subject:
        return {"ok": False, "error": "Nama mata pelajaran wajib diisi."}

    try:
        minutes = int(minutes)
        if not (1 <= minutes <= 720):
            return {"ok": False, "error": "Durasi belajar harus antara 1 sampai 720 menit."}
    except (ValueError, TypeError):
        return {"ok": False, "error": "Durasi harus berupa angka bulat."}

    try:
        focus = max(1, min(5, int(focus)))
    except (ValueError, TypeError):
        focus = 4

    try:
        datetime.fromisoformat(start)
    except (ValueError, TypeError):
        return {"ok": False, "error": "Format tanggal tidak valid."}

    # Pastikan sesi ini milik user aktif
    sess = db.query_db("SELECT id FROM sessions WHERE id = ? AND user_id = ?", (session_id, uid), one=True)
    if not sess:
        return {"ok": False, "error": "Sesi tidak ditemukan atau kamu tidak memiliki izin mengubah sesi ini."}

    db.query_db("""
    UPDATE sessions
    SET subject = ?, topic = ?, start = ?, minutes = ?, focus = ?, note = ?
    WHERE id = ? AND user_id = ?
    """, (subject, topic, start, minutes, focus, note, session_id, uid), commit=True)

    return {"ok": True, "message": "Aktivitas belajar berhasil diperbarui!"}


@eel.expose
def delete_session(sid):
    """Hapus sesi belajar (CRUD Delete)."""
    uid = get_current_user_id()
    db.query_db("DELETE FROM sessions WHERE id = ? AND user_id = ?", (int(sid), uid), commit=True)
    return {"ok": True}


@eel.expose
def clear_all():
    """Hapus semua sesi milik user saat ini."""
    uid = get_current_user_id()
    db.query_db("DELETE FROM sessions WHERE user_id = ?", (uid,), commit=True)
    return True


@eel.expose
def seed_demo():
    """Isi data contoh belajar agar analitik dan visualisasi langsung terlihat menarik."""
    uid = get_current_user_id()
    mapel_data = [
        ("Rekayasa Perangkat Lunak", "Perancangan UML", [45, 60, 90, 120]),
        ("E-Application", "Pandas & Pengolahan Data", [45, 60, 90]),
        ("Sistem Pendukung Keputusan", "Metode SMART", [30, 45, 60, 90]),
        ("Sistem Informasi Geografis", "Georeferencing QGIS", [45, 60, 90]),
        ("Teknik Penulisan Karya Ilmiah", "Rumusan Masalah", [60, 90, 120])
    ]
    now = datetime.now()
    for d in range(21):
        day = now - timedelta(days=d)
        for _ in range(random.choice([0, 1, 1, 2])):
            m, t, dur_choices = random.choice(mapel_data)
            hour = random.choices([7, 9, 10, 14, 16, 19, 20, 21], [1, 2, 2, 2, 3, 5, 4, 2])[0]
            focus = max(1, min(5, round(random.gauss(4.2 if hour in (19, 20, 9) else 3.2, 0.7))))
            mins = random.choice(dur_choices)
            st = day.replace(hour=hour, minute=random.choice([0, 15, 30]), second=0, microsecond=0)
            iso_st = st.strftime("%Y-%m-%dT%H:%M")
            db.query_db("""
            INSERT INTO sessions(user_id, subject, topic, start, minutes, focus, note, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            """, (uid, m, t, iso_st, mins, focus, "Sesi latihan rutin", iso_st), commit=True)
    return True


# ----------------------------------------------------
# STUDY PLANNER (SCHEDULES CRUD)
# ----------------------------------------------------
@eel.expose
def get_schedules():
    """Mengambil semua jadwal belajar terencana."""
    uid = get_current_user_id()
    return db.query_db("""
    SELECT id, user_id, subject, day_of_week, start_time, end_time, color, note
    FROM schedules
    WHERE user_id = ?
    ORDER BY day_of_week ASC, start_time ASC
    """, (uid,)) or []


@eel.expose
def add_schedule(subject, day_of_week, start_time, end_time, color="#6535e8", note=""):
    """Tambah jadwal belajar baru dengan validasi waktu."""
    uid = get_current_user_id()
    subject = str(subject).strip()
    start_time = str(start_time).strip()
    end_time = str(end_time).strip()

    if not subject:
        return {"ok": False, "error": "Nama mata pelajaran wajib diisi."}
    try:
        day_of_week = int(day_of_week)
        if not (0 <= day_of_week <= 6):
            return {"ok": False, "error": "Hari tidak valid."}
    except (ValueError, TypeError):
        return {"ok": False, "error": "Hari harus dipilih."}

    if not re.match(r"^\d{2}:\d{2}$", start_time) or not re.match(r"^\d{2}:\d{2}$", end_time):
        return {"ok": False, "error": "Format jam harus JJ:MM (misal 09:00)."}

    if start_time >= end_time:
        return {"ok": False, "error": "Jam selesai harus setelah jam mulai."}

    now_iso = datetime.now().isoformat()
    db.query_db("""
    INSERT INTO schedules(user_id, subject, day_of_week, start_time, end_time, color, note, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    """, (uid, subject, day_of_week, start_time, end_time, color, note.strip(), now_iso), commit=True)

    return {"ok": True, "message": "Jadwal berhasil ditambahkan!"}


@eel.expose
def update_schedule(schedule_id, subject, day_of_week, start_time, end_time, color="#6535e8", note=""):
    """Update jadwal belajar."""
    uid = get_current_user_id()
    schedule_id = int(schedule_id)
    subject = str(subject).strip()

    if not subject:
        return {"ok": False, "error": "Nama mata pelajaran wajib diisi."}
    if start_time >= end_time:
        return {"ok": False, "error": "Jam selesai harus setelah jam mulai."}

    db.query_db("""
    UPDATE schedules
    SET subject = ?, day_of_week = ?, start_time = ?, end_time = ?, color = ?, note = ?
    WHERE id = ? AND user_id = ?
    """, (subject, int(day_of_week), start_time, end_time, color, note.strip(), schedule_id, uid), commit=True)

    return {"ok": True, "message": "Jadwal berhasil diperbarui!"}


@eel.expose
def delete_schedule(schedule_id):
    """Hapus jadwal belajar."""
    uid = get_current_user_id()
    db.query_db("DELETE FROM schedules WHERE id = ? AND user_id = ?", (int(schedule_id), uid), commit=True)
    return {"ok": True}


# ----------------------------------------------------
# LEADERBOARD (GAMIFIKASI & KOMPETISI WAKTU BELAJAR)
# ----------------------------------------------------
@eel.expose
def get_leaderboard():
    """Menghitung ranking semua mahasiswa berdasarkan akumulasi durasi belajar."""
    current_uid = get_current_user_id()
    users = db.query_db("""
    SELECT id, full_name, username, nim, major, university, avatar_data
    FROM users
    """) or []

    leaderboard = []
    today = datetime.now().date()

    for u in users:
        u_id = u["id"]
        sess = db.query_db("SELECT start, minutes, focus FROM sessions WHERE user_id = ?", (u_id,)) or []
        total_mins = sum(s["minutes"] for s in sess)
        total_hours = round(total_mins / 60.0, 1)
        count = len(sess)
        avg_focus = round(sum(s["focus"] * s["minutes"] for s in sess) / total_mins, 1) if total_mins else 0.0

        # Hitung streak hari berturut-turut
        dates = set()
        for s in sess:
            try:
                dates.add(datetime.fromisoformat(s["start"]).date())
            except Exception:
                pass

        cur = today if today in dates else today - timedelta(days=1)
        streak = 0
        while cur in dates:
            streak += 1
            cur -= timedelta(days=1)

        leaderboard.append({
            "id": u["id"],
            "full_name": u["full_name"],
            "username": u["username"],
            "nim": u["nim"] or "-",
            "major": u["major"] or "Mahasiswa",
            "university": u["university"] or "Universitas",
            "avatar_data": u["avatar_data"],
            "total_minutes": total_mins,
            "total_hours": total_hours,
            "sessions_count": count,
            "avg_focus": avg_focus,
            "streak": streak,
            "is_current_user": (u["id"] == current_uid)
        })

    # Urutkan berdasarkan total waktu belajar menurun, kemudian streak
    leaderboard.sort(key=lambda x: (x["total_minutes"], x["streak"]), reverse=True)

    # Berikan peringkat dan badge tier
    current_user_rank = None
    for idx, item in enumerate(leaderboard, start=1):
        item["rank"] = idx
        if idx == 1:
            item["badge"] = "Grandmaster 👑"
            item["badge_color"] = "#eab308"
        elif idx == 2:
            item["badge"] = "Master ⚡"
            item["badge_color"] = "#94a3b8"
        elif idx == 3:
            item["badge"] = "Diamond 💎"
            item["badge_color"] = "#38bdf8"
        elif idx <= 5:
            item["badge"] = "Pro 🔥"
            item["badge_color"] = "#a855f7"
        else:
            item["badge"] = "Scholar 📚"
            item["badge_color"] = "#6366f1"

        if item["is_current_user"]:
            current_user_rank = idx

    # Cari selisih dengan peringkat di atasnya untuk memacu semangat
    diff_msg = ""
    if current_user_rank and current_user_rank > 1:
        above_user = leaderboard[current_user_rank - 2]
        gap_hours = round(above_user["total_hours"] - leaderboard[current_user_rank - 1]["total_hours"], 1)
        diff_msg = f"Tingkatkan belajarmu {gap_hours} jam lagi untuk menyalip {above_user['full_name']} di posisi #{current_user_rank - 1}!"
    elif current_user_rank == 1:
        diff_msg = "🔥 Kamu berada di peringkat 1! Pertahankan posisimu dari kejaran teman-temanmu!"

    return {
        "leaderboard": leaderboard,
        "current_user_rank": current_user_rank,
        "challenge_message": diff_msg
    }


# ----------------------------------------------------
# CSV IMPORT & EXPORT
# ----------------------------------------------------
@eel.expose
def export_csv():
    """Mengekspor seluruh riwayat sesi belajar ke string format CSV."""
    uid = get_current_user_id()
    sessions = db.query_db("""
    SELECT subject, topic, start, minutes, focus, note
    FROM sessions WHERE user_id = ? ORDER BY start DESC
    """, (uid,)) or []

    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["Mata Pelajaran", "Topik", "Tanggal Mulai", "Durasi (menit)", "Tingkat Fokus (1-5)", "Catatan"])

    for s in sessions:
        writer.writerow([s["subject"], s["topic"], s["start"], s["minutes"], s["focus"], s["note"]])

    csv_data = output.getvalue()
    filename = f"StudyPulse_Sessions_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return {"ok": True, "csv_data": csv_data, "filename": filename}


@eel.expose
def import_csv(csv_content):
    """Mengimpor data sesi dari file CSV dengan validasi setiap baris."""
    uid = get_current_user_id()
    if not csv_content or not isinstance(csv_content, str):
        return {"ok": False, "error": "Konten file CSV kosong atau tidak valid."}

    # Hilangkan BOM jika ada
    clean_csv = csv_content.lstrip("\ufeff").strip()
    if not clean_csv:
        return {"ok": False, "error": "File CSV tidak memiliki data."}

    # Deteksi delimiter (koma atau titik koma)
    first_line = clean_csv.split("\n")[0]
    delimiter = ";" if ";" in first_line and "," not in first_line else ","

    f = io.StringIO(clean_csv)
    reader = csv.reader(f, delimiter=delimiter)
    headers = next(reader, None)

    if not headers:
        return {"ok": False, "error": "Header kolom CSV tidak ditemukan."}

    # Normalisasi header
    header_map = {}
    for idx, h in enumerate(headers):
        clean_h = h.strip().lower()
        if "mata" in clean_h or "subject" in clean_h or "mapel" in clean_h:
            header_map["subject"] = idx
        elif "topik" in clean_h or "topic" in clean_h:
            header_map["topic"] = idx
        elif "tanggal" in clean_h or "start" in clean_h or "waktu" in clean_h or "date" in clean_h:
            header_map["start"] = idx
        elif "durasi" in clean_h or "menit" in clean_h or "minutes" in clean_h or "duration" in clean_h:
            header_map["minutes"] = idx
        elif "fokus" in clean_h or "focus" in clean_h:
            header_map["focus"] = idx
        elif "catatan" in clean_h or "note" in clean_h:
            header_map["note"] = idx

    if "subject" not in header_map:
        return {"ok": False, "error": "Kolom 'Mata Pelajaran' tidak ditemukan pada file CSV."}

    imported_count = 0
    skipped_count = 0
    errors = []

    now_iso = datetime.now().isoformat()

    for line_num, row in enumerate(reader, start=2):
        if not row or not any(row):
            continue
        try:
            subj = row[header_map["subject"]].strip() if "subject" in header_map and len(row) > header_map["subject"] else ""
            if not subj:
                skipped_count += 1
                errors.append(f"Baris {line_num}: Nama mata pelajaran kosong.")
                continue

            top = row[header_map["topic"]].strip() if "topic" in header_map and len(row) > header_map["topic"] else "Umum"

            # Parse start date
            raw_start = row[header_map["start"]].strip() if "start" in header_map and len(row) > header_map["start"] else ""
            if raw_start:
                try:
                    # Coba standard ISO
                    dt = datetime.fromisoformat(raw_start)
                    st_iso = dt.strftime("%Y-%m-%dT%H:%M")
                except ValueError:
                    # Coba beberapa format tanggal populer
                    parsed = False
                    for fmt in ("%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M", "%Y-%m-%d", "%d/%m/%Y"):
                        try:
                            dt = datetime.strptime(raw_start, fmt)
                            st_iso = dt.strftime("%Y-%m-%dT%H:%M")
                            parsed = True
                            break
                        except ValueError:
                            pass
                    if not parsed:
                        st_iso = datetime.now().strftime("%Y-%m-%dT%H:%M")
            else:
                st_iso = datetime.now().strftime("%Y-%m-%dT%H:%M")

            # Parse minutes
            raw_mins = row[header_map["minutes"]].strip() if "minutes" in header_map and len(row) > header_map["minutes"] else "45"
            mins = int(float(raw_mins)) if raw_mins else 45
            mins = max(1, min(720, mins))

            # Parse focus
            raw_focus = row[header_map["focus"]].strip() if "focus" in header_map and len(row) > header_map["focus"] else "4"
            focus = int(float(raw_focus)) if raw_focus else 4
            focus = max(1, min(5, focus))

            note = row[header_map["note"]].strip() if "note" in header_map and len(row) > header_map["note"] else ""

            db.query_db("""
            INSERT INTO sessions(user_id, subject, topic, start, minutes, focus, note, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            """, (uid, subj, top, st_iso, mins, focus, note, now_iso), commit=True)
            imported_count += 1

        except Exception as exc:
            skipped_count += 1
            errors.append(f"Baris {line_num}: {exc}")

    return {
        "ok": True,
        "imported": imported_count,
        "skipped": skipped_count,
        "errors": errors[:5],
        "message": f"Berhasil mengimpor {imported_count} sesi belajar." + (f" ({skipped_count} dilewati)" if skipped_count else "")
    }


@eel.expose
def get_csv_template():
    """Mengambil template CSV untuk memudahkan pengguna memasukkan data belajar."""
    template = (
        "Mata Pelajaran,Topik,Tanggal Mulai,Durasi (menit),Tingkat Fokus (1-5),Catatan\n"
        "Pemrograman,Pengenalan Pandas,2026-11-22T19:00,120,5,Belajar DataFrame & Series\n"
        "Basis Data,SQL JOIN,2026-11-21T16:00,90,4,Inner join dan left outer join\n"
        "Matematika,Integral,2026-11-20T19:00,60,3,Latihan integral parsial\n"
        "Jaringan,TCP/IP,2026-11-19T19:00,60,4,Model OSI dan TCP/IP layer\n"
    )
    return {"ok": True, "csv_data": template, "filename": "studypulse_template.csv"}


# ----------------------------------------------------
# ANALYTICS, DASHBOARD & REPORTS
# ----------------------------------------------------
@eel.expose
def get_dashboard_summary():
    """Ringkasan komprehensif untuk Dashboard sesuai tampilan di gambar mockup."""
    uid = get_current_user_id()
    user = get_current_user()
    weekly_target = user["weekly_target_hours"] if user else 16.0

    today = datetime.now().date()
    # 7 hari minggu ini (Senin - Minggu)
    start_of_week = today - timedelta(days=today.weekday())
    end_of_week = start_of_week + timedelta(days=6)

    all_sessions = db.query_db("""
    SELECT id, subject, topic, start, minutes, focus, note
    FROM sessions WHERE user_id = ? ORDER BY start DESC
    """, (uid,)) or []

    # Filter minggu ini
    this_week_sessions = []
    prev_week_sessions = []
    prev_week_start = start_of_week - timedelta(days=7)
    prev_week_end = start_of_week - timedelta(days=1)

    by_day_week = {i: 0 for i in range(7)}  # 0: Sen, ..., 6: Min
    by_subject = defaultdict(int)

    for s in all_sessions:
        try:
            s_dt = datetime.fromisoformat(s["start"])
            s_date = s_dt.date()
            if start_of_week <= s_date <= end_of_week:
                this_week_sessions.append(s)
                w_day = s_date.weekday()
                by_day_week[w_day] += s["minutes"]
                by_subject[s["subject"]] += s["minutes"]
            elif prev_week_start <= s_date <= prev_week_end:
                prev_week_sessions.append(s)
        except Exception:
            pass

    total_mins_week = sum(s["minutes"] for s in this_week_sessions)
    total_hours_week = round(total_mins_week / 60.0, 1)

    prev_mins = sum(s["minutes"] for s in prev_week_sessions)
    if prev_mins > 0:
        pct_change = round(((total_mins_week - prev_mins) / prev_mins) * 100)
    else:
        pct_change = 0

    session_count = len(this_week_sessions)
    prev_count = len(prev_week_sessions)
    diff_count = session_count - prev_count

    target_pct = min(100, round((total_hours_week / weekly_target) * 100)) if weekly_target > 0 else 0

    # Mata pelajaran terbanyak
    top_subject = "-"
    top_subject_hours = 0.0
    if by_subject:
        top_name, top_mins = max(by_subject.items(), key=lambda x: x[1])
        top_subject = top_name
        top_subject_hours = round(top_mins / 60.0, 1)

    # Chart 1: Durasi Belajar per Hari (7 hari)
    daily_chart = []
    for i in range(7):
        day_date = start_of_week + timedelta(days=i)
        day_mins = by_day_week[i]
        daily_chart.append({
            "day": HARI[i][:3],
            "date": day_date.strftime("%d %b"),
            "minutes": day_mins,
            "hours": round(day_mins / 60.0, 1),
            "label": f"{HARI[i][:3]} {day_date.strftime('%d %b')}"
        })

    # Chart 2: Proporsi Waktu per Mata Pelajaran (Donut)
    palette = ["#F29F67", "#1E1E2C", "#3B8FF3", "#34B1AA", "#E0B50F", "#EF4444", "#8B5CF6"]
    prop_chart = []
    for idx, (subj_name, subj_mins) in enumerate(sorted(by_subject.items(), key=lambda x: x[1], reverse=True)):
        pct = round((subj_mins / total_mins_week) * 100, 1) if total_mins_week else 0
        prop_chart.append({
            "subject": subj_name,
            "minutes": subj_mins,
            "hours": round(subj_mins / 60.0, 1),
            "percentage": pct,
            "color": palette[idx % len(palette)]
        })

    # Sesi Belajar Terakhir (5 sesi)
    recent_sessions = all_sessions[:5]

    # Rekomendasi Waktu Belajar
    rec = get_recommendations()

    return {
        "date_range_label": f"Minggu ini ({start_of_week.strftime('%d')} - {end_of_week.strftime('%d %b %Y')})",
        "total_hours": total_hours_week,
        "pct_change": pct_change,
        "session_count": session_count,
        "diff_count": diff_count,
        "weekly_target_hours": weekly_target,
        "target_pct": target_pct,
        "top_subject": top_subject,
        "top_subject_hours": top_subject_hours,
        "daily_chart": daily_chart,
        "prop_chart": prop_chart,
        "recent_sessions": recent_sessions,
        "recommendations": rec,
        "all_time_hours": round(sum(s["minutes"] for s in all_sessions) / 60.0, 1),
        "status_summary_value": total_mins_week
    }


@eel.expose
def get_analytics(period="7d", subject_filter=None):
    """Data analitik mendalam dengan filter periode 7 hari, 30 hari, atau 3 bulan."""
    uid = get_current_user_id()
    all_sessions = db.query_db("SELECT * FROM sessions WHERE user_id = ? ORDER BY start DESC", (uid,)) or []

    today = datetime.now().date()
    days_back = 7 if period == "7d" else (30 if period == "30d" else 90)
    cutoff = today - timedelta(days=days_back)

    filtered = []
    for s in all_sessions:
        try:
            s_date = datetime.fromisoformat(s["start"]).date()
            if s_date >= cutoff:
                if not subject_filter or subject_filter == "Semua Mata Pelajaran" or s["subject"] == subject_filter:
                    filtered.append(s)
        except Exception:
            pass

    total_mins = sum(s["minutes"] for s in filtered)
    total_hours = round(total_mins / 60.0, 1)
    avg_duration = round(total_mins / len(filtered)) if filtered else 0
    avg_focus = round(sum(s["focus"] * s["minutes"] for s in filtered) / total_mins, 1) if total_mins else 0.0

    # Distribusi per hari
    daily_map = defaultdict(int)
    for s in filtered:
        s_date = datetime.fromisoformat(s["start"]).date()
        daily_map[s_date] += s["minutes"]

    daily_chart = []
    for i in range(days_back - 1, -1, -1):
        d = today - timedelta(days=i)
        mins = daily_map[d]
        daily_chart.append({
            "label": d.strftime("%d/%m"),
            "minutes": mins,
            "hours": round(mins / 60.0, 1)
        })

    # Distribusi jam (24 jam)
    hour_buckets = [{"hour": i, "min": 0, "count": 0, "focus_sum": 0.0} for i in range(24)]
    weekday_mins = [0] * 7
    subject_map = defaultdict(lambda: {"minutes": 0, "count": 0, "focus_sum": 0.0})

    for s in filtered:
        s_dt = datetime.fromisoformat(s["start"])
        h = hour_buckets[s_dt.hour]
        h["min"] += s["minutes"]
        h["count"] += 1
        h["focus_sum"] += s["focus"] * s["minutes"]

        weekday_mins[s_dt.weekday()] += s["minutes"]

        sm = subject_map[s["subject"]]
        sm["minutes"] += s["minutes"]
        sm["count"] += 1
        sm["focus_sum"] += s["focus"] * s["minutes"]

    hours_chart = [{
        "hour": i,
        "label": f"{i:02d}:00",
        "minutes": h["min"],
        "hours": round(h["min"] / 60.0, 1),
        "focus": round(h["focus_sum"] / h["min"], 1) if h["min"] else 0.0
    } for i, h in enumerate(hour_buckets)]

    # Hari paling produktif
    max_wd_idx = max(range(7), key=lambda x: weekday_mins[x]) if any(weekday_mins) else 5
    most_productive_day = HARI[max_wd_idx]

    # Mapel terbanyak
    top_subject = max(subject_map.items(), key=lambda x: x[1]["minutes"])[0] if subject_map else "-"

    subjects_summary = sorted([{
        "name": k,
        "minutes": v["minutes"],
        "hours": round(v["minutes"] / 60.0, 1),
        "count": v["count"],
        "focus": round(v["focus_sum"] / v["minutes"], 1) if v["minutes"] else 0.0
    } for k, v in subject_map.items()], key=lambda x: x["minutes"], reverse=True)

    all_subjects = sorted(list(set(s["subject"] for s in all_sessions if s.get("subject"))))

    return {
        "total_hours": total_hours,
        "total_sessions": len(filtered),
        "avg_duration_minutes": avg_duration,
        "avg_duration_hours": round(avg_duration / 60.0, 1),
        "avg_focus": avg_focus,
        "most_productive_day": most_productive_day,
        "top_subject": top_subject,
        "daily_chart": daily_chart,
        "hours_chart": hours_chart,
        "weekday_chart": [{"day": HARI[i][:3], "hours": round(weekday_mins[i] / 60.0, 1)} for i in range(7)],
        "subjects": subjects_summary,
        "all_subjects": all_subjects
    }


@eel.expose
def get_recommendations():
    """Memberikan saran jadwal dan pola belajar yang dapat ditindaklanjuti."""
    uid = get_current_user_id()
    all_sessions = db.query_db("SELECT * FROM sessions WHERE user_id = ? ORDER BY start DESC", (uid,)) or []

    if len(all_sessions) < 3:
        return {
            "best_time_range": "19.00 - 21.00",
            "most_productive_day": "Sabtu",
            "avg_session_hours": 1.6,
            "insights": [
                {"title": "Catat lebih banyak sesi", "text": "Catat minimal 5 sesi agar sistem dapat menganalisis pola waktu belajarmu secara mendalam."}
            ],
            "schedule_suggestions": [
                {"time": "19.00 - 21.00", "title": "Sesi Utama (Fokus)", "desc": "Materi tersulit & butuh konsentrasi tinggi"},
                {"time": "14.00 - 16.00", "title": "Review Materi", "desc": "Membaca ulang catatan & rangkuman"},
                {"time": "10.00 - 11.00", "title": "Latihan Soal", "desc": "Latihan kuis & studi kasus singkat"}
            ]
        }

    # Analisis jam dengan fokus tertinggi
    hours_focus = defaultdict(lambda: {"focus_sum": 0, "minutes": 0, "n": 0})
    for s in all_sessions:
        h = datetime.fromisoformat(s["start"]).hour
        hours_focus[h]["focus_sum"] += s["focus"] * s["minutes"]
        hours_focus[h]["minutes"] += s["minutes"]
        hours_focus[h]["n"] += 1

    cand = []
    for h, data in hours_focus.items():
        if data["minutes"] > 0:
            avg_f = data["focus_sum"] / data["minutes"]
            cand.append((h, avg_f, data["minutes"]))
    cand.sort(key=lambda x: (x[1], x[2]), reverse=True)

    best_h = cand[0][0] if cand else 19
    best_time_str = f"{best_h:02d}.00 - {(best_h + 2) % 24:02d}.00"

    total_mins = sum(s["minutes"] for s in all_sessions)
    avg_session_hours = round((total_mins / len(all_sessions)) / 60.0, 1)

    # Hari paling produktif
    wd_count = defaultdict(int)
    for s in all_sessions:
        wd_count[datetime.fromisoformat(s["start"]).weekday()] += s["minutes"]
    best_wd = max(wd_count.items(), key=lambda x: x[1])[0] if wd_count else 5
    most_productive_day = HARI[best_wd]

    # Mapel dengan persentase paling sedikit
    subj_count = defaultdict(int)
    for s in all_sessions:
        subj_count[s["subject"]] += s["minutes"]
    least_subj, least_mins = min(subj_count.items(), key=lambda x: x[1]) if subj_count else ("Jaringan", 120)
    least_pct = round((least_mins / total_mins) * 100, 1) if total_mins else 13.8

    insights = [
        {
            "icon": "trending-up",
            "title": f"Tingkatkan waktu belajar {least_subj}",
            "text": f"Hanya {least_pct}% dari total waktu belajarmu. Alokasikan 1-2 sesi ekstra minggu ini."
        },
        {
            "icon": "check-circle",
            "title": "Pertahankan konsistensi belajar",
            "text": "Belajar sedikit setiap hari lebih efektif daripada belajar borongan dalam satu malam."
        },
        {
            "icon": "clock",
            "title": f"Target harian disarankan: {avg_session_hours} - 2 jam",
            "text": f"Sesi belajarmu dengan fokus optimal biasanya berdurasi {avg_session_hours} jam."
        }
    ]

    schedule_suggestions = [
        {"time": best_time_str, "title": "Sesi Utama (Fokus Penuh)", "desc": "Cocok untuk materi yang membutuhkan analisis mendalam."},
        {"time": "14.00 - 16.00", "title": "Review Materi & Catatan", "desc": "Pengulangan materi agar ingatan tetap kuat."},
        {"time": "10.00 - 11.00", "title": "Latihan Soal & Kuis", "desc": "Menguji pemahaman dengan latihan singkat."}
    ]

    return {
        "best_time_range": best_time_str,
        "most_productive_day": most_productive_day,
        "avg_session_hours": avg_session_hours,
        "insights": insights,
        "schedule_suggestions": schedule_suggestions
    }


@eel.expose
def get_reports(period="weekly"):
    """Laporan komprehensif aktivitas belajar untuk diekspor ke CSV atau dicetak PDF."""
    uid = get_current_user_id()
    user = get_current_user()
    weekly_target = user["weekly_target_hours"] if user else 16.0

    all_sessions = db.query_db("SELECT * FROM sessions WHERE user_id = ? ORDER BY start DESC", (uid,)) or []

    today = datetime.now().date()
    if period == "daily":
        filtered = [s for s in all_sessions if datetime.fromisoformat(s["start"]).date() == today]
        title = f"Laporan Harian ({today.strftime('%d %B %Y')})"
    elif period == "monthly":
        first_of_month = today.replace(day=1)
        filtered = [s for s in all_sessions if datetime.fromisoformat(s["start"]).date() >= first_of_month]
        title = f"Laporan Bulanan ({today.strftime('%B %Y')})"
    else:  # weekly
        start_week = today - timedelta(days=today.weekday())
        filtered = [s for s in all_sessions if datetime.fromisoformat(s["start"]).date() >= start_week]
        title = f"Laporan Mingguan ({start_week.strftime('%d %b')} - {today.strftime('%d %b %Y')})"

    total_mins = sum(s["minutes"] for s in filtered)
    total_hours = round(total_mins / 60.0, 1)
    session_count = len(filtered)
    avg_focus = round(sum(s["focus"] * s["minutes"] for s in filtered) / total_mins, 1) if total_mins else 0.0
    target_pct = min(100, round((total_hours / weekly_target) * 100)) if weekly_target else 0

    # Rekap per mata pelajaran
    by_subj = defaultdict(lambda: {"minutes": 0, "count": 0, "focus_sum": 0.0})
    for s in filtered:
        m = by_subj[s["subject"]]
        m["minutes"] += s["minutes"]
        m["count"] += 1
        m["focus_sum"] += s["focus"] * s["minutes"]

    rekap_list = []
    for idx, (subj, data) in enumerate(sorted(by_subj.items(), key=lambda x: x[1]["minutes"], reverse=True), start=1):
        pct = round((data["minutes"] / total_mins) * 100, 1) if total_mins else 0.0
        rekap_list.append({
            "no": idx,
            "subject": subj,
            "total_hours": round(data["minutes"] / 60.0, 1),
            "sessions_count": data["count"],
            "percentage": pct,
            "avg_focus": round(data["focus_sum"] / data["minutes"], 1) if data["minutes"] else 0.0
        })

    return {
        "title": title,
        "total_hours": total_hours,
        "session_count": session_count,
        "target_pct": target_pct,
        "avg_focus": avg_focus,
        "rekap_table": rekap_list
    }


# ----------------------------------------------------
# DATABASE STATUS & NOTIFICATIONS
# ----------------------------------------------------
@eel.expose
def get_db_status():
    """Mengambil status koneksi database saat ini."""
    return {
        "type": db.ACTIVE_DB_TYPE,
        "connected": db.DB_STATUS_INFO.get("connected", False),
        "message": db.DB_STATUS_INFO.get("message", "Aktif"),
        "host": db.DB_STATUS_INFO.get("host", "aws-1-ap-southeast-1.pooler.supabase.com")
    }


@eel.expose
def reconnect_supabase():
    """Menampilkan status database lokal (nama lama dipertahankan untuk UI)."""
    return db.test_supabase_connection()


@eel.expose
def get_system_notifications():
    """Mendapatkan notifikasi sistem dinamis (jadwal hari ini, target, streak)."""
    uid = get_current_user_id()
    user = get_current_user()
    today_wd = datetime.now().weekday()

    notifications = []

    # 1. Jadwal belajar hari ini
    today_schedules = db.query_db("""
    SELECT subject, start_time, end_time, note
    FROM schedules WHERE user_id = ? AND day_of_week = ?
    ORDER BY start_time ASC
    """, (uid, today_wd)) or []

    if today_schedules:
        s0 = today_schedules[0]
        notifications.append({
            "type": "schedule",
            "title": f"Jadwal belajar hari ini: {s0['subject']}",
            "desc": f"{s0['start_time']} - {s0['end_time']}" + (f" ({s0['note']})" if s0['note'] else ""),
            "time": "Hari ini",
            "icon": "calendar"
        })
    else:
        notifications.append({
            "type": "schedule",
            "title": "Belum ada jadwal hari ini",
            "desc": "Buka Study Planner untuk merencanakan waktu belajarmu.",
            "time": "Info",
            "icon": "calendar"
        })

    # 2. Target mingguan
    weekly_target = user["weekly_target_hours"] if user else 16.0
    today = datetime.now().date()
    start_week = today - timedelta(days=today.weekday())
    week_sess = db.query_db("""
    SELECT minutes FROM sessions WHERE user_id = ? AND start >= ?
    """, (uid, start_week.strftime("%Y-%m-%d")), ) or []
    tot_h = round(sum(s["minutes"] for s in week_sess) / 60.0, 1)
    pct = min(100, round((tot_h / weekly_target) * 100)) if weekly_target else 0

    notifications.append({
        "type": "target",
        "title": f"Target mingguan: {pct}%",
        "desc": f"Kamu sudah mencapai {tot_h} dari target {weekly_target} jam.",
        "time": "Progres",
        "icon": "target"
    })

    # 3. Konsistensi belajar
    notifications.append({
        "type": "streak",
        "title": "Konsistensi belajar",
        "desc": "Pertahankan ritme belajarmu setiap hari untuk tetap di puncak leaderboard!",
        "time": "Semangat",
        "icon": "flame"
    })

    return notifications


# ----------------------------------------------------
# MATERIALS, FLASHCARD & QUIZ GENERATOR (WITH GEMINI AI)
# ----------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"]


def _call_gemini_api(prompt, temperature=0.2):
    """Memanggil Gemini REST API dengan model fallback otomatis dan parse JSON."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY belum dikonfigurasi di file .env atau environment variable.")
    last_err = None
    for model_name in GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
        payload = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature}
        }).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                candidates = data.get("candidates", [])
                if not candidates:
                    continue
                raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                clean = re.sub(r"^```(?:json)?\s*", "", raw_text.strip(), flags=re.MULTILINE)
                clean = re.sub(r"\s*```$", "", clean)
                return json.loads(clean.strip())
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"Gagal memanggil Gemini AI: {last_err}")


def _extract_material_text(filename, content):
    extension = os.path.splitext(filename)[1].lower()
    if extension in (".txt", ".md"):
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("File teks harus menggunakan encoding UTF-8.") from exc
    elif extension == ".pdf":
        if PdfReader is None:
            raise ValueError("Pembacaan PDF belum tersedia pada instalasi ini.")
        try:
            reader = PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except (PdfReadError, ValueError) as exc:
            raise ValueError("PDF tidak bisa dibaca. Pastikan PDF tidak terkunci atau rusak.") from exc
    else:
        raise ValueError("Format yang didukung: PDF, TXT, dan Markdown.")
    text = text[:MAX_EXTRACTED_CHARS].strip()
    if not text:
        raise ValueError("Tidak ada teks yang dapat dibaca dari file ini.")
    return text


@eel.expose
def upload_material(filename, encoded_content):
    uid = get_current_user_id()
    if not isinstance(filename, str) or not isinstance(encoded_content, str):
        return {"ok": False, "error": "File yang dipilih tidak valid."}
    original_name = os.path.basename(filename.replace("\\", "/")).strip()
    extension = os.path.splitext(original_name)[1].lower()
    if extension not in (".txt", ".md", ".pdf"):
        return {"ok": False, "error": "Format yang didukung: PDF, TXT, dan Markdown."}
    try:
        content = base64.b64decode(encoded_content, validate=True)
    except (binascii.Error, ValueError):
        return {"ok": False, "error": "Isi file tidak valid."}
    if not content:
        return {"ok": False, "error": "File kosong."}
    if len(content) > MAX_UPLOAD_BYTES:
        return {"ok": False, "error": "Ukuran file maksimal 10 MB."}
    try:
        text = _extract_material_text(original_name, content)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    os.makedirs(MATERIALS_DIR, exist_ok=True)
    stored_name = uuid.uuid4().hex + extension
    path = os.path.join(MATERIALS_DIR, stored_name)
    title = os.path.splitext(original_name)[0][:120] or "Materi baru"

    try:
        with open(path, "wb") as f:
            f.write(content)

        now_iso = datetime.now().isoformat()
        db.query_db("""
        INSERT INTO materials(user_id, title, stored_name, original_name, size_bytes, created_at)
        VALUES(?, ?, ?, ?, ?, ?)
        """, (uid, title, stored_name, original_name[:255], len(content), now_iso), commit=True)
        m = db.query_db("SELECT id FROM materials WHERE stored_name = ?", (stored_name,), one=True)
        material_id = m["id"] if m else 1
    except Exception as exc:
        if os.path.exists(path):
            os.remove(path)
        return {"ok": False, "error": f"Materi gagal disimpan: {exc}"}

    return {"ok": True, "material": {"id": material_id, "title": title, "original_name": original_name, "size_bytes": len(content), "text_chars": len(text)}}


@eel.expose
def get_materials():
    uid = get_current_user_id()
    return db.query_db("""
    SELECT id, title, original_name, size_bytes, created_at
    FROM materials WHERE user_id = ? ORDER BY id DESC
    """, (uid,)) or []


@eel.expose
def delete_material(material_id):
    uid = get_current_user_id()
    m = db.query_db("SELECT stored_name FROM materials WHERE id = ? AND user_id = ?", (int(material_id), uid), one=True)
    if not m:
        return {"ok": False, "error": "Materi tidak ditemukan."}

    db.query_db("DELETE FROM study_cards WHERE material_id = ?", (int(material_id),), commit=True)
    db.query_db("DELETE FROM materials WHERE id = ?", (int(material_id),), commit=True)

    path = os.path.join(MATERIALS_DIR, m["stored_name"])
    if os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass
    return {"ok": True}


def _parse_study_pairs(text):
    pairs = []
    for line in text.splitlines():
        line = re.sub(r"^\s*(?:[-*+]|\d+[.)])\s*", "", line).strip()
        if not line or line.startswith("#"):
            continue
        parts = re.split(r"\s*\|\s*|\s*::\s*|\s*:\s*|\s+[—–-]\s+", line, maxsplit=1)
        if len(parts) == 2 and parts[0].strip() and parts[1].strip():
            pairs.append((parts[0].strip()[:500], parts[1].strip()[:2000]))
        if len(pairs) == 100:
            break
    return pairs


@eel.expose
def generate_ai_study_set(material_id=None, topic="", kind="flashcard", count=5):
    """Menghasilkan Flashcard atau Kuis Pilihan Ganda berstandar akademik tinggi menggunakan Gemini AI."""
    uid = get_current_user_id()
    count = max(2, min(int(count or 5), 15))
    kind = "quiz" if kind == "quiz" else "flashcard"

    source_text = ""
    mat_id = None
    if material_id and int(material_id) > 0:
        mat_id = int(material_id)
        m = db.query_db("SELECT title, stored_name, original_name FROM materials WHERE id = ?", (mat_id,), one=True)
        if m:
            path = os.path.join(MATERIALS_DIR, m["stored_name"])
            if os.path.exists(path):
                try:
                    with open(path, "rb") as f:
                        file_bytes = f.read(MAX_UPLOAD_BYTES + 1)
                    source_text = _extract_material_text(m["original_name"], file_bytes)
                except Exception:
                    source_text = m["title"]
            else:
                source_text = m["title"]
    elif topic and topic.strip():
        source_text = topic.strip()
        title = f"✦ AI: {topic.strip()[:60]}"
        # Cari materi yang sudah ada atau buat record materi baru
        existing = db.query_db("SELECT id FROM materials WHERE user_id = ? AND title = ?", (uid, title), one=True)
        if existing:
            mat_id = existing["id"]
        else:
            now_iso = datetime.now().isoformat()
            stored = f"ai_gen_{uuid.uuid4().hex[:8]}.txt"
            db.query_db("""
            INSERT INTO materials(user_id, title, stored_name, original_name, size_bytes, created_at)
            VALUES(?, ?, ?, ?, ?, ?)
            """, (uid, title, stored, f"{topic[:40]}.txt", 1024, now_iso), commit=True)
            new_m = db.query_db("SELECT id FROM materials WHERE stored_name = ?", (stored,), one=True)
            mat_id = new_m["id"] if new_m else 1

    if not source_text:
        return {"ok": False, "error": "Harap masukkan topik pembelajaran atau pilih materi yang telah diunggah."}

    # Buat prompt terstruktur untuk Gemini AI
    if kind == "flashcard":
        prompt = f"""
Anda adalah asisten tutor akademik cerdas. Buatkan {count} flashcard pembelajaran interaktif bermutu tinggi berdasarkan materi/topik berikut:
\"\"\"{source_text[:15000]}\"\"\"

Setiap flashcard harus membantu mahasiswa memahami konsep kunci secara mendalam dan mudah diingat.
Wajib berikan respon HANYA dalam format array JSON murni tanpa pembungkus markdown apapun:
[
  {{
    "question": "Pertanyaan konsep kunci yang menantang dan jelas",
    "concept": "Label konsep/bab (singkat 2-4 kata)",
    "answer": "Penjelasan komprehensif, terstruktur, dan mudah dipahami",
    "tip": "Jembatan keledai, analogi praktis, atau tips mengingat cepat"
  }}
]
"""
    else:  # quiz MCQ
        prompt = f"""
Anda adalah dosen dan pembuat soal ujian akademik profesional. Buatkan {count} soal kuis pilihan ganda (Multiple Choice) interaktif bermutu tinggi berdasarkan materi/topik berikut:
\"\"\"{source_text[:15000]}\"\"\"

Kriteria soal:
1. Memiliki 4 pilihan jawaban yang terformat rapi: ["A. ...", "B. ...", "C. ...", "D. ..."].
2. Tentukan satu kunci jawaban yang benar ("A", "B", "C", atau "D").
3. Berikan pembahasan/penjelasan ilmiah mengapa jawaban tersebut benar dan penting untuk dipahami.

Wajib berikan respon HANYA dalam format array JSON murni tanpa pembungkus markdown apapun:
[
  {{
    "question": "Teks pertanyaan kuis yang jelas dan spesifik",
    "options": [
      "A. Pilihan jawaban A",
      "B. Pilihan jawaban B",
      "C. Pilihan jawaban C",
      "D. Pilihan jawaban D"
    ],
    "correct": "A",
    "explanation": "Pembahasan lengkap dan edukatif mengapa jawaban ini benar..."
  }}
]
"""

    try:
        cards_data = _call_gemini_api(prompt, temperature=0.2)
        if not isinstance(cards_data, list) or len(cards_data) == 0:
            return {"ok": False, "error": "Gemini AI tidak menghasilkan kartu yang valid. Coba ulangi dengan topik yang lebih spesifik."}

        # Bersihkan kartu lama untuk material dan kind ini
        db.query_db("DELETE FROM study_cards WHERE material_id = ? AND kind = ?", (mat_id, kind), commit=True)

        for item in cards_data:
            q = str(item.get("question", "")).strip()[:500]
            if not q:
                continue
            if kind == "flashcard":
                ans_payload = json.dumps({
                    "answer": str(item.get("answer", "")).strip(),
                    "concept": str(item.get("concept", "Konsep Kunci")).strip(),
                    "tip": str(item.get("tip", "")).strip()
                }, ensure_ascii=False)
            else:
                correct_letter = str(item.get("correct", "A")).upper().replace(".", "").strip()[:1]
                if correct_letter not in ("A", "B", "C", "D"):
                    correct_letter = "A"
                ans_payload = json.dumps({
                    "options": item.get("options", []),
                    "correct": correct_letter,
                    "explanation": str(item.get("explanation", "")).strip()
                }, ensure_ascii=False)

            db.query_db("""
            INSERT INTO study_cards(material_id, kind, question, answer)
            VALUES(?, ?, ?, ?)
            """, (mat_id, kind, q, ans_payload), commit=True)

        return {"ok": True, "material_id": mat_id, "cards_count": len(cards_data), "kind": kind}
    except Exception as exc:
        return {"ok": False, "error": f"Gagal membuat kartu dengan Gemini AI: {exc}"}


@eel.expose
def create_study_set(material_id, kind):
    """Membuat latihan kartu. Jika ada format baris sederhana, gunakan; jika tidak, gunakan Gemini AI."""
    if kind not in ("flashcard", "quiz"):
        return {"ok": False, "error": "Jenis latihan tidak valid."}

    m = db.query_db("SELECT stored_name, original_name, title FROM materials WHERE id = ?", (int(material_id),), one=True)
    if not m:
        return {"ok": False, "error": "Materi tidak ditemukan."}

    path = os.path.join(MATERIALS_DIR, m["stored_name"])
    if not os.path.exists(path):
        # Jika file fisik tidak ada (misal materi dibuat dari prompt AI), generate via AI
        return generate_ai_study_set(material_id=material_id, topic=m["title"], kind=kind, count=5)

    try:
        with open(path, "rb") as f:
            content = f.read(MAX_UPLOAD_BYTES + 1)
        text = _extract_material_text(m["original_name"], content)
        pairs = _parse_study_pairs(text)
    except Exception:
        pairs = []

    if pairs:
        db.query_db("DELETE FROM study_cards WHERE material_id = ? AND kind = ?", (int(material_id), kind), commit=True)
        for q, a in pairs:
            # Bungkus format jawaban agar serasi
            if kind == "flashcard":
                payload = json.dumps({"answer": a, "concept": "Konsep Kunci", "tip": ""}, ensure_ascii=False)
            else:
                payload = json.dumps({"options": [f"A. {a}", "B. Pilihan alternatif lain", "C. Konsep berbeda", "D. Tidak relevan"], "correct": "A", "explanation": a}, ensure_ascii=False)
            db.query_db("""
            INSERT INTO study_cards(material_id, kind, question, answer)
            VALUES(?, ?, ?, ?)
            """, (int(material_id), kind, q, payload), commit=True)
        return {"ok": True, "cards": len(pairs)}

    # Jika teks dokumen adalah teks umum (bukan format baris Istilah:Definisi), gunakan Gemini AI otomatis!
    return generate_ai_study_set(material_id=material_id, topic="", kind=kind, count=5)


@eel.expose
def get_study_cards(material_id, kind):
    rows = db.query_db("""
    SELECT id, question, answer FROM study_cards WHERE material_id = ? AND kind = ? ORDER BY id ASC
    """, (int(material_id), kind)) or []
    result = []
    for r in rows:
        ans_raw = r["answer"]
        parsed = None
        try:
            parsed = json.loads(ans_raw)
        except Exception:
            parsed = None
        result.append({
            "id": r["id"],
            "question": r["question"],
            "raw_answer": ans_raw,
            "data": parsed
        })
    return result


# ----------------------------------------------------
# START APPLICATION
# ----------------------------------------------------
if __name__ == "__main__":
    db.init_all()
    eel.init(os.path.join(BASE, "web"))

    port = 8088
    # Deteksi browser secara langsung agar startup instan tanpa timeout pencarian Chrome
    def get_preferred_browser():
        chrome_candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        ]
        for c in chrome_candidates:
            if os.path.exists(c):
                return "chrome"
        return "edge"

    browser_mode = get_preferred_browser()
    try:
        eel.start("index.html", mode=browser_mode, size=(1360, 880), port=port)
    except Exception:
        try:
            eel.start("index.html", mode="edge", size=(1360, 880), port=port)
        except Exception:
            eel.start("index.html", mode="default", size=(1360, 880), port=port)
