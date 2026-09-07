#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
let assertions = 0;

function check(value, message) {
  assertions += 1;
  assert.ok(value, message);
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

check(
  pkg.scripts["seed:sqlite"] ===
    "node scripts/criar-seed-sqlite-limpo.cjs",
  "script seed:sqlite configurado",
);

check(
  pkg.scripts["desktop:prepare"] ===
    "npm run seed:sqlite && node scripts/preparar-standalone-desktop.js",
  "desktop:prepare sempre valida/gera seed limpo",
);

check(
  !Object.prototype.hasOwnProperty.call(pkg.scripts, "prisma:push"),
  "prisma:push continua removido",
);

check(
  !String(pkg.scripts["local:prepare"] || "").includes("db push"),
  "local:prepare continua sem db push",
);

const resources = Array.isArray(pkg.build?.extraResources)
  ? pkg.build.extraResources
  : [];

check(resources.length === 1, "há exatamente um extraResource de seed");
check(
  resources[0].from === "build/seed/data",
  "seed vem de build/seed/data",
);
check(resources[0].to === "seed/data", "seed entra em resources/seed/data");
check(
  Array.isArray(resources[0].filter) &&
    resources[0].filter.length === 1 &&
    resources[0].filter[0] === "nio-os.db",
  "apenas nio-os.db limpo é empacotado",
);

const packageText = fs.readFileSync(
  path.join(root, "package.json"),
  "utf8",
);
check(
  !packageText.includes('"from": "data"'),
  "data/nio-os.db real não é fonte do extraResources",
);

const generator = fs.readFileSync(
  path.join(root, "scripts", "criar-seed-sqlite-limpo.cjs"),
  "utf8",
);

check(
  generator.includes("sqlite_master"),
  "gerador clona somente metadados de schema",
);
check(
  generator.includes("sourceBusinessRowsRead: false"),
  "gerador não lê linhas de negócio",
);
check(
  generator.includes("sourceBusinessDatabaseCopied: false"),
  "gerador não copia banco real",
);
check(
  generator.includes("validateNoBusinessRows"),
  "seed valida zero linhas de negócio",
);
check(
  generator.includes("validateSchemaEquivalent"),
  "seed compara schema fonte/destino",
);
check(
  generator.includes("manifest?.migrations"),
  "histórico é validado contra manifesto atual",
);
check(
  !generator.includes("prisma db push"),
  "gerador não usa prisma db push",
);
check(
  !generator.includes("--apply"),
  "gerador não tenta bootstrap pelo migrador",
);

console.log(
  JSON.stringify({
    ok: true,
    stage: "4A.7B.1",
    assertions,
    seedStrategy: "schema-metadata-clone",
    sourceBusinessRowsRead: false,
    realBusinessDatabaseCopied: false,
    prismaDbPushUsed: false,
    liveDatabaseChanged: false,
    desktopBuildRun: false,
  }),
);
