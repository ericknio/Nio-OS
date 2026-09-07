#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const releaseDir = path.join(root, "release");
const packageFile = path.join(root, "package.json");
const secureValidator = path.join(
  root,
  "scripts",
  "validar-desktop-dir-seguro.cjs"
);
const output = path.join(root, "ETAPA4A14B_VALIDACAO_INSTALADOR.json");

function sha256(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);

  try {
    while (true) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!bytes) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }

  return hash.digest("hex");
}

function runNode(file) {
  const result = spawnSync(process.execPath, [file], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(
      String(result.stderr || result.stdout || "Validador falhou.").trim()
    );
  }

  const text = String(result.stdout || "").trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const jsonLine = [...lines].reverse().find((line) => {
    try {
      JSON.parse(line);
      return true;
    } catch {
      return false;
    }
  });

  if (!jsonLine) {
    throw new Error("Validador seguro não retornou JSON.");
  }

  return JSON.parse(jsonLine);
}

function authenticode(file) {
  const escaped = file.replace(/'/g, "''");
  const command =
    `$s=Get-AuthenticodeSignature -LiteralPath '${escaped}';` +
    `[pscustomobject]@{Status=[string]$s.Status;` +
    `StatusMessage=[string]$s.StatusMessage;` +
    `SignerSubject=if($s.SignerCertificate){[string]$s.SignerCertificate.Subject}else{''}}` +
    `| ConvertTo-Json -Compress`;

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
    }
  );

  if (result.status !== 0) {
    return {
      checked: false,
      status: "UNKNOWN",
      message: String(result.stderr || "").trim(),
    };
  }

  try {
    const parsed = JSON.parse(String(result.stdout || "").trim());

    return {
      checked: true,
      status: parsed.Status || "Unknown",
      message: parsed.StatusMessage || "",
      signerSubject: parsed.SignerSubject || "",
    };
  } catch {
    return {
      checked: false,
      status: "UNKNOWN",
      message: "Não foi possível interpretar Get-AuthenticodeSignature.",
    };
  }
}

function main() {
  if (!fs.existsSync(packageFile)) {
    throw new Error("package.json não encontrado.");
  }

  if (!fs.existsSync(releaseDir)) {
    throw new Error("Pasta release não encontrada.");
  }

  const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  const productName = String(pkg?.build?.productName || pkg?.name || "").trim();
  const version = String(pkg?.version || "").trim();

  if (!productName || !version) {
    throw new Error("productName/version inválidos no package.json.");
  }

  if (!fs.existsSync(secureValidator)) {
    throw new Error("scripts/validar-desktop-dir-seguro.cjs não encontrado.");
  }

  const packageValidation = runNode(secureValidator);

  if (packageValidation?.ok !== true) {
    throw new Error("O win-unpacked não passou no validador seguro.");
  }

  const expectedName = `${productName}-Setup-${version}.exe`;
  const expectedInstaller = path.join(releaseDir, expectedName);

  if (!fs.existsSync(expectedInstaller)) {
    const installers = fs
      .readdirSync(releaseDir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.toLowerCase().endsWith(".exe") &&
          entry.name.toLowerCase().includes("setup")
      )
      .map((entry) => entry.name);

    throw new Error(
      `Instalador esperado não encontrado: release/${expectedName}. ` +
        `Encontrados: ${installers.join(", ") || "nenhum"}`
    );
  }

  const stat = fs.statSync(expectedInstaller);

  if (stat.size < 10 * 1024 * 1024) {
    throw new Error(
      `Instalador suspeitamente pequeno: ${stat.size} bytes.`
    );
  }

  const blockmap = `${expectedInstaller}.blockmap`;

  const report = {
    ok: true,
    stage: "4A.14B-INSTALADOR-ESTATICAMENTE-VALIDADO",
    generatedAt: new Date().toISOString(),
    package: {
      productName,
      version,
      artifactName: expectedName,
    },
    installer: {
      path: path
        .relative(root, expectedInstaller)
        .replace(/\\/g, "/"),
      sizeBytes: stat.size,
      sha256: sha256(expectedInstaller),
      blockmapExists: fs.existsSync(blockmap),
      authenticode: authenticode(expectedInstaller),
    },
    unpackedValidation: {
      ok: packageValidation.ok === true,
      stage: packageValidation.stage,
      unexpectedDatabases: packageValidation.unexpectedDatabases,
      envFilesInsideApp: packageValidation.envFilesInsideApp,
      realDataPathsWithFiles: packageValidation.realDataPathsWithFiles,
      seed: packageValidation.seed,
      packagedExeExists: packageValidation.packagedExeExists,
    },
    safety: {
      installerExecuted: false,
      installerInstalled: false,
      databaseChanged: false,
      schemaChanged: false,
      migrationExecuted: false,
      runtimeChanged: false,
    },
    nextStep:
      "Executar instalação controlada preservando o runtime existente e validar primeira abertura do app instalado.",
  };

  fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify({
      ok: true,
      stage: report.stage,
      report: path.basename(output),
      installer: report.installer.path,
      sizeBytes: report.installer.sizeBytes,
      sha256: report.installer.sha256,
      authenticodeStatus: report.installer.authenticode.status,
      unpackedValidationOk: true,
      installerExecuted: false,
    })
  );
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      stage: "4A.14B-INSTALADOR-ESTATICAMENTE-VALIDADO",
      message:
        error instanceof Error ? error.message : String(error),
      installerExecuted: false,
      databaseChanged: false,
    })
  );
  process.exit(1);
}
