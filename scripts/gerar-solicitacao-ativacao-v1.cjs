"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const core = require("../desktop/license-core.cjs");

function main() {
  const userDataDir = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
    "Nio-OS"
  );

  const appVersion = process.argv[2] || "0.1.2";
  const request = core.buildActivationRequest(userDataDir, appVersion);

  const output = path.join(
    process.cwd(),
    "SOLICITACAO-ATIVACAO-" + request.machineCode + ".json"
  );

  fs.writeFileSync(output, JSON.stringify(request, null, 2) + os.EOL, "utf8");

  console.log(JSON.stringify({
    ok: true,
    stage: "0.1.2-LICENCA-LOCAL-V1-SOLICITACAO",
    machineCode: request.machineCode,
    installationId: request.installationId,
    appVersion: request.appVersion,
    requestFile: path.basename(output),
    userDataDir,
    licenseTarget: core.licensePath(userDataDir),
    databaseChanged: false,
    firewallChanged: false,
    buildExecuted: false
  }));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "0.1.2-LICENCA-LOCAL-V1-SOLICITACAO",
    message: error instanceof Error ? error.message : String(error)
  }));
  process.exit(1);
}
