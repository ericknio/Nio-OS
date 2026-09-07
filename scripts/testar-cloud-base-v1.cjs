"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

const contract = require("../desktop/cloud-contract-v1.cjs");
const { createCloudTokenStore } = require("../desktop/cloud-token-store-v1.cjs");

function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (error) { caught = error; }
  assert.ok(caught, `Esperava erro ${code}`);
  assert.equal(caught.code, code);
}

const request = contract.assertRegisterRequest({
  name: "Cliente Teste",
  email: "  CLIENTE@EXEMPLO.COM ",
  password: "senha-segura-123",
  installationId: "7ed17b81-a75d-4558-9fb1-6c2bd6565f22",
  machineFingerprint: "a".repeat(64),
    machineIdentityHash: "b".repeat(64),
  machineCode: "nio-3ea1-c2a1-9758-b15b"
});

assert.equal(request.email, "cliente@exemplo.com");
assert.equal(request.machineCode, "NIO-3EA1-C2A1-9758-B15B");

expectCode(() => contract.assertRegisterRequest({
  ...request,
  password: "senha-segura-123",
  campoForjado: "PRO"
}), "UNKNOWN_FIELD");

expectCode(() => contract.assertSyncRequest({
  installationId: request.installationId,
  plan: "PRO"
}), "UNKNOWN_FIELD");

const active = contract.assertSyncResponse({
  status: "ACTIVE",
  reason: null,
  licenseFile: JSON.stringify({
    schema: 1,
    payload: { product: "Nio-OS" },
    signature: "x".repeat(64)
  }),
  syncAfterSeconds: 3600
});

assert.equal(active.status, "ACTIVE");

const blocked = contract.assertSyncResponse({
  status: "BLOCKED",
  reason: "CUSTOMER_BLOCKED",
  licenseFile: null,
  syncAfterSeconds: 3600
});

assert.equal(blocked.reason, "CUSTOMER_BLOCKED");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "nio-cloud-token-test-"));
const TOKEN = "nio_device_" + "A".repeat(64);

const safeStorageMock = {
  isEncryptionAvailable: () => true,
  encryptString(value) {
    return Buffer.from("enc:" + value, "utf8");
  },
  decryptString(buffer) {
    const value = buffer.toString("utf8");
    if (!value.startsWith("enc:")) throw new Error("cipher");
    return value.slice(4);
  }
};

try {
  const store = createCloudTokenStore({
    safeStorage: safeStorageMock,
    userDataDir: temp
  });

  assert.equal(store.exists(), false);
  assert.equal(store.save(TOKEN), true);
  assert.equal(store.exists(), true);

  const raw = fs.readFileSync(store.file, "utf8");
  assert.equal(raw.includes(TOKEN), false, "Token não pode ser persistido em claro.");

  assert.equal(store.load(), TOKEN);
  assert.equal(store.clear(), true);
  assert.equal(store.load(), null);

  expectCode(() => createCloudTokenStore({
    safeStorage: {
      isEncryptionAvailable: () => false,
      encryptString() { throw new Error("não deve chamar"); },
      decryptString() { throw new Error("não deve chamar"); }
    },
    userDataDir: temp
  }).save(TOKEN), "SECURE_STORAGE_UNAVAILABLE");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  stage: "0.1.3-CLOUD-BASE-V1-TESTE",
  protocolVersion: contract.CLOUD_PROTOCOL_VERSION,
  product: contract.PRODUCT,
  registerStrictAllowlist: true,
  syncStrictAllowlist: true,
  secureStorageNoPlaintext: true,
  secureStorageFailClosed: true,
  databaseChanged: false,
  firewallChanged: false,
  buildExecuted: false
}));
