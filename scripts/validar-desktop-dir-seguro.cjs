#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();
const unpacked = path.join(root, "release", "win-unpacked");
const resources = path.join(unpacked, "resources");
const appDir = path.join(resources, "app");
const standalone = path.join(appDir, ".next", "standalone");
const seedDb = path.join(resources, "seed", "data", "nio-os.db");

function walk(base) {
  const files = [];
  const dirs = [];
  if (!fs.existsSync(base)) return { files, dirs };

  const stack = [base];

  while (stack.length > 0) {
    const current = stack.pop();

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);

      if (entry.isSymbolicLink()) {
        throw new Error("Link simbólico inesperado: " + full);
      }

      if (entry.isDirectory()) {
        dirs.push(full);
        stack.push(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }

  return { files, dirs };
}

function normalize(file) {
  return path.resolve(file).replace(/\\/g, "/").toLowerCase();
}

function validateSeed() {
  if (!fs.existsSync(seedDb)) {
    throw new Error("Seed não encontrado: " + seedDb);
  }

  const db = new DatabaseSync(seedDb, { readOnly: true });

  try {
    const integrity = db.prepare("PRAGMA integrity_check").all();
    const fk = db.prepare("PRAGMA foreign_key_check").all();
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map((row) => String(row.name));

    if (
      integrity.length !== 1 ||
      String(integrity[0].integrity_check) !== "ok"
    ) {
      throw new Error("Seed empacotado falhou no integrity_check.");
    }

    if (fk.length !== 0) {
      throw new Error("Seed empacotado possui violações de FK.");
    }

    if (tables.length !== 22) {
      throw new Error(
        "Seed empacotado possui " + tables.length + " tabelas; esperado 22."
      );
    }

    const migrationCount = Number(
      db.prepare('SELECT COUNT(*) AS c FROM "NioSchemaMigration"').get().c
    );

    if (migrationCount !== 5) {
      throw new Error(
        "Seed possui " + migrationCount + " migrações; esperado 5."
      );
    }

    let businessRows = 0;

    for (const table of tables) {
      if (table === "NioSchemaMigration") continue;
      const safe = table.replaceAll('"', '""');
      businessRows += Number(
        db.prepare('SELECT COUNT(*) AS c FROM "' + safe + '"').get().c
      );
    }

    if (businessRows !== 0) {
      throw new Error("Seed contém dados de negócio.");
    }

    return {
      integrityCheck: "ok",
      foreignKeyViolations: 0,
      tableCount: 22,
      migrationCount: 5,
      businessRows: 0,
      sizeBytes: fs.statSync(seedDb).size,
    };
  } finally {
    db.close();
  }
}

function main() {
  if (!fs.existsSync(unpacked)) {
    throw new Error(
      "release/win-unpacked não existe. Rode npm run desktop:dir primeiro."
    );
  }

  const appTree = walk(appDir);
  const resourceTree = walk(resources);
  const standaloneNormalized = normalize(standalone) + "/";

  const forbiddenDirs = appTree.dirs.filter((dir) => {
    const n = normalize(dir);
    const relativoStandalone = n.startsWith(standaloneNormalized)
      ? n.slice(standaloneNormalized.length)
      : "";
    const dentroDoNextInterno =
      relativoStandalone === ".next" ||
      relativoStandalone.startsWith(".next/");

    if (n === normalize(path.join(appDir, "data"))) return true;
    if (n === normalize(path.join(appDir, "backups"))) return true;
    if (n === normalize(path.join(appDir, "storage"))) return true;

    if (
      path.basename(dir).toLowerCase() === "uploads" &&
      path.basename(path.dirname(dir)).toLowerCase() === "public" &&
      !dentroDoNextInterno
    ) {
      return true;
    }

    if (
      n === normalize(path.join(standalone, "release")) ||
      n === normalize(path.join(standalone, "dist-local")) ||
      n === normalize(path.join(standalone, "_arquivo_morto_nio_os"))
    ) {
      return true;
    }

    return false;
  });

  if (forbiddenDirs.length > 0) {
    throw new Error(
      "Diretório proibido no pacote: " + forbiddenDirs.join(", ")
    );
  }

  const envFiles = appTree.files.filter((file) =>
    /^\.env(?:\.|$)/i.test(path.basename(file))
  );

  if (envFiles.length > 0) {
    throw new Error(
      "Arquivo de ambiente dentro do app empacotado: " + envFiles.join(", ")
    );
  }

  const databases = resourceTree.files.filter((file) =>
    /^nio-os\.(?:db|sqlite|sqlite3)$/i.test(path.basename(file))
  );

  const unexpectedDatabases = databases.filter(
    (file) => normalize(file) !== normalize(seedDb)
  );

  if (unexpectedDatabases.length > 0) {
    throw new Error(
      "Banco inesperado no pacote: " + unexpectedDatabases.join(", ")
    );
  }

  if (databases.length !== 1) {
    throw new Error(
      "Esperado exatamente 1 banco seed no pacote; encontrado " +
        databases.length +
        "."
    );
  }

  for (const required of [
    path.join(appDir, "desktop", "main.cjs"),
    path.join(standalone, "server.js"),
    path.join(appDir, "scripts", "schema-migrator", "cli.cjs"),
  ]) {
    if (!fs.existsSync(required)) {
      throw new Error("Arquivo runtime obrigatório ausente: " + required);
    }
  }

  const seed = validateSeed();

  console.log(
    JSON.stringify({
      ok: true,
      stage: "4A.14C.3-DESKTOP-DIR-RECURSIVAMENTE-VALIDADO",
      unpacked: "release/win-unpacked",
      unexpectedDatabases: 0,
      envFilesInsideApp: 0,
      realDataPathsWithFiles: 0,
      recursivePublicUploads: 0,
      nestedReleaseTrees: 0,
      seed,
      packagedExeExists: fs.existsSync(
        path.join(unpacked, "Nio-OS.exe")
      ),
      packagedDesktopBootStillPending: true,
    })
  );
}

main();
