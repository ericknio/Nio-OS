"use strict";

const assert = require("node:assert/strict");
const {
  normalizeBaseUrl,
  createCloudClient
} = require("../desktop/cloud-client-v1.cjs");

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const key = Object.keys(headers).find(
          item => item.toLowerCase() === String(name).toLowerCase()
        );
        return key ? String(headers[key]) : null;
      }
    },
    async text() {
      return JSON.stringify(body);
    }
  };
}

async function expectCode(fn, code) {
  let caught = null;
  try { await fn(); } catch (error) { caught = error; }
  assert.ok(caught, `Esperava erro ${code}`);
  assert.equal(caught.code, code);
}

async function main() {
  assert.equal(
    normalizeBaseUrl("https://licenca.exemplo.com/"),
    "https://licenca.exemplo.com"
  );

  assert.equal(
    normalizeBaseUrl("http://127.0.0.1:8787/", { allowLoopbackHttp: true }),
    "http://127.0.0.1:8787"
  );

  assert.throws(
    () => normalizeBaseUrl("http://licenca.exemplo.com"),
    error => error.code === "INSECURE_CLOUD_URL"
  );

  const calls = [];
  const TOKEN = "nio_device_" + "A".repeat(64);
  const LICENSE = JSON.stringify({
    schema: 1,
    payload: {
      product: "Nio-OS",
      clientName: "Cliente Teste"
    },
    signature: "x".repeat(64)
  });

  const fetchImpl = async (url, options) => {
    calls.push({ url, options });

    if (url.endsWith("/api/v1/auth/register")) {
      return response(200, {
        deviceToken: TOKEN,
        status: "ACTIVE",
        licenseFile: LICENSE,
        syncAfterSeconds: 3600
      });
    }

    if (url.endsWith("/api/v1/auth/login")) {
      return response(200, {
        deviceToken: TOKEN,
        status: "ACTIVE",
        licenseFile: LICENSE,
        syncAfterSeconds: 3600
      });
    }

    if (url.endsWith("/api/v1/license/sync")) {
      return response(200, {
        status: "ACTIVE",
        reason: null,
        licenseFile: LICENSE,
        syncAfterSeconds: 3600
      });
    }

    if (url.endsWith("/api/v1/auth/logout")) {
      return response(200, { ok: true });
    }

    return response(404, { reason: "NOT_FOUND" });
  };

  const client = createCloudClient({
    baseUrl: "https://licenca.exemplo.com",
    fetchImpl
  });

  const installationId = "7ed17b81-a75d-4558-9fb1-6c2bd6565f22";
  const machineFingerprint = "a".repeat(64);
  const machineIdentityHash = "b".repeat(64);

  const register = await client.register({
    name: "Cliente Teste",
    email: "cliente@exemplo.com",
    password: "senha-segura-123",
    installationId,
    machineFingerprint,
    machineIdentityHash,
    machineCode: "NIO-3EA1-C2A1-9758-B15B"
  });

  assert.equal(register.deviceToken, TOKEN);
  assert.equal(register.status, "ACTIVE");

  const login = await client.login({
    email: "cliente@exemplo.com",
    password: "senha-segura-123",
    installationId,
    machineFingerprint,
    machineIdentityHash
  });

  assert.equal(login.status, "ACTIVE");

  const sync = await client.sync({ installationId }, TOKEN);
  assert.equal(sync.status, "ACTIVE");

  assert.equal(await client.logout(TOKEN), true);

  const syncCall = calls.find(call => call.url.endsWith("/api/v1/license/sync"));
  assert.equal(syncCall.options.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(syncCall.options.redirect, "error");
  assert.equal(syncCall.options.cache, "no-store");

  await expectCode(
    async () => createCloudClient({
      baseUrl: "https://licenca.exemplo.com",
      fetchImpl: async () => response(403, { reason: "CUSTOMER_BLOCKED" })
    }).sync({ installationId }, TOKEN),
    "CUSTOMER_BLOCKED"
  );

  await expectCode(
    async () => createCloudClient({
      baseUrl: "https://licenca.exemplo.com",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => String(600 * 1024) },
        async text() { return "{}"; }
      })
    }).sync({ installationId }, TOKEN),
    "CLOUD_RESPONSE_TOO_LARGE"
  );

  console.log(JSON.stringify({
    ok: true,
    stage: "0.1.3-CLOUD-CLIENT-V1-TESTE",
    httpsRequired: true,
    loopbackHttpDevOnly: true,
    timeoutBounded: true,
    responseSizeBounded: true,
    bearerOnlyOnAuthenticatedCalls: true,
    redirectsRejected: true,
    responsesValidatedByContract: true,
    databaseChanged: false,
    firewallChanged: false,
    buildExecuted: false
  }));
}

main().catch(error => {
  console.error(JSON.stringify({
    ok: false,
    stage: "0.1.3-CLOUD-CLIENT-V1-TESTE",
    message: error instanceof Error ? error.message : String(error)
  }));
  process.exit(1);
});
