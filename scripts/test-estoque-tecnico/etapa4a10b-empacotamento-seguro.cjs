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

function read(relative) {
  return fs.readFileSync(path.join(root, ...relative.split("/")), "utf8");
}

const pkg = JSON.parse(read("package.json"));

check(
  pkg.scripts["desktop:prepare"] ===
    "npm run local:prepare && npm run seed:sqlite && node scripts/preparar-standalone-desktop.js",
  "desktop:prepare centraliza build + seed + standalone",
);

for (const name of [
  "desktop:dir",
  "desktop:portable",
  "desktop:installer",
  "desktop:release",
  "desktop:win",
]) {
  check(
    String(pkg.scripts[name] || "").startsWith("npm run desktop:prepare && "),
    `${name} passa obrigatoriamente por desktop:prepare`,
  );
}

check(
  pkg.scripts["desktop:instalador"] === "npm run desktop:installer",
  "desktop:instalador é alias seguro",
);

const files = pkg.build?.files || [];

for (const required of [
  "desktop/**/*",
  ".next/standalone/**/*",
  "scripts/schema-migrator/**/*",
  "prisma/**/*",
  "package.json",
  "!data/**/*",
  "!backups/**/*",
  "!storage/**/*",
  "!public/uploads/**/*",
  "!.next/standalone/data/**/*",
  "!.next/standalone/backups/**/*",
  "!.next/standalone/storage/**/*",
  "!.next/standalone/public/uploads/**/*",
]) {
  check(files.includes(required), `build.files contém ${required}`);
}

for (const forbidden of [
  "public/**/*",
  "public/**",
  "scripts/**",
  "node_modules/**",
  ".next/standalone/**",
]) {
  check(!files.includes(forbidden), `build.files não reabre ${forbidden}`);
}

const resources = pkg.build?.extraResources || [];
check(resources.length === 1, "há um único extraResources");
check(
  resources[0]?.from === "build/seed/data" &&
    resources[0]?.to === "seed/data",
  "extraResources aponta apenas para seed limpo",
);

const afterPack = read("scripts/electron-afterpack-v11n.js");

check(
  !afterPack.includes(
    'copiarDiretorio(path.join(projeto, "public"), path.join(standaloneDestino, "public"))',
  ),
  "afterPack não copia public bruto",
);

check(
  afterPack.includes("validarStandaloneSemDadosReais"),
  "afterPack valida standalone antes de copiar",
);

check(
  afterPack.includes("validarStandaloneSemEnv"),
  "afterPack bloqueia arquivos .env do standalone",
);

const preparer = read("scripts/preparar-standalone-desktop.js");

check(
  preparer.includes("removerEnvStandalone"),
  "preparador remove .env do standalone antes do builder",
);

check(
  preparer.includes('".env.production.local"'),
  "preparador cobre variantes de ambiente de produção",
);

console.log(
  JSON.stringify({
    ok: true,
    stage: "4A.10B",
    assertions,
    realDataPackagingBlocked: true,
    rawPublicCopyBlocked: true,
    seedRequiredForEveryDesktopTarget: true,
    desktopBuildRun: false,
  }),
);
