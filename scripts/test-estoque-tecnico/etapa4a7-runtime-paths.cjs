#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
let assertions = 0;

function read(relative) {
  const file = path.join(root, ...relative.split("/"));
  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo não encontrado: ${relative}`);
  }
  return fs.readFileSync(file, "utf8");
}

function check(value, message) {
  assertions += 1;
  assert.ok(value, message);
}

function has(text, value, message) {
  check(text.includes(value), message);
}

function lacks(text, value, message) {
  check(!text.includes(value), message);
}

const runtime = read("lib/runtimeStorage.ts");
has(runtime, "process.env.LOCALAPPDATA || process.env.APPDATA", "runtime prioriza LOCALAPPDATA");
has(runtime, 'process.env.NODE_ENV !== "production"', "desenvolvimento permanece no projeto");
has(runtime, "process.env.NIO_OS_DATA_DIR", "runtime aceita raiz explícita");
has(runtime, "process.env.NIO_OS_RUNTIME_DIR", "runtime aceita raiz runtime explícita");

const desktop = read("desktop/main.cjs");
has(desktop, 'process.env.LOCALAPPDATA || app.getPath("appData")', "Electron usa LOCALAPPDATA");
has(desktop, "caminhoRaizRoamingLegada", "Electron mantém compatibilidade de upgrade do Roaming");
has(desktop, "migrarDadosRoamingLegados", "Electron migra legado sem sobrescrever destino");
has(desktop, "Banco SQLite inicial/migrado para LOCALAPPDATA", "log não chama destino de APPDATA");

const pkg = JSON.parse(read("package.json"));
check(!Object.prototype.hasOwnProperty.call(pkg.scripts, "prisma:push"), "script prisma:push removido");
check(
  pkg.scripts["local:prepare"] === "npm run prisma:generate && npm run build",
  "local:prepare não executa db push",
);
lacks(pkg.scripts["local:prepare"], "db push", "build não chama db push");

const envPrep = read("scripts/preparar-env-sqlite-local.js");
has(envPrep, '"NIO_OS_DATA_DIR"', "preparação local fixa raiz de dados no projeto");
has(envPrep, '"NIO_OS_RUNTIME_DIR"', "preparação local fixa raiz runtime no projeto");

const runtimeUpload = read("app/api/runtime/uploads/[...path]/route.ts");
has(runtimeUpload, 'from "@/lib/runtimeStorage"', "rota runtime usa helper central");
lacks(runtimeUpload, "process.env.APPDATA", "rota runtime não resolve Roaming própria");

const attachCreate = read("app/api/ordens/[id]/anexos/route.ts");
has(attachCreate, "caminhoStorageRuntime", "anexo grava em storage runtime");
lacks(
  attachCreate,
  'path.join(process.cwd(), "storage", "uploads", "anexos")',
  "anexo não grava no cwd",
);

const attachDelete = read("app/api/ordens/[id]/anexos/[anexoId]/route.ts");
has(attachDelete, "caminhoStorageRuntime", "exclusão usa storage runtime");
has(attachDelete, "caminhoUploadPublico", "exclusão mantém compatibilidade public/uploads");

const attachGet = read("app/api/uploads/anexos/[arquivo]/route.ts");
has(attachGet, "caminhoStorageRuntime", "leitura protegida usa storage runtime");
has(attachGet, "caminhoUploadPublico", "leitura protegida verifica legado public/uploads");

for (const file of [
  "app/api/produtos/upload/[arquivo]/route.ts",
  "app/api/uploads/produtos/[arquivo]/route.ts",
]) {
  const text = read(file);
  has(text, "caminhoUploadPublico", `${file} usa upload runtime`);
  lacks(text, 'path.join(\n      process.cwd(),', `${file} não monta public pelo cwd`);
}

const reportPdf = read("app/api/relatorios/pdf/route.ts");
has(reportPdf, "caminhoUploadPublico", "PDF de relatório usa logo runtime");
lacks(reportPdf, 'path.resolve(process.cwd(), "public")', "PDF não busca logo no cwd");

const resetBat = read("REDEFINIR-MODO-DESKTOP.bat");
has(resetBat, "$env:LOCALAPPDATA", "BAT redefine modo no LOCALAPPDATA");

const resetPs1 = read("REDEFINIR-MODO-DESKTOP.ps1");
has(resetPs1, 'Join-Path $env:LOCALAPPDATA "Nio-OS\\nio-os-desktop-config.json"', "PS1 usa caminho atual Local");
has(resetPs1, 'Join-Path $env:APPDATA "Nio-OS\\nio-os-desktop-config.json"', "PS1 ainda limpa legado Roaming");

console.log(JSON.stringify({
  ok: true,
  stage: "4A.7A",
  assertions,
  databaseChanged: false,
  schemaChanged: false,
  migrationRequired: false,
  prismaDbPushUsed: false,
  desktopBuildRun: false
}));
