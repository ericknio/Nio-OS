"use strict";

const CLOUD_PROTOCOL_VERSION = 1;
const PRODUCT = "Nio-OS";

const ACCOUNT_STATUS = Object.freeze(["ACTIVE", "BLOCKED"]);
const INSTALLATION_STATUS = Object.freeze(["ACTIVE", "BLOCKED", "REVOKED"]);
const ENTITLEMENT_STATUS = Object.freeze(["ACTIVE", "BLOCKED", "EXPIRED"]);
const ENTITLEMENT_TYPE = Object.freeze(["TRIAL", "PAID"]);
const PLAN = Object.freeze(["BASIC", "PRO"]);
const SYNC_STATUS = Object.freeze(["ACTIVE", "BLOCKED", "EXPIRED"]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(obj, allowed, required = allowed) {
  if (!isObject(obj)) fail("INVALID_BODY", "Corpo deve ser objeto JSON.");

  const allowedSet = new Set(allowed);
  const keys = Object.keys(obj);

  for (const key of keys) {
    if (!allowedSet.has(key)) fail("UNKNOWN_FIELD", `Campo não permitido: ${key}`);
  }

  for (const key of required) {
    if (!(key in obj)) fail("MISSING_FIELD", `Campo obrigatório ausente: ${key}`);
  }
}

function stringField(value, name, min, max) {
  if (typeof value !== "string") fail("INVALID_FIELD", `${name} deve ser string.`);
  const clean = value.trim();

  if (clean.length < min || clean.length > max) {
    fail("INVALID_FIELD", `${name} deve ter entre ${min} e ${max} caracteres.`);
  }

  if (/[\u0000-\u001F\u007F]/.test(clean)) {
    fail("INVALID_FIELD", `${name} contém caracteres de controle.`);
  }

  return clean;
}

function normalizeLoginOrEmail(value) {
  const login = stringField(value, "email", 3, 254).toLowerCase();
  const isUsername = /^[a-z0-9._-]{3,120}$/.test(login);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login);
  if (!isUsername && !isEmail) {
    fail("INVALID_LOGIN", "Login ou e-mail inválido.");
  }
  return login;
}

const normalizeEmail = normalizeLoginOrEmail;

function assertHexSha256(value, name) {
  const clean = stringField(value, name, 64, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(clean)) fail("INVALID_FIELD", `${name} inválido.`);
  return clean;
}

function assertInstallationId(value) {
  const clean = stringField(value, "installationId", 16, 128);
  if (!/^[A-Za-z0-9._:-]+$/.test(clean)) {
    fail("INVALID_FIELD", "installationId contém caracteres inválidos.");
  }
  return clean;
}

function assertMachineCode(value) {
  const clean = stringField(value, "machineCode", 8, 128).toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(clean)) fail("INVALID_FIELD", "machineCode inválido.");
  return clean;
}

function assertPassword(value) {
  if (typeof value !== "string") fail("INVALID_FIELD", "password deve ser string.");
  if (value.length < 8 || value.length > 256) {
    fail("INVALID_FIELD", "password deve ter entre 8 e 256 caracteres.");
  }
  if (/[\u0000\r\n]/.test(value)) fail("INVALID_FIELD", "password contém caracteres inválidos.");
  return value;
}

function assertRegisterRequest(body) {
  assertExactKeys(body, [
    "name",
    "email",
    "password",
    "installationId",
    "machineFingerprint",
    "machineIdentityHash",
    "machineCode"
  ]);

  return {
    name: stringField(body.name, "name", 2, 120),
    email: normalizeEmail(body.email),
    password: assertPassword(body.password),
    installationId: assertInstallationId(body.installationId),
    machineFingerprint: assertHexSha256(body.machineFingerprint, "machineFingerprint"),
    machineIdentityHash: assertHexSha256(body.machineIdentityHash, "machineIdentityHash"),
    machineCode: assertMachineCode(body.machineCode)
  };
}

function assertLoginRequest(body) {
  assertExactKeys(body, [
    "email",
    "password",
    "installationId",
    "machineFingerprint",
    "machineIdentityHash"
  ]);

  return {
    email: normalizeEmail(body.email),
    password: assertPassword(body.password),
    installationId: assertInstallationId(body.installationId),
    machineFingerprint: assertHexSha256(body.machineFingerprint, "machineFingerprint"),
    machineIdentityHash: assertHexSha256(body.machineIdentityHash, "machineIdentityHash")
  };
}

function assertSyncRequest(body) {
  assertExactKeys(body, ["installationId"]);
  return { installationId: assertInstallationId(body.installationId) };
}

function assertDeviceToken(value) {
  const token = stringField(value, "deviceToken", 32, 4096);
  if (/\s/.test(token)) fail("INVALID_TOKEN", "deviceToken contém espaços.");
  return token;
}

function assertLicenseFileText(value) {
  if (typeof value !== "string") {
    fail("INVALID_FIELD", "licenseFile deve ser string.");
  }

  const size = Buffer.byteLength(value, "utf8");

  if (size < 32 || size > 256 * 1024) {
    fail("INVALID_FIELD", "licenseFile deve ter entre 32 bytes e 256 KiB.");
  }

  // JSON válido pode conter TAB/LF/CR como whitespace fora das strings.
  // Bloqueamos NUL e demais controles não permitidos.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) {
    fail("INVALID_FIELD", "licenseFile contém caracteres de controle inválidos.");
  }

  return value;
}

function assertSyncAfterSeconds(value) {
  if (!Number.isInteger(value) || value < 300 || value > 86400) {
    fail("INVALID_FIELD", "syncAfterSeconds deve estar entre 300 e 86400.");
  }
  return value;
}

function assertRegisterOrLoginResponse(body) {
  assertExactKeys(body, ["deviceToken", "status", "licenseFile", "syncAfterSeconds"]);

  const status = stringField(body.status, "status", 3, 32).toUpperCase();
  if (!SYNC_STATUS.includes(status)) fail("INVALID_STATUS", "status inválido.");

  const result = {
    deviceToken: assertDeviceToken(body.deviceToken),
    status,
    licenseFile: null,
    syncAfterSeconds: assertSyncAfterSeconds(body.syncAfterSeconds)
  };

  if (status === "ACTIVE") {
    result.licenseFile = assertLicenseFileText(body.licenseFile);
  } else if (body.licenseFile !== null) {
    fail("INVALID_RESPONSE", "licenseFile deve ser null quando status não é ACTIVE.");
  }

  return result;
}

function assertSyncResponse(body) {
  assertExactKeys(body, ["status", "reason", "licenseFile", "syncAfterSeconds"]);

  const status = stringField(body.status, "status", 3, 32).toUpperCase();
  if (!SYNC_STATUS.includes(status)) fail("INVALID_STATUS", "status inválido.");

  const reason = body.reason === null
    ? null
    : stringField(body.reason, "reason", 2, 80).toUpperCase();

  const result = {
    status,
    reason,
    licenseFile: null,
    syncAfterSeconds: assertSyncAfterSeconds(body.syncAfterSeconds)
  };

  if (status === "ACTIVE") {
    if (reason !== null) fail("INVALID_RESPONSE", "reason deve ser null quando status é ACTIVE.");
    result.licenseFile = assertLicenseFileText(body.licenseFile);
  } else {
    if (body.licenseFile !== null) {
      fail("INVALID_RESPONSE", "licenseFile deve ser null quando status não é ACTIVE.");
    }
    if (!reason) fail("INVALID_RESPONSE", "reason é obrigatório quando status não é ACTIVE.");
  }

  return result;
}

module.exports = Object.freeze({
  CLOUD_PROTOCOL_VERSION,
  PRODUCT,
  ACCOUNT_STATUS,
  INSTALLATION_STATUS,
  ENTITLEMENT_STATUS,
  ENTITLEMENT_TYPE,
  PLAN,
  SYNC_STATUS,
  normalizeEmail,
  assertRegisterRequest,
  assertLoginRequest,
  assertSyncRequest,
  assertDeviceToken,
  assertRegisterOrLoginResponse,
  assertSyncResponse
});
