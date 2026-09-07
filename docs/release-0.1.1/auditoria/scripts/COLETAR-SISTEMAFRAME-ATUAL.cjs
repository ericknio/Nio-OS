#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const target = path.join(root, "app", "SistemaFrame.tsx");
const output = path.join(root, "SISTEMAFRAME_ATUAL.json");

function sha256(text) {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(text, "utf8"))
    .digest("hex");
}

function main() {
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new Error("app/SistemaFrame.tsx não encontrado.");
  }

  const content = fs.readFileSync(target, "utf8");

  const report = {
    ok: true,
    stage: "COLETAR-SISTEMAFRAME-ATUAL",
    generatedAt: new Date().toISOString(),
    safety: {
      readOnly: true,
      fileChanged: false,
      databaseChanged: false,
      buildExecuted: false,
      secretsExpected: false,
    },
    file: {
      path: "app/SistemaFrame.tsx",
      sizeBytes: Buffer.byteLength(content, "utf8"),
      sha256: sha256(content),
      content,
    },
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
      sha256: report.file.sha256,
      sizeBytes: report.file.sizeBytes,
      fileChanged: false,
    }),
  );
}

main();
