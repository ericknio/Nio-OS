#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const releaseDir = path.join(root, "release");
const packageFile = path.join(root, "package.json");
const secureValidator = path.join(root, "scripts", "validar-desktop-dir-seguro.cjs");
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

  const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  const jsonLine = [...lines].reverse().find((line) => {
    try {
      JSON.parse(line);
      return true;
    } catch {
      return false;
    }
  });

  if (!jsonLine) throw new Error("Validador seguro não retornou JSON.");
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
    { cwd: root, encoding: "utf8", windowsHide: true, shell: false }
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

function localizarInstalador(productName, version) {
  const nomesPreferidos = [
    `${productName} Setup ${version}.exe`,
    `${productName}-Setup-${version}.exe`,
  ];

  for (const name of nomesPreferidos) {
    const candidate = path.join(releaseDir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  const installers = fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) =>
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".exe") &&
      entry.name.toLowerCase().includes("setup") &&
      entry.name.includes(version) &&
      !entry.name.includes(".__uninstaller")
    )
    .map((entry) => path.join(releaseDir, entry.name));

  if (installers.length === 1) return installers[0];

  if (installers.length === 0) {
    throw new Error(
      `Nenhum instalador NSIS .exe da versão ${version} foi encontrado em release/.`
    );
  }

  throw new Error(
    `Mais de um instalador candidato foi encontrado: ${installers
      .map((file) => path.basename(file))
      .join(", ")}`
  );
}

function main() {
  if (!fs.existsSync(packageFile)) throw new Error("package.json não encontrado.");
  if (!fs.existsSync(releaseDir)) throw new Error("Pasta release não encontrada.");
  if (!fs.existsSync(secureValidator)) {
    throw new Error("scripts/validar-desktop-dir-seguro.cjs não encontrado.");
  }

  const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  const productName = String(pkg?.build?.productName || pkg?.name || "").trim();
  const version = String(pkg?.version || "").trim();

  if (!productName || !version) {
    throw new Error("productName/version inválidos no package.json.");
  }

  const packageValidation = runNode(secureValidator);

  if (packageValidation?.ok !== true) {
    throw new Error("O win-unpacked não passou no validador seguro.");
  }

  const installer = localizarInstalador(productName, version);
  const stat = fs.statSync(installer);

  if (stat.size < 10 * 1024 * 1024) {
    throw new Error(`Instalador suspeitamente pequeno: ${stat.size} bytes.`);
  }

  const blockmap = `${installer}.blockmap`;

  const report = {
    ok: true,
    stage: "4A.14B-INSTALADOR-ESTATICAMENTE-VALIDADO",
    generatedAt: new Date().toISOString(),
    package: {
      productName,
      version,
      artifactName: path.basename(installer),
    },
    installer: {
      path: path.relative(root, installer).replace(/\\/g, "/"),
      sizeBytes: stat.size,
      sha256: sha256(installer),
      blockmapExists: fs.existsSync(blockmap),
      authenticode: authenticode(installer),
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

  console.log(JSON.stringify({
    ok: true,
    stage: report.stage,
    report: path.basename(output),
    installer: report.installer.path,
    sizeBytes: report.installer.sizeBytes,
    sha256: report.installer.sha256,
    blockmapExists: report.installer.blockmapExists,
    authenticodeStatus: report.installer.authenticode.status,
    unpackedValidationOk: true,
    installerExecuted: false,
  }));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14B-INSTALADOR-ESTATICAMENTE-VALIDADO",
    message: error instanceof Error ? error.message : String(error),
    installerExecuted: false,
    databaseChanged: false,
  }));
  process.exit(1);
}
