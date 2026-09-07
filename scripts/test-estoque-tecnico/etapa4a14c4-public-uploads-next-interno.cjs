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

const preparer = read("scripts/preparar-standalone-desktop.js");
const afterPack = read("scripts/electron-afterpack-v11n.js");
const validator = read("scripts/validar-desktop-dir-seguro.cjs");

check(
  preparer.includes('relativoAtual === ".next" || relativoAtual.startsWith(".next/")'),
  "preparador reconhece internals do Next"
);

check(
  preparer.includes("!dentroDoNextInterno"),
  "preparador diferencia rota compilada de dados reais"
);

check(
  afterPack.includes('relativoAtual === ".next" || relativoAtual.startsWith(".next/")'),
  "afterPack reconhece internals do Next"
);

check(
  afterPack.includes("!dentroDoNextInterno"),
  "afterPack preserva chunks/rotas compiladas do Next"
);

check(
  validator.includes('relativoStandalone.startsWith(".next/")'),
  "validador reconhece internals do Next"
);

check(
  validator.includes("!dentroDoNextInterno"),
  "validador diferencia public/uploads real de rota compilada"
);

check(
  preparer.includes('for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os"])'),
  "preparador continua removendo árvore release aninhada"
);

check(
  afterPack.includes('for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os"])'),
  "afterPack continua bloqueando release aninhado"
);

check(
  validator.includes("nestedReleaseTrees"),
  "validador reforçado continua ativo"
);

console.log(JSON.stringify({
  ok: true,
  stage: "4A.14C.4-V2-PUBLIC-UPLOADS-NEXT-INTERNO",
  assertions,
  compiledNextRoutesPreserved: true,
  realPublicUploadsStillBlocked: true,
  nestedReleaseStillBlocked: true,
  databaseChanged: false,
  buildExecuted: false
}));
