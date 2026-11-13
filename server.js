require("dotenv").config();

const express = require("express");
const path = require("path");
const { createRemoteJWKSet, jwtVerify } = require("jose");

// ==================================================
// 1. KONFIGURASI SERVER
// ==================================================

const app = express();

const PORT = Number(process.env.PORT) || 3000;

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || "smart-garden-bb510";

const BLYNK_TOKEN =
  (process.env.BLYNK_AUTH_TOKEN || "").trim();

const BLYNK_BASE =
  "https://blynk.cloud/external/api";

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

// Virtual pin yang masih digunakan website.
const ALLOWED_PINS = new Set(["V3", "V4"]);

// ==================================================
// 2. MIDDLEWARE
// ==================================================

app.disable("x-powered-by");

app.use(
  express.json({
    limit: "20kb"
  })
);

app.use(express.static(path.join(__dirname, "public")));

if (!BLYNK_TOKEN) {
  console.warn(
    "[CONFIG] BLYNK_AUTH_TOKEN belum diatur di file .env."
  );
}

// ==================================================
// 3. VALIDASI DATASTREAM
// ==================================================

function validBinary(value) {
  return [
    0,
    1,
    "0",
    "1",
    true,
    false
  ].includes(value);
}

function validatePinValue(pin, value) {
  switch (pin) {
    case "V3":
      if (!validBinary(value)) {
        return "Mode harus 0 (Manual) atau 1 (Otomatis).";
      }
      break;

    case "V4":
      if (!validBinary(value)) {
        return "Status pompa harus 0 (OFF) atau 1 (ON).";
      }
      break;

    default:
      return "Virtual pin tidak diizinkan.";
  }

  return null;
}

// ==================================================
// 4. REQUEST KE BLYNK
// ==================================================

async function blynkRequest(endpoint, params = {}) {
  if (!BLYNK_TOKEN) {
    throw new Error(
      "Token Blynk belum diatur di file .env."
    );
  }

  const url = new URL(`${BLYNK_BASE}/${endpoint}`);

  url.searchParams.set("token", BLYNK_TOKEN);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000)
  });

  const body = await response.text();

  if (
    !response.ok ||
    /invalid token|wrong pin|not found|not allowed|not supported|request failed/i.test(
      body
    )
  ) {
    throw new Error(
      `Blynk HTTP ${response.status}: ${
        body || "Permintaan ditolak."
      }`
    );
  }

  return body;
}

// ==================================================
// 5. AUTENTIKASI FIREBASE
// ==================================================

async function requireLogin(req, res, next) {
  try {
    const authorization =
      req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Silakan login terlebih dahulu."
      });
    }

    const token = authorization.slice(7);

    const { payload } = await jwtVerify(
      token,
      FIREBASE_JWKS,
      {
        issuer: `https://securetoken.google.com/${PROJECT_ID}`,
        audience: PROJECT_ID,
        algorithms: ["RS256"]
      }
    );

    if (!payload.sub) {
      return res.status(401).json({
        success: false,
        error: "Token Firebase tidak valid."
      });
    }

    req.user = {
      uid: payload.sub,
      email: payload.email || ""
    };

    return next();
  } catch (error) {
    console.error("[AUTH]", error.message);

    return res.status(401).json({
      success: false,
      error:
        "Sesi login tidak valid atau kedaluwarsa. Silakan login kembali."
    });
  }
}

// ==================================================
// 6. STATUS SERVER
// ==================================================

app.get("/api/health", (_req, res) => {
  return res.json({
    success: true,
    projectId: PROJECT_ID,

    features: {
      firebaseAuthentication: true,
      blynkIntegration: Boolean(BLYNK_TOKEN),
      liveSensorData: true,
      pumpControl: true,
      modeControl: true,
      wateringHistory: false,
      historicalCharts: false,
      csvExport: false,
      storage: "none"
    },

    controlPins: [...ALLOWED_PINS]
  });
});

// ==================================================
// 7. MEMBACA DATA SENSOR DARI BLYNK
// ==================================================

app.get(
  "/api/device",
  requireLogin,
  async (_req, res) => {
    try {
      const raw = await blynkRequest("getAll");

      let values;

      try {
        values = JSON.parse(raw);
      } catch {
        throw new Error(
          "Respons Blynk bukan JSON yang valid."
        );
      }

      if (
        !values ||
        typeof values !== "object" ||
        Array.isArray(values)
      ) {
        throw new Error(
          "Format data Blynk tidak sesuai."
        );
      }

      return res.json({
        success: true,
        values
      });
    } catch (error) {
      console.error("[BLYNK READ]", error.message);

      return res.status(502).json({
        success: false,
        error:
          "Gagal membaca Blynk. Periksa token, koneksi internet, dan konfigurasi datastream."
      });
    }
  }
);

// ==================================================
// 8. MENGIRIM PERINTAH KE BLYNK
// ==================================================

app.post(
  "/api/datastream",
  requireLogin,
  async (req, res) => {
    try {
      const { pin, value } = req.body || {};

      // Hanya izinkan pin mode dan pompa.
      if (
        typeof pin !== "string" ||
        !ALLOWED_PINS.has(pin)
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Pin tidak diizinkan. Gunakan V3 untuk mode dan V4 untuk pompa."
        });
      }

      if (
        !["number", "string", "boolean"].includes(
          typeof value
        )
      ) {
        return res.status(400).json({
          success: false,
          error: "Nilai datastream tidak valid."
        });
      }

      const validationError =
        validatePinValue(pin, value);

      if (validationError) {
        return res.status(400).json({
          success: false,
          error: validationError
        });
      }

      const result = await blynkRequest(
        "update",
        {
          [pin]: value
        }
      );

      console.log(
        `[BLYNK UPDATE] ${pin}=${value} | ${
          req.user.email || req.user.uid
        }`
      );

      return res.json({
        success: true,
        message: `${pin} berhasil dikirim ke Blynk.`,
        pin,
        value,
        blynkResponse: result
      });
    } catch (error) {
      console.error("[BLYNK UPDATE]", error.message);

      return res.status(502).json({
        success: false,
        error:
          "Gagal mengirim perintah ke Blynk. Periksa token dan konfigurasi datastream."
      });
    }
  }
);

// ==================================================
// 9. API TIDAK DITEMUKAN
// ==================================================

app.use("/api", (_req, res) => {
  return res.status(404).json({
    success: false,
    error: "Endpoint API tidak ditemukan."
  });
});

// ==================================================
// 10. PENANGANAN ERROR
// ==================================================

app.use((error, _req, res, _next) => {
  console.error("[SERVER]", error.message);

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: "Format JSON yang dikirim tidak valid."
    });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: "Ukuran data yang dikirim terlalu besar."
    });
  }

  return res.status(500).json({
    success: false,
    error: "Terjadi kesalahan pada server."
  });
});

// ==================================================
// 11. MENJALANKAN SERVER
// ==================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log("----------------------------------------");
  console.log("SMART PLANT WATERING SYSTEM");
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Firebase project: ${PROJECT_ID}`);
  console.log(
    `Blynk token configured: ${Boolean(BLYNK_TOKEN)}`
  );
  console.log("Firebase Authentication: READY");
  console.log("Blynk Integration: READY");
  console.log("Live Sensor Data: READY");
  console.log("Pump Control (V4): READY");
  console.log("Mode Control (V3): READY");
  console.log("Watering History: DISABLED");
  console.log("Historical Charts API: DISABLED");
  console.log("CSV Export: DISABLED");
  console.log("----------------------------------------");
});
