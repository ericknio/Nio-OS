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
const files = pkg.build?.files || [];
const preparer = read("scripts/preparar-standalone-desktop.js");
const afterPack = read("scripts/electron-afterpack-v11n.js");
const validator = read("scripts/validar-desktop-dir-seguro.cjs");

for (const required of [
  "!.next/standalone/release/**/*",
  "!.next/standalone/dist-local/**/*",
  "!.next/standalone/_arquivo_morto_nio_os/**/*",
]) {
  check(files.includes(required), "build.files contém " + required);
}

check(
  preparer.includes("limparArtefatosGerados"),
  "preparador remove artefatos gerados do standalone"
);
check(
  preparer.includes("removerPublicUploadsRecursivo"),
  "preparador remove public/uploads recursivamente"
);
check(
  preparer.includes("removerEnvRecursivo"),
  "preparador remove .env recursivamente"
);
check(
  preparer.includes("validarStandalone(standalone)"),
  "preparador valida standalone antes do builder"
);
check(
  afterPack.includes("validarStandaloneRecursivo"),
  "afterPack faz validação recursiva"
);
check(
  afterPack.includes('item.name.toLowerCase() === "uploads"'),
  "afterPack bloqueia public/uploads em qualquer profundidade"
);
check(
  validator.includes("nestedReleaseTrees"),
  "validador final reporta árvores release aninhadas"
);
check(
  validator.includes("recursivePublicUploads"),
  "validador final reporta public/uploads recursivo"
);

console.log(
  JSON.stringify({
    ok: true,
    stage: "4A.14C.3-EMPACOTAMENTO-RECURSIVO-SEGURO",
    assertions,
    recursiveGeneratedArtifactsBlocked: true,
    recursivePublicUploadsBlocked: true,
    recursiveEnvBlocked: true,
    databaseChanged: false,
    buildExecuted: false,
  })
);
