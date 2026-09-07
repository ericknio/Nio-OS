#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const output = path.join(
  root,
  "ETAPA4A10A_DESKTOP_BUILD_FONTES.json",
);

const TARGETS = [
  "package.json",
  "scripts/electron-afterpack-v11n.js",
  "scripts/preparar-standalone-desktop.js",
  "scripts/criar-seed-sqlite-limpo.cjs",
  "desktop/main.cjs",
  "desktop/schemaMigratorRunner.cjs",
];

function sha256(text) {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(text, "utf8"))
    .digest("hex");
}

function readFile(relative) {
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

function main() {
  const files = TARGETS.map(readFile);

  const report = {
    ok: true,
    stage: "4A.10A-DESKTOP-BUILD-FONTES",
    generatedAt: new Date().toISOString(),
    safety: {
      readOnly: true,
      buildExecuted: false,
      databaseChanged: false,
      schemaChanged: false,
      migrationExecuted: false,
      secretsIncluded: false,
    },
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
      found: files.filter(
        (item) => item.exists && item.isFile,
      ).length,
      missing: files
        .filter((item) => !item.exists)
        .map((item) => item.path),
      buildExecuted: false,
      databaseChanged: false,
    }),
  );
}

main();
