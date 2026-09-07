"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const {
  assertRegisterRequest,
  assertLoginRequest,
  assertSyncRequest,
  assertDeviceToken
} = require("../desktop/cloud-contract-v1.cjs");

const SYNC_AFTER_SECONDS = 3600;
const MAX_BODY_BYTES = 256 * 1024;

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(payload.length),
    "cache-control": "no-store"
  });
  res.end(payload);
}

function reason(res, status, code) {
  json(res, status, { reason: code });
}

function parseBearer(req) {
  const value = String(req.headers.authorization || "");
  if (!value.startsWith("Bearer ")) return null;
  try {
    return assertDeviceToken(value.slice(7));
  } catch {
    return null;
  }
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest();
}

function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 32);
}

function passwordMatches(password, salt, expected) {
  const actual = passwordHash(password, salt);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function readJson(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("BODY_TOO_LARGE");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("INVALID_JSON");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function createCloudMockServer({ licenseFile }) {
  if (typeof licenseFile !== "string" || !licenseFile.trim()) {
    throw new Error("licenseFile válido é obrigatório para o mock.");
  }

  const accounts = new Map();
  const tokens = new Map();

  function issueToken(email, installationId) {
    const token = `nio_device_${crypto.randomBytes(32).toString("base64url")}`;
    const tokenHash = hashToken(token).toString("hex");
    tokens.set(tokenHash, { email, installationId, revoked: false });
    return token;
  }

  function findTokenRecord(token) {
    if (!token) return null;
    const key = hashToken(token).toString("hex");
    const record = tokens.get(key);
    return record && !record.revoked ? { key, record } : null;
  }

  async function handler(req, res) {
    if (req.method !== "POST") return reason(res, 405, "METHOD_NOT_ALLOWED");

    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return reason(res, error.code === "BODY_TOO_LARGE" ? 413 : 400, error.code || "INVALID_REQUEST");
    }

    try {
      if (req.url === "/api/v1/auth/register") {
        const input = assertRegisterRequest(body);

        if (accounts.has(input.email)) return reason(res, 409, "EMAIL_EXISTS");

        const salt = crypto.randomBytes(16);
        accounts.set(input.email, {
          name: input.name,
          email: input.email,
          salt,
          passwordHash: passwordHash(input.password, salt),
          installationId: input.installationId,
          machineFingerprint: input.machineFingerprint,
      machineIdentityHash: input.machineIdentityHash,
          machineCode: input.machineCode,
          status: "ACTIVE"
        });

        return json(res, 200, {
          deviceToken: issueToken(input.email, input.installationId),
          status: "ACTIVE",
          licenseFile,
          syncAfterSeconds: SYNC_AFTER_SECONDS
        });
      }

      if (req.url === "/api/v1/auth/login") {
        const input = assertLoginRequest(body);
        const account = accounts.get(input.email);

        if (!account || !passwordMatches(input.password, account.salt, account.passwordHash)) {
          return reason(res, 401, "INVALID_CREDENTIALS");
        }

        if (
          account.installationId !== input.installationId ||
          account.machineFingerprint !== input.machineFingerprint ||
      account.machineIdentityHash !== input.machineIdentityHash
        ) {
          return reason(res, 403, "INSTALLATION_MISMATCH");
        }

        if (account.status !== "ACTIVE") {
          return reason(res, 403, "CUSTOMER_BLOCKED");
        }

        return json(res, 200, {
          deviceToken: issueToken(input.email, input.installationId),
          status: "ACTIVE",
          licenseFile,
          syncAfterSeconds: SYNC_AFTER_SECONDS
        });
      }

      if (req.url === "/api/v1/license/sync") {
        const tokenEntry = findTokenRecord(parseBearer(req));
        if (!tokenEntry) return reason(res, 401, "DEVICE_TOKEN_INVALID");

        const input = assertSyncRequest(body);

        if (input.installationId !== tokenEntry.record.installationId) {
          return reason(res, 403, "INSTALLATION_MISMATCH");
        }

        const account = accounts.get(tokenEntry.record.email);

        if (!account || account.status !== "ACTIVE") {
          return json(res, 200, {
            status: "BLOCKED",
            reason: "CUSTOMER_BLOCKED",
            licenseFile: null,
            syncAfterSeconds: SYNC_AFTER_SECONDS
          });
        }

        return json(res, 200, {
          status: "ACTIVE",
          reason: null,
          licenseFile,
          syncAfterSeconds: SYNC_AFTER_SECONDS
        });
      }

      if (req.url === "/api/v1/auth/logout") {
        const tokenEntry = findTokenRecord(parseBearer(req));
        if (!tokenEntry) return reason(res, 401, "DEVICE_TOKEN_INVALID");

        tokenEntry.record.revoked = true;
        return json(res, 200, { ok: true });
      }

      return reason(res, 404, "NOT_FOUND");
    } catch (error) {
      return reason(res, 400, String(error?.code || "INVALID_REQUEST"));
    }
  }

  const server = http.createServer(handler);

  return Object.freeze({
    async listen(port = 0, host = "127.0.0.1") {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      });

      const address = server.address();

      return Object.freeze({
        host,
        port: address.port,
        baseUrl: `http://${host}:${address.port}`
      });
    },

    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve())
      );
    },

    setAccountStatus(email, status) {
      const account = accounts.get(String(email || "").trim().toLowerCase());
      if (!account) return false;
      if (!["ACTIVE", "BLOCKED"].includes(status)) throw new Error("Status mock inválido.");
      account.status = status;
      return true;
    },

    stats() {
      return Object.freeze({
        accounts: accounts.size,
        activeTokens: [...tokens.values()].filter(x => !x.revoked).length
      });
    }
  });
}

module.exports = Object.freeze({
  createCloudMockServer
});
