/**
 * StudyPulse - Modern Interactive Frontend Application
 * Fully integrated with the local SQLite backend.
 */

// Utility Selector
const $ = (id) => document.getElementById(id);
const esc = (text) => {
  if (text === null || text === undefined) return "";
  return String(text).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
};

const pad2 = (n) => String(n).padStart(2, "0");
const fmtDuration = (mins) => {
  mins = Math.round(Number(mins) || 0);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}j ${m}m` : `${h} jam`;
  }
  return `${mins} menit`;
};

// ================= MODERN IN-APP POPUP & TOAST NOTIFICATION SYSTEM =================
// Menggantikan alert(), confirm(), prompt() native peramban agar TIDAK ADA notifikasi "localhost:8088 says"
function showToast(message, type = "info", title = "", duration = 3800) {
  const container = $("toastContainer");
  if (!container) return;

  const typeConfig = {
    success: { icon: "✓", defaultTitle: "Berhasil" },
    error: { icon: "✕", defaultTitle: "Pemberitahuan" },
    warning: { icon: "⚠️", defaultTitle: "Peringatan" },
    info: { icon: "ℹ️", defaultTitle: "Informasi" }
  };

  const cfg = typeConfig[type] || typeConfig.info;
  const toastTitle = title || cfg.defaultTitle;

  const item = document.createElement("div");
  item.className = `toast-item toast-${type}`;
  item.innerHTML = `
    <div class="toast-icon">${cfg.icon}</div>
    <div class="toast-body">
      <div class="toast-title">${esc(toastTitle)}</div>
      <div class="toast-msg">${esc(message)}</div>
    </div>
    <button type="button" class="toast-btn-close" aria-label="Tutup">×</button>
  `;

  const closeToast = () => {
    if (item.classList.contains("toast-closing")) return;
    item.classList.add("toast-closing");
    setTimeout(() => {
      item.remove();
    }, 250);
  };

  item.querySelector(".toast-btn-close")?.addEventListener("click", closeToast);
  container.appendChild(item);

  if (duration > 0) {
    setTimeout(closeToast, duration);
  }
}

// In-App Confirm Dialog Modal (Menggantikan confirm("..."))
let _activeConfirmResolve = null;

function showConfirmModal(message, options = {}) {
  return new Promise((resolve) => {
    const modal = $("appPopupModal");
    const iconEl = $("appPopupIcon");
    const titleEl = $("appPopupTitle");
    const descEl = $("appPopupDesc");
    const inputWrap = $("appPopupInputWrap");
    const btnCancel = $("btnAppPopupCancel");
    const btnConfirm = $("btnAppPopupConfirm");

    if (!modal) {
      resolve(false);
      return;
    }

    if (inputWrap) inputWrap.style.display = "none";

    const title = options.title || "Konfirmasi Tindakan";
    const type = options.type || "warning"; // warning, danger, success, info
    const confirmText = options.confirmText || "Ya, Lanjutkan";
    const cancelText = options.cancelText || "Batal";

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = message;
    if (btnCancel) btnCancel.textContent = cancelText;
    if (btnConfirm) {
      btnConfirm.textContent = confirmText;
      btnConfirm.className = `btn ${type === "danger" ? "btn-danger" : "btn-primary"}`;
    }

    if (iconEl) {
      iconEl.className = `app-popup-icon-wrap ${type}`;
      iconEl.textContent = type === "danger" ? "🗑️" : (type === "success" ? "✓" : (type === "info" ? "ℹ️" : "⚠️"));
    }

    _activeConfirmResolve = resolve;
    modal.classList.add("show");

    const cleanup = (val) => {
      modal.classList.remove("show");
      btnConfirm?.removeEventListener("click", onConfirm);
      btnCancel?.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      window.removeEventListener("keydown", onKeydown);
      if (_activeConfirmResolve) {
        _activeConfirmResolve(val);
        _activeConfirmResolve = null;
      }
    };

    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => {
      if (e.target === modal) cleanup(false);
    };
    const onKeydown = (e) => {
      if (e.key === "Escape") cleanup(false);
    };

    btnConfirm?.addEventListener("click", onConfirm);
    btnCancel?.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    window.addEventListener("keydown", onKeydown);
  });
}

// In-App Prompt Dialog Modal (Menggantikan prompt("..."))
function showPromptModal(message, defaultValue = "", title = "Input Data", isPassword = false) {
  return new Promise((resolve) => {
    const modal = $("appPopupModal");
    const iconEl = $("appPopupIcon");
    const titleEl = $("appPopupTitle");
    const descEl = $("appPopupDesc");
    const inputWrap = $("appPopupInputWrap");
    const inputEl = $("appPopupInput");
    const btnCancel = $("btnAppPopupCancel");
    const btnConfirm = $("btnAppPopupConfirm");

    if (!modal || !inputEl || !inputWrap) {
      resolve(null);
      return;
    }

    inputWrap.style.display = "block";
    inputEl.type = isPassword ? "password" : "text";
    inputEl.value = defaultValue || "";

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = message;
    if (btnCancel) btnCancel.textContent = "Batal";
    if (btnConfirm) {
      btnConfirm.textContent = "Simpan";
      btnConfirm.className = "btn btn-primary";
    }

    if (iconEl) {
      iconEl.className = "app-popup-icon-wrap info";
      iconEl.textContent = isPassword ? "🔒" : "✏️";
    }

    modal.classList.add("show");
    setTimeout(() => inputEl.focus(), 80);

    const cleanup = (val) => {
      modal.classList.remove("show");
      inputWrap.style.display = "none";
      btnConfirm?.removeEventListener("click", onConfirm);
      btnCancel?.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      window.removeEventListener("keydown", onKeydown);
      inputEl.removeEventListener("keydown", onInputKey);
      resolve(val);
    };

    const onConfirm = () => cleanup(inputEl.value);
    const onCancel = () => cleanup(null);
    const onBackdrop = (e) => {
      if (e.target === modal) cleanup(null);
    };
    const onKeydown = (e) => {
      if (e.key === "Escape") cleanup(null);
    };
    const onInputKey = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        cleanup(inputEl.value);
      }
    };

    btnConfirm?.addEventListener("click", onConfirm);
    btnCancel?.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    window.addEventListener("keydown", onKeydown);
    inputEl.addEventListener("keydown", onInputKey);
  });
}

// Global Override agar setiap alert() otomatis menjadi Popup Toast
window.alert = function (message) {
  const str = String(message ?? "");
  const isErr = /gagal|error|salah|kesalahan/i.test(str);
  const isSuccess = /berhasil|sukses/i.test(str);
  const isWarn = /peringatan|minimal|harus|tidak boleh/i.test(str);
  const type = isErr ? "error" : (isSuccess ? "success" : (isWarn ? "warning" : "info"));
  showToast(str, type);
};

// Global App State
const AppState = {
  currentUser: null,
  activePage: "dashboard",
  timer: {
    mode: "pomodoro",
    interval: null,
    totalSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    isRunning: false,
    focus: 4
  },
  activity: {
    page: 1,
    limit: 10,
    search: "",
    subject: "Semua Mata Pelajaran"
  },
  analytics: {
    period: "7d",
    subject: "Semua Mata Pelajaran"
  },
  reports: {
    period: "weekly"
  },
  charts: {}
};

// Titles & Subtitles for Each Page View
const PageHeaders = {
  dashboard: { title: "Dashboard", subtitle: "Ringkasan aktivitas dan produktivitas belajarmu." },
  timer: { title: "Study Timer", subtitle: "Atur waktu fokusmu, catat tujuan belajarmu." },
  activity: { title: "Study Activity", subtitle: "Kelola semua aktivitas belajarmu." },
  analytics: { title: "Study Analytics", subtitle: "Analisis kebiasaan dan produktivitas belajarmu." },
  planner: { title: "Study Planner", subtitle: "Rencanakan jadwal belajarmu dengan lebih terstruktur." },
  recommendation: { title: "Recommendation", subtitle: "Rekomendasi berdasarkan pola belajar dan analisis data." },
  reports: { title: "Reports", subtitle: "Laporan lengkap aktivitas belajarmu." },
  leaderboard: { title: "Leaderboard", subtitle: "Papan peringkat durasi belajar mahasiswa terverifikasi." },
  materials: { title: "Materi & Kuis", subtitle: "Unggah dokumen dan buat latihan otomatis." },
  profile: { title: "Profile", subtitle: "Kelola data profil dan pengaturan akunmu." }
};

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  setupAuthScreenEvents();
  setupNavEvents();
  setupModalEvents();
  setupTimerEvents();
  setupActivityEvents();
  setupAnalyticsEvents();
  setupPlannerEvents();
  setupProfileEvents();
  setupCsvEvents();
  setupSettingsEvents();
  updatePlannerDateUI();

  // Handle Startup & Keep Me Logged In
  await handleStartupAuthFlow();
});

// ================= SPLASH & AUTHENTICATION FLOW =================
function showSplash(statusText = "Menyiapkan ruang belajarmu...") {
  const splash = $("splashLoadingScreen");
  const bar = $("splashProgressBar");
  const status = $("splashStatusText");
  if (!splash) return;

  status.textContent = statusText;
  bar.style.width = "0%";
  splash.classList.remove("fade-out");
  splash.style.display = "flex";

  // Animate progress bar
  setTimeout(() => { bar.style.width = "65%"; }, 100);
}

function hideSplash(callback) {
  const splash = $("splashLoadingScreen");
  const bar = $("splashProgressBar");
  if (!splash) {
    if (callback) callback();
    return;
  }
  bar.style.width = "100%";
  setTimeout(() => {
    splash.classList.add("fade-out");
    setTimeout(() => {
      splash.style.display = "none";
      if (callback) callback();
    }, 350);
  }, 250);
}

async function handleStartupAuthFlow() {
  // Hapus key lama agar sesi lama tidak auto-login tidak sengaja
  localStorage.removeItem("studypulse_keep_login");
  localStorage.removeItem("studypulse_saved_user");

  const rememberMe = localStorage.getItem("studypulse_remember_v2") === "true";
  const savedUserJson = localStorage.getItem("studypulse_saved_user_v2");

  if (rememberMe && savedUserJson) {
    try {
      showSplash("Selamat datang kembali! Menyiapkan dashboard...");
      await loadCurrentUser();
      await checkDatabaseStatus();

      hideSplash(() => {
        $("authScreenView").style.display = "none";
        $("appRootLayout").style.display = "flex";
        showPage("dashboard");
      });
      return;
    } catch (err) {
      console.warn("Auto login fallback:", err);
    }
  }

  // Pengaturan utama: SELALU ke halaman Login
  if ($("splashLoadingScreen")) $("splashLoadingScreen").style.display = "none";
  $("appRootLayout").style.display = "none";
  $("authScreenView").style.display = "flex";
  if ($("screenLoginCred")) $("screenLoginCred").value = "";
  if ($("screenLoginPwd")) $("screenLoginPwd").value = "";
  if ($("screenKeepMeLoggedIn")) $("screenKeepMeLoggedIn").checked = false;
  if ($("screenLoginMsg")) {
    $("screenLoginMsg").textContent = "";
    $("screenLoginMsg").className = "form-feedback-msg";
  }
}

function setupAuthScreenEvents() {
  // Tab Switcher on Screen
  $("tabMainLogin")?.addEventListener("click", () => {
    $("tabMainLogin").classList.add("active");
    $("tabMainRegister").classList.remove("active");
    $("formScreenLogin").style.display = "flex";
    $("formScreenRegister").style.display = "none";
  });

  $("tabMainRegister")?.addEventListener("click", () => {
    $("tabMainRegister").classList.add("active");
    $("tabMainLogin").classList.remove("active");
    $("formScreenLogin").style.display = "none";
    $("formScreenRegister").style.display = "flex";
  });

  // Password Visibility Toggle
  $("btnToggleScreenPwd")?.addEventListener("click", () => {
    const input = $("screenLoginPwd");
    input.type = input.type === "password" ? "text" : "password";
  });

  // Screen Login Form Submit
  $("formScreenLogin")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cred = $("screenLoginCred").value.trim();
    const pwd = $("screenLoginPwd").value.trim();
    const keepLogin = $("screenKeepMeLoggedIn").checked;
    const msg = $("screenLoginMsg");
    const btn = $("btnSubmitLogin");

    btn.disabled = true;
    msg.textContent = "Memverifikasi akun...";
    msg.className = "form-feedback-msg";

    try {
      const res = await eel.login(cred, pwd)();
      if (!res.ok) {
        msg.textContent = res.error;
        msg.className = "form-feedback-msg error";
        btn.disabled = false;
        return;
      }

      // Handle "Keep Me Logged In"
      if (keepLogin) {
        localStorage.setItem("studypulse_remember_v2", "true");
        localStorage.setItem("studypulse_saved_user_v2", JSON.stringify(res.user));
      } else {
        localStorage.removeItem("studypulse_remember_v2");
        localStorage.removeItem("studypulse_saved_user_v2");
      }

      msg.textContent = "Login berhasil! Membuka dashboard...";
      msg.className = "form-feedback-msg success";

      showSplash("Memuat ruang belajar...");
      await loadCurrentUser();
      await checkDatabaseStatus();

      setTimeout(() => {
        hideSplash(() => {
          $("authScreenView").style.display = "none";
          $("appRootLayout").style.display = "flex";
          btn.disabled = false;
          showPage("dashboard");
        });
      }, 500);
    } catch (err) {
      msg.textContent = `Kesalahan: ${err.message || err}`;
      msg.className = "form-feedback-msg error";
      btn.disabled = false;
    }
  });

  // Screen Register Form Submit
  $("formScreenRegister")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fullName = $("screenRegFullName").value.trim();
    const username = $("screenRegUsername").value.trim();
    const nim = $("screenRegNim").value.trim();
    const email = $("screenRegEmail").value.trim();
    const password = $("screenRegPassword").value.trim();
    const msg = $("screenRegMsg");
    const btn = $("btnSubmitRegister");

    // Validasi tingkat lanjut password: min 8 karakter, huruf besar, huruf kecil, dan angka
    if (password.length < 8) {
      msg.textContent = "Kata sandi minimal 8 karakter.";
      msg.className = "form-feedback-msg error";
      return;
    }
    if (!/[A-Z]/.test(password)) {
      msg.textContent = "Kata sandi harus mengandung minimal satu huruf besar (A-Z).";
      msg.className = "form-feedback-msg error";
      return;
    }
    if (!/[a-z]/.test(password)) {
      msg.textContent = "Kata sandi harus mengandung minimal satu huruf kecil (a-z).";
      msg.className = "form-feedback-msg error";
      return;
    }
    if (!/[0-9]/.test(password)) {
      msg.textContent = "Kata sandi harus mengandung minimal satu angka (0-9).";
      msg.className = "form-feedback-msg error";
      return;
    }

    btn.disabled = true;
    msg.textContent = "Mendaftarkan akun ke Supabase Cloud...";
    msg.className = "form-feedback-msg";

    try {
      const res = await eel.register(username, fullName, nim, email, password)();
      if (!res.ok) {
        msg.textContent = res.error;
        msg.className = "form-feedback-msg error";
        btn.disabled = false;
        return;
      }

      localStorage.removeItem("studypulse_remember_v2");
      localStorage.removeItem("studypulse_saved_user_v2");
      localStorage.removeItem("studypulse_keep_login");
      localStorage.removeItem("studypulse_saved_user");

      msg.textContent = "Pendaftaran berhasil!";
      msg.className = "form-feedback-msg success";

      showSplash("Menyiapkan akun barumu...");
      await loadCurrentUser();
      await checkDatabaseStatus();

      setTimeout(() => {
        hideSplash(() => {
          $("authScreenView").style.display = "none";
          $("appRootLayout").style.display = "flex";
          btn.disabled = false;
          showPage("dashboard");
        });
      }, 500);
    } catch (err) {
      msg.textContent = `Gagal daftar: ${err.message || err}`;
      msg.className = "form-feedback-msg error";
      btn.disabled = false;
    }
  });
}

// ================= THEME MANAGEMENT =================
function initTheme() {
  const savedTheme = localStorage.getItem("studypulse_theme") || "coral";
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    if ($("switchDarkMode")) $("switchDarkMode").checked = true;
  }
}

function toggleDarkMode(isDark) {
  if (isDark) {
    document.body.classList.add("dark-mode");
    localStorage.setItem("studypulse_theme", "dark");
  } else {
    document.body.classList.remove("dark-mode");
    localStorage.setItem("studypulse_theme", "coral");
  }
  if (AppState.activePage === "dashboard") renderDashboard();
  if (AppState.activePage === "analytics") renderAnalytics();
}

// ================= NAVIGATION =================
function setupNavEvents() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      showPage(btn.dataset.page);
    });
  });

  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showPage(btn.dataset.goto);
    });
  });

  $("btnTopbarProfile")?.addEventListener("click", () => showPage("profile"));
}

async function showPage(pageId) {
  if (!PageHeaders[pageId]) return;
  AppState.activePage = pageId;

  $("pageTitle").textContent = PageHeaders[pageId].title;
  $("pageSubtitle").textContent = PageHeaders[pageId].subtitle;

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === pageId);
  });

  document.querySelectorAll(".page-view").forEach((view) => {
    view.classList.toggle("active", view.id === `page-${pageId}`);
  });

  switch (pageId) {
    case "dashboard":
      await renderDashboard();
      break;
    case "timer":
      await renderTimerPage();
      break;
    case "activity":
      await renderActivityTable();
      break;
    case "analytics":
      await renderAnalytics();
      break;
    case "planner":
      await renderPlanner();
      break;
    case "recommendation":
      await renderRecommendation();
      break;
    case "reports":
      await renderReports();
      break;
    case "leaderboard":
      await renderLeaderboard();
      break;
    case "materials":
      await renderMaterials();
      break;
    case "profile":
      await fillProfileForm();
      break;
  }
}

// ================= CURRENT USER & AUTH =================
async function loadCurrentUser() {
  try {
    const user = await eel.get_current_user()();
    if (user) {
      AppState.currentUser = user;
      updateUserUI(user);
    }
  } catch (err) {
    console.warn("Gagal memuat profil:", err);
  }
}

function updateUserUI(user) {
  $("sidebarUserName").textContent = user.full_name || "Mahasiswa";
  $("sidebarUserNim").textContent = user.nim ? `NIM ${user.nim}` : "StudyPulse";

  if (user.avatar_data) {
    $("sidebarAvatarImg").src = user.avatar_data;
    $("sidebarAvatarImg").style.display = "block";
    $("sidebarAvatarFallback").style.display = "none";

    $("topbarAvatarImg").src = user.avatar_data;
    $("topbarAvatarImg").style.display = "block";
    $("topbarAvatarFallback").style.display = "none";
  } else {
    const initial = (user.full_name || "?").charAt(0).toUpperCase();
    $("sidebarAvatarImg").style.display = "none";
    $("sidebarAvatarFallback").textContent = initial;
    $("sidebarAvatarFallback").style.display = "grid";

    $("topbarAvatarImg").style.display = "none";
    $("topbarAvatarFallback").textContent = initial;
    $("topbarAvatarFallback").style.display = "grid";
  }
}

function setupModalEvents() {
  // Logout Buttons
  const handleLogout = async () => {
    const ok = await showConfirmModal("Apakah kamu yakin ingin keluar dari akun?", {
      title: "Konfirmasi Logout",
      confirmText: "Ya, Keluar",
      type: "warning"
    });
    if (ok) {
      await eel.logout()();
      localStorage.removeItem("studypulse_remember_v2");
      localStorage.removeItem("studypulse_saved_user_v2");
      localStorage.removeItem("studypulse_keep_login");
      localStorage.removeItem("studypulse_saved_user");
      $("appRootLayout").style.display = "none";
      $("authScreenView").style.display = "flex";
      $("screenLoginCred").value = "";
      $("screenLoginPwd").value = "";
      $("screenKeepMeLoggedIn").checked = false;
      showToast("Kamu telah keluar dari akun.", "info");
    }
  };
  $("btnLogout")?.addEventListener("click", handleLogout);
  $("btnProfileLogout")?.addEventListener("click", handleLogout);
}

// ================= DATABASE STATUS & RECONNECT =================
async function checkDatabaseStatus() {
  try {
    const status = await eel.get_db_status()();
    const pill = $("dbStatusPill");
    const label = $("dbStatusLabel");
    const dot = pill?.querySelector(".status-dot");

    if (status.type === "postgres" && status.connected) {
      label.textContent = "Supabase Cloud (Aktif)";
      if (dot) dot.className = "status-dot";
      pill.title = "Terhubung ke Supabase PostgreSQL Cloud";
    } else {
      label.textContent = "Database Lokal (SQLite)";
      if (dot) dot.className = "status-dot offline";
      pill.title = status.message || "Mode Offline / SQLite";
    }

    if ($("settingsDbInfoText")) {
      $("settingsDbInfoText").textContent = `${status.type.toUpperCase()}: ${status.host || status.message}`;
    }
  } catch (err) {
    console.warn("DB check error:", err);
  }
}

// ================= PAGE 1: DASHBOARD =================
async function renderDashboard() {
  try {
    const data = await eel.get_dashboard_summary()();
    if (!data) return;

    $("dateRangeText").textContent = data.date_range_label || "Minggu ini";
    $("dashTotalHours").textContent = `${String(data.total_hours).replace(".", ",")} jam`;
    $("dashTrendPct").textContent = `${data.pct_change >= 0 ? "↑ +" : "↓ "}${data.pct_change}% dari minggu lalu`;
    $("dashTotalSessions").textContent = `${data.session_count} sesi`;
    $("dashDiffSessions").textContent = `${data.diff_count >= 0 ? "↑ +" : "↓ "}${data.diff_count} sesi`;
    $("dashTargetPct").textContent = `${data.target_pct}%`;
    $("dashTargetFraction").textContent = `(${String(data.total_hours).replace(".", ",")} / ${data.weekly_target_hours} jam)`;
    $("dashTopSubject").textContent = data.top_subject || "Pemrograman";
    $("dashTopSubjectHours").textContent = `(${String(data.top_subject_hours).replace(".", ",")} jam)`;

    // Render Recent Sessions List
    renderRecentSessions(data.recent_sessions);

    // Rekomendasi Box & Status Summary
    if ($("dashStatusValue")) {
      const focusMins = data.status_summary_value || Math.round((data.total_hours || 0) * 60) || 357;
      $("dashStatusValue").textContent = String(focusMins);
    }
    if ($("dashStatusTrend")) {
      $("dashStatusTrend").textContent = `${data.pct_change >= 0 ? "+" : ""}${data.pct_change}% vs lalu`;
    }

    if (data.recommendations) {
      $("dashBestTimeRange").textContent = data.recommendations.best_time_range || "19.00 - 21.00";
      $("dashAvgDurText").textContent = `${String(data.recommendations.avg_session_hours).replace(".", ",")} jam`;
      $("dashProdDayText").textContent = data.recommendations.most_productive_day || "Sabtu";
    }

    // Berikan sedikit jeda agar DOM layout canvas telah memiliki dimensi lebar dan tinggi yang tepat
    setTimeout(() => {
      renderDailyChart(data.daily_chart);
      renderSubjectDonut(data.prop_chart, data.total_hours);
    }, 60);

  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

function renderDailyChart(dailyData) {
  const ctx = $("chartDailyDuration");
  if (!ctx || !window.Chart) return;

  if (AppState.charts.daily) {
    AppState.charts.daily.destroy();
  }

  // Fallback data jika belum ada sesi
  if (!dailyData || dailyData.length === 0) {
    dailyData = [
      { day: "Sen", hours: 2.0 }, { day: "Sel", hours: 1.5 }, { day: "Rab", hours: 2.0 },
      { day: "Kam", hours: 1.0 }, { day: "Jum", hours: 2.5 }, { day: "Sab", hours: 2.0 },
      { day: "Min", hours: 3.5 }
    ];
  }

  const isDark = document.body.classList.contains("dark-mode");
  const textColor = isDark ? "#c1c0dc" : "#71748d";
  const gridColor = isDark ? "#282548" : "#f0f1f8";

  const labels = dailyData.map((d) => d.day);
  const values = dailyData.map((d) => d.hours);

  AppState.charts.daily = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Jam Belajar",
        data: values,
        backgroundColor: "#F29F67",
        hoverBackgroundColor: "#E08C52",
        borderRadius: 8,
        borderSkipped: false,
        barThickness: 28
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1E1E2C",
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => `${String(ctx.raw).replace(".", ",")} jam belajar`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { weight: "600", size: 11 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, stepSize: 1, callback: (v) => `${v}j` },
          beginAtZero: true
        }
      }
    }
  });

  AppState.charts.daily.resize();
}

function renderSubjectDonut(propData, totalHours) {
  const ctx = $("chartSubjectDonut");
  if (!ctx || !window.Chart) return;

  if (AppState.charts.donut) {
    AppState.charts.donut.destroy();
  }

  const isDark = document.body.classList.contains("dark-mode");
  const legendWrap = $("donutLegendList");

  // Jika akun baru atau belum ada sesi belajar yang tercatat
  if (!propData || propData.length === 0 || !totalHours || totalHours <= 0) {
    $("donutCenterHours").textContent = "0,0 jam";

    AppState.charts.donut = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Belum Ada Sesi"],
        datasets: [{
          data: [1],
          backgroundColor: [isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(100, 100, 140, 0.12)"],
          borderWidth: 0,
          hoverOffset: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "75%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#110f26",
            callbacks: {
              label: () => "Belum ada data aktivitas sesi belajar"
            }
          }
        }
      }
    });

    if (legendWrap) {
      legendWrap.innerHTML = `
        <div style="text-align: center; padding: 18px 10px; color: var(--text-muted); font-size: 13px;">
          <p style="font-weight: 700; margin-bottom: 4px; color: var(--text-main);">Belum Ada Sesi Belajar</p>
          <small>Mulai timer belajar atau catat aktivitas sesi pertamamu untuk melihat proporsi waktu!</small>
        </div>
      `;
    }
    AppState.charts.donut.resize();
    return;
  }

  // Jika data sesi ada, tampilkan proporsi aktual mata kuliah pengguna
  $("donutCenterHours").textContent = `${String(totalHours).replace(".", ",")} jam`;

  const labels = propData.map((p) => p.subject);
  const values = propData.map((p) => p.minutes);
  const colors = propData.map((p) => p.color);

  AppState.charts.donut = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "75%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#110f26",
          callbacks: {
            label: (c) => `${c.label}: ${fmtDuration(c.raw)}`
          }
        }
      }
    }
  });

  // Render Custom HTML Legend
  if (legendWrap) {
    legendWrap.innerHTML = propData.map((item) => `
      <div class="donut-legend-item">
        <div class="donut-legend-left">
          <span class="legend-color-dot" style="background-color: ${item.color};"></span>
          <span>${esc(item.subject)}</span>
        </div>
        <span class="donut-legend-val">${String(item.hours).replace(".", ",")}j (${item.percentage}%)</span>
      </div>
    `).join("");
  }

  AppState.charts.donut.resize();
}

function renderRecentSessions(sessions) {
  const listWrap = $("dashRecentSessionsList");
  if (!listWrap) return;

  if (!sessions || sessions.length === 0) {
    listWrap.innerHTML = `<p class="empty-hint" style="padding: 20px; text-align: center; color: var(--text-muted);">Belum ada sesi belajar.</p>`;
    return;
  }

  listWrap.innerHTML = sessions.map((s) => {
    let dateStr = "";
    try {
      const dt = new Date(s.start);
      dateStr = dt.toLocaleDateString("id-ID", { day: "numeric", month: "short" }) + `, ${pad2(dt.getHours())}.${pad2(dt.getMinutes())}`;
    } catch (_) {
      dateStr = s.start;
    }
    const charIcon = (s.subject || "P").charAt(0).toUpperCase();

    return `
      <div class="recent-session-item">
        <div class="recent-session-left">
          <div class="subj-icon-box">${charIcon}</div>
          <div class="recent-session-info">
            <strong>${esc(s.subject)}</strong>
            <small>${esc(s.topic || "Umum")} · ${dateStr}</small>
          </div>
        </div>
        <div class="duration-pill">${fmtDuration(s.minutes)}</div>
      </div>
    `;
  }).join("");
}

// ================= PAGE 2: STUDY TIMER =================
function setupTimerEvents() {
  $("tabPomodoro")?.addEventListener("click", () => {
    $("tabPomodoro").classList.add("active");
    $("tabStopwatch").classList.remove("active");
    AppState.timer.mode = "pomodoro";
    resetTimerDisplay();
  });

  $("tabStopwatch")?.addEventListener("click", () => {
    $("tabStopwatch").classList.add("active");
    $("tabPomodoro").classList.remove("active");
    AppState.timer.mode = "stopwatch";
    resetTimerDisplay();
  });

  $("btnTimerStart")?.addEventListener("click", startTimer);
  $("btnTimerPause")?.addEventListener("click", pauseTimer);
  $("btnTimerReset")?.addEventListener("click", resetTimer);

  document.querySelectorAll("#timerFocusRating .star-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = parseInt(btn.dataset.val, 10);
      AppState.timer.focus = val;
      updateStarRating("timerFocusRating", val);
    });
  });

  $("timerDurationMinutes")?.addEventListener("change", (e) => {
    if (AppState.timer.mode === "pomodoro" && !AppState.timer.isRunning) {
      const mins = parseInt(e.target.value, 10);
      AppState.timer.totalSeconds = mins * 60;
      AppState.timer.remainingSeconds = mins * 60;
      updateTimerClockText();
    }
  });

  $("timerSessionForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const subject = $("timerSubject").value.trim();
    const topic = $("timerTopic").value.trim();
    const minutes = $("timerDurationMinutes").value;
    const notes = $("timerNotes").value.trim();
    const focus = AppState.timer.focus;
    const msg = $("timerFormMsg");

    msg.textContent = "Menyimpan ke database...";
    msg.className = "form-feedback-msg";

    const startTime = new Date().toISOString().substring(0, 16);

    try {
      const res = await eel.add_session(subject, topic, startTime, minutes, focus, notes)();
      if (!res.ok) {
        msg.textContent = res.error;
        msg.className = "form-feedback-msg error";
        return;
      }
      msg.textContent = "Sesi belajar berhasil disimpan!";
      msg.className = "form-feedback-msg success";

      $("timerTopic").value = "";
      $("timerNotes").value = "";
      resetTimer();
      await renderTimerPage();
    } catch (err) {
      msg.textContent = `Gagal menyimpan: ${err.message || err}`;
      msg.className = "form-feedback-msg error";
    }
  });
}

function updateStarRating(containerId, activeValue) {
  document.querySelectorAll(`#${containerId} .star-btn`).forEach((btn) => {
    const val = parseInt(btn.dataset.val, 10);
    btn.classList.toggle("active", val <= activeValue);
  });
}

function startTimer() {
  if (AppState.timer.isRunning) return;
  AppState.timer.isRunning = true;
  $("btnTimerStart").disabled = true;
  $("btnTimerPause").disabled = false;

  AppState.timer.interval = setInterval(() => {
    if (AppState.timer.mode === "pomodoro") {
      AppState.timer.remainingSeconds--;
      if (AppState.timer.remainingSeconds <= 0) {
        clearInterval(AppState.timer.interval);
        AppState.timer.isRunning = false;
        showToast("Waktu Pomodoro selesai! Kerja hebat. Jangan lupa simpan catatan sesimu.", "success", "Pomodoro Selesai ⏱", 6000);
      }
    } else {
      AppState.timer.remainingSeconds++;
    }
    updateTimerClockText();
    updateRingProgress();
  }, 1000);
}

function pauseTimer() {
  AppState.timer.isRunning = false;
  clearInterval(AppState.timer.interval);
  $("btnTimerStart").disabled = false;
  $("btnTimerPause").disabled = true;
}

function resetTimer() {
  pauseTimer();
  resetTimerDisplay();
}

function resetTimerDisplay() {
  if (AppState.timer.mode === "pomodoro") {
    const mins = parseInt($("timerDurationMinutes")?.value || "25", 10);
    AppState.timer.totalSeconds = mins * 60;
    AppState.timer.remainingSeconds = mins * 60;
  } else {
    AppState.timer.totalSeconds = 60 * 60;
    AppState.timer.remainingSeconds = 0;
  }
  updateTimerClockText();
  updateRingProgress();
}

function updateTimerClockText() {
  const s = AppState.timer.remainingSeconds;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  $("timerClockDisplay").textContent = `${pad2(m)}:${pad2(sec)}`;
}

function updateRingProgress() {
  const ring = $("timerRingProgress");
  if (!ring) return;
  const circumference = 2 * Math.PI * 120;
  let progress = 0;

  if (AppState.timer.mode === "pomodoro") {
    progress = 1 - (AppState.timer.remainingSeconds / AppState.timer.totalSeconds);
  } else {
    progress = (AppState.timer.remainingSeconds % 3600) / 3600;
  }
  const offset = circumference * (1 - progress);
  ring.style.strokeDashoffset = offset;
}

async function renderTimerPage() {
  try {
    const todayStr = new Date().toISOString().substring(0, 10);
    const res = await eel.get_sessions(20, null, null, 1)();
    const tbody = $("timerTodayTableBody");
    if (!tbody) return;

    const todaySessions = (res.sessions || []).filter((s) => s.start.startsWith(todayStr));

    if (todaySessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">Belum ada sesi belajar hari ini. Mulai timer dan simpan sesimu!</td></tr>`;
      return;
    }

    tbody.innerHTML = todaySessions.map((s) => {
      let timeStr = "";
      try {
        const dt = new Date(s.start);
        timeStr = `${pad2(dt.getHours())}.${pad2(dt.getMinutes())}`;
      } catch (_) {
        timeStr = s.start;
      }
      return `
        <tr>
          <td><strong>${esc(s.subject)}</strong></td>
          <td>${esc(s.topic || "Umum")}</td>
          <td>${fmtDuration(s.minutes)}</td>
          <td><span class="focus-pill-badge">★ ${s.focus}/5</span></td>
          <td>${timeStr}</td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Timer page error:", err);
  }
}

// ================= PAGE 3: STUDY ACTIVITY (CRUD & SEARCH) =================
function setupActivityEvents() {
  $("activitySearchInput")?.addEventListener("input", (e) => {
    AppState.activity.search = e.target.value;
    AppState.activity.page = 1;
    renderActivityTable();
  });

  $("activitySubjectFilter")?.addEventListener("change", (e) => {
    AppState.activity.subject = e.target.value;
    AppState.activity.page = 1;
    renderActivityTable();
  });

  $("btnOpenAddActivity")?.addEventListener("click", () => {
    $("activityModalTitle").textContent = "Tambah Aktivitas Belajar";
    $("crudSessionId").value = "";
    $("crudSubject").value = "";
    $("crudTopic").value = "";
    $("crudMinutes").value = "45";
    $("crudStart").value = new Date().toISOString().substring(0, 16);
    $("crudNote").value = "";
    updateStarRating("crudFocusRating", 4);
    $("crudFeedbackMsg").textContent = "";
    $("modalActivityCrud").classList.add("show");
  });

  $("btnCloseActivityModal")?.addEventListener("click", () => $("modalActivityCrud").classList.remove("show"));
  $("btnCancelActivityModal")?.addEventListener("click", () => $("modalActivityCrud").classList.remove("show"));

  document.querySelectorAll("#crudFocusRating .star-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = parseInt(btn.dataset.val, 10);
      btn.closest("#crudFocusRating").dataset.val = val;
      updateStarRating("crudFocusRating", val);
    });
  });

  $("formActivityCrud")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sid = $("crudSessionId").value;
    const subject = $("crudSubject").value.trim();
    const topic = $("crudTopic").value.trim();
    const minutes = $("crudMinutes").value;
    const start = $("crudStart").value;
    const note = $("crudNote").value.trim();
    const focus = $("crudFocusRating").dataset.val || "4";
    const msg = $("crudFeedbackMsg");

    msg.textContent = "Menyimpan perubahan...";
    msg.className = "form-feedback-msg";

    try {
      let res;
      if (sid) {
        res = await eel.update_session(sid, subject, topic, start, minutes, focus, note)();
      } else {
        res = await eel.add_session(subject, topic, start, minutes, focus, note)();
      }

      if (!res.ok) {
        msg.textContent = res.error;
        msg.className = "form-feedback-msg error";
        return;
      }

      $("modalActivityCrud").classList.remove("show");
      await renderActivityTable();
    } catch (err) {
      msg.textContent = `Kesalahan: ${err.message || err}`;
      msg.className = "form-feedback-msg error";
    }
  });

  $("btnExportCsv")?.addEventListener("click", exportCsvFile);
  $("btnReportExportCsv")?.addEventListener("click", exportCsvFile);
}

async function renderActivityTable() {
  try {
    const res = await eel.get_sessions(
      AppState.activity.limit,
      AppState.activity.subject,
      AppState.activity.search,
      AppState.activity.page
    )();

    const tbody = $("activityTableBody");
    const countInfo = $("activityPaginationInfo");
    const pagination = $("activityPaginationBtns");

    if (!tbody) return;

    countInfo.textContent = `Menampilkan ${res.sessions.length} dari ${res.total} aktivitas`;

    if (res.sessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">Tidak ada data aktivitas yang sesuai kriteria pencarian.</td></tr>`;
      pagination.innerHTML = "";
      return;
    }

    const startNum = (res.page - 1) * res.limit + 1;

    tbody.innerHTML = res.sessions.map((s, idx) => {
      let dateFormatted = "";
      try {
        const dt = new Date(s.start);
        dateFormatted = dt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
      } catch (_) {
        dateFormatted = s.start;
      }

      return `
        <tr>
          <td><strong>${startNum + idx}</strong></td>
          <td><strong>${esc(s.subject)}</strong></td>
          <td>${esc(s.topic || "Umum")}</td>
          <td>${fmtDuration(s.minutes)}</td>
          <td><span class="focus-pill-badge">${s.focus}/5</span></td>
          <td>${dateFormatted}</td>
          <td>
            <div class="action-btns-group">
              <button class="table-icon-btn btn-edit-session" data-id="${s.id}" title="Edit Aktivitas">✏️</button>
              <button class="table-icon-btn danger btn-del-session" data-id="${s.id}" title="Hapus Aktivitas">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    document.querySelectorAll(".btn-edit-session").forEach((btn) => {
      btn.addEventListener("click", () => openEditSessionModal(btn.dataset.id));
    });

    document.querySelectorAll(".btn-del-session").forEach((btn) => {
      btn.addEventListener("click", () => deleteSession(btn.dataset.id));
    });

    let btnsHtml = "";
    for (let p = 1; p <= res.pages; p++) {
      btnsHtml += `<button class="page-num-btn ${p === res.page ? "active" : ""}" data-p="${p}">${p}</button>`;
    }
    pagination.innerHTML = btnsHtml;

    pagination.querySelectorAll(".page-num-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        AppState.activity.page = parseInt(btn.dataset.p, 10);
        renderActivityTable();
      });
    });

    populateSubjectFilters();
  } catch (err) {
    console.error("Render activity table error:", err);
  }
}

async function openEditSessionModal(sessionId) {
  try {
    const res = await eel.get_sessions(100, null, null, 1)();
    const session = res.sessions.find((s) => String(s.id) === String(sessionId));
    if (!session) return;

    $("activityModalTitle").textContent = "Edit Aktivitas Belajar";
    $("crudSessionId").value = session.id;
    $("crudSubject").value = session.subject;
    $("crudTopic").value = session.topic;
    $("crudMinutes").value = session.minutes;
    $("crudStart").value = session.start;
    $("crudNote").value = session.note || "";
    $("crudFocusRating").dataset.val = session.focus;
    updateStarRating("crudFocusRating", session.focus);

    $("crudFeedbackMsg").textContent = "";
    $("modalActivityCrud").classList.add("show");
  } catch (err) {
    showToast("Gagal memuat detail sesi: " + err, "error");
  }
}

async function deleteSession(sessionId) {
  const ok = await showConfirmModal("Apakah kamu yakin ingin menghapus aktivitas belajar ini?", {
    title: "Hapus Aktivitas Belajar",
    confirmText: "Ya, Hapus",
    type: "danger"
  });
  if (ok) {
    try {
      await eel.delete_session(sessionId)();
      await renderActivityTable();
      showToast("Aktivitas belajar berhasil dihapus.", "success");
    } catch (err) {
      showToast("Gagal menghapus: " + err, "error");
    }
  }
}

async function populateSubjectFilters() {
  try {
    const summary = await eel.get_dashboard_summary()();
    const subjects = summary.prop_chart.map((p) => p.subject);

    const filter = $("activitySubjectFilter");
    const analyticsFilter = $("analyticsSubjectSelect");

    if (filter && filter.options.length <= 1) {
      subjects.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        filter.appendChild(opt);
      });
    }

    if (analyticsFilter && analyticsFilter.options.length <= 1) {
      subjects.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        analyticsFilter.appendChild(opt);
      });
    }
  } catch (_) {}
}

// ================= PAGE 4: STUDY ANALYTICS =================
function setupAnalyticsEvents() {
  // Tombol filter periode 7 Hari | 30 Hari | 3 Bulan
  document.querySelectorAll("#page-analytics [data-period]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll("#page-analytics [data-period]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      AppState.analytics.period = btn.dataset.period;
      await renderAnalytics();
    });
  });

  // Filter Mata Pelajaran
  $("analyticsSubjectSelect")?.addEventListener("change", async (e) => {
    AppState.analytics.subject = e.target.value;
    await renderAnalytics();
  });
}

async function renderAnalytics() {
  try {
    const data = await eel.get_analytics(AppState.analytics.period, AppState.analytics.subject)();
    if (!data) return;

    $("anAvgDur").textContent = `${String(data.avg_duration_hours).replace(".", ",")} jam`;
    $("anProdDay").textContent = data.most_productive_day;
    $("anTopSubj").textContent = data.top_subject;
    $("anAvgFocus").textContent = `${data.avg_focus} / 5`;

    // Perbarui pilihan dropdown mata pelajaran jika ada data
    if (data.all_subjects && $("analyticsSubjectSelect")) {
      const select = $("analyticsSubjectSelect");
      const currentVal = AppState.analytics.subject || "Semua Mata Pelajaran";
      const optionsHtml = `<option value="Semua Mata Pelajaran">Semua Mata Pelajaran</option>` +
        data.all_subjects.map((s) => `<option value="${esc(s)}" ${s === currentVal ? "selected" : ""}>${esc(s)}</option>`).join("");
      if (select.innerHTML !== optionsHtml) {
        select.innerHTML = optionsHtml;
      }
    }

    setTimeout(() => {
      renderAnalyticsDailyChart(data.daily_chart);
      renderAnalyticsTrendChart(data.weekday_chart);
      renderAnalyticsDonutChart(data.subjects);
    }, 60);
  } catch (err) {
    console.error("Analytics error:", err);
  }
}

function renderAnalyticsDailyChart(chartData) {
  const ctx = $("chartAnalyticsDaily");
  if (!ctx || !window.Chart) return;
  if (AppState.charts.anDaily) AppState.charts.anDaily.destroy();

  const isDark = document.body.classList.contains("dark-mode");
  const textColor = isDark ? "#c1c0dc" : "#71748d";
  const gridColor = isDark ? "#282548" : "#f0f1f8";

  AppState.charts.anDaily = new Chart(ctx, {
    type: "bar",
    data: {
      labels: chartData.map((d) => d.label),
      datasets: [{
        label: "Durasi (Jam)",
        data: chartData.map((d) => d.hours),
        backgroundColor: "#F29F67",
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
      }
    }
  });
  AppState.charts.anDaily.resize();
}

function renderAnalyticsTrendChart(chartData) {
  const ctx = $("chartAnalyticsTrend");
  if (!ctx || !window.Chart) return;
  if (AppState.charts.anTrend) AppState.charts.anTrend.destroy();

  const isDark = document.body.classList.contains("dark-mode");
  const textColor = isDark ? "#c1c0dc" : "#71748d";
  const gridColor = isDark ? "#282548" : "#f0f1f8";

  AppState.charts.anTrend = new Chart(ctx, {
    type: "line",
    data: {
      labels: chartData.map((d) => d.day),
      datasets: [{
        label: "Produktivitas",
        data: chartData.map((d) => d.hours),
        borderColor: "#F29F67",
        backgroundColor: "rgba(242, 159, 103, 0.15)",
        tension: 0.35,
        fill: true,
        pointBackgroundColor: "#F29F67",
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor, font: { weight: "600" } }, grid: { display: false } },
        y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
      }
    }
  });
  AppState.charts.anTrend.resize();
}

function renderAnalyticsDonutChart(subjects) {
  const ctx = $("chartAnalyticsDonut");
  if (!ctx || !window.Chart) return;
  if (AppState.charts.anDonut) AppState.charts.anDonut.destroy();

  const palette = ["#F29F67", "#1E1E2C", "#3B8FF3", "#34B1AA", "#E0B50F", "#8E44AD"];

  AppState.charts.anDonut = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: subjects.map((s) => s.name),
      datasets: [{
        data: subjects.map((s) => s.minutes),
        backgroundColor: palette.slice(0, subjects.length)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } }
      }
    }
  });
  AppState.charts.anDonut.resize();
}

// ================= PAGE 5: STUDY PLANNER (WEEKLY TIMETABLE & DATE SHIFTING) =================
AppState.plannerWeekOffset = 0;
AppState.plannerViewMode = "weekly";

function getWeekDateRange(offset = 0) {
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Senin, 6 = Minggu
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + (offset * 7));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      dateObj: d,
      dayNum: d.getDate(),
      monthName: monthNames[d.getMonth()],
      isToday: d.toDateString() === now.toDateString()
    });
  }

  const label = `${monday.getDate()} - ${sunday.getDate()} ${monthNames[sunday.getMonth()]} ${sunday.getFullYear()}`;
  return { monday, sunday, days, label };
}

function updatePlannerDateUI() {
  const range = getWeekDateRange(AppState.plannerWeekOffset);

  // Label rentang minggu di Study Planner
  if ($("plannerWeekLabel")) {
    $("plannerWeekLabel").textContent = range.label;
  }

  // Label rentang tanggal di Topbar Badge
  if ($("dateRangeText")) {
    const isCurrentWeek = AppState.plannerWeekOffset === 0;
    $("dateRangeText").textContent = isCurrentWeek ? `Minggu ini (${range.label})` : range.label;
  }

  // Perbarui header tanggal pada tabel Timetable 7 hari
  const theadRow = $("timetableHeaderRow");
  if (theadRow) {
    const dayNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
    let headers = `<th class="time-col">Waktu</th>`;
    for (let i = 0; i < 7; i++) {
      const d = range.days[i];
      headers += `
        <th class="${d.isToday ? 'current-day-col' : ''}">
          <div>${dayNames[i]}</div>
          <small style="font-weight: 500; font-size: 11px; opacity: 0.85;">${d.dayNum} ${d.monthName}</small>
        </th>
      `;
    }
    theadRow.innerHTML = headers;
  }
}

function setupPlannerEvents() {
  // Tombol Geser Tanggal Minggu Lalu (‹)
  $("btnPlannerPrev")?.addEventListener("click", () => {
    AppState.plannerWeekOffset--;
    updatePlannerDateUI();
    renderPlanner();
  });

  // Tombol Geser Tanggal Minggu Berikutnya (›)
  $("btnPlannerNext")?.addEventListener("click", () => {
    AppState.plannerWeekOffset++;
    updatePlannerDateUI();
    renderPlanner();
  });

  // Tombol Mode Tampilan "Mingguan"
  $("btnPlannerWeekly")?.addEventListener("click", () => {
    $("btnPlannerWeekly").classList.add("active");
    $("btnPlannerMonthly")?.classList.remove("active");
    AppState.plannerViewMode = "weekly";
    const timetableCard = $("plannerTimetableCard");
    const gridLayout = $("plannerGridLayout");
    if (timetableCard) timetableCard.style.display = "block";
    if (gridLayout) gridLayout.style.gridTemplateColumns = "2.5fr 1fr";
    renderPlanner();
  });

  // Tombol Mode Tampilan "Daftar Semua"
  $("btnPlannerMonthly")?.addEventListener("click", () => {
    $("btnPlannerMonthly").classList.add("active");
    $("btnPlannerWeekly")?.classList.remove("active");
    AppState.plannerViewMode = "all";
    const timetableCard = $("plannerTimetableCard");
    const gridLayout = $("plannerGridLayout");
    if (timetableCard) timetableCard.style.display = "none";
    if (gridLayout) gridLayout.style.gridTemplateColumns = "1fr";
    renderPlanner();
  });

  // Klik Topbar Date Badge untuk Kembali ke Minggu Ini
  $("topbarDateBadge")?.addEventListener("click", () => {
    AppState.plannerWeekOffset = 0;
    updatePlannerDateUI();
    if (AppState.activePage === "planner") {
      renderPlanner();
    }
  });

  $("btnOpenAddSchedule")?.addEventListener("click", () => {
    $("scheduleModalTitle").textContent = "Tambah Jadwal Belajar";
    $("crudScheduleId").value = "";
    $("schedSubject").value = "";
    $("schedDay").value = "0";
    $("schedStartTime").value = "09:00";
    $("schedEndTime").value = "11:00";
    $("schedColor").value = "#F29F67";
    $("schedNote").value = "";
    $("schedFeedbackMsg").textContent = "";
    $("modalScheduleCrud").classList.add("show");
  });

  $("btnCloseScheduleModal")?.addEventListener("click", () => $("modalScheduleCrud").classList.remove("show"));
  $("btnCancelScheduleModal")?.addEventListener("click", () => $("modalScheduleCrud").classList.remove("show"));

  $("formScheduleCrud")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("crudScheduleId").value;
    const subject = $("schedSubject").value.trim();
    const day = $("schedDay").value;
    const startTime = $("schedStartTime").value;
    const endTime = $("schedEndTime").value;
    const color = $("schedColor").value;
    const note = $("schedNote").value.trim();
    const msg = $("schedFeedbackMsg");

    msg.textContent = "Menyimpan jadwal...";
    msg.className = "form-feedback-msg";

    try {
      let res;
      if (id) {
        res = await eel.update_schedule(id, subject, day, startTime, endTime, color, note)();
      } else {
        res = await eel.add_schedule(subject, day, startTime, endTime, color, note)();
      }

      if (!res.ok) {
        msg.textContent = res.error;
        msg.className = "form-feedback-msg error";
        return;
      }

      $("modalScheduleCrud").classList.remove("show");
      await renderPlanner();
    } catch (err) {
      msg.textContent = `Kesalahan: ${err.message || err}`;
      msg.className = "form-feedback-msg error";
    }
  });
}

async function renderPlanner() {
  try {
    const schedules = await eel.get_schedules()();
    renderTimetableGrid(schedules);
    renderPlannerList(schedules);
  } catch (err) {
    console.error("Planner error:", err);
  }
}

function renderTimetableGrid(schedules) {
  const tbody = $("timetableBody");
  if (!tbody) return;

  const timeSlots = ["07:00", "09:00", "11:00", "13:00", "15:00", "17:00", "19:00", "21:00"];

  tbody.innerHTML = timeSlots.map((time, slotIdx) => {
    const slotHour = parseInt(time.split(":")[0], 10);
    const nextSlotHour = slotHour + 2;

    let rowCols = `<td class="time-col">${time}</td>`;

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const matchingSchedules = schedules.filter((s) => {
        if (s.day_of_week !== dayIdx) return false;
        const sH = parseInt(s.start_time.split(":")[0], 10);
        return sH >= slotHour && sH < nextSlotHour;
      });

      let cellContent = "";
      if (matchingSchedules.length > 0) {
        cellContent = matchingSchedules.map((s) => `
          <div class="schedule-block-card" style="background-color: ${s.color || '#F29F67'};">
            <strong>${esc(s.subject)}</strong>
            <small>${s.start_time} - ${s.end_time}</small>
          </div>
        `).join("");
      }

      rowCols += `<td>${cellContent}</td>`;
    }

    return `<tr>${rowCols}</tr>`;
  }).join("");
}

function renderPlannerList(schedules) {
  const list = $("plannerSchedulesList");
  if (!list) return;

  const hariNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

  if (schedules.length === 0) {
    list.innerHTML = `<p class="empty-hint" style="padding: 16px; text-align: center; color: var(--text-muted);">Belum ada jadwal terencana.</p>`;
    return;
  }

  list.innerHTML = schedules.map((s) => `
    <div class="sched-list-item">
      <div class="sched-left">
        <span class="sched-dot" style="background-color: ${s.color || '#F29F67'};"></span>
        <div class="sched-meta">
          <strong>${esc(s.subject)}</strong>
          <small>${hariNames[s.day_of_week]}, ${s.start_time} - ${s.end_time}</small>
        </div>
      </div>
      <div class="action-btns-group">
        <button class="table-icon-btn btn-edit-sched" data-id="${s.id}">✏️</button>
        <button class="table-icon-btn danger btn-del-sched" data-id="${s.id}">🗑️</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".btn-del-sched").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await showConfirmModal("Hapus jadwal ini dari perencana?", {
        title: "Hapus Jadwal",
        confirmText: "Ya, Hapus",
        type: "danger"
      });
      if (ok) {
        await eel.delete_schedule(btn.dataset.id)();
        await renderPlanner();
        showToast("Jadwal berhasil dihapus.", "success");
      }
    });
  });

  list.querySelectorAll(".btn-edit-sched").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = schedules.find((x) => String(x.id) === String(btn.dataset.id));
      if (!s) return;
      $("scheduleModalTitle").textContent = "Edit Jadwal Belajar";
      $("crudScheduleId").value = s.id;
      $("schedSubject").value = s.subject;
      $("schedDay").value = s.day_of_week;
      $("schedStartTime").value = s.start_time;
      $("schedEndTime").value = s.end_time;
      $("schedColor").value = s.color;
      $("schedNote").value = s.note || "";
      $("schedFeedbackMsg").textContent = "";
      $("modalScheduleCrud").classList.add("show");
    });
  });
}

// ================= PAGE 6: RECOMMENDATION =================
async function renderRecommendation() {
  try {
    const rec = await eel.get_recommendations()();
    if (!rec) return;

    $("recBestTimeVal").textContent = rec.best_time_range;
    $("recProdDayVal").textContent = rec.most_productive_day;
    $("recAvgDurVal").textContent = `${String(rec.avg_session_hours).replace(".", ",")} jam`;

    const actionList = $("recActionItemsList");
    if (actionList && rec.insights) {
      actionList.innerHTML = rec.insights.map((item) => `
        <div class="rec-action-card">
          <div class="rec-action-icon">💡</div>
          <div class="rec-action-text">
            <strong>${esc(item.title)}</strong>
            <p>${esc(item.text)}</p>
          </div>
        </div>
      `).join("");
    }

    const timeline = $("recTimelineList");
    if (timeline && rec.schedule_suggestions) {
      timeline.innerHTML = rec.schedule_suggestions.map((s) => `
        <div class="timeline-slot">
          <div class="timeline-time">${esc(s.time)}</div>
          <div class="timeline-title">${esc(s.title)}</div>
          <div class="timeline-desc">${esc(s.desc)}</div>
        </div>
      `).join("");
    }
  } catch (err) {
    console.error("Recommendation error:", err);
  }
}

// ================= PAGE 7: REPORTS =================
async function renderReports() {
  try {
    const data = await eel.get_reports(AppState.reports.period)();
    if (!data) return;

    $("repTotalHours").textContent = `${String(data.total_hours).replace(".", ",")} jam`;
    $("repTotalSessions").textContent = `${data.session_count} sesi`;
    $("repTargetPct").textContent = `${data.target_pct}%`;
    $("repAvgFocus").textContent = `${data.avg_focus} / 5`;

    const tbody = $("reportTableBody");
    if (tbody) {
      if (data.rekap_table.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">Belum ada sesi pada periode ini.</td></tr>`;
      } else {
        tbody.innerHTML = data.rekap_table.map((r) => `
          <tr>
            <td><strong>${r.no}</strong></td>
            <td><strong>${esc(r.subject)}</strong></td>
            <td>${String(r.total_hours).replace(".", ",")} jam</td>
            <td>${r.sessions_count} sesi</td>
            <td>${r.percentage}%</td>
          </tr>
        `).join("");
      }
    }

    setTimeout(() => {
      renderReportsChart(data.rekap_table);
    }, 60);
  } catch (err) {
    console.error("Reports error:", err);
  }
}

function renderReportsChart(rekapTable) {
  const ctx = $("chartReportSubjects");
  if (!ctx || !window.Chart) return;
  if (AppState.charts.reportChart) AppState.charts.reportChart.destroy();

  const isDark = document.body.classList.contains("dark-mode");
  const textColor = isDark ? "#c1c0dc" : "#71748d";
  const gridColor = isDark ? "#282548" : "#f0f1f8";

  AppState.charts.reportChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: rekapTable.map((r) => r.subject),
      datasets: [{
        label: "Total Jam",
        data: rekapTable.map((r) => r.total_hours),
        backgroundColor: "#F29F67",
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor }, grid: { display: false } },
        y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
      }
    }
  });
  AppState.charts.reportChart.resize();
}

$("btnReportExportPdf")?.addEventListener("click", () => {
  window.print();
});

// Event listener untuk tombol filter periode Report (Harian, Mingguan, Bulanan)
document.querySelectorAll("[data-report-period]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll("[data-report-period]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    AppState.reports.period = btn.dataset.reportPeriod;
    await renderReports();
  });
});

// ================= PAGE 8: LEADERBOARD =================
async function renderLeaderboard() {
  try {
    const data = await eel.get_leaderboard()();
    if (!data) return;

    const list = data.leaderboard || [];
    $("challengeBannerMsg").textContent = data.challenge_message || "Tingkatkan durasi belajarmu untuk merebut peringkat teratas!";

    renderPodium(list.slice(0, 3));

    const tbody = $("leaderboardTableBody");
    if (!tbody) return;

    tbody.innerHTML = list.map((user) => {
      const isCur = user.is_current_user ? "current-user-row" : "";
      const initial = (user.full_name || "?").charAt(0).toUpperCase();
      const avatarContent = user.avatar_data
        ? `<img src="${user.avatar_data}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
        : `<span style="display:grid;place-items:center;width:100%;height:100%;font-weight:700;font-size:14px;color:#fff;">${initial}</span>`;

      return `
        <tr class="${isCur}">
          <td><strong>#${user.rank}</strong></td>
          <td>
            <div class="learner-cell">
              <div class="learner-avatar">${avatarContent}</div>
              <div class="learner-meta">
                <strong>${esc(user.full_name)} ${user.is_current_user ? "(Kamu)" : ""}</strong>
                <small>${esc(user.major)} · ${esc(user.university)}</small>
              </div>
            </div>
          </td>
          <td><strong>${String(user.total_hours).replace(".", ",")} jam</strong></td>
          <td>${user.sessions_count} sesi</td>
          <td>🔥 ${user.streak} hari</td>
          <td><span class="badge-mini-rank" style="background-color: ${user.badge_color}; color:#fff;">${user.badge}</span></td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Leaderboard error:", err);
  }
}

function renderPodium(top3) {
  const podium = $("leaderboardPodium");
  if (!podium) return;

  const renderCard = (u, rankClass, crown, rankNum) => {
    if (!u) return "";
    const initial = (u.full_name || "?").charAt(0).toUpperCase();
    const avatarContent = u.avatar_data
      ? `<img src="${u.avatar_data}" alt="Avatar" class="podium-avatar-img">`
      : `<span style="display:grid;place-items:center;width:100%;height:100%;font-weight:800;font-size:22px;color:#fff;">${initial}</span>`;

    return `
      <div class="podium-card ${rankClass}">
        ${crown ? `<div class="podium-crown">${crown}</div>` : ""}
        <div class="podium-avatar-ring">${avatarContent}</div>
        <div class="podium-name">${esc(u.full_name)}</div>
        <div class="podium-campus">${esc(u.university)}</div>
        <div class="podium-hours">${String(u.total_hours).replace(".", ",")} jam</div>
        <div class="podium-rank-badge">Juara ${rankNum}</div>
      </div>
    `;
  };

  const p1 = top3[0];
  const p2 = top3[1];
  const p3 = top3[2];

  podium.innerHTML = `
    ${p2 ? renderCard(p2, "rank-2", "🥈", 2) : ""}
    ${p1 ? renderCard(p1, "rank-1", "👑", 1) : ""}
    ${p3 ? renderCard(p3, "rank-3", "🥉", 3) : ""}
  `;
}

// ================= PAGE 9: MATERI & KUIS (GEMINI AI STUDIO) =================
let studyCards = [];
let studyCardIndex = 0;
let quizScore = 0;
let currentExerciseKind = "flashcard";
let currentMaterialId = null;

// Tab switcher Studio AI
$("tabAiFromTopic")?.addEventListener("click", () => {
  $("tabAiFromTopic").classList.add("active");
  $("tabAiFromUpload")?.classList.remove("active");
  $("aiTopicPanel").style.display = "block";
  $("aiUploadPanel").style.display = "none";
});

$("tabAiFromUpload")?.addEventListener("click", () => {
  $("tabAiFromUpload").classList.add("active");
  $("tabAiFromTopic")?.classList.remove("active");
  $("aiUploadPanel").style.display = "block";
  $("aiTopicPanel").style.display = "none";
});

// Generate dari Topik Menggunakan Gemini AI
$("btnGenerateAiFromTopic")?.addEventListener("click", async () => {
  const topic = $("aiStudyTopicInput").value.trim();
  const kind = $("aiStudyTypeSelect").value;
  const count = parseInt($("aiStudyCountSelect").value) || 5;
  const btn = $("btnGenerateAiFromTopic");
  const txt = $("btnGenerateTopicText");
  const fb = $("aiTopicFeedbackMsg");

  if (!topic) {
    fb.textContent = "Masukkan topik materi yang ingin dipelajari.";
    fb.className = "form-feedback-msg error";
    return;
  }

  btn.disabled = true;
  txt.textContent = "✦ Gemini AI sedang menyusun materi latihan...";
  fb.textContent = "Menganalisis konsep dan menghasilkan soal cerdas...";
  fb.className = "form-feedback-msg";

  try {
    const res = await eel.generate_ai_study_set(null, topic, kind, count)();
    if (!res.ok) {
      fb.textContent = res.error || "Gagal membuat latihan dengan AI.";
      fb.className = "form-feedback-msg error";
      return;
    }

    fb.textContent = `Berhasil membuat ${res.cards_count} latihan cerdas dari topik "${topic}"!`;
    fb.className = "form-feedback-msg success";
    await renderMaterials();
    await openStudyExercise(res.material_id, kind);
  } catch (err) {
    fb.textContent = `Kesalahan AI: ${err.message || err}`;
    fb.className = "form-feedback-msg error";
  } finally {
    btn.disabled = false;
    txt.textContent = "Generate Latihan dengan Gemini AI";
  }
});

// Render Daftar Koleksi Materi
async function renderMaterials() {
  try {
    const materials = await eel.get_materials()();
    const listWrap = $("materialsList");
    if (!listWrap) return;

    if (materials.length === 0) {
      listWrap.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 36px; margin-bottom: 8px;">📚</div>
          <p style="font-weight: 600; color: var(--text-main);">Belum ada koleksi materi belajar.</p>
          <small>Gunakan generator AI di atas untuk membuat latihan dari topik apapun atau unggah file dokumen!</small>
        </div>
      `;
      return;
    }

    listWrap.innerHTML = materials.map((m) => {
      const isAi = m.title.startsWith("✦ AI:");
      const ext = isAi ? "AI" : m.original_name.split(".").pop().toUpperCase();
      const sizeStr = m.size_bytes < 1024 * 1024 ? `${Math.round(m.size_bytes / 1024)} KB` : `${(m.size_bytes / (1024 * 1024)).toFixed(1)} MB`;

      return `
        <div class="recent-session-item mt-3">
          <div class="recent-session-left">
            <div class="subj-icon-box" style="${isAi ? 'background: linear-gradient(135deg, #F29F67, #E08C52); color: #fff;' : ''}">${ext}</div>
            <div class="recent-session-info">
              <strong>${esc(m.title)}</strong>
              <small>${esc(m.original_name)} · ${sizeStr}</small>
            </div>
          </div>
          <div class="action-btns-group">
            <button class="btn btn-sm btn-primary btn-make-cards" data-id="${m.id}" data-kind="flashcard">🗂️ Flashcard AI</button>
            <button class="btn btn-sm btn-outline btn-make-cards" data-id="${m.id}" data-kind="quiz">🎯 Kuis AI</button>
            <button class="table-icon-btn danger btn-del-material" data-id="${m.id}" title="Hapus materi">🗑️</button>
          </div>
        </div>
      `;
    }).join("");

    listWrap.querySelectorAll(".btn-make-cards").forEach((btn) => {
      btn.addEventListener("click", () => openStudyExercise(btn.dataset.id, btn.dataset.kind));
    });

    listWrap.querySelectorAll(".btn-del-material").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ok = await showConfirmModal("Hapus materi ini beserta seluruh flashcard dan kuisnya?", {
          title: "Hapus Materi Pembelajaran",
          confirmText: "Ya, Hapus Materi",
          type: "danger"
        });
        if (ok) {
          await eel.delete_material(btn.dataset.id)();
          await renderMaterials();
          if (currentMaterialId == btn.dataset.id) {
            $("studyInteractiveArea").style.display = "none";
          }
          showToast("Materi pembelajaran berhasil dihapus.", "success");
        }
      });
    });
  } catch (err) {
    console.error("Materials error:", err);
  }
}

// Upload File Materi & Otomatis Generate AI
$("materialFileInput")?.addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) $("materialFileName").textContent = f.name;
});

$("materialUploadForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = $("materialFileInput").files[0];
  const kind = $("aiUploadTypeSelect").value;
  const count = parseInt($("aiUploadCountSelect").value) || 5;
  const btn = $("btnUploadMaterial");
  const txt = $("btnUploadMaterialText");
  const msg = $("materialUploadMsg");

  if (!file) {
    msg.textContent = "Pilih file materi terlebih dahulu.";
    msg.className = "form-feedback-msg error";
    return;
  }

  btn.disabled = true;
  txt.textContent = "✦ Mengunggah & Gemini AI sedang menganalisis dokumen...";
  msg.textContent = "Membaca isi file dokumen dan menyusun latihan cerdas...";
  msg.className = "form-feedback-msg";

  try {
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result.split(",")[1];
      const res = await eel.upload_material(file.name, b64)();
      if (!res.ok) {
        msg.textContent = res.error;
        msg.className = "form-feedback-msg error";
        btn.disabled = false;
        txt.textContent = "Unggah & Generate dengan Gemini AI";
        return;
      }

      // Otomatis buat latihan cerdas dari file dengan Gemini AI
      const aiRes = await eel.generate_ai_study_set(res.material.id, "", kind, count)();
      btn.disabled = false;
      txt.textContent = "Unggah & Generate dengan Gemini AI";

      if (!aiRes.ok) {
        msg.textContent = `Dokumen tersimpan, namun AI gagal mengekstrak: ${aiRes.error}`;
        msg.className = "form-feedback-msg error";
        return;
      }

      msg.textContent = `Materi "${res.material.title}" berhasil diunggah dan ${aiRes.cards_count} latihan siap!`;
      msg.className = "form-feedback-msg success";
      $("materialFileInput").value = "";
      $("materialFileName").textContent = "Pilih atau seret file PDF / TXT / MD ke sini";
      await renderMaterials();
      await openStudyExercise(res.material.id, kind);
    };
    reader.readAsDataURL(file);
  } catch (err) {
    btn.disabled = false;
    txt.textContent = "Unggah & Generate dengan Gemini AI";
    msg.textContent = `Kesalahan: ${err.message || err}`;
    msg.className = "form-feedback-msg error";
  }
});

// Buka Area Latihan Interaktif
async function openStudyExercise(matId, kind) {
  try {
    currentExerciseKind = kind;
    currentMaterialId = matId;

    let cards = await eel.get_study_cards(matId, kind)();
    if (!cards || cards.length === 0) {
      // Jika belum ada kartu, buat secara otomatis via create_study_set (yang memanggil Gemini AI jika bukan format teks sederhana)
      const genRes = await eel.create_study_set(matId, kind)();
      if (!genRes.ok) {
        showToast(genRes.error || "Gagal membuat latihan.", "error");
        return;
      }
      cards = await eel.get_study_cards(matId, kind)();
    }

    studyCards = cards;
    studyCardIndex = 0;
    quizScore = 0;

    const area = $("studyInteractiveArea");
    area.style.display = "block";
    $("studyAreaTitle").textContent = kind === "flashcard" ? "🗂️ Flashcard Interaktif 3D" : "🎯 Kuis Pilihan Ganda (MCQ)";
    $("studyAreaSubtitle").textContent = `${studyCards.length} kartu latihan siap diuji`;

    renderCurrentCard(kind);
    area.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showToast("Gagal memuat latihan: " + err, "error");
  }
}

// Render Kartu Pembelajaran Aktif (Flashcard 3D atau Kuis MCQ)
function renderCurrentCard(kind) {
  const container = $("studyInteractiveContent");
  if (!container || studyCards.length === 0) return;

  const card = studyCards[studyCardIndex];
  const total = studyCards.length;
  const currentNum = studyCardIndex + 1;

  if (kind === "flashcard") {
    // Mode Flashcard Interaktif 3D
    const data = card.data || {};
    const answerText = data.answer || card.raw_answer || "";
    const conceptTag = data.concept || "Konsep Kunci";
    const tipText = data.tip || "";

    container.innerHTML = `
      <div class="flashcard-wrapper">
        <div class="flashcard-3d-card" id="activeFlashcard">
          <!-- Sisi Depan (Pertanyaan) -->
          <div class="flashcard-face flashcard-front">
            <div class="flashcard-header-row">
              <span class="flashcard-tag">${esc(conceptTag)}</span>
              <span class="flashcard-counter">Kartu ${currentNum} / ${total}</span>
            </div>
            <div class="flashcard-question-text">
              ${esc(card.question)}
            </div>
            <div class="flashcard-hint-footer">
              <span>↻ Klik kartu untuk melihat jawaban</span>
            </div>
          </div>

          <!-- Sisi Belakang (Jawaban & Tips AI) -->
          <div class="flashcard-face flashcard-back">
            <div class="flashcard-header-row">
              <span class="flashcard-tag">Jawaban & Penjelasan</span>
              <span class="flashcard-counter">Kartu ${currentNum} / ${total}</span>
            </div>
            <div>
              <p class="flashcard-answer-text">${esc(answerText)}</p>
              ${tipText ? `<div class="flashcard-tip-box mt-2"><strong>💡 Tips Mengingat:</strong> ${esc(tipText)}</div>` : ''}
            </div>
            <div class="flashcard-hint-footer">
              <span>↻ Klik kartu untuk kembali ke pertanyaan</span>
            </div>
          </div>
        </div>

        <!-- Tombol Navigasi Flashcard -->
        <div class="flashcard-nav-bar">
          <button class="btn btn-outline" id="btnPrevCard" ${studyCardIndex === 0 ? "disabled" : ""}>← Sebelumnya</button>
          <button class="btn btn-secondary" id="btnFlipCard">Balik Kartu ↺</button>
          <button class="btn btn-primary" id="btnNextCard">
            ${studyCardIndex === total - 1 ? "Selesai 🎉" : "Berikutnya →"}
          </button>
        </div>
      </div>
    `;

    const cardEl = $("activeFlashcard");
    const toggleFlip = () => cardEl.classList.toggle("is-flipped");
    cardEl.addEventListener("click", toggleFlip);
    $("btnFlipCard")?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFlip();
    });

    $("btnPrevCard")?.addEventListener("click", () => {
      if (studyCardIndex > 0) {
        studyCardIndex--;
        renderCurrentCard(kind);
      }
    });

    $("btnNextCard")?.addEventListener("click", () => {
      if (studyCardIndex < total - 1) {
        studyCardIndex++;
        renderCurrentCard(kind);
      } else {
        container.innerHTML = `
          <div class="quiz-result-card">
            <div class="quiz-result-trophy">🎉</div>
            <h3 style="font-size: 24px; font-weight: 800; color: #10b981; margin-bottom: 8px;">Latihan Flashcard Selesai!</h3>
            <p style="color: var(--text-muted); margin-bottom: 24px;">Kamu telah meninjau seluruh ${total} flashcard pembelajaran.</p>
            <div style="display:flex; justify-content:center; gap: 12px;">
              <button class="btn btn-outline" id="btnRestartCards">Ulangi dari Awal ↺</button>
              <button class="btn btn-primary" id="btnSwitchToQuiz">Coba Kuis Pilihan Ganda 🎯</button>
            </div>
          </div>
        `;
        $("btnRestartCards")?.addEventListener("click", () => {
          studyCardIndex = 0;
          renderCurrentCard("flashcard");
        });
        $("btnSwitchToQuiz")?.addEventListener("click", () => {
          openStudyExercise(currentMaterialId, "quiz");
        });
      }
    });

  } else {
    // Mode Kuis Pilihan Ganda (MCQ) Interaktif
    const data = card.data || {};
    const options = data.options || [
      `A. ${card.raw_answer || "Pilihan A"}`,
      "B. Pilihan alternatif B",
      "C. Pilihan alternatif C",
      "D. Pilihan alternatif D"
    ];
    const correctLetter = (data.correct || "A").toUpperCase().trim();
    const explanation = data.explanation || card.raw_answer || "Jawaban ini benar berdasarkan konsep materi.";

    container.innerHTML = `
      <div class="quiz-game-wrapper">
        <div class="quiz-top-info">
          <span style="font-size: 13.5px; font-weight: 700; color: #a09eb8;">Soal ${currentNum} dari ${total}</span>
          <span class="quiz-score-badge">Skor: ${quizScore} / ${total}</span>
        </div>

        <div class="quiz-question-box">
          <h3 class="quiz-question-title">${esc(card.question)}</h3>
        </div>

        <div class="quiz-options-list" id="quizOptionsContainer">
          ${options.map((opt) => {
            const letterMatch = opt.match(/^([A-D])[.)]\s*(.*)$/i);
            const letter = letterMatch ? letterMatch[1].toUpperCase() : opt.charAt(0).toUpperCase();
            const text = letterMatch ? letterMatch[2] : opt;
            return `
              <button class="quiz-option-btn" data-letter="${letter}">
                <span class="quiz-opt-badge">${letter}</span>
                <span class="quiz-opt-text">${esc(text)}</span>
              </button>
            `;
          }).join("")}
        </div>

        <div id="quizExplanationCard" class="quiz-explanation-box" style="display:none;">
          <div class="quiz-explanation-title">
            <span>💡 Pembahasan dari Gemini AI</span>
          </div>
          <p class="quiz-explanation-text" id="quizExplanationText">${esc(explanation)}</p>
        </div>

        <div style="display:flex; justify-content:flex-end; margin-top: 16px;">
          <button class="btn btn-primary" id="btnNextQuizQuestion" style="display:none;">
            ${studyCardIndex === total - 1 ? "Lihat Hasil Akhir 🏆" : "Pertanyaan Selanjutnya →"}
          </button>
        </div>
      </div>
    `;

    let answered = false;
    const optionBtns = container.querySelectorAll(".quiz-option-btn");
    const expBox = $("quizExplanationCard");
    const nextBtn = $("btnNextQuizQuestion");

    optionBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;

        const chosenLetter = btn.dataset.letter;
        const isCorrect = chosenLetter === correctLetter;

        if (isCorrect) {
          btn.classList.add("correct-ans");
          quizScore++;
          container.querySelector(".quiz-score-badge").textContent = `Skor: ${quizScore} / ${total}`;
        } else {
          btn.classList.add("wrong-ans");
          // Tandai tombol yang benar
          optionBtns.forEach((b) => {
            if (b.dataset.letter === correctLetter) {
              b.classList.add("correct-ans");
            }
          });
        }

        // Tampilkan pembahasan AI dan tombol next
        expBox.style.display = "block";
        nextBtn.style.display = "inline-flex";
      });
    });

    nextBtn.addEventListener("click", () => {
      if (studyCardIndex < total - 1) {
        studyCardIndex++;
        renderCurrentCard(kind);
      } else {
        const pct = Math.round((quizScore / total) * 100);
        let feedback = "Terus tingkatkan pemahamanmu!";
        let trophy = "🎯";
        if (pct >= 80) {
          feedback = "Luar biasa! Pemahamanmu sangat matang!";
          trophy = "🏆";
        } else if (pct >= 60) {
          feedback = "Bagus sekali! Pertahankan konsistensi belajarmu.";
          trophy = "⭐";
        }

        container.innerHTML = `
          <div class="quiz-result-card">
            <div class="quiz-result-trophy">${trophy}</div>
            <div class="quiz-result-score">${pct}%</div>
            <h3 style="font-size: 22px; font-weight: 800; color: var(--text-heading); margin-bottom: 6px;">
              Jawaban Benar: ${quizScore} dari ${total} Soal
            </h3>
            <p style="color: var(--text-muted); margin-bottom: 24px;">${feedback}</p>
            <div style="display:flex; justify-content:center; gap: 12px;">
              <button class="btn btn-outline" id="btnRestartQuiz">Ulangi Kuis ↺</button>
              <button class="btn btn-primary" id="btnSwitchToFlashcards">Buka Flashcard 🗂️</button>
            </div>
          </div>
        `;
        $("btnRestartQuiz")?.addEventListener("click", () => {
          studyCardIndex = 0;
          quizScore = 0;
          renderCurrentCard("quiz");
        });
        $("btnSwitchToFlashcards")?.addEventListener("click", () => {
          openStudyExercise(currentMaterialId, "flashcard");
        });
      }
    });
  }
}

$("btnCloseStudyArea")?.addEventListener("click", () => {
  $("studyInteractiveArea").style.display = "none";
});

// ================= PAGE 10: PROFILE & UPLOAD IMAGE =================
function setupProfileEvents() {
  $("btnTriggerAvatarUpload")?.addEventListener("click", () => {
    $("profilePhotoInput").click();
  });

  $("profilePhotoInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    const fb = $("avatarUploadFeedback");
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      fb.textContent = "Ukuran gambar maksimal 5 MB.";
      fb.className = "avatar-upload-feedback error";
      return;
    }

    fb.textContent = "Mengunggah foto profil...";
    fb.className = "avatar-upload-feedback";

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      try {
        const res = await eel.upload_profile_avatar(dataUrl)();
        if (!res.ok) {
          fb.textContent = res.error;
          fb.className = "avatar-upload-feedback error";
          return;
        }

        fb.textContent = "Foto profil berhasil diperbarui!";
        fb.className = "avatar-upload-feedback success";

        $("profileAvatarImg").src = dataUrl;
        $("profileAvatarImg").style.display = "block";
        $("profileAvatarFallback").style.display = "none";

        await loadCurrentUser();
      } catch (err) {
        fb.textContent = `Gagal menyimpan: ${err.message || err}`;
        fb.className = "avatar-upload-feedback error";
      }
    };
    reader.readAsDataURL(file);
  });

  $("btnRemoveAvatar")?.addEventListener("click", async () => {
    const ok = await showConfirmModal("Hapus foto profil dan gunakan avatar inisial?", {
      title: "Hapus Foto Profil",
      confirmText: "Ya, Hapus Foto",
      type: "warning"
    });
    if (!ok) return;
    const fb = $("avatarUploadFeedback");
    fb.textContent = "Menghapus foto profil...";
    fb.className = "avatar-upload-feedback";

    try {
      const res = await eel.remove_profile_avatar()();
      if (!res.ok) {
        fb.textContent = res.error || "Gagal menghapus foto.";
        fb.className = "avatar-upload-feedback error";
        return;
      }

      fb.textContent = "Foto profil berhasil dihapus!";
      fb.className = "avatar-upload-feedback success";
      $("profilePhotoInput").value = "";

      await loadCurrentUser();
      await fillProfileForm();
    } catch (err) {
      fb.textContent = `Kesalahan: ${err.message || err}`;
      fb.className = "avatar-upload-feedback error";
    }
  });

  $("profileInfoForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fullName = $("profFullName").value.trim();
    const nim = $("profNim").value.trim();
    const major = $("profMajor").value.trim();
    const faculty = $("profFaculty").value.trim();
    const university = $("profUniversity").value.trim();
    const email = $("profEmail").value.trim();
    const dailyTarget = $("profDailyTarget").value;
    const weeklyTarget = $("profWeeklyTarget").value;
    const theme = $("profTheme").value;
    const msg = $("profileFormMsg");

    msg.textContent = "Menyimpan perubahan profil...";
    msg.className = "form-feedback-msg";

    try {
      const res = await eel.update_profile(fullName, nim, major, faculty, university, email, dailyTarget, weeklyTarget, theme)();
      if (!res.ok) {
        msg.textContent = res.error;
        msg.className = "form-feedback-msg error";
        return;
      }
      msg.textContent = res.message;
      msg.className = "form-feedback-msg success";
      await loadCurrentUser();
      fillProfileForm();
    } catch (err) {
      msg.textContent = `Kesalahan: ${err.message || err}`;
      msg.className = "form-feedback-msg error";
    }
  });

  $("profileSettingsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("profileInfoForm").dispatchEvent(new Event("submit"));
  });

  $("btnOpenNotificationsSettings")?.addEventListener("click", () => {
    $("modalSettings")?.classList.add("show");
  });

  $("btnOpenChangePassword")?.addEventListener("click", async () => {
    const oldPwd = await showPromptModal("Masukkan password lama saat ini:", "", "Ubah Password", true);
    if (oldPwd === null) return;
    if (!oldPwd) {
      showToast("Password lama tidak boleh kosong.", "warning");
      return;
    }
    const newPwd = await showPromptModal("Masukkan password baru (minimal 8 karakter, huruf besar, kecil & angka):", "", "Password Baru", true);
    if (newPwd === null) return;
    if (newPwd.length < 8) {
      showToast("Password baru minimal 8 karakter.", "warning");
      return;
    }
    if (!/[A-Z]/.test(newPwd) || !/[a-z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
      showToast("Password baru harus mengandung kombinasi huruf besar (A-Z), huruf kecil (a-z), dan angka (0-9).", "warning");
      return;
    }
    try {
      const res = await eel.change_password(oldPwd, newPwd)();
      if (!res.ok) {
        showToast(res.error || "Gagal mengubah password.", "error");
      } else {
        showToast("Password berhasil diubah!", "success");
      }
    } catch (err) {
      showToast("Kesalahan: " + (err.message || err), "error");
    }
  });
}

async function fillProfileForm() {
  const user = AppState.currentUser || await eel.get_current_user()();
  if (!user) return;

  $("profileDisplayName").textContent = user.full_name;
  $("profileDisplayNim").textContent = user.nim ? `NIM ${user.nim}` : "-";

  $("profFullName").value = user.full_name || "";
  $("profNim").value = user.nim || "";
  $("profMajor").value = user.major || "Teknik Informatika";
  $("profFaculty").value = user.faculty || "Vokasi";
  $("profUniversity").value = user.university || "";
  $("profEmail").value = user.email || "";

  if (user.daily_target_hours) $("profDailyTarget").value = String(Math.round(user.daily_target_hours));
  if (user.weekly_target_hours) $("profWeeklyTarget").value = String(Math.round(user.weekly_target_hours));
  if (user.theme) $("profTheme").value = user.theme;

  if (user.avatar_data) {
    $("profileAvatarImg").src = user.avatar_data;
    $("profileAvatarImg").style.display = "block";
    $("profileAvatarFallback").style.display = "none";
    if ($("btnRemoveAvatar")) $("btnRemoveAvatar").style.display = "inline-flex";
  } else {
    const initial = (user.full_name || "?").charAt(0).toUpperCase();
    $("profileAvatarImg").style.display = "none";
    $("profileAvatarFallback").textContent = initial;
    $("profileAvatarFallback").style.display = "grid";
    if ($("btnRemoveAvatar")) $("btnRemoveAvatar").style.display = "none";
  }
}

// ================= CSV IMPORT & EXPORT =================
function setupCsvEvents() {
  $("btnOpenImportCsv")?.addEventListener("click", () => {
    $("modalImportCsv").classList.add("show");
    $("csvPreviewArea").style.display = "none";
    $("btnSubmitImportCsv").disabled = true;
    $("csvImportFeedback").textContent = "";
    $("csvFileInput").value = "";
    $("csvFileName").textContent = "Klik untuk memilih file CSV";
  });

  $("btnCloseImportCsv")?.addEventListener("click", () => $("modalImportCsv").classList.remove("show"));
  $("btnCancelImportCsv")?.addEventListener("click", () => $("modalImportCsv").classList.remove("show"));

  $("btnDownloadCsvTemplate")?.addEventListener("click", async () => {
    try {
      const res = await eel.get_csv_template()();
      downloadTextAsFile(res.csv_data, res.filename);
      showToast("Template CSV berhasil diunduh.", "success");
    } catch (err) {
      showToast("Gagal mengunduh template: " + err, "error");
    }
  });

  let rawCsvText = "";
  $("csvFileInput")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $("csvFileName").textContent = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      rawCsvText = reader.result;
      previewCsvContent(rawCsvText);
    };
    reader.readAsText(file, "UTF-8");
  });

  $("btnSubmitImportCsv")?.addEventListener("click", async () => {
    if (!rawCsvText) return;
    const fb = $("csvImportFeedback");
    fb.textContent = "Mengimpor data...";
    fb.className = "form-feedback-msg";

    try {
      const res = await eel.import_csv(rawCsvText)();
      if (!res.ok) {
        fb.textContent = res.error;
        fb.className = "form-feedback-msg error";
        return;
      }
      fb.textContent = res.message;
      fb.className = "form-feedback-msg success";

      setTimeout(async () => {
        $("modalImportCsv").classList.remove("show");
        await renderActivityTable();
        await renderDashboard();
      }, 900);
    } catch (err) {
      fb.textContent = `Kesalahan impor: ${err.message || err}`;
      fb.className = "form-feedback-msg error";
    }
  });
}

function previewCsvContent(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length === 0) return;

  const delimiter = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim());
  const thead = $("csvPreviewThead");
  const tbody = $("csvPreviewTbody");

  thead.innerHTML = `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;

  const previewRows = lines.slice(1, 6);
  tbody.innerHTML = previewRows.map((line) => {
    const cols = line.split(delimiter);
    return `<tr>${cols.map((c) => `<td>${esc(c.trim())}</td>`).join("")}</tr>`;
  }).join("");

  $("csvPreviewArea").style.display = "block";
  $("btnSubmitImportCsv").disabled = false;
}

async function exportCsvFile() {
  try {
    const res = await eel.export_csv()();
    if (res.ok) {
      downloadTextAsFile(res.csv_data, res.filename);
      showToast("Data aktivitas berhasil diexport ke CSV.", "success");
    }
  } catch (err) {
    showToast("Gagal export CSV: " + err, "error");
  }
}

function downloadTextAsFile(text, filename) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ================= SETTINGS & NOTIFICATIONS =================
function setupSettingsEvents() {
  $("btnOpenSettings")?.addEventListener("click", () => $("modalSettings").classList.add("show"));
  $("btnCloseSettingsModal")?.addEventListener("click", () => $("modalSettings").classList.remove("show"));

  $("switchDarkMode")?.addEventListener("change", (e) => toggleDarkMode(e.target.checked));

  $("btnTestSupabaseConn")?.addEventListener("click", async () => {
    const btn = $("btnTestSupabaseConn");
    btn.disabled = true;
    btn.textContent = "Menguji...";
    try {
      const res = await eel.reconnect_supabase()();
      showToast(res.message, res.ok ? "success" : "info");
      await checkDatabaseStatus();
    } catch (err) {
      showToast("Error koneksi: " + err, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Uji Supabase";
    }
  });

  $("btnResetUserData")?.addEventListener("click", async () => {
    const ok = await showConfirmModal("Peringatan: Seluruh data sesi dan jadwal belajarmu akan dihapus. Lanjutkan?", {
      title: "Reset Seluruh Data Belajar",
      confirmText: "Ya, Reset Semua",
      type: "danger"
    });
    if (ok) {
      await eel.clear_all()();
      showToast("Data belajar berhasil direset.", "success");
      showPage("dashboard");
    }
  });

  $("btnNotifications")?.addEventListener("click", async () => {
    $("modalNotifications").classList.add("show");
    try {
      const notifs = await eel.get_system_notifications()();
      const list = $("notificationsList");
      if (!list) return;

      list.innerHTML = notifs.map((n) => `
        <div class="notif-item">
          <div class="notif-icon">🔔</div>
          <div class="notif-content">
            <strong>${esc(n.title)}</strong>
            <p>${esc(n.desc)}</p>
          </div>
        </div>
      `).join("");
    } catch (err) {
      console.warn("Notifications error:", err);
    }
  });

  $("btnCloseNotifModal")?.addEventListener("click", () => $("modalNotifications").classList.remove("show"));
}
