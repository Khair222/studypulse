"""Script pembuat file eksekusi (EXE) untuk StudyPulse menggunakan PyInstaller.
Menghasilkan StudyPulse.exe yang mandiri dan dapat dijalankan di Windows.
"""
import os
import sys
import subprocess
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
DATABASE_FILE = os.path.join(BASE_DIR, "studypulse.db")
DIST_DIR = os.path.join(BASE_DIR, "dist")
BUILD_DIR = os.path.join(BASE_DIR, "build")

def build():
    print("=" * 60)
    print("Memulai proses kompilasi StudyPulse.exe dengan PyInstaller...")
    print("=" * 60)

    # Pastikan direktori web ada
    if not os.path.exists(WEB_DIR):
        print(f"Error: Folder {WEB_DIR} tidak ditemukan!")
        sys.exit(1)

    cmd = [
        # Python 3.13 menyediakan distutils melalui setuptools saat diimpor lebih dulu.
        sys.executable, "-c", "import setuptools; import PyInstaller.__main__ as p; p.run()",
        "--name=StudyPulse",
        "--noconfirm",
        "--clean",
        "--onedir",  # onedir start up instan untuk aplikasi berbasis webview/eel
        f"--add-data={WEB_DIR};web",
        f"--add-data={DATABASE_FILE};.",
        "--hidden-import=bottle",
        "--hidden-import=bottle_websocket",
        "--hidden-import=gevent",
        "--hidden-import=gevent.ssl",
        "--hidden-import=gevent.builtins",
        "--hidden-import=sqlite3",
        "--hidden-import=psycopg2",
        "--hidden-import=psycopg2.extras",
        "main.py"
    ]

    print("Menjalankan perintah:")
    print(" ".join(cmd))
    print()

    proc = subprocess.run(cmd, cwd=BASE_DIR)
    if proc.returncode == 0:
        exe_path = os.path.join(DIST_DIR, "StudyPulse", "StudyPulse.exe")
        print("\n" + "=" * 60)
        print("KOMPILASI BERHASIL!")
        print(f"File eksekusi tersedia di: {exe_path}")
        print("=" * 60)
    else:
        print(f"\nKompilasi gagal dengan exit code: {proc.returncode}")
        sys.exit(proc.returncode)

if __name__ == "__main__":
    build()

