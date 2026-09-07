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
    timeout: 5000,
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

function verifyLicenseObject(envelope, userDataDir, options = {}) {
  try {
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      return { ok: false, code: "LICENSE_FORMAT_INVALID" };
    }

    if (envelope.schema !== LICENSE_SCHEMA) {
      return { ok: false, code: "LICENSE_SCHEMA_UNSUPPORTED" };
    }

    if (envelope.keyId !== KEY_ID) {
      return { ok: false, code: "LICENSE_KEY_UNKNOWN" };
    }

    const payloadError = validatePayload(envelope.payload);
    if (payloadError) return { ok: false, code: payloadError };

    if (!/^[A-Za-z0-9_-]{64,256}$/.test(String(envelope.signature || ""))) {
      return { ok: false, code: "SIGNATURE_FORMAT_INVALID" };
    }

    const publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);
    const signature = base64urlDecode(envelope.signature);
    const verified = crypto.verify(
      null,
      signedEnvelopeBytes(envelope),
      publicKey,
      signature
    );

    if (!verified) {
      return { ok: false, code: "SIGNATURE_INVALID" };
    }

    const installationId = ensureInstallationId(userDataDir);
    if (envelope.payload.installationId !== installationId) {
      return { ok: false, code: "INSTALLATION_MISMATCH" };
    }

    const fingerprint = machineFingerprint(installationId);
    if (
      String(envelope.payload.machineFingerprint).toLowerCase() !==
      fingerprint.toLowerCase()
    ) {
      return { ok: false, code: "MACHINE_MISMATCH" };
    }

    const now = options.now instanceof Date ? options.now : new Date();
    const today = todayLocalDate(now);

    if (envelope.payload.issuedOn && today < envelope.payload.issuedOn) {
      return { ok: false, code: "LICENSE_NOT_YET_VALID" };
    }

    if (envelope.payload.expiresOn && today > envelope.payload.expiresOn) {
      return { ok: false, code: "LICENSE_EXPIRED" };
    }

    return {
      ok: true,
      code: "OK",
      license: {
        licenseId: envelope.payload.licenseId,
        clientName: envelope.payload.clientName,
        plan: String(envelope.payload.plan || "PRO"),
        issuedOn: envelope.payload.issuedOn || null,
        expiresOn: envelope.payload.expiresOn || null,
        features: envelope.payload.features || {},
        machineCode: machineCodeFromFingerprint(fingerprint),
      },
    };
  } catch (error) {
    return {
      ok: false,
      code: "LICENSE_VERIFY_ERROR",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function verifyLicenseFile(userDataDir, options = {}) {
  const file = options.file || licensePath(userDataDir);

  if (!fs.existsSync(file)) {
    return { ok: false, code: "LICENSE_NOT_FOUND", file };
  }

  try {
    const envelope = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      ...verifyLicenseObject(envelope, userDataDir, options),
      file,
    };
  } catch (error) {
    return {
      ok: false,
      code: "LICENSE_FILE_INVALID",
      file,
      message: error instanceof Error ? error.message : String(error),
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
