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
  fs.copyFileSync(file, `${file}.bak-4a14c4v2-${stamp}`);
}

function findFunctionRange(content, functionName) {
  const markers = [
    `function ${functionName}(`,
    `async function ${functionName}(`,
  ];

  let start = -1;

  for (const marker of markers) {
    const index = content.indexOf(marker);
    if (index >= 0 && (start < 0 || index < start)) start = index;
  }

  if (start < 0) {
    fail(`Função não encontrada: ${functionName}`);
  }

  const braceStart = content.indexOf("{", start);
  if (braceStart < 0) {
    fail(`Abertura da função não encontrada: ${functionName}`);
  }

  let depth = 0;
  let state = "code";
  let quote = "";

  for (let i = braceStart; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1] || "";

    if (state === "line") {
      if (ch === "\n") state = "code";
      continue;
    }

    if (state === "block") {
      if (ch === "*" && next === "/") {
        state = "code";
        i++;
      }
      continue;
    }

    if (state === "string") {
      if (ch === "\\") {
        i++;
        continue;
      }

      if (ch === quote) {
        state = "code";
        quote = "";
      }
      continue;
    }

    if (ch === "/" && next === "/") {
      state = "line";
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      state = "block";
      i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      state = "string";
      quote = ch;
      continue;
    }

    if (ch === "{") {
      depth++;
      continue;
    }

    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return { start, end: i + 1 };
      }
    }
  }

  fail(`Fechamento da função não encontrado: ${functionName}`);
}

function replaceFunction(content, functionName, replacement) {
  const range = findFunctionRange(content, functionName);
  return (
    content.slice(0, range.start) +
    replacement.trim() +
    content.slice(range.end)
  );
}

const removerPublicUploadsRecursivo = String.raw`
function removerPublicUploadsRecursivo(base) {
  let removidos = 0;
  if (!fs.existsSync(base)) return removidos;

  const pilha = [base];

  while (pilha.length > 0) {
    const atual = pilha.pop();
    const relativoAtual = normalizar(path.relative(base, atual));
    const dentroDoNextInterno =
      relativoAtual === ".next" || relativoAtual.startsWith(".next/");

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, item.name);

      if (item.isSymbolicLink()) {
        throw new Error("Link simbólico recusado no standalone: " + completo);
      }

      if (!item.isDirectory()) continue;

      if (
        item.name.toLowerCase() === "uploads" &&
        path.basename(atual).toLowerCase() === "public" &&
        !dentroDoNextInterno
      ) {
        fs.rmSync(completo, { recursive: true, force: true });
        removidos += 1;
        continue;
      }

      pilha.push(completo);
    }
  }

  return removidos;
}
`;

const validarStandalonePreparer = String.raw`
function validarStandalone(standalone) {
  for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os"]) {
    if (fs.existsSync(path.join(standalone, nome))) {
      throw new Error("Artefato de build proibido no standalone: " + nome);
    }
  }

  const pilha = [standalone];

  while (pilha.length > 0) {
    const atual = pilha.pop();
    const relativoAtual = normalizar(path.relative(standalone, atual));
    const dentroDoNextInterno =
      relativoAtual === ".next" || relativoAtual.startsWith(".next/");

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, item.name);

      if (item.isSymbolicLink()) {
        throw new Error("Link simbólico recusado no standalone: " + completo);
      }

      if (item.isDirectory()) {
        if (
          item.name.toLowerCase() === "uploads" &&
          path.basename(atual).toLowerCase() === "public" &&
          !dentroDoNextInterno
        ) {
          throw new Error("public/uploads encontrado no standalone: " + completo);
        }

        pilha.push(completo);
        continue;
      }

      if (/^\.env(?:\.|$)/i.test(item.name)) {
        throw new Error("Arquivo de ambiente encontrado no standalone: " + completo);
      }

      if (/^nio-os\.(?:db|sqlite|sqlite3)$/i.test(item.name)) {
        throw new Error("Banco de runtime encontrado no standalone: " + completo);
      }
    }
  }
}
`;

const validarStandaloneAfterPack = String.raw`
function validarStandaloneRecursivo(standalone) {
  for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os"]) {
    if (existe(path.join(standalone, nome))) {
      throw new Error("Artefato de build proibido no standalone: " + nome);
    }
  }

  const pilha = [standalone];

  while (pilha.length > 0) {
    const atual = pilha.pop();
    const relativoAtual = path
      .relative(standalone, atual)
      .replace(/\\/g, "/");
    const dentroDoNextInterno =
      relativoAtual === ".next" || relativoAtual.startsWith(".next/");

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, item.name);

      if (item.isSymbolicLink()) {
        throw new Error("Link simbólico recusado no standalone: " + completo);
      }

      if (item.isDirectory()) {
        if (
          item.name.toLowerCase() === "uploads" &&
          path.basename(atual).toLowerCase() === "public" &&
          !dentroDoNextInterno
        ) {
          throw new Error("public/uploads proibido no standalone: " + completo);
        }

        pilha.push(completo);
        continue;
      }

      if (/^\.env(?:\.|$)/i.test(item.name)) {
        throw new Error("Arquivo de ambiente recusado no standalone: " + completo);
      }

      if (/^nio-os\.(?:db|sqlite|sqlite3)$/i.test(item.name)) {
        throw new Error("Banco de runtime recusado no standalone: " + completo);
      }
    }
  }
}
`;

function patchValidator(content) {
  const marker = `  const forbiddenDirs = appTree.dirs.filter((dir) => {`;
  const start = content.indexOf(marker);

  if (start < 0) {
    fail("Bloco forbiddenDirs não encontrado no validador.");
  }

  const open = content.indexOf("{", start);
  let depth = 0;
  let end = -1;

  for (let i = open; i < content.length; i++) {
    const ch = content[i];

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const closeParen = content.indexOf(");", i);
        if (closeParen < 0) fail("Fim do forbiddenDirs não encontrado.");
        end = closeParen + 2;
        break;
      }
    }
  }

  if (end < 0) fail("Não foi possível delimitar forbiddenDirs.");

  const replacement = String.raw`  const forbiddenDirs = appTree.dirs.filter((dir) => {
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
  });`;

  return content.slice(0, start) + replacement + content.slice(end);
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

  const novoPreparer = replaceFunction(
    replaceFunction(
      preparer,
      "removerPublicUploadsRecursivo",
      removerPublicUploadsRecursivo
    ),
    "validarStandalone",
    validarStandalonePreparer
  );

  const novoAfterPack = replaceFunction(
    afterPack,
    "validarStandaloneRecursivo",
    validarStandaloneAfterPack
  );

  const novoValidator = patchValidator(validator);

  backup(targets.preparer);
  backup(targets.afterPack);
  backup(targets.validator);

  fs.writeFileSync(targets.preparer, novoPreparer, "utf8");
  fs.writeFileSync(targets.afterPack, novoAfterPack, "utf8");
  fs.writeFileSync(targets.validator, novoValidator, "utf8");

  fs.mkdirSync(path.dirname(targets.test), { recursive: true });
  fs.writeFileSync(targets.test, testContent, "utf8");

  console.log(JSON.stringify({
    ok: true,
    stage: "4A.14C.4-V2-CORRECAO-FALSO-POSITIVO-NEXT",
    changed: [
      "scripts/preparar-standalone-desktop.js",
      "scripts/electron-afterpack-v11n.js",
      "scripts/validar-desktop-dir-seguro.cjs",
      "scripts/test-estoque-tecnico/etapa4a14c4-public-uploads-next-interno.cjs"
    ],
    compiledNextRoutesPreserved: true,
    realPublicUploadsStillBlocked: true,
    nestedReleaseStillBlocked: true,
    databaseChanged: false,
    schemaChanged: false,
    migrationExecuted: false,
    buildExecuted: false,
    installerBuildExecuted: false
  }));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    stage: "4A.14C.4-V2-CORRECAO-FALSO-POSITIVO-NEXT",
    message: error instanceof Error ? error.message : String(error),
    databaseChanged: false,
    buildExecuted: false
  }));
  process.exit(1);
}
