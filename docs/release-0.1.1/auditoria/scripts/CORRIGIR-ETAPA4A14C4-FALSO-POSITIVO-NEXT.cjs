#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const targets = {
  preparer: path.join(root, "scripts", "preparar-standalone-desktop.js"),
  afterPack: path.join(root, "scripts", "electron-afterpack-v11n.js"),
  validator: path.join(root, "scripts", "validar-desktop-dir-seguro.cjs"),
  test: path.join(
    root,
    "scripts",
    "test-estoque-tecnico",
    "etapa4a14c4-public-uploads-next-interno.cjs"
  ),
};

function fail(message) {
  throw new Error(message);
}

function read(file) {
  if (!fs.existsSync(file)) {
    fail(`Arquivo não encontrado: ${path.relative(root, file)}`);
  }

  return fs.readFileSync(file, "utf8");
}

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-4a14c4-${stamp}`);
}

function replaceOnce(content, before, after, label) {
  const count = content.split(before).length - 1;

  if (count !== 1) {
    fail(`${label}: esperado 1 trecho para substituir; encontrado ${count}.`);
  }

  return content.replace(before, after);
}

function patchPreparer(content) {
  content = replaceOnce(
    content,
`  const pilha = [base];

  while (pilha.length > 0) {
    const atual = pilha.pop();

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {`,
`  const pilha = [base];

  while (pilha.length > 0) {
    const atual = pilha.pop();
    const relativoAtual = normalizar(path.relative(base, atual));
    const dentroDoNextInterno =
      relativoAtual === ".next" || relativoAtual.startsWith(".next/");

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {`,
    "preparador/removerPublicUploadsRecursivo"
  );

  content = replaceOnce(
    content,
`      if (
        item.name.toLowerCase() === "uploads" &&
        path.basename(atual).toLowerCase() === "public"
      ) {`,
`      if (
        item.name.toLowerCase() === "uploads" &&
        path.basename(atual).toLowerCase() === "public" &&
        !dentroDoNextInterno
      ) {`,
    "preparador/condição public-uploads"
  );

  content = replaceOnce(
    content,
`  const pilha = [standalone];

  while (pilha.length > 0) {
    const atual = pilha.pop();

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {`,
`  const pilha = [standalone];

  while (pilha.length > 0) {
    const atual = pilha.pop();
    const relativoAtual = normalizar(path.relative(standalone, atual));
    const dentroDoNextInterno =
      relativoAtual === ".next" || relativoAtual.startsWith(".next/");

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {`,
    "preparador/validarStandalone"
  );

  content = replaceOnce(
    content,
`        if (
          item.name.toLowerCase() === "uploads" &&
          path.basename(atual).toLowerCase() === "public"
        ) {`,
`        if (
          item.name.toLowerCase() === "uploads" &&
          path.basename(atual).toLowerCase() === "public" &&
          !dentroDoNextInterno
        ) {`,
    "preparador/validação public-uploads"
  );

  return content;
}

function patchAfterPack(content) {
  content = replaceOnce(
    content,
`function validarStandaloneRecursivo(standalone) {
  for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os"]) {`,
`function normalizar(caminho) {
  return caminho.replace(/\\\\/g, "/");
}

function validarStandaloneRecursivo(standalone) {
  for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os"]) {`,
    "afterPack/helper normalizar"
  );

  content = replaceOnce(
    content,
`  const pilha = [standalone];

  while (pilha.length > 0) {
    const atual = pilha.pop();

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {`,
`  const pilha = [standalone];

  while (pilha.length > 0) {
    const atual = pilha.pop();
    const relativoAtual = normalizar(path.relative(standalone, atual));
    const dentroDoNextInterno =
      relativoAtual === ".next" || relativoAtual.startsWith(".next/");

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {`,
    "afterPack/loop"
  );

  content = replaceOnce(
    content,
`        if (
          item.name.toLowerCase() === "uploads" &&
          path.basename(atual).toLowerCase() === "public"
        ) {`,
`        if (
          item.name.toLowerCase() === "uploads" &&
          path.basename(atual).toLowerCase() === "public" &&
          !dentroDoNextInterno
        ) {`,
    "afterPack/condição public-uploads"
  );

  return content;
}

function patchValidator(content) {
  content = replaceOnce(
    content,
`  const forbiddenDirs = appTree.dirs.filter((dir) => {
    const n = normalize(dir);

    if (n === normalize(path.join(appDir, "data"))) return true;`,
`  const forbiddenDirs = appTree.dirs.filter((dir) => {
    const n = normalize(dir);
    const relativoStandalone = n.startsWith(standaloneNormalized)
      ? n.slice(standaloneNormalized.length)
      : "";
    const dentroDoNextInterno =
      relativoStandalone === ".next" ||
      relativoStandalone.startsWith(".next/");

    if (n === normalize(path.join(appDir, "data"))) return true;`,
    "validator/contexto standalone"
  );

  content = replaceOnce(
    content,
`    if (
      path.basename(dir).toLowerCase() === "uploads" &&
      path.basename(path.dirname(dir)).toLowerCase() === "public"
    ) {
      return true;
    }`,
`    if (
      path.basename(dir).toLowerCase() === "uploads" &&
      path.basename(path.dirname(dir)).toLowerCase() === "public" &&
      !dentroDoNextInterno
    ) {
      return true;
    }`,
    "validator/condição public-uploads"
  );

  return content;
}

const testContent = String.raw`#!/usr/bin/env node
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
  "preparador não trata rota compilada /public/uploads como dado real"
);

check(
  afterPack.includes('relativoAtual === ".next" || relativoAtual.startsWith(".next/")'),
  "afterPack reconhece internals do Next"
);

check(
  afterPack.includes("!dentroDoNextInterno"),
  "afterPack não bloqueia chunks/rotas compiladas do Next"
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
  "remoção da árvore release contaminada continua ativa"
);

check(
  afterPack.includes('for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os"])'),
  "afterPack continua bloqueando release aninhado na raiz do standalone"
);

check(
  validator.includes("nestedReleaseTrees"),
  "validador reforçado de release aninhado continua ativo"
);

console.log(
  JSON.stringify({
    ok: true,
    stage: "4A.14C.4-PUBLIC-UPLOADS-NEXT-INTERNO",
    assertions,
    compiledNextRoutesPreserved: true,
    realPublicUploadsStillBlocked: true,
    nestedReleaseStillBlocked: true,
    databaseChanged: false,
    buildExecuted: false,
  })
);
`;

function main() {
  const preparer = read(targets.preparer);
  const afterPack = read(targets.afterPack);
  const validator = read(targets.validator);

  if (!preparer.includes("limparArtefatosGerados")) {
    fail("preparar-standalone-desktop.js não está na versão 4A.14C.3 esperada.");
  }

  if (!afterPack.includes("validarStandaloneRecursivo")) {
    fail("electron-afterpack-v11n.js não está na versão 4A.14C.3 esperada.");
  }

  if (!validator.includes("nestedReleaseTrees")) {
    fail("validar-desktop-dir-seguro.cjs não está na versão 4A.14C.3 esperada.");
  }

  backup(targets.preparer);
  backup(targets.afterPack);
  backup(targets.validator);

  fs.writeFileSync(targets.preparer, patchPreparer(preparer), "utf8");
  fs.writeFileSync(targets.afterPack, patchAfterPack(afterPack), "utf8");
  fs.writeFileSync(targets.validator, patchValidator(validator), "utf8");

  fs.mkdirSync(path.dirname(targets.test), { recursive: true });
  fs.writeFileSync(targets.test, testContent, "utf8");

  console.log(
    JSON.stringify({
      ok: true,
      stage: "4A.14C.4-CORRECAO-FALSO-POSITIVO-NEXT",
      changed: [
        "scripts/preparar-standalone-desktop.js",
        "scripts/electron-afterpack-v11n.js",
        "scripts/validar-desktop-dir-seguro.cjs",
        "scripts/test-estoque-tecnico/etapa4a14c4-public-uploads-next-interno.cjs",
      ],
      compiledNextRoutesPreserved: true,
      realPublicUploadsStillBlocked: true,
      nestedReleaseStillBlocked: true,
      databaseChanged: false,
      schemaChanged: false,
      migrationExecuted: false,
      buildExecuted: false,
      installerBuildExecuted: false,
    })
  );
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      stage: "4A.14C.4-CORRECAO-FALSO-POSITIVO-NEXT",
      message: error instanceof Error ? error.message : String(error),
      databaseChanged: false,
      buildExecuted: false,
    })
  );
  process.exit(1);
}
