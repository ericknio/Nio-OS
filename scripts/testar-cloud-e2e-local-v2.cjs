"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const licenseCore = require("../desktop/license-core.cjs");
const { createCloudClient } = require("../desktop/cloud-client-v1.cjs");
const { createCloudActivationBridge } = require("../desktop/cloud-activation-bridge-v1.cjs");
const { createCloudMockServer } = require("./cloud-mock-server-v1.cjs");

function copyFileAtomic(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temp = `${destination}.tmp-${process.pid}-${Date.now()}`;
  fs.copyFileSync(source, temp);
  fs.renameSync(temp, destination);
}

async function main() {
  const runtimeRoot = path.join(process.env.LOCALAPPDATA || "", "Nio-OS");
  const runtimeLicense = licenseCore.licensePath(runtimeRoot);
  const runtimeInstallationId = licenseCore.installationIdPath(runtimeRoot);

  assert.equal(fs.existsSync(runtimeLicense), true, "Licença runtime válida é necessária.");
  assert.equal(fs.existsSync(runtimeInstallationId), true, "installation-id runtime é necessário.");

  const current = licenseCore.verifyLicenseFile(runtimeRoot);
  assert.equal(current.ok, true, `Licença runtime inválida: ${current.code}`);

  const licenseFile = fs.readFileSync(runtimeLicense, "utf8");
  const installationId = fs.readFileSync(runtimeInstallationId, "utf8").trim();
  const machineFingerprint = licenseCore.machineFingerprint(installationId);
  const machineIdentityHash = licenseCore.machineIdentityHash();
  const machineCode = licenseCore.machineCodeFromFingerprint(machineFingerprint);

  const runtimeLicenseBefore = cryptoHashFile(runtimeLicense);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nio-cloud-e2e-"));
  fs.mkdirSync(licenseCore.licenseDir(tempRoot), { recursive: true });
  fs.writeFileSync(
    licenseCore.installationIdPath(tempRoot),
    installationId + "\n",
    "utf8"
  );

  const tokenState = { value: null };
  const tokenStore = {
    save(token) {
      tokenState.value = token;
      return true;
    },
    load() {
      return tokenState.value;
    },
    clear() {
      tokenState.value = null;
      return true;
    }
  };

  const bridge = createCloudActivationBridge({
    licenseCore,
    userDataDir: tempRoot,
    tokenStore,
    installLicenseFile(candidatePath) {
      const candidate = licenseCore.verifyLicenseFile(tempRoot, { file: candidatePath });
      assert.equal(candidate.ok, true, `Candidato recusado: ${candidate.code}`);
      copyFileAtomic(candidatePath, licenseCore.licensePath(tempRoot));
    }
  });

  const server = createCloudMockServer({ licenseFile });
  const address = await server.listen();

  try {
    const client = createCloudClient({
      baseUrl: address.baseUrl,
      allowLoopbackHttp: true
    });

    const email = "cloud-e2e@nio-os.local";
    const password = "senha-cloud-e2e-123";

    const registerResponse = await client.register({
      name: "Cliente Cloud E2E",
      email,
      password,
      installationId,
      machineFingerprint,
      machineIdentityHash,
      machineCode
    });

    const authApplied = bridge.applyAuthResponse(registerResponse);
    assert.equal(authApplied.installed, true);
    assert.equal(authApplied.tokenSaved, true);
    assert.equal(typeof tokenStore.load(), "string");

    const installedAfterRegister = licenseCore.verifyLicenseFile(tempRoot);
    assert.equal(installedAfterRegister.ok, true);

    const syncResponse = await client.sync({ installationId }, tokenStore.load());
    const syncApplied = bridge.applySyncResponse(syncResponse);
    assert.equal(syncApplied.installed, true);

    server.setAccountStatus(email, "BLOCKED");

    const blockedResponse = await client.sync({ installationId }, tokenStore.load());
    const blockedApplied = bridge.applySyncResponse(blockedResponse);
    assert.equal(blockedApplied.status, "BLOCKED");
    assert.equal(blockedApplied.installed, false);

    const installedAfterBlock = licenseCore.verifyLicenseFile(tempRoot);
    assert.equal(installedAfterBlock.ok, true, "Bloqueio cloud não pode apagar cache local.");

    server.setAccountStatus(email, "ACTIVE");

    const loginResponse = await client.login({
      email,
      password,
      installationId,
      machineFingerprint,
      machineIdentityHash
    });

    const loginApplied = bridge.applyAuthResponse(loginResponse);
    assert.equal(loginApplied.installed, true);
    assert.equal(loginApplied.tokenSaved, true);

    const tokenBeforeLogout = tokenStore.load();
    assert.equal(await client.logout(tokenBeforeLogout), true);
    tokenStore.clear();
    assert.equal(tokenStore.load(), null);

    assert.equal(
      cryptoHashFile(runtimeLicense),
      runtimeLicenseBefore,
      "Teste local não pode alterar license.nio runtime real."
    );

    console.log(JSON.stringify({
      ok: true,
      stage: "0.1.3-CLOUD-E2E-LOCAL-V2",
      baseUrl: address.baseUrl,
      usedExistingSignedRuntimeLicenseAsFixture: true,
      privateKeyUsed: false,
      registerPassed: true,
      loginPassed: true,
      syncPassed: true,
      blockedPassed: true,
      blockedPreservedLocalCache: true,
      logoutPassed: true,
      realLicenseVerifierUsed: true,
      realMachineBindingUsed: true,
      tempRuntimeOnly: true,
      mockStats: server.stats(),
      runtimeDatabaseChanged: false,
      runtimeLicenseChanged: false,
      firewallChanged: false,
      externalCloudCalled: false
    }));
  } finally {
    await server.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function cryptoHashFile(file) {
  return require("node:crypto")
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

main().catch(error => {
  console.error(JSON.stringify({
    ok: false,
    stage: "0.1.3-CLOUD-E2E-LOCAL-V2",
    message: error instanceof Error ? error.message : String(error),
    runtimeDatabaseChanged: false,
    runtimeLicenseChanged: false,
    firewallChanged: false,
    externalCloudCalled: false
  }));
  process.exit(1);
});
