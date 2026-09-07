#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const output = path.join(
  root,
  "ETAPA4A12_CLIENTE_DESKTOP_FONTES.json",
);

const TARGETS = [
  "desktop/main.cjs",
  "desktop/preload.cjs",
  "desktop/seletor.html",
  "app/api/local/health/route.ts",
  "package.json",
];

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function readSource(relative) {
  const file = path.join(root, ...relative.split("/"));

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

  const buffer = fs.readFileSync(file);

  if (buffer.includes(0)) {
    return {
      path: relative,
      exists: true,
      isFile: true,
      sizeBytes: stat.size,
      sha256: sha256(buffer),
      skipped: "BINARY_CONTENT",
    };
  }

  const content = buffer.toString("utf8");

  return {
    path: relative,
    exists: true,
    isFile: true,
    sizeBytes: stat.size,
    sha256: sha256(buffer),
    content,
  };
}

function main() {
  const files = TARGETS.map(readSource);
  const missing = files
    .filter((item) => !item.exists)
    .map((item) => item.path);

  if (missing.length > 0) {
    throw new Error(
      `Arquivos obrigatórios ausentes: ${missing.join(", ")}`,
    );
  }

  const report = {
    ok: true,
    stage: "4A.12A-CLIENTE-DESKTOP-FONTES",
    generatedAt: new Date().toISOString(),
    safety: {
      readOnly: true,
      databaseChanged: false,
      schemaChanged: false,
      migrationExecuted: false,
      buildExecuted: false,
      installerBuildExecuted: false,
      envFileRead: false,
      runtimeConfigRead: false,
      databaseRead: false,
    },
    purpose:
      "Inspecionar o fluxo Electron cliente, preload, seletor e assinatura do health antes do teste real em outro computador.",
    files,
  };

  fs.writeFileSync(
    output,
    JSON.stringify(report, null, 2),
    "utf8",
  );

  console.log(
    JSON.stringify({
      ok: true,
      stage: report.stage,
      report: path.basename(output),
      requestedFiles: TARGETS.length,
      found: files.length,
      databaseChanged: false,
      schemaChanged: false,
      buildExecuted: false,
      installerBuildExecuted: false,
    }),
  );
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      stage: "4A.12A-CLIENTE-DESKTOP-FONTES",
      message:
        error instanceof Error ? error.message : String(error),
      databaseChanged: false,
      schemaChanged: false,
      buildExecuted: false,
      installerBuildExecuted: false,
    }),
  );
  process.exit(1);
}
