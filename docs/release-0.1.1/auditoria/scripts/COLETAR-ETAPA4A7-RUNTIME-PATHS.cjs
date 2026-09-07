#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const output = path.join(root, "ETAPA4A7_RUNTIME_PATHS_FONTES.json");

const TARGETS = [
  "package.json",
  "desktop/main.cjs",
  "desktop/schemaMigratorRunner.cjs",
  "lib/prisma.ts",
  "lib/estoqueTecnico/db.ts",
  "scripts/preparar-env-sqlite-local.js",
  "scripts/preparar-standalone-desktop.js",
  "scripts/backup-core.js",
  "scripts/backup-api.js",
  "scripts/backup-local.js",
  "scripts/backup-auto.js",
  "scripts/restore-local.js",
  "scripts/schema-migrator/cli.cjs",
  "app/api/runtime/uploads/[...path]/route.ts",
  "app/api/ordens/[id]/anexos/route.ts",
  "app/api/ordens/[id]/anexos/[anexoId]/route.ts",
  "app/api/uploads/anexos/[arquivo]/route.ts",
  "app/api/produtos/upload/route.ts",
  "app/api/produtos/upload/[arquivo]/route.ts",
  "app/api/uploads/produtos/[arquivo]/route.ts",
  "app/api/configuracoes/logo/route.ts",
  "app/api/relatorios/pdf/route.ts",
  "app/api/ordens/[id]/imprimir/route.ts",
  "app/api/ordens/[id]/garantia/route.ts",
  "app/api/ordens/[id]/recibo/route.ts",
  "REDEFINIR-MODO-DESKTOP.bat",
  "REDEFINIR-MODO-DESKTOP.ps1"
];

function abs(relative) {
  return path.join(root, ...relative.split("/"));
}

function sha256(text) {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(text, "utf8"))
    .digest("hex");
}

function readSource(relative) {
  const file = abs(relative);

  if (!fs.existsSync(file)) {
    return {
      path: relative,
      exists: false,
    };
  }

  const stat = fs.statSync(file);

  if (!stat.isFile()) {
    return {
      path: relative,
      exists: true,
      isFile: false,
    };
  }

  if (stat.size > 1024 * 1024) {
    return {
      path: relative,
      exists: true,
      isFile: true,
      sizeBytes: stat.size,
      skipped: "FILE_TOO_LARGE",
    };
  }

  const content = fs.readFileSync(file, "utf8");

  if (content.includes("\u0000")) {
    return {
      path: relative,
      exists: true,
      isFile: true,
      sizeBytes: stat.size,
      skipped: "BINARY_CONTENT",
    };
  }

  return {
    path: relative,
    exists: true,
    isFile: true,
    sizeBytes: stat.size,
    sha256: sha256(content),
    content,
  };
}

function envKeys() {
  const envFile = path.join(root, ".env");
  if (!fs.existsSync(envFile)) return [];

  return fs
    .readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")).trim())
    .filter(Boolean);
}

function main() {
  const files = TARGETS.map(readSource);

  const report = {
    ok: true,
    stage: "4A.7-RUNTIME-PATHS-FONTES",
    generatedAt: new Date().toISOString(),
    root,
    safety: {
      readOnly: true,
      databaseChanged: false,
      schemaChanged: false,
      migrationExecuted: false,
      envValuesIncluded: false,
      secretsFileIncluded: false,
    },
    environment: {
      platform: process.platform,
      APPDATA: process.env.APPDATA || null,
      LOCALAPPDATA: process.env.LOCALAPPDATA || null,
      envKeys: envKeys(),
    },
    files,
  };

  fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify({
      ok: true,
      stage: report.stage,
      report: path.basename(output),
      requestedFiles: TARGETS.length,
      existingFiles: files.filter((file) => file.exists && file.isFile).length,
      missingFiles: files
        .filter((file) => !file.exists)
        .map((file) => file.path),
      envValuesIncluded: false,
      databaseChanged: false,
      schemaChanged: false,
      migrationExecuted: false,
    })
  );
}

main();
