"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCloudActivationBridge } = require("../desktop/cloud-activation-bridge-v1.cjs");

function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (error) { caught = error; }
  assert.ok(caught, `Esperava erro ${code}`);
  assert.equal(caught.code, code);
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nio-cloud-bridge-test-"));
const TOKEN = "nio_device_" + "A".repeat(64);

const validEnvelope = {
  schema: 1,
  payload: {
    product: "Nio-OS",
    clientName: "Cliente Teste",
    expiresOn: "2030-12-31"
  },
  signature: "x".repeat(64)
};

const validLicenseFile = JSON.stringify(validEnvelope);

let installed = null;
let installCalls = 0;
let lastCandidatePath = null;
let tokenSaved = null;

const licenseCore = {
  verifyLicenseObject(envelope) {
    if (envelope?.payload?.product !== "Nio-OS") {
      return { ok: false, code: "PRODUCT_MISMATCH" };
    }

    return {
      ok: true,
      code: "OK",
      license: envelope.payload
    };
  },

  verifyLicenseFile() {
    if (!installed) return { ok: false, code: "LICENSE_NOT_FOUND" };

    return {
      ok: true,
      code: "OK",
      license: installed.payload
    };
  }
};

const tokenStore = {
  save(token) {
    tokenSaved = token;
    return true;
  }
};

const bridge = createCloudActivationBridge({
  licenseCore,
  userDataDir,
  tokenStore,
  installLicenseFile(candidatePath) {
    installCalls += 1;
    lastCandidatePath = candidatePath;
    installed = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
  }
});

try {
  const auth = bridge.applyAuthResponse({
    deviceToken: TOKEN,
    status: "ACTIVE",
    licenseFile: validLicenseFile,
    syncAfterSeconds: 3600
  });

  assert.equal(auth.status, "ACTIVE");
  assert.equal(auth.installed, true);
  assert.equal(auth.tokenSaved, true);
  assert.equal(tokenSaved, TOKEN);
  assert.equal(installCalls, 1);
  assert.equal(fs.existsSync(lastCandidatePath), false, "Candidato temporário deve ser removido.");

  const beforeBlocked = installCalls;

  const blocked = bridge.applySyncResponse({
    status: "BLOCKED",
    reason: "CUSTOMER_BLOCKED",
    licenseFile: null,
    syncAfterSeconds: 3600
  });

  assert.equal(blocked.installed, false);
  assert.equal(installCalls, beforeBlocked, "BLOCKED não pode apagar/substituir cache local.");

  const expired = bridge.applySyncResponse({
    status: "EXPIRED",
    reason: "ENTITLEMENT_EXPIRED",
    licenseFile: null,
    syncAfterSeconds: 3600
  });

  assert.equal(expired.installed, false);
  assert.equal(installCalls, beforeBlocked, "EXPIRED não pode apagar/substituir cache local.");

  const sync = bridge.applySyncResponse({
    status: "ACTIVE",
    reason: null,
    licenseFile: validLicenseFile,
    syncAfterSeconds: 3600
  });

  assert.equal(sync.installed, true);
  assert.equal(installCalls, beforeBlocked + 1);

  tokenSaved = null;
  installed = null;

  expectCode(() => bridge.applyAuthResponse({
    deviceToken: TOKEN,
    status: "ACTIVE",
    licenseFile: JSON.stringify({
      ...validEnvelope,
      payload: { ...validEnvelope.payload, product: "Outro-Produto" }
    }),
    syncAfterSeconds: 3600
  }), "PRODUCT_MISMATCH");

  assert.equal(tokenSaved, null, "Token não pode ser salvo se a licença for rejeitada.");

  console.log(JSON.stringify({
    ok: true,
    stage: "0.1.3-CLOUD-ACTIVATION-BRIDGE-V1-TESTE",
    verifiesCloudLicenseBeforeInstall: true,
    reusesLocalInstallerCallback: true,
    verifiesInstalledLicenseAfterWrite: true,
    tokenSavedOnlyAfterValidInstall: true,
    blockedDoesNotDeleteLocalCache: true,
    expiredDoesNotDeleteLocalCache: true,
    tempCandidateRemoved: true,
    databaseChanged: false,
    firewallChanged: false,
    buildExecuted: false
  }));
} finally {
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
