"use strict";

const crypto = require("node:crypto");
const {
  CLOUD_PROTOCOL_VERSION,
  PRODUCT,
  assertRegisterRequest,
  assertLoginRequest,
  assertSyncRequest,
  assertDeviceToken,
  assertRegisterOrLoginResponse,
  assertSyncResponse
} = require("./cloud-contract-v1.cjs");

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;

function issueIdempotencyKey() {
  return crypto.randomBytes(24).toString("base64url");
}

function assertIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_KEY_RE.test(key)) {
    fail("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key inválida.");
  }
  return key;
}

function fail(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details !== null) error.details = details;
  throw error;
}

function normalizeBaseUrl(value, { allowLoopbackHttp = false } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    fail("INVALID_CLOUD_URL", "URL cloud inválida.");
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    fail("INVALID_CLOUD_URL", "URL cloud inválida.");
  }

  const loopback =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "::1";

  if (url.protocol !== "https:" && !(allowLoopbackHttp && loopback && url.protocol === "http:")) {
    fail("INSECURE_CLOUD_URL", "Cloud exige HTTPS; HTTP só é aceito em loopback de desenvolvimento.");
  }

  if (url.username || url.password) {
    fail("INVALID_CLOUD_URL", "Credenciais não podem estar embutidas na URL cloud.");
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");

  return url.toString().replace(/\/$/, "");
}

function assertTimeoutMs(value) {
  if (!Number.isInteger(value) || value < 1000 || value > 60000) {
    fail("INVALID_TIMEOUT", "timeoutMs deve estar entre 1000 e 60000.");
  }
  return value;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    fail("INVALID_CLOUD_RESPONSE", "Resposta cloud não contém JSON válido.");
  }
}

async function readBoundedJson(response) {
  const length = Number(response.headers?.get?.("content-length") || 0);

  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    fail("CLOUD_RESPONSE_TOO_LARGE", "Resposta cloud excede o limite permitido.");
  }

  const text = await response.text();

  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    fail("CLOUD_RESPONSE_TOO_LARGE", "Resposta cloud excede o limite permitido.");
  }

  if (!text) fail("INVALID_CLOUD_RESPONSE", "Resposta cloud vazia.");
  return safeJsonParse(text);
}

function errorFromCloud(status, body) {
  const reason =
    body &&
    typeof body === "object" &&
    typeof body.reason === "string" &&
    /^[A-Z0-9_:-]{2,80}$/.test(body.reason)
      ? body.reason
      : (status === 401 ? "INVALID_CREDENTIALS" : (status === 403 ? "FORBIDDEN" : (status === 402 ? "PAYMENT_REQUIRED" : "CLOUD_REQUEST_FAILED")));

  const cloudMessage =
    body &&
    typeof body === "object" &&
    typeof body.message === "string" &&
    body.message.trim()
      ? body.message.trim()
      : `Cloud recusou a operação (${status}).`;

  const error = new Error(cloudMessage);
  error.code = reason;
  error.httpStatus = status;
  return error;
}

function createCloudClient({
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  allowLoopbackHttp = false
}) {
  if (typeof fetchImpl !== "function") {
    fail("FETCH_UNAVAILABLE", "fetch não está disponível.");
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl, { allowLoopbackHttp });
  const normalizedTimeout = assertTimeoutMs(timeoutMs);

  async function request(pathname, {
    body,
    token = null,
    idempotencyKey = null,
    retryTransport = false
  } = {}) {
    const headers = {
      "content-type": "application/json",
      accept: "application/json",
      "x-nio-product": PRODUCT,
      "x-nio-cloud-protocol": String(CLOUD_PROTOCOL_VERSION)
    };

    if (token !== null) {
      headers.authorization = `Bearer ${assertDeviceToken(token)}`;
    }

    if (idempotencyKey !== null) {
      headers["idempotency-key"] = assertIdempotencyKey(idempotencyKey);
    }

    const attempts = retryTransport ? 2 : 1;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), normalizedTimeout);

      let response;
      try {
        response = await fetchImpl(`${normalizedBaseUrl}${pathname}`, {
          method: "POST",
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
          redirect: "error",
          cache: "no-store"
        });
      } catch (error) {
        if (attempt < attempts) continue;

        if (error?.name === "AbortError") {
          fail("CLOUD_TIMEOUT", "Cloud não respondeu dentro do tempo limite.");
        }
        fail("CLOUD_UNAVAILABLE", "Não foi possível conectar ao serviço cloud.");
      } finally {
        clearTimeout(timer);
      }

      const payload = await readBoundedJson(response);

      if (!response.ok) throw errorFromCloud(response.status, payload);

      return payload;
    }

    fail("CLOUD_UNAVAILABLE", "Não foi possível conectar ao serviço cloud.");
  }

  return Object.freeze({
    baseUrl: normalizedBaseUrl,

    async register(input) {
      const requestBody = assertRegisterRequest(input);
      const idempotencyKey = issueIdempotencyKey();
      const payload = await request("/api/v1/auth/register", {
        body: requestBody,
        idempotencyKey,
        retryTransport: true
      });
      return assertRegisterOrLoginResponse(payload);
    },

    async login(input) {
      const requestBody = assertLoginRequest(input);
      const idempotencyKey = issueIdempotencyKey();
      const payload = await request("/api/v1/auth/login", {
        body: requestBody,
        idempotencyKey,
        retryTransport: true
      });
      return assertRegisterOrLoginResponse(payload);
    },

    async sync(input, deviceToken) {
      const requestBody = assertSyncRequest(input);
      const idempotencyKey = issueIdempotencyKey();
      const payload = await request("/api/v1/license/sync", {
        body: requestBody,
        token: deviceToken,
        idempotencyKey,
        retryTransport: true
      });
      return assertSyncResponse(payload);
    },

    async logout(deviceToken) {
      const payload = await request("/api/v1/auth/logout", {
        body: {},
        token: deviceToken
      });

      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        payload.ok !== true ||
        Object.keys(payload).some(key => key !== "ok")
      ) {
        fail("INVALID_CLOUD_RESPONSE", "Resposta de logout inválida.");
      }

      return true;
    }
  });
}

module.exports = Object.freeze({
  DEFAULT_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  IDEMPOTENCY_KEY_RE,
  issueIdempotencyKey,
  normalizeBaseUrl,
  createCloudClient
});
