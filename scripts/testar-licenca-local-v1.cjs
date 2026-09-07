"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const core = require("../desktop/license-core.cjs");

const privateKeyFile = path.join(
  os.homedir(),
  "Nio-License-Keys",
  "Nio-OS",
  "nio-os-license-private.ed25519.pem"
);

function signEnvelope(payload, privateKey) {
  const envelope = {
    schema: core.LICENSE_SCHEMA,
    keyId: core.KEY_ID,
    payload,
  };

  envelope.signature = core.base64urlEncode(
    crypto.sign(null, core.signedEnvelopeBytes(envelope), privateKey)
  );

  return envelope;
}

function writeLicense(file, envelope) {
  fs.writeFileSync(file, JSON.stringify(envelope, null, 2) + os.EOL, "utf8");
}

function main() {
  if (!fs.existsSync(privateKeyFile)) {
    throw new Error("Chave privada externa não encontrada.");
  }

  const privateKey = crypto.createPrivateKey(
    fs.readFileSync(privateKeyFile, "utf8")
  );

  const derivedPublic = crypto.createPublicKey(privateKey).export({
    type: "spki",
    format: "pem",
  }).toString();

  if (derivedPublic.trim() !== core.PUBLIC_KEY_PEM.trim()) {
    throw new Error("A chave privada externa não corresponde à chave pública do Nio-OS.");
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-license-v1-"));
  const request = core.buildActivationRequest(tempRoot, "0.1.2-test");
  const licenseFile = core.licensePath(tempRoot);

  const basePayload = {
    licenseId: "NIO-TEST-V1",
    product: core.PRODUCT,
    clientName: "Teste Local Nio-OS",
    plan: "PRO",
    installationId: request.installationId,
    machineFingerprint: request.machineFingerprint,
    issuedOn: "2026-01-01",
    expiresOn: "2099-12-31",
    features: {
      produtos: true,
      estoqueTecnico: true,
      financeiro: true,
      redeLocal: true,
    },
  };

  const validEnvelope = signEnvelope(basePayload, privateKey);
  writeLicense(licenseFile, validEnvelope);

  const valid = core.verifyLicenseFile(tempRoot, {
    file: licenseFile,
    now: new Date("2026-08-16T12:00:00"),
  });

  const tampered = JSON.parse(JSON.stringify(validEnvelope));
  tampered.payload.clientName = "Cliente adulterado";
  writeLicense(licenseFile, tampered);

  const tamperedResult = core.verifyLicenseFile(tempRoot, {
    file: licenseFile,
    now: new Date("2026-08-16T12:00:00"),
  });

  const wrongMachinePayload = {
    ...basePayload,
    machineFingerprint: "0".repeat(64),
  };
  const wrongMachineEnvelope = signEnvelope(wrongMachinePayload, privateKey);
  writeLicense(licenseFile, wrongMachineEnvelope);

  const wrongMachine = core.verifyLicenseFile(tempRoot, {
    file: licenseFile,
    now: new Date("2026-08-16T12:00:00"),
  });

  const expiredPayload = {
    ...basePayload,
    expiresOn: "2025-12-31",
  };
  const expiredEnvelope = signEnvelope(expiredPayload, privateKey);
  writeLicense(licenseFile, expiredEnvelope);

  const expired = core.verifyLicenseFile(tempRoot, {
    file: licenseFile,
    now: new Date("2026-08-16T12:00:00"),
  });

  const checks = {
    validLicenseAccepted: valid.ok === true && valid.code === "OK",
    tamperingRejected:
      tamperedResult.ok === false &&
      tamperedResult.code === "SIGNATURE_INVALID",
    wrongMachineRejected:
      wrongMachine.ok === false &&
      wrongMachine.code === "MACHINE_MISMATCH",
    expiredLicenseRejected:
      expired.ok === false &&
      expired.code === "LICENSE_EXPIRED",
    privateKeyOutsideProject:
      !path.resolve(privateKeyFile)
        .toLowerCase()
        .startsWith(path.resolve(process.cwd()).toLowerCase() + path.sep),
  };

  const ok = Object.values(checks).every(Boolean);

  fs.rmSync(tempRoot, { recursive: true, force: true });

  console.log(JSON.stringify({
    ok,
    stage: "0.1.2-LICENCA-LOCAL-V1-CRYPTO-TEST",
    keyId: core.KEY_ID,
    machineCodeSample: request.machineCode,
    validCode: valid.code,
    tamperedCode: tamperedResult.code,
    wrongMachineCode: wrongMachine.code,
    expiredCode: expired.code,
    ...checks,
    runtimeDatabaseChanged: false,
    firewallChanged: false,
    buildExecuted: false,
  }));

  process.exit(ok ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "0.1.2-LICENCA-LOCAL-V1-CRYPTO-TEST",
    message: error instanceof Error ? error.message : String(error),
    runtimeDatabaseChanged: false,
    firewallChanged: false,
    buildExecuted: false,
  }));
  process.exit(1);
}
