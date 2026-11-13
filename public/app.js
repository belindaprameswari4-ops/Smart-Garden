
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

/* =================================================
   FIREBASE
================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyDvygS_w9sF5aqltxZEq3KFws_ToaTUHac",
  authDomain: "smart-garden-bb510.firebaseapp.com",
  projectId: "smart-garden-bb510",
  storageBucket: "smart-garden-bb510.firebasestorage.app",
  messagingSenderId: "840233525095",
  appId: "1:840233525095:web:94649271668d6bdcccd9c2",
  measurementId: "G-8K0G228H69"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

const $ = id => document.getElementById(id);

/* =================================================
   KONFIGURASI MONITORING
================================================= */

const POLLING_INTERVAL = 5000;
const REQUEST_TIMEOUT = 7000;

let authMode = "login";
let sensorChart = null;
let chartData = [];

let currentMode = 1;
let currentPump = 0;

let pollTimer = null;
let toastTimer = null;
let welcomeTimer = null;

let isPolling = false;
let requestInProgress = false;

/* =================================================
   WELCOME SCREEN
   Tampilkan pemandangan minimal 3,5 detik.
   Tidak menunggu Firebase atau koneksi Blynk.
================================================= */

function hideWelcomeScreen() {
  const welcome = $("welcomeScreen");

  if (!welcome || welcome.dataset.closing === "true") {
    return;
  }

  welcome.dataset.closing = "true";
  welcome.classList.add("is-exiting");

  window.setTimeout(() => {
    welcome.remove();
  }, 450);
}

function initializeWelcomeScreen() {
  const welcome = $("welcomeScreen");

  if (!welcome) return;

  if (welcomeTimer) {
    window.clearTimeout(welcomeTimer);
  }

  welcomeTimer = window.setTimeout(() => {
    hideWelcomeScreen();
  }, 3500);
}

/* =================================================
   NAVIGASI HALAMAN
================================================= */

function showPage(page) {
  const home = $("homePage");
  const authPage = $("authPage");
  const dashboard = $("dashboardPage");

  if (home) home.hidden = page !== "home";
  if (authPage) authPage.hidden = page !== "auth";
  if (dashboard) dashboard.hidden = page !== "dashboard";
}

/* =================================================
   TOAST
================================================= */

function toast(message) {
  const element = $("toast");

  if (!element) {
    console.log(message);
    return;
  }

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = window.setTimeout(() => {
    element.classList.remove("show");
  }, 3000);
}

/* =================================================
   FORM LOGIN DAN REGISTER
================================================= */

function openAuth(mode = "login") {
  authMode = mode;

  const title = $("authTitle");
  const subtitle = $("authSubtitle");
  const submit = $("authSubmit");
  const nameGroup = $("nameGroup");
  const fullName = $("fullName");
  const authSwitch = $("authSwitch");
  const message = $("authMessage");

  if (title) {
    title.textContent =
      mode === "login"
        ? "Selamat Datang Kembali"
        : "Buat Akun Baru";
  }

  if (subtitle) {
    subtitle.textContent =
      mode === "login"
        ? "Masuk untuk memantau tanaman dan penyiraman."
        : "Mulai rawat tanaman dengan lebih cerdas.";
  }

  if (submit) {
    submit.textContent =
      mode === "login" ? "MASUK" : "DAFTAR SEKARANG";
  }

  if (nameGroup) {
    nameGroup.hidden = mode === "login";
  }

  if (fullName) {
    fullName.required = mode === "register";
  }

  if (message) {
    message.textContent = "";
  }

  if (authSwitch) {
    authSwitch.innerHTML =
      mode === "login"
        ? 'Belum punya akun? <button type="button" id="switchRegister">Daftar sekarang</button>'
        : 'Sudah punya akun? <button type="button" id="switchLogin">Masuk sekarang</button>';

    const switchButton = $(
      mode === "login" ? "switchRegister" : "switchLogin"
    );

    switchButton?.addEventListener("click", () => {
      openAuth(mode === "login" ? "register" : "login");
    });
  }

  showPage("auth");
}

["homeLogin", "heroLogin"].forEach(id => {
  $(id)?.addEventListener("click", () => openAuth("login"));
});

["homeRegister", "heroStart"].forEach(id => {
  $(id)?.addEventListener("click", () => openAuth("register"));
});

$("backHome")?.addEventListener("click", () => {
  showPage("home");
});

/* =================================================
   PESAN ERROR FIREBASE
================================================= */

function translateFirebaseError(code, fallback) {
  const messages = {
    "auth/email-already-in-use":
      "Email sudah terdaftar.",

    "auth/invalid-email":
      "Format email tidak valid.",

    "auth/weak-password":
      "Password terlalu lemah.",

    "auth/invalid-credential":
      "Email atau password salah.",

    "auth/user-not-found":
      "Akun tidak ditemukan.",

    "auth/wrong-password":
      "Password salah.",

    "auth/too-many-requests":
      "Terlalu banyak percobaan. Coba lagi nanti.",

    "auth/network-request-failed":
      "Koneksi internet bermasalah. Periksa jaringanmu.",

    "auth/popup-closed-by-user":
      "Login Google dibatalkan.",

    "auth/popup-blocked":
      "Popup diblokir browser. Izinkan popup untuk login.",

    "auth/unauthorized-domain":
      "Domain website belum diizinkan di Firebase.",

    "auth/operation-not-allowed":
      "Metode login belum diaktifkan di Firebase."
  };

  return messages[code] || fallback ||
    "Terjadi kesalahan. Silakan coba kembali.";
}

/* =================================================
   LOGIN / REGISTER
================================================= */

$("authForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("email")?.value.trim() || "";
  const password = $("password")?.value || "";
  const name = $("fullName")?.value.trim() || "";

  const submitButton = $("authSubmit");
  const message = $("authMessage");

  if (submitButton) submitButton.disabled = true;
  if (message) message.textContent = "Memproses akun...";

  try {
    if (authMode === "register") {
      if (!name) {
        throw new Error("Nama lengkap harus diisi.");
      }

      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await updateProfile(result.user, {
        displayName: nama
      });

      if (message) message.textContent = "";
      toast("Pendaftaran berhasil!");
    } else {
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      if (message) message.textContent = "";
      toast("Login berhasil!");
    }
  } catch (error) {
    console.error("Authentication error:", error);

    if (message) {
      message.textContent = translateFirebaseError(
        error.code,
        error.message
      );
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

/* =================================================
   LOGIN GOOGLE
================================================= */

$("googleLogin")?.addEventListener("click", async () => {
  const message = $("authMessage");
  const button = $("googleLogin");

  if (button) button.disabled = true;
  if (message) message.textContent = "Menghubungkan akun Google...";

  try {
    await signInWithPopup(auth, googleProvider);

    if (message) message.textContent = "";
    toast("Berhasil masuk dengan Google!");
  } catch (error) {
    console.error("Google login error:", error);

    if (message) {
      message.textContent = translateFirebaseError(
        error.code,
        error.message
      );
    }
  } finally {
    if (button) button.disabled = false;
  }
});

/* =================================================
   STATUS AUTENTIKASI
================================================= */

onAuthStateChanged(auth, user => {
  /*
   * Welcome screen tetap ditutup oleh timer 3,5 detik.
   * Kecepatan Firebase tidak memengaruhi durasinya.
   */

  if (user) {
    if ($("userName")) {
      $("userName").textContent =
        user.displayName || user.email || "Pengguna";
    }

    $("welcomeName").textContent =
  user.displayName ||
  user.email?.split("@")[0] ||
  "Pengguna";if ($("welcomeName")) {
      $("welcomeName").textContent =
        user.displayName || "Gardener";
    }

    showPage("dashboard");
    startMonitoring();
  } else {
    stopMonitoring();
    showPage("home");
  }
});

/* =================================================
   LOGOUT
================================================= */

$("logoutButton")?.addEventListener("click", async () => {
  try {
    stopMonitoring();
    await signOut(auth);

    toast("Berhasil logout.");
  } catch (error) {
    console.error("Logout error:", error);
    toast("Gagal logout. Silakan coba lagi.");
  }
});

/* =================================================
   REQUEST KE SERVER
================================================= */

async function api(endpoint, options = {}) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Silakan login terlebih dahulu.");
  }

  const idToken = await user.getIdToken();

  const controller = new AbortController();

  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT);

  try {
    const response = await fetch(endpoint, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.headers || {}),
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || `Permintaan gagal (${response.status}).`
      );
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "Server terlalu lama merespons. Coba lagi sebentar."
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/* =================================================
   MONITORING SENSOR
================================================= */

function startMonitoring() {
  if (isPolling || !auth.currentUser) return;

  isPolling = true;

  loadDeviceData();

  pollTimer = window.setInterval(() => {
    loadDeviceData();
  }, POLLING_INTERVAL);
}

function stopMonitoring() {
  isPolling = false;

  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function loadDeviceData() {
  if (
    !auth.currentUser ||
    !isPolling ||
    requestInProgress
  ) {
    return;
  }

  requestInProgress = true;

  try {
    const result = await api("/api/device");

    if (!isPolling) return;

    const values = result.values || {};

    renderData(values);
    setConnection(true);
  } catch (error) {
    setConnection(false);
    console.error("Monitoring error:", error);
  } finally {
    requestInProgress = false;
  }
}

/* =================================================
   STATUS KONEKSI
================================================= */

function setConnection(online) {
  const connection = $("connection");
  const dot = $("connectionDot");

  if (connection) {
    connection.textContent = online
      ? "BLYNK API TERHUBUNG"
      : "BLYNK TIDAK TERHUBUNG";
  }

  if (dot) {
    dot.className = online
      ? "dot online"
      : "dot offline";
  }
}

/* =================================================
   DATA SENSOR
================================================= */

function readNumber(value) {
  if (value === undefined || value === null || value === "") {
    return NaN;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function renderData(data) {
  const soil = readNumber(data.v1);
  const humidity = readNumber(data.v2);
  const temp = readNumber(data.v5);

  if (Number.isFinite(temp) && $("temperature")) {
    $("temperature").textContent = temp.toFixed(1);
  }

  if (Number.isFinite(soil) && $("soil")) {
    $("soil").textContent = soil.toFixed(0);
  }

  if (Number.isFinite(humidity) && $("humidity")) {
    $("humidity").textContent = humidity.toFixed(0);
  }

  if ($("soilMeter") && Number.isFinite(soil)) {
    $("soilMeter").style.width =
      `${Math.max(0, Math.min(100, soil))}%`;
  }

  if ($("humidityMeter") && Number.isFinite(humidity)) {
    $("humidityMeter").style.width =
      `${Math.max(0, Math.min(100, humidity))}%`;
  }

  if (data.v3 !== undefined) {
    currentMode = Number(data.v3) === 0 ? 0 : 1;

    if ($("mode")) {
      $("mode").value = String(currentMode);
    }

    updateModeLabels();
  }

  if (data.v4 !== undefined) {
    currentPump = Number(data.v4) === 1 ? 1 : 0;

    if ($("pumpStatus")) {
      $("pumpStatus").textContent =
        currentPump ? "ON" : "OFF";
    }

    if ($("pumpState")) {
      $("pumpState").textContent =
        currentPump ? "ON" : "OFF";
    }

    if ($("pumpNote")) {
      $("pumpNote").textContent = currentPump
        ? "Pompa sedang menyala"
        : "Pompa berhenti";
    }

    if ($("pumpHint")) {
      $("pumpHint").textContent = currentPump
        ? "Air sedang dialirkan ke tanaman."
        : "Pompa sedang tidak aktif.";
    }
  }

  if ($("controlMessage")) {
    $("controlMessage").textContent =
      `Mode: ${currentMode === 1 ? "AUTOMATIC" : "MANUAL"} | Pompa: ${currentPump ? "ON" : "OFF"}`;
  }

  if ($("modeLabel")) {
    $("modeLabel").textContent =
      currentMode === 1 ? "AUTOMATIC" : "MANUAL";
  }

  if ($("modeStatus")) {
    $("modeStatus").textContent =
      currentMode === 1 ? "AUTO" : "MANUAL";
  }

  if ($("lastUpdate")) {
    $("lastUpdate").textContent =
      new Date().toLocaleTimeString("id-ID");
  }

  if ($("soilStatus") && Number.isFinite(soil)) {
    $("soilStatus").textContent =
      soil < 40 ? "Tanah kering" :
      soil < 70 ? "Kelembapan cukup" :
      "Tanah lembap";
  }

  // Grafik sensor langsung tetap digunakan.
  updateChart(temp, soil, humidity);
}

function updateModeLabels() {
  const modeLabel = currentMode === 1
    ? "AUTOMATIC"
    : "MANUAL";

  if ($("modeLabel")) {
    $("modeLabel").textContent = modeLabel;
  }

  if ($("modeStatus")) {
    $("modeStatus").textContent = modeLabel;
  }
}

/* =================================================
   KONTROL MODE AUTO / MANUAL
================================================= */

$("mode")?.addEventListener("change", async () => {
  const modeSelect = $("mode");
  if (!modeSelect) return;

  const requestedMode =
    Number(modeSelect.value) === 0 ? 0 : 1;

  const previousMode = currentMode;

  modeSelect.disabled = true;

  try {
    await sendPin("V3", requestedMode);

    currentMode = requestedMode;
    updateModeLabels();

    if (requestedMode === 0) {
      await sendPin("V4", 0);

      currentPump = 0;

      if ($("pumpStatus")) {
        $("pumpStatus").textContent = "OFF";
      }

      if ($("pumpState")) {
        $("pumpState").textContent = "OFF";
      }

      if ($("pumpNote")) {
        $("pumpNote").textContent =
          "Pompa berhenti — mode manual";
      }

      toast("Mode MANUAL aktif.");
    } else {
      toast("Mode AUTOMATIC aktif.");
    }
  } catch (error) {
    currentMode = previousMode;
    modeSelect.value = String(previousMode);

    updateModeLabels();

    toast(`Gagal mengubah mode: ${error.message}`);
  } finally {
    modeSelect.disabled = false;
  }
});

/* =================================================
   KONTROL POMPA
================================================= */

async function controlPump(status) {
  if (currentMode !== 0) {
    toast("Pilih Manual Mode terlebih dahulu.");
    return;
  }

  const buttons = [$("pumpOn"), $("pumpOff")];

  buttons.forEach(button => {
    if (button) button.disabled = true;
  });

  try {
    await sendPin("V4", status ? 1 : 0);

    currentPump = status ? 1 : 0;

    if ($("pumpStatus")) {
      $("pumpStatus").textContent =
        currentPump ? "ON" : "OFF";
    }

    if ($("pumpState")) {
      $("pumpState").textContent =
        currentPump ? "ON" : "OFF";
    }

    if ($("pumpNote")) {
      $("pumpNote").textContent =
        currentPump
          ? "Pompa sedang menyala"
          : "Pompa berhenti";
    }

    if ($("pumpHint")) {
      $("pumpHint").textContent =
        currentPump
          ? "Air sedang dialirkan ke tanaman."
          : "Pompa sedang tidak aktif.";
    }

    toast(
      status
        ? "Perintah pompa ON berhasil dikirim."
        : "Perintah pompa OFF berhasil dikirim."
    );
  } catch (error) {
    toast(`Gagal mengontrol pompa: ${error.message}`);
  } finally {
    buttons.forEach(button => {
      if (button) button.disabled = false;
    });
  }
}

$("pumpOn")?.addEventListener("click", () => {
  controlPump(true);
});

$("pumpOff")?.addEventListener("click", () => {
  controlPump(false);
});

/* =================================================
   KIRIM VIRTUAL PIN
================================================= */

async function sendPin(pin, value) {
  return api("/api/datastream", {
    method: "POST",
    body: JSON.stringify({ pin, value })
  });
}

/* =================================================
   GRAFIK SENSOR LANGSUNG
================================================= */

function updateChart(temp, soil, humidity) {
  if (![temp, soil, humidity].every(Number.isFinite)) {
    return;
  }

  chartData.push({
    time: new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit"
    }),
    temp,
    soil,
    humidity
  });

  if (chartData.length > 24) {
    chartData.shift();
  }

  const canvas = $("sensorChart");

  if (!canvas || typeof Chart === "undefined") return;

  const labels = chartData.map(item => item.time);

  const datasets = [
    {
      label: "Suhu (°C)",
      data: chartData.map(item => item.temp),
      borderColor: "#e99a53",
      backgroundColor: "rgba(233,154,83,.12)",
      tension: 0.35,
      fill: true,
      yAxisID: "y"
    },
    {
      label: "Kelembapan tanah (%)",
      data: chartData.map(item => item.soil),
      borderColor: "#26764d",
      backgroundColor: "rgba(38,118,77,.10)",
      tension: 0.35,
      fill: true,
      yAxisID: "y1"
    },
    {
      label: "Kelembapan udara (%)",
      data: chartData.map(item => item.humidity),
      borderColor: "#5c9bd6",
      backgroundColor: "rgba(92,155,214,.08)",
      tension: 0.35,
      fill: false,
      yAxisID: "y1"
    }
  ];

  if (!sensorChart) {
    sensorChart = new Chart(canvas, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          intersect: false,
          mode: "index"
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 6 }
          },
          y: {
            position: "left",
            beginAtZero: true
          },
          y1: {
            position: "right",
            min: 0,
            max: 100,
            grid: { drawOnChartArea: false }
          }
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              usePointStyle: true,
              boxWidth: 7
            }
          }
        }
      }
    });
  } else {
    sensorChart.data.labels = labels;

    sensorChart.data.datasets.forEach((dataset, index) => {
      dataset.data = datasets[index].data;
    });

    sensorChart.update("none");
  }
}

/* =================================================
   NAVIGASI BAGIAN HALAMAN
================================================= */

document.querySelectorAll(".bottom-nav a").forEach(link => {
  link.addEventListener("click", event => {
    const href = link.getAttribute("href");

    if (!href || !href.startsWith("#")) return;

    const target = document.querySelector(href);

    if (!target) return;

    event.preventDefault();

    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
});

/* =================================================
   INISIALISASI
================================================= */

initializeWelcomeScreen();

console.log("Smart Plant app.js berhasil dimuat.");
