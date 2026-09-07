#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const output = path.join(root, "ETAPA4A13A_SEGURANCA_LAN_FONTES.json");

const EXACT = [
  "proxy.ts",
  "middleware.ts",
  "src/proxy.ts",
  "src/middleware.ts",
  "app/api/auth/login/route.ts",
  "app/api/auth/logout/route.ts",
  "app/api/auth/me/route.ts",
  "app/api/auth/setup/route.ts",
  "app/api/auth/minha-conta/route.ts",
  "app/api/auth/trocar-senha/route.ts",
  "app/api/local/health/route.ts",
  "desktop/main.cjs"
];

const SEARCH_DIRS = ["lib", "app/api/auth"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".cjs", ".mjs"]);
const KEYWORDS = [
  "auth",
  "session",
  "cookie",
  "csrf",
  "cors",
  "origin",
  "permission",
  "permiss",
  "login",
  "logout",
  "secret"
];

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalize(relative) {
  return relative.replace(/\\/g, "/");
}

function shouldSkip(relative) {
  const n = normalize(relative).toLowerCase();
  const base = path.basename(n);

  return (
    n.includes("/node_modules/") ||
    n.includes("/.next/") ||
    n.includes("/release/") ||
    n.includes("/backups/") ||
    n.includes(".bak-") ||
    base === ".env" ||
    base.startsWith(".env.")
  );
}

function collectCandidates() {
  const found = new Set();

  for (const relative of EXACT) {
    const file = path.join(root, ...relative.split("/"));

    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      found.add(normalize(relative));
    }
  }

  function walk(dir, relativeDir) {
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const relative = normalize(path.join(relativeDir, entry.name));

      if (shouldSkip(relative)) continue;

      if (entry.isDirectory()) {
        walk(absolute, relative);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

      const lower = relative.toLowerCase();

      if (KEYWORDS.some((keyword) => lower.includes(keyword))) {
        found.add(relative);
      }
    }
  }

  for (const relative of SEARCH_DIRS) {
    walk(path.join(root, ...relative.split("/")), relative);
  }

  return [...found].sort();
}

function readSource(relative) {
  const file = path.join(root, ...relative.split("/"));
  const stat = fs.statSync(file);

  if (stat.size > 300 * 1024) {
    return {
      path: relative,
      sizeBytes: stat.size,
      skipped: "FILE_TOO_LARGE"
    };
  }

  const buffer = fs.readFileSync(file);

  if (buffer.includes(0)) {
    return {
      path: relative,
      sizeBytes: stat.size,
      sha256: sha256(buffer),
      skipped: "BINARY_CONTENT"
    };
  }

  return {
    path: relative,
    sizeBytes: stat.size,
    sha256: sha256(buffer),
    content: buffer.toString("utf8")
  };
}

function main() {
  const candidates = collectCandidates();

  if (candidates.length === 0) {
    throw new Error("Nenhuma fonte de autenticação/segurança LAN foi encontrada.");
  }

  const files = candidates.map(readSource);

  const report = {
    ok: true,
    stage: "4A.13A-SEGURANCA-LAN-FONTES",
    generatedAt: new Date().toISOString(),
    safety: {
      readOnly: true,
      databaseRead: false,
      databaseChanged: false,
      envRead: false,
      runtimeConfigRead: false,
      buildExecuted: false,
      installerBuildExecuted: false
    },
    purpose:
      "Revisar autenticação, sessão/cookies, origem/CSRF/CORS, permissões e limites do modo LAN antes do instalador final.",
    files
  };

  fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify({
      ok: true,
      stage: report.stage,
      report: path.basename(output),
      filesCollected: files.length,
      databaseChanged: false,
      buildExecuted: false
    })
  );
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      stage: "4A.13A-SEGURANCA-LAN-FONTES",
      message: error instanceof Error ? error.message : String(error),
      databaseChanged: false,
      buildExecuted: false
    })
  );
  process.exit(1);
}
