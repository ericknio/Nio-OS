"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  assertRegisterOrLoginResponse,
  assertSyncResponse
} = require("./cloud-contract-v1.cjs");

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseEnvelope(licenseFile) {
  if (typeof licenseFile !== "string" || !licenseFile.trim()) {
    fail("CLOUD_LICENSE_EMPTY", "Cloud não retornou uma licença.");
  }

  try {
    const envelope = JSON.parse(licenseFile);
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      fail("CLOUD_LICENSE_FORMAT_INVALID", "Licença cloud possui formato inválido.");
    }
    return envelope;
  } catch (error) {
    if (error?.code === "CLOUD_LICENSE_FORMAT_INVALID") throw error;
    fail("CLOUD_LICENSE_JSON_INVALID", "Licença cloud não contém JSON válido.");
  }
}

function createCloudActivationBridge({
  licenseCore,
  userDataDir,
  tokenStore,
  installLicenseFile
}) {
  if (
    !licenseCore ||
    typeof licenseCore.verifyLicenseObject !== "function" ||
    typeof licenseCore.verifyLicenseFile !== "function"
  ) {
    fail("INVALID_LICENSE_CORE", "licenseCore inválido.");
  }

  if (typeof userDataDir !== "string" || !userDataDir.trim()) {
    fail("INVALID_USER_DATA_DIR", "userDataDir inválido.");
  }

  if (!tokenStore || typeof tokenStore.save !== "function") {
    fail("INVALID_TOKEN_STORE", "tokenStore inválido.");
  }

  if (typeof installLicenseFile !== "function") {
    fail("INVALID_LICENSE_INSTALLER", "Instalador local de licença inválido.");
  }

  function verifyCandidate(licenseFile) {
    const envelope = parseEnvelope(licenseFile);
    const result = licenseCore.verifyLicenseObject(envelope, userDataDir);

    if (!result?.ok) {
      fail(
        String(result?.code || "CLOUD_LICENSE_REJECTED"),
        "Licença recebida da cloud foi rejeitada pelo verificador local."
      );
    }

    return { envelope, result };
  }

  function installVerifiedLicense(licenseFile) {
    const verified = verifyCandidate(licenseFile);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nio-cloud-license-"));
    const candidate = path.join(tempDir, "candidate.nio");

    try {
      fs.writeFileSync(candidate, licenseFile, {
        encoding: "utf8",
        mode: 0o600
      });

      installLicenseFile(candidate);

      const installed = licenseCore.verifyLicenseFile(userDataDir);

      if (!installed?.ok) {
        fail(
          String(installed?.code || "CLOUD_LICENSE_INSTALL_VERIFY_FAILED"),
          "Licença cloud foi gravada, mas não passou na verificação final."
        );
      }

      return installed;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  function applyAuthResponse(rawResponse) {
    const response = assertRegisterOrLoginResponse(rawResponse);

    if (response.status !== "ACTIVE") {
      return Object.freeze({
        status: response.status,
        installed: false,
        tokenSaved: false
      });
    }

    const installed = installVerifiedLicense(response.licenseFile);

    // O token só é persistido depois de a licença estar instalada e validada.
    // Se o safeStorage falhar, a licença curta continua válida e o usuário
    // pode autenticar novamente sem deixar token em texto puro.
    tokenStore.save(response.deviceToken);

    return Object.freeze({
      status: response.status,
      installed: true,
      tokenSaved: true,
      license: installed.license || null
    });
  }

  function applySyncResponse(rawResponse) {
    const response = assertSyncResponse(rawResponse);

    if (response.status !== "ACTIVE") {
      // BLOCKED/EXPIRED não apaga o cache local já assinado.
      // O backend simplesmente deixa de renovar; o cache vence naturalmente.
      return Object.freeze({
        status: response.status,
        reason: response.reason,
        installed: false
      });
    }

    const installed = installVerifiedLicense(response.licenseFile);

    return Object.freeze({
      status: response.status,
      reason: null,
      installed: true,
      license: installed.license || null
    });
  }

  return Object.freeze({
    verifyCandidate,
    applyAuthResponse,
    applySyncResponse
  });
}

module.exports = Object.freeze({
  createCloudActivationBridge
});
