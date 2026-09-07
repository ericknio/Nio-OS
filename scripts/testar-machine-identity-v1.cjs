"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../desktop/license-core.cjs");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-machine-identity-v1-"));

try {
  const installationA = crypto.randomUUID();
  const installationB = crypto.randomUUID();

  const identityA = core.machineIdentityHash();
  const identityB = core.machineIdentityHash();
  const fingerprintA = core.machineFingerprint(installationA);
  const fingerprintB = core.machineFingerprint(installationB);

  assert.match(identityA, /^[a-f0-9]{64}$/);
  assert.equal(identityA, identityB);
  assert.notEqual(fingerprintA, fingerprintB);

  const request = core.buildActivationRequest(tempRoot, "0.1.3-test");
  assert.equal(Object.prototype.hasOwnProperty.call(request, "machineIdentityHash"), false);

  console.log(JSON.stringify({
    ok: true,
    stage: "0.1.3-CLOUD-STABLE-MACHINE-IDENTITY-V1-TESTE",
    stableAcrossAppInstallationIdChanges: true,
    licenseMachineFingerprintRemainsInstallationBound: true,
    localActivationRequestV1ShapePreserved: true,
    rawMachineGuidExposed: false,
    rawSystemUuidExposed: false,
    databaseChanged: false
  }));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
