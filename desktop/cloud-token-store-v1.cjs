"use strict";

const fs = require("node:fs");
const path = require("node:path");

const TOKEN_SCHEMA = 1;
const TOKEN_DIR = "cloud";
const TOKEN_FILE = "device-token-v1.json";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function tokenPath(userDataDir) {
  if (typeof userDataDir !== "string" || !userDataDir.trim()) {
    fail("INVALID_USER_DATA_DIR", "userDataDir inválido.");
  }
  return path.join(userDataDir, TOKEN_DIR, TOKEN_FILE);
}

function validateToken(token) {
  if (
    typeof token !== "string" ||
    token.length < 32 ||
    token.length > 4096 ||
    /\s/.test(token) ||
    /[\u0000-\u001F\u007F]/.test(token)
  ) {
    fail("INVALID_DEVICE_TOKEN", "deviceToken inválido.");
  }
  return token;
}

function requireEncryption(safeStorage) {
  if (
    !safeStorage ||
    typeof safeStorage.isEncryptionAvailable !== "function" ||
    typeof safeStorage.encryptString !== "function" ||
    typeof safeStorage.decryptString !== "function" ||
    !safeStorage.isEncryptionAvailable()
  ) {
    fail(
      "SECURE_STORAGE_UNAVAILABLE",
      "Armazenamento seguro do sistema operacional indisponível."
    );
  }
}

function createCloudTokenStore({ safeStorage, userDataDir }) {
  const file = tokenPath(userDataDir);

  return Object.freeze({
    file,

    exists() {
      return fs.existsSync(file);
    },

    save(token) {
      requireEncryption(safeStorage);
      const clean = validateToken(token);
      const encrypted = safeStorage.encryptString(clean);

      if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
        fail("ENCRYPTION_FAILED", "safeStorage não retornou conteúdo criptografado.");
      }

      const payload = {
        schema: TOKEN_SCHEMA,
        ciphertextBase64: encrypted.toString("base64")
      };

      const dir = path.dirname(file);
      fs.mkdirSync(dir, { recursive: true });

      const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(payload), {
        encoding: "utf8",
        mode: 0o600
      });

      try {
        fs.renameSync(tmp, file);
      } catch (error) {
        try { fs.unlinkSync(tmp); } catch {}
        throw error;
      }

      return true;
    },

    load() {
      if (!fs.existsSync(file)) return null;
      requireEncryption(safeStorage);

      let payload;
      try {
        payload = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        fail("TOKEN_FILE_INVALID", "Arquivo de deviceToken inválido.");
      }

      if (
        !payload ||
        payload.schema !== TOKEN_SCHEMA ||
        typeof payload.ciphertextBase64 !== "string" ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.ciphertextBase64)
      ) {
        fail("TOKEN_FILE_INVALID", "Estrutura do deviceToken inválida.");
      }

      let token;
      try {
        token = safeStorage.decryptString(
          Buffer.from(payload.ciphertextBase64, "base64")
        );
      } catch {
        fail("TOKEN_DECRYPT_FAILED", "Não foi possível descriptografar o deviceToken.");
      }

      return validateToken(token);
    },

    clear() {
      if (!fs.existsSync(file)) return false;
      fs.unlinkSync(file);
      return true;
    }
  });
}

module.exports = Object.freeze({
  TOKEN_SCHEMA,
  createCloudTokenStore
});
