"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const LICENSE_SCHEMA = 1;
const PRODUCT = "Nio-OS";
const KEY_ID = "nio-ed25519-3aed3b0a255d893d";
const PUBLIC_KEY_PEM = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEACW/UCzkk23U6LOBwz92dR4ccVF9+zXIzJeBT2lmlWno=\n-----END PUBLIC KEY-----\n";
const INSTALLATION_ID_FILE = "installation-id";
const LICENSE_FILE = "license.nio";

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";

  const keys = Object.keys(value).sort();
  return (
    "{" +
    keys.map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") +
    "}"
  );
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function base64urlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = normalized + (pad ? "=".repeat(4 - pad) : "");
  return Buffer.from(padded, "base64");
}

function licenseDir(userDataDir) {
  return path.join(path.resolve(userDataDir), "license");
}

function installationIdPath(userDataDir) {
  return path.join(licenseDir(userDataDir), INSTALLATION_ID_FILE);
}

function licensePath(userDataDir) {
  return path.join(licenseDir(userDataDir), LICENSE_FILE);
}

function assertUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function ensureInstallationId(userDataDir) {
  const dir = licenseDir(userDataDir);
  const file = installationIdPath(userDataDir);
  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, "utf8").trim();
    if (!assertUuid(current)) {
      throw new Error("INSTALLATION_ID_INVALID");
    }
    return current;
  }

  const installationId = crypto.randomUUID();
  const temp = file + ".tmp-" + process.pid + "-" + Date.now();
  fs.writeFileSync(temp, installationId + os.EOL, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temp, file);
  return installationId;
}

function runText(command, args) {
  const r = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: 15000,
  });

  if (r.status !== 0) return "";
  return String(r.stdout || "").trim();
}

function windowsMachineGuid() {
  if (process.platform !== "win32") return "";

  const text = runText("reg.exe", [
    "query",
    "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
    "/v",
    "MachineGuid",
  ]);

  const match = text.match(/MachineGuid\s+REG_\w+\s+([^\r\n]+)/i);
  return match ? match[1].trim() : "";
}

function windowsSystemUuid() {
  if (process.platform !== "win32") return "";

  const text = runText("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-Command",
    "(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction Stop).UUID",
  ]);

  if (!text) return "";
  return text.split(/\r?\n/)[0].trim();
}

function machineFingerprint(installationId) {
  const machineGuid = windowsMachineGuid();
  const systemUuid = windowsSystemUuid();

  if (process.platform === "win32" && !machineGuid && !systemUuid) {
    throw new Error("MACHINE_ID_UNAVAILABLE");
  }

  const fallback =
    process.platform === "win32"
      ? ""
      : [os.hostname(), os.platform(), os.arch()].join("|");

  const material = [
    "nio-os-machine-v1",
    installationId,
    machineGuid.toLowerCase(),
    systemUuid.toLowerCase(),
    fallback.toLowerCase(),
  ].join("\n");

  return sha256Hex(material);
}

function machineIdentityHash() {
  const machineGuid = windowsMachineGuid();
  const systemUuid = windowsSystemUuid();

  if (process.platform === "win32" && !machineGuid && !systemUuid) {
    throw new Error("MACHINE_ID_UNAVAILABLE");
  }

  const fallback =
    process.platform === "win32"
      ? ""
      : [os.hostname(), os.platform(), os.arch()].join("|");

  const material = [
    "nio-os-hardware-v1",
    machineGuid.toLowerCase(),
    systemUuid.toLowerCase(),
    fallback.toLowerCase(),
  ].join("\n");

  return sha256Hex(material);
}

function machineCodeFromFingerprint(fingerprint) {
  const clean = String(fingerprint || "").replace(/[^a-f0-9]/gi, "").toUpperCase();
  return "NIO-" + [
    clean.slice(0, 4),
    clean.slice(4, 8),
    clean.slice(8, 12),
    clean.slice(12, 16),
  ].join("-");
}

function buildActivationRequest(userDataDir, appVersion = "") {
  const installationId = ensureInstallationId(userDataDir);
  const fingerprint = machineFingerprint(installationId);

  return {
    schema: 1,
    product: PRODUCT,
    installationId,
    machineFingerprint: fingerprint,
    machineCode: machineCodeFromFingerprint(fingerprint),
    appVersion: String(appVersion || ""),
  };
}

function signedEnvelopeBytes(envelope) {
  return Buffer.from(
    stableStringify({
      schema: envelope.schema,
      keyId: envelope.keyId,
      payload: envelope.payload,
    }),
    "utf8"
  );
}

function validateDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function todayLocalDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "PAYLOAD_INVALID";
  }

  if (payload.product !== PRODUCT) return "PRODUCT_INVALID";
  if (!/^NIO-[A-Z0-9-]{4,64}$/.test(String(payload.licenseId || ""))) {
    return "LICENSE_ID_INVALID";
  }

  if (!String(payload.clientName || "").trim()) return "CLIENT_NAME_INVALID";
  if (!assertUuid(payload.installationId)) return "INSTALLATION_ID_INVALID";

  if (!/^[a-f0-9]{64}$/i.test(String(payload.machineFingerprint || ""))) {
    return "MACHINE_FINGERPRINT_INVALID";
  }

  if (payload.issuedOn && !validateDateOnly(payload.issuedOn)) {
    return "ISSUED_ON_INVALID";
  }

  if (payload.expiresOn && !validateDateOnly(payload.expiresOn)) {
    return "EXPIRES_ON_INVALID";
  }

  if (
    payload.features !== undefined &&
    (payload.features === null ||
      typeof payload.features !== "object" ||
      Array.isArray(payload.features))
  ) {
    return "FEATURES_INVALID";
  }

  return "";
}

function licencaLocalIlimitadaPadrao(userDataDir) {
  let fingerprint = "LOCAL_OFFLINE_PRO";
  try {
    if (userDataDir) {
      const installationId = ensureInstallationId(userDataDir);
      fingerprint = machineFingerprint(installationId);
    }
  } catch {}

  return {
    ok: true,
    code: "OK",
    license: {
      licenseId: "OFFLINE-ILIMITADO",
      clientName: "Assistência Técnica Local",
      plan: "PRO (Vitalício)",
      issuedOn: "2026-01-01",
      expiresOn: null,
      features: { all: true, localOnly: true },
      machineCode: machineCodeFromFingerprint(fingerprint),
    },
  };
}

function verifyLicenseObject(envelope, userDataDir, options = {}) {
  // Edição 100% Local Desbloqueada: validação sempre positiva
  if (!envelope) {
    return licencaLocalIlimitadaPadrao(userDataDir);
  }

  try {
    if (envelope.payload) {
      const installationId = userDataDir ? ensureInstallationId(userDataDir) : "";
      const fingerprint = installationId ? machineFingerprint(installationId) : "LOCAL_OFFLINE_PRO";
      return {
        ok: true,
        code: "OK",
        license: {
          licenseId: envelope.payload.licenseId || "OFFLINE-ILIMITADO",
          clientName: envelope.payload.clientName || "Assistência Técnica Local",
          plan: String(envelope.payload.plan || "PRO (Vitalício)"),
          issuedOn: envelope.payload.issuedOn || "2026-01-01",
          expiresOn: null,
          features: envelope.payload.features || { all: true },
          machineCode: machineCodeFromFingerprint(fingerprint),
        },
      };
    }
    return licencaLocalIlimitadaPadrao(userDataDir);
  } catch {
    return licencaLocalIlimitadaPadrao(userDataDir);
  }
}

function verifyLicenseFile(userDataDir, options = {}) {
  const file = options.file || licensePath(userDataDir);

  if (!fs.existsSync(file)) {
    return licencaLocalIlimitadaPadrao(userDataDir);
  }

  try {
    const envelope = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      ...verifyLicenseObject(envelope, userDataDir, options),
      file,
    };
  } catch {
    return {
      ...licencaLocalIlimitadaPadrao(userDataDir),
      file,
    };
  }
}

module.exports = {
  LICENSE_SCHEMA,
  PRODUCT,
  KEY_ID,
  PUBLIC_KEY_PEM,
  INSTALLATION_ID_FILE,
  LICENSE_FILE,
  stableStringify,
  base64urlEncode,
  base64urlDecode,
  licenseDir,
  installationIdPath,
  licensePath,
  ensureInstallationId,
  machineFingerprint,
  machineIdentityHash,
  machineCodeFromFingerprint,
  buildActivationRequest,
  signedEnvelopeBytes,
  verifyLicenseObject,
  verifyLicenseFile,
};
