#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const output = path.join(root, "ETAPA4A_INSPECAO_APPDATA.json");

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "release",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache",
]);

const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".cjs",
  ".mjs",
  ".json",
  ".prisma",
  ".bat",
  ".cmd",
  ".ps1",
]);

const NEEDLES = [
  "DATABASE_URL",
  "nio-os.db",
  "node:sqlite",
  "better-sqlite3",
  "schema-migrator",
  "LOCALAPPDATA",
  "APPDATA",
  "userData",
  "app.getPath",
  "process.resourcesPath",
  "process.cwd()",
  "backups",
  "uploads",
  "electron",
  "next start",
  "next dev",
  "win-unpacked",
];

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function sha256File(file) {
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

function fileInfo(file) {
  if (!fs.existsSync(file)) return { exists: false };

  const stat = fs.statSync(file);

  return {
    exists: true,
    path: rel(file),
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    sha256: stat.isFile() ? sha256File(file) : null,
  };
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();

    if (EXTENSIONS.has(ext) || entry.name === "Dockerfile") {
      files.push(full);
    }
  }

  return files;
}

function safeReadText(file) {
  const stat = fs.statSync(file);
  if (stat.size > 2 * 1024 * 1024) return null;

  const content = fs.readFileSync(file, "utf8");
  return content.includes("\u0000") ? null : content;
}

function snippets(file, content) {
  const lines = content.split(/\r?\n/);
  const found = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();

    for (const needle of NEEDLES) {
      if (!lower.includes(needle.toLowerCase())) continue;

      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length - 1, i + 2);
      const key = `${start}:${end}`;

      if (seen.has(key)) continue;
      seen.add(key);

      found.push({
        needle,
        startLine: start + 1,
        endLine: end + 1,
        text: lines
          .slice(start, end + 1)
          .map((line, idx) => `${start + idx + 1}: ${line}`)
          .join("\n"),
      });

      if (found.length >= 12) return found;
    }
  }

  return found;
}

function envKeyNames(file) {
  if (!fs.existsSync(file)) return [];

  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")).trim())
    .filter(Boolean);
}

function packageSummary() {
  const file = path.join(root, "package.json");
  if (!fs.existsSync(file)) return null;

  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));

  return {
    name: pkg.name || null,
    version: pkg.version || null,
    scripts: pkg.scripts || {},
    main: pkg.main || null,
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {},
  };
}

function collectKeyFiles() {
  const candidates = [
    "package.json",
    "prisma/schema.prisma",
    "lib/prisma.ts",
    "lib/prisma.js",
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
    "electron/main.ts",
    "electron/main.js",
    "electron/main.cjs",
    "main.js",
    "main.cjs",
    "scripts/schema-migrator/index.cjs",
    "scripts/schema-migrator/migrations.cjs",
    "scripts/schema-migrator/runner.cjs",
  ];

  return candidates
    .map((relative) => path.join(root, ...relative.split("/")))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({
      path: rel(file),
      sizeBytes: fs.statSync(file).size,
    }));
}

function findLikelyDesktopFiles(allFiles) {
  return allFiles
    .map((file) => ({ file, content: safeReadText(file) }))
    .filter(({ content }) => content)
    .filter(({ file, content }) => {
      const r = rel(file).toLowerCase();
      const c = content.toLowerCase();

      return (
        r.includes("electron") ||
        r.includes("desktop") ||
        r.endsWith(".bat") ||
        r.endsWith(".cmd") ||
        c.includes("browserwindow") ||
        c.includes("electron") ||
        c.includes("win-unpacked")
      );
    })
    .slice(0, 50)
    .map(({ file }) => rel(file));
}

function main() {
  const allFiles = walk(root);
  const matches = [];

  for (const file of allFiles) {
    const content = safeReadText(file);
    if (content === null) continue;

    const found = snippets(file, content);

    if (found.length > 0) {
      matches.push({
        path: rel(file),
        matches: found,
      });
    }
  }

  const projectDb = path.join(root, "data", "nio-os.db");
  const localAppData = process.env.LOCALAPPDATA || null;
  const appData = process.env.APPDATA || null;

  const appDataCandidates = localAppData
    ? [
        path.join(localAppData, "Nio-OS"),
        path.join(localAppData, "Nio OS"),
        path.join(localAppData, "nio-os"),
      ]
    : [];

  const report = {
    ok: true,
    stage: "4A-INSPECAO",
    generatedAt: new Date().toISOString(),
    root,
    platform: process.platform,
    node: process.version,

    safety: {
      readOnlyInspection: true,
      productFilesChanged: false,
      databaseChanged: false,
      schemaChanged: false,
      migrationExecuted: false,
      envValuesIncluded: false,
    },

    environment: {
      LOCALAPPDATA: localAppData,
      APPDATA: appData,
      envFiles: [".env", ".env.local", ".env.production"]
        .map((name) => ({
          file: name,
          exists: fs.existsSync(path.join(root, name)),
          keys: envKeyNames(path.join(root, name)),
        }))
        .filter((item) => item.exists),
    },

    package: packageSummary(),

    database: {
      currentProjectDb: fileInfo(projectDb),
      appDataCandidates: appDataCandidates.map((candidate) => ({
        path: candidate,
        exists: fs.existsSync(candidate),
        nioOsDb: fileInfo(path.join(candidate, "data", "nio-os.db")),
      })),
    },

    directories: {
      data: fileInfo(path.join(root, "data")),
      backups: fileInfo(path.join(root, "backups")),
      publicUploads: fileInfo(path.join(root, "public", "uploads")),
      uploads: fileInfo(path.join(root, "uploads")),
      schemaMigrator: fileInfo(path.join(root, "scripts", "schema-migrator")),
    },

    keyFiles: collectKeyFiles(),
    likelyDesktopFiles: findLikelyDesktopFiles(allFiles),
    sourceMatches: matches,
  };

  fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify({
      ok: true,
      stage: "4A-INSPECAO",
      report: path.basename(output),
      sourceFilesScanned: allFiles.length,
      filesWithRelevantMatches: matches.length,
      databaseFound: report.database.currentProjectDb.exists,
      databaseSizeBytes: report.database.currentProjectDb.sizeBytes || 0,
      envValuesIncluded: false,
      databaseChanged: false,
      schemaChanged: false,
      migrationExecuted: false,
    })
  );
}

main();
