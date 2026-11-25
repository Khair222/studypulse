"""StudyPulse Database Layer
Arsitektur Local-First dengan Cloud Sync Supabase PostgreSQL.
Performa instan (< 10ms) untuk pembacaan & visualisasi grafik,
dengan sinkronisasi data dua arah ke Supabase Cloud.
"""
import os
import sqlite3
import hashlib
import threading
import time
import re
from datetime import datetime, timedelta
import random

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SQLITE_PATH = os.path.join(BASE_DIR, "studypulse.db")


def load_env_file(env_path: str = None):
    """Memuat variabel dari file .env lokal tanpa ketergantungan paket eksternal."""
    path = env_path or os.path.join(BASE_DIR, ".env")
    if not os.path.isfile(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key:
                    os.environ.setdefault(key, value)
    except OSError:
        pass


load_env_file()

# Supabase connection string (diambil dari .env / environment variable):
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()

# Global database state
ACTIVE_DB_TYPE = "postgres"
DB_STATUS_INFO = {
    "connected": True,
    "type": "postgres",
    "message": "Terhubung ke Supabase PostgreSQL Cloud",
    "host": "aws-1-ap-southeast-1.pooler.supabase.com"
}

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    PSYCOPG2_AVAILABLE = True
except ImportError:
    psycopg2 = None
    RealDictCursor = None
    PSYCOPG2_AVAILABLE = False
    ACTIVE_DB_TYPE = "sqlite"
    DB_STATUS_INFO = {
        "connected": True,
        "type": "sqlite",
        "message": "psycopg2 tidak tersedia; menggunakan SQLite lokal",
        "host": "Local SQLite (studypulse.db)"
    }

# Persistent PostgreSQL Connection (Singleton dengan auto-reconnect)
_pg_conn = None
_pg_lock = threading.Lock()


def validate_password_strength(password: str) -> tuple[bool, str]:
    """Validasi password tingkat lanjut:
    - Minimal 8 karakter
    - Minimal 1 huruf besar (A-Z)
    - Minimal 1 huruf kecil (a-z)
    - Minimal 1 angka (0-9)
    """
    if not password or len(password) < 8:
        return False, "Password minimal 8 karakter."
    if not re.search(r"[A-Z]", password):
        return False, "Password harus mengandung minimal satu huruf besar (A-Z)."
    if not re.search(r"[a-z]", password):
        return False, "Password harus mengandung minimal satu huruf kecil (a-z)."
    if not re.search(r"[0-9]", password):
        return False, "Password harus mengandung minimal satu angka (0-9)."
    return True, ""


def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
    return f"{salt}:{hashed}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, hashed = stored_hash.split(":", 1)
        check = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
        return check == hashed
    except Exception:
        return False


def get_sqlite_conn():
    conn = sqlite3.connect(SQLITE_PATH, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def get_persistent_pg():
    """Mendapatkan atau membuat koneksi persisten ke Supabase PostgreSQL."""
    global _pg_conn, DB_STATUS_INFO, ACTIVE_DB_TYPE
    if not PSYCOPG2_AVAILABLE:
        return None
    if not SUPABASE_URL:
        ACTIVE_DB_TYPE = "sqlite"
        DB_STATUS_INFO["connected"] = False
        DB_STATUS_INFO["type"] = "sqlite"
        DB_STATUS_INFO["message"] = "SUPABASE_URL belum diatur; menggunakan SQLite lokal"
        DB_STATUS_INFO["host"] = "Local SQLite (studypulse.db)"
        return None

    with _pg_lock:
        if _pg_conn is not None and not _pg_conn.closed:
            try:
                # Fast ping
                with _pg_conn.cursor() as cur:
                    cur.execute("SELECT 1")
                return _pg_conn
            except Exception:
                try:
                    _pg_conn.close()
                except Exception:
                    pass
                _pg_conn = None

        # Buat koneksi baru jika terputus
        try:
            _pg_conn = psycopg2.connect(SUPABASE_URL, connect_timeout=5)
            _pg_conn.autocommit = True
            ACTIVE_DB_TYPE = "postgres"
            DB_STATUS_INFO["connected"] = True
            DB_STATUS_INFO["type"] = "postgres"
            DB_STATUS_INFO["message"] = "Terhubung ke Supabase PostgreSQL Cloud"
            DB_STATUS_INFO["host"] = "aws-1-ap-southeast-1.pooler.supabase.com"
            return _pg_conn
        except Exception as e:
            _pg_conn = None
            ACTIVE_DB_TYPE = "sqlite"
            DB_STATUS_INFO["connected"] = False
            DB_STATUS_INFO["type"] = "sqlite"
            DB_STATUS_INFO["message"] = f"Supabase offline ({e.__class__.__name__}); fallback ke SQLite lokal"
            return None


def query_db(sql: str, params=(), one=False, commit=False):
    """Menjalankan query SQL dengan kecepatan instan dari SQLite lokal,
    serta secara paralel mereplikasi write/insert/update/delete ke Supabase PostgreSQL.
    """
    # 1. Eksekusi lokal (super cepat < 10ms untuk kelancaran visualisasi & dashboard)
    sq_conn = get_sqlite_conn()
    result = None
    try:
        with sq_conn:
            cur = sq_conn.cursor()
            cur.execute(sql, params)
            if commit:
                result = cur.lastrowid if cur.lastrowid else cur.rowcount
            elif cur.description:
                rows = cur.fetchall()
                result = (dict(rows[0]) if rows else None) if one else [dict(r) for r in rows]
    finally:
        sq_conn.close()

    # 2. Jika operasi COMMIT (INSERT/UPDATE/DELETE), sinkronkan secara non-blocking ke Supabase!
    if commit:
        threading.Thread(target=_async_write_supabase, args=(sql, params), daemon=True).start()

    return result


def _async_write_supabase(sql: str, params=()):
    """Replikasi penulisan data ke Supabase di background tanpa memperlambat UI."""
    try:
        pg = get_persistent_pg()
        if pg:
            pg_sql = sql.replace("?", "%s")
            with pg.cursor() as cur:
                cur.execute(pg_sql, params)
    except Exception as e:
        print(f"[Supabase Sync Error]: {e}")


def test_supabase_connection():
    """Menguji koneksi ke Supabase PostgreSQL."""
    pg = get_persistent_pg()
    if pg:
        return {
            "ok": True,
            "connected": True,
            "type": "postgres",
            "message": "Berhasil terhubung ke Supabase PostgreSQL Cloud!",
            "host": "aws-1-ap-southeast-1.pooler.supabase.com"
        }
    return {
        "ok": False,
        "connected": False,
        "type": "sqlite",
        "message": "Gagal terhubung ke Supabase PostgreSQL. Menggunakan database lokal SQLite.",
        "host": "Local SQLite (studypulse.db)"
    }


def init_db_schema():
    """Inisialisasi tabel lokal SQLite dan Supabase PostgreSQL."""
    sq_conn = get_sqlite_conn()
    try:
        with sq_conn:
            sq_conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                nim TEXT DEFAULT '',
                major TEXT DEFAULT 'Teknik Informatika',
                faculty TEXT DEFAULT 'Vokasi',
                university TEXT DEFAULT 'Universitas Sumatera Utara',
                email TEXT DEFAULT '',
                avatar_data TEXT DEFAULT '',
                daily_target_hours REAL DEFAULT 2.0,
                weekly_target_hours REAL DEFAULT 16.0,
                theme TEXT DEFAULT 'coral',
                created_at TEXT NOT NULL
            );
            """)
            sq_conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 1,
                subject TEXT NOT NULL,
                topic TEXT DEFAULT '',
                start TEXT NOT NULL,
                minutes INTEGER NOT NULL,
                focus INTEGER NOT NULL,
                note TEXT DEFAULT '',
                created_at TEXT DEFAULT ''
            );
            """)
            sq_conn.execute("""
            CREATE TABLE IF NOT EXISTS schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 1,
                subject TEXT NOT NULL,
                day_of_week INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                color TEXT DEFAULT '#F29F67',
                note TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );
            """)
            sq_conn.execute("""
            CREATE TABLE IF NOT EXISTS materials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 1,
                title TEXT NOT NULL,
                stored_name TEXT NOT NULL UNIQUE,
                original_name TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            """)
            sq_conn.execute("""
            CREATE TABLE IF NOT EXISTS study_cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                material_id INTEGER NOT NULL,
                kind TEXT NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL
            );
            """)
    finally:
        sq_conn.close()

    # Inisialisasi skema di Supabase PostgreSQL secara background agar startup instan
    threading.Thread(target=_init_supabase_background, daemon=True).start()


def _init_supabase_background():
    """Inisialisasi tabel di Supabase di background dan sinkronkan data."""
    try:
        pg = get_persistent_pg()
        if not pg:
            return
        with pg.cursor() as cur:
            cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                nim VARCHAR(50) DEFAULT '',
                major VARCHAR(100) DEFAULT 'Teknik Informatika',
                faculty VARCHAR(100) DEFAULT 'Vokasi',
                university VARCHAR(150) DEFAULT 'Universitas Sumatera Utara',
                email VARCHAR(150) DEFAULT '',
                avatar_data TEXT DEFAULT '',
                daily_target_hours REAL DEFAULT 2.0,
                weekly_target_hours REAL DEFAULT 16.0,
                theme VARCHAR(50) DEFAULT 'coral',
                created_at VARCHAR(50) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                subject VARCHAR(150) NOT NULL,
                topic VARCHAR(255) DEFAULT '',
                start VARCHAR(50) NOT NULL,
                minutes INTEGER NOT NULL,
                focus INTEGER NOT NULL,
                note TEXT DEFAULT '',
                created_at VARCHAR(50) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS schedules (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                subject VARCHAR(150) NOT NULL,
                day_of_week INTEGER NOT NULL,
                start_time VARCHAR(10) NOT NULL,
                end_time VARCHAR(10) NOT NULL,
                color VARCHAR(30) DEFAULT '#F29F67',
                note TEXT DEFAULT '',
                created_at VARCHAR(50) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS materials (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) UNIQUE NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                size_bytes BIGINT NOT NULL,
                created_at VARCHAR(50) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS study_cards (
                id SERIAL PRIMARY KEY,
                material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
                kind VARCHAR(50) NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL
            );
            """)

        # Sinkronkan data dari Supabase jika ada data yang belum ada di lokal
        _sync_from_supabase(pg)
    except Exception as e:
        print(f"[Supabase Init Warning]: {e}")


def upsert_local_user(u: dict):
    """Menyimpan atau memperbarui data user dari Supabase ke SQLite lokal."""
    if not u or not u.get("id"):
        return
    sq_conn = get_sqlite_conn()
    try:
        with sq_conn:
            sq_conn.execute("""
            INSERT INTO users(id, username, password_hash, full_name, nim, major, faculty, university, email, avatar_data, daily_target_hours, weekly_target_hours, theme, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                username = excluded.username,
                password_hash = excluded.password_hash,
                full_name = excluded.full_name,
                nim = excluded.nim,
                major = excluded.major,
                faculty = excluded.faculty,
                university = excluded.university,
                email = excluded.email,
                avatar_data = excluded.avatar_data,
                daily_target_hours = excluded.daily_target_hours,
                weekly_target_hours = excluded.weekly_target_hours,
                theme = excluded.theme
            """, (
                u.get("id"),
                u.get("username"),
                u.get("password_hash"),
                u.get("full_name"),
                u.get("nim", ""),
                u.get("major", "Teknik Informatika"),
                u.get("faculty", "Vokasi"),
                u.get("university", "Universitas Sumatera Utara"),
                u.get("email", ""),
                u.get("avatar_data", ""),
                u.get("daily_target_hours", 2.0),
                u.get("weekly_target_hours", 16.0),
                u.get("theme", "coral"),
                u.get("created_at", datetime.now().isoformat())
            ))
    finally:
        sq_conn.close()


def _sync_from_supabase(pg_conn):
    """Sinkronkan data lengkap (users, sessions, schedules) dari Supabase ke SQLite lokal."""
    try:
        # 1. Sinkronkan Users
        with pg_conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM users ORDER BY id ASC")
            pg_users = cur.fetchall()
        if pg_users:
            for u in pg_users:
                upsert_local_user(dict(u))

        # 2. Sinkronkan Sessions
        with pg_conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM sessions ORDER BY id ASC")
            pg_sessions = cur.fetchall()
        if pg_sessions:
            sq_conn = get_sqlite_conn()
            try:
                with sq_conn:
                    for s in pg_sessions:
                        sq_conn.execute("""
                        INSERT INTO sessions(id, user_id, subject, topic, start, minutes, focus, note, created_at)
                        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            user_id = excluded.user_id,
                            subject = excluded.subject,
                            topic = excluded.topic,
                            start = excluded.start,
                            minutes = excluded.minutes,
                            focus = excluded.focus,
                            note = excluded.note
                        """, (s["id"], s.get("user_id", 1), s["subject"], s.get("topic", "Umum"), s["start"], s["minutes"], s["focus"], s.get("note", ""), s.get("created_at", "")))
            finally:
                sq_conn.close()

        # 3. Sinkronkan Schedules
        with pg_conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM schedules ORDER BY id ASC")
            pg_schedules = cur.fetchall()
        if pg_schedules:
            sq_conn = get_sqlite_conn()
            try:
                with sq_conn:
                    for sc in pg_schedules:
                        sq_conn.execute("""
                        INSERT INTO schedules(id, user_id, subject, day_of_week, start_time, end_time, color, note, created_at)
                        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            user_id = excluded.user_id,
                            subject = excluded.subject,
                            day_of_week = excluded.day_of_week,
                            start_time = excluded.start_time,
                            end_time = excluded.end_time,
                            color = excluded.color,
                            note = excluded.note
                        """, (sc["id"], sc.get("user_id", 1), sc["subject"], sc["day_of_week"], sc["start_time"], sc["end_time"], sc.get("color", "#F29F67"), sc.get("note", ""), sc.get("created_at", "")))
            finally:
                sq_conn.close()

        print("[Supabase Sync]: Berhasil sinkronisasi users, sessions, dan schedules dari Supabase ke lokal.")
    except Exception as e:
        print(f"[Sync from Supabase]: {e}")


def seed_initial_data():
    """Menyiapkan empat akun demo lokal beserta aktivitas dan jadwalnya."""
    sq_conn = get_sqlite_conn()
    now = datetime.now()
    now_iso = now.isoformat()
    roster = {
        "fathul": ("Fathul Khair", "241712073", "Teknik Informatika", "Vokasi", "fathulkhair@gmail.com"),
        "alvin": ("Alvin", "241712075", "Teknik Informatika", "Vokasi", "ya@gmail.com"),
        "jeremia": ("Jeremia Ignatius Hasibuan", "241712085", "Teknik Informatika", "Vokasi", "jeremiahasibuan554@gmail.com"),
        "rael": ("Rael Gilbert Manurung", "241712070", "Teknik Informatika", "Vokasi", "RaelGilbertManurung@gmail.com"),
    }
    try:
        with sq_conn:
            existing = sq_conn.execute("SELECT id, username FROM users ORDER BY id").fetchall()
            existing_usernames = {row["username"] for row in existing}

            # Cek apakah 4 akun sudah ada
            if existing_usernames == set(roster) and len(existing) == 4:
                # Update password jika belum menggunakan format baru
                for u in existing:
                    sq_conn.execute("UPDATE users SET faculty = 'Vokasi', major = 'Teknik Informatika' WHERE id = ?", (u["id"],))
                return

            # Reset tabel lokal
            sq_conn.execute("DELETE FROM study_cards")
            sq_conn.execute("DELETE FROM materials")
            sq_conn.execute("DELETE FROM schedules")
            sq_conn.execute("DELETE FROM sessions")
            sq_conn.execute("DELETE FROM users")
            sq_conn.execute("DELETE FROM sqlite_sequence WHERE name IN ('users', 'sessions', 'schedules', 'materials', 'study_cards')")

            pwd_hash = hash_password("Password123")
            for username, (name, nim, major, faculty, email) in roster.items():
                sq_conn.execute("""
                INSERT INTO users(username, password_hash, full_name, nim, major, faculty, university, email,
                                  avatar_data, daily_target_hours, weekly_target_hours, theme, created_at)
                VALUES(?, ?, ?, ?, ?, ?, 'Universitas Sumatera Utara', ?, '', 2.0, 16.0, 'coral', ?)
                """, (username, pwd_hash, name, nim, major, faculty, email, now_iso))

            user_ids = {row["username"]: row["id"] for row in sq_conn.execute("SELECT id, username FROM users")}

            schedules = {
                "fathul": [
                    ("Rekayasa Perangkat Lunak", 0, "09:00", "11:00", "#F29F67", "UML dan perancangan sistem"),
                    ("Praktikum E-Application", 2, "13:00", "15:00", "#34B1AA", "CRUD Python Eel"),
                    ("Sistem Informasi Geografis", 4, "16:00", "18:00", "#3B8FF3", "Georeferencing QGIS")
                ],
                "alvin": [
                    ("E-Application", 1, "09:00", "11:00", "#F29F67", "Pandas dan pengolahan data"),
                    ("Sistem Pendukung Keputusan", 3, "13:00", "15:00", "#E0B50F", "Metode SMART"),
                    ("Praktikum Pemrograman Visual", 5, "10:00", "12:00", "#34B1AA", "Windows Forms VB.NET")
                ],
                "jeremia": [
                    ("Praktikum Teknik Penulisan Karya Ilmiah", 0, "13:00", "15:00", "#34B1AA", "Daftar pustaka jurnal"),
                    ("Rekayasa Perangkat Lunak", 2, "09:00", "11:00", "#F29F67", "Activity diagram"),
                    ("Pemrograman Visual", 4, "15:00", "17:00", "#E0B50F", "Event handling VB.NET")
                ],
                "rael": [
                    ("Manajemen Proyek IT", 1, "09:00", "11:00", "#E0B50F", "Manajemen risiko proyek"),
                    ("E-Application", 3, "13:00", "15:00", "#F29F67", "Web scraping Python"),
                    ("Teknik Penulisan Karya Ilmiah", 5, "10:00", "12:00", "#3B8FF3", "Rumusan masalah penelitian")
                ],
            }
            for username, rows in schedules.items():
                for subject, day, start_time, end_time, color, note in rows:
                    sq_conn.execute("""
                    INSERT INTO schedules(user_id, subject, day_of_week, start_time, end_time, color, note, created_at)
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
                    """, (user_ids[username], subject, day, start_time, end_time, color, note, now_iso))
    finally:
        sq_conn.close()


def sync_local_db_with_supabase():
    """Menyelaraskan SQLite lokal dengan data dari Supabase saat ini."""
    pg = get_persistent_pg()
    if pg:
        _sync_from_supabase(pg)


def init_all():
    """Inisialisasi skema dan data awal."""
    init_db_schema()
    seed_initial_data()
