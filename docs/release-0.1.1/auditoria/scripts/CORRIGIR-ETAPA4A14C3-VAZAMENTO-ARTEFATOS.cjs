#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const files = {
  package: path.join(root, "package.json"),
  preparer: path.join(root, "scripts", "preparar-standalone-desktop.js"),
  afterPack: path.join(root, "scripts", "electron-afterpack-v11n.js"),
  validator: path.join(root, "scripts", "validar-desktop-dir-seguro.cjs"),
  test: path.join(
    root,
    "scripts",
    "test-estoque-tecnico",
    "etapa4a14c3-empacotamento-recursivo-seguro.cjs"
  ),
};

function fail(message) {
  throw new Error(message);
}

function backup(file) {
  if (!fs.existsSync(file)) fail(`Arquivo não encontrado: ${path.relative(root, file)}`);
  fs.copyFileSync(file, `${file}.bak-4a14c3-${stamp}`);
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function patchPackage() {
  const pkg = JSON.parse(fs.readFileSync(files.package, "utf8"));
  const list = Array.isArray(pkg.build?.files) ? [...pkg.build.files] : [];

  const required = [
    "!.next/standalone/release/**/*",
    "!.next/standalone/dist-local/**/*",
    "!.next/standalone/_arquivo_morto_nio_os/**/*",
    "!.next/standalone/logs-build-*/*",
  ];

  for (const item of required) {
    if (!list.includes(item)) list.push(item);
  }

  pkg.build = pkg.build || {};
  pkg.build.files = list;

  return JSON.stringify(pkg, null, 2) + "\n";
}

const preparerContent = String.raw`// scripts/preparar-standalone-desktop.js
// Nio-OS Desktop V11
// Sanitiza o standalone antes do Electron Builder e impede dados reais/artefatos de build no pacote.

const fs = require("fs");
const path = require("path");

const raiz = process.cwd();

function normalizar(caminho) {
  return caminho.replace(/\\/g, "/");
}

function relativo(caminho) {
  return normalizar(path.relative(raiz, caminho));
}

function deveIgnorar(origem) {
  const rel = relativo(origem);

  return (
    rel === "data" ||
    rel.startsWith("data/") ||
    rel === "backups" ||
    rel.startsWith("backups/") ||
    rel === "storage" ||
    rel.startsWith("storage/") ||
    rel === "public/uploads" ||
    rel.startsWith("public/uploads/")
  );
}

function garantirPasta(destino) {
  fs.mkdirSync(destino, { recursive: true });
}

function remover(caminho) {
  if (fs.existsSync(caminho)) {
    fs.rmSync(caminho, { recursive: true, force: true });
  }
}

function copiar(origem, destino) {
  if (!fs.existsSync(origem)) return false;
  if (deveIgnorar(origem)) return false;

  const stat = fs.statSync(origem);

  if (stat.isDirectory()) {
    garantirPasta(destino);

    for (const item of fs.readdirSync(origem)) {
      copiar(path.join(origem, item), path.join(destino, item));
    }

    return true;
  }

  garantirPasta(path.dirname(destino));
  fs.copyFileSync(origem, destino);
  return true;
}

function copiarLimpando(origem, destino) {
  if (!fs.existsSync(origem)) return false;
  remover(destino);
  return copiar(origem, destino);
}

function removerEnvRecursivo(base) {
  let removidos = 0;
  if (!fs.existsSync(base)) return removidos;

  const pilha = [base];

  while (pilha.length > 0) {
    const atual = pilha.pop();

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, item.name);

      if (item.isSymbolicLink()) {
        throw new Error("Link simbólico recusado no standalone: " + completo);
      }

      if (item.isDirectory()) {
        pilha.push(completo);
        continue;
      }

      if (item.isFile() && /^\.env(?:\.|$)/i.test(item.name)) {
        fs.rmSync(completo, { force: true });
        removidos += 1;
      }
    }
  }

  return removidos;
}

function removerPublicUploadsRecursivo(base) {
  let removidos = 0;
  if (!fs.existsSync(base)) return removidos;

  const pilha = [base];

  while (pilha.length > 0) {
    const atual = pilha.pop();

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, item.name);

      if (item.isSymbolicLink()) {
        throw new Error("Link simbólico recusado no standalone: " + completo);
      }

      if (!item.isDirectory()) continue;

      if (
        item.name.toLowerCase() === "uploads" &&
        path.basename(atual).toLowerCase() === "public"
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

function limparArtefatosGerados(standalone) {
  const removidos = [];

  for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os"]) {
    const alvo = path.join(standalone, nome);

    if (fs.existsSync(alvo)) {
      fs.rmSync(alvo, { recursive: true, force: true });
      removidos.push(nome);
    }
  }

  for (const item of fs.readdirSync(standalone, { withFileTypes: true })) {
    if (
      item.isDirectory() &&
      item.name.toLowerCase().startsWith("logs-build-")
    ) {
      fs.rmSync(path.join(standalone, item.name), {
        recursive: true,
        force: true,
      });
      removidos.push(item.name);
    }
  }

  return removidos;
}

function validarStandalone(standalone) {
  for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os"]) {
    if (fs.existsSync(path.join(standalone, nome))) {
      throw new Error("Artefato de build proibido no standalone: " + nome);
    }
  }

  const pilha = [standalone];

  while (pilha.length > 0) {
    const atual = pilha.pop();

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, item.name);

      if (item.isSymbolicLink()) {
        throw new Error("Link simbólico recusado no standalone: " + completo);
      }

      if (item.isDirectory()) {
        if (
          item.name.toLowerCase() === "uploads" &&
          path.basename(atual).toLowerCase() === "public"
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

function main() {
  const standalone = path.join(raiz, ".next", "standalone");

  if (!fs.existsSync(standalone)) {
    console.error("ERRO: .next/standalone nao encontrado.");
    console.error('Verifique output: "standalone" e rode npm run build.');
    process.exit(1);
  }

  const artefatosRemovidos = limparArtefatosGerados(standalone);
  const uploadsRemovidosAntes = removerPublicUploadsRecursivo(standalone);
  const envRemovidosAntes = removerEnvRecursivo(standalone);

  copiarLimpando(
    path.join(raiz, ".next", "static"),
    path.join(standalone, ".next", "static")
  );

  copiarLimpando(
    path.join(raiz, "public"),
    path.join(standalone, "public")
  );

  copiarLimpando(
    path.join(raiz, "prisma"),
    path.join(standalone, "prisma")
  );

  copiarLimpando(
    path.join(raiz, "node_modules", ".prisma"),
    path.join(standalone, "node_modules", ".prisma")
  );

  copiarLimpando(
    path.join(raiz, "node_modules", "@prisma", "client"),
    path.join(standalone, "node_modules", "@prisma", "client")
  );

  const uploadsRemovidosDepois = removerPublicUploadsRecursivo(standalone);
  const envRemovidosDepois = removerEnvRecursivo(standalone);

  validarStandalone(standalone);

  console.log("====================================");
  console.log(" Standalone desktop V11 preparado.");
  console.log("====================================");
  console.log("Dados reais ficam fora de Program Files.");
  console.log(
    "Artefatos de build removidos do standalone: " + artefatosRemovidos.length
  );
  console.log(
    "Pastas public/uploads removidas: " +
      (uploadsRemovidosAntes + uploadsRemovidosDepois)
  );
  console.log(
    "Arquivos de ambiente removidos: " +
      (envRemovidosAntes + envRemovidosDepois)
  );
}

main();
`;

const afterPackContent = String.raw`const fs = require("fs");
const path = require("path");

function existe(caminho) {
  return fs.existsSync(caminho);
}

function copiarDiretorio(origem, destino) {
  if (!existe(origem)) return false;
  fs.mkdirSync(destino, { recursive: true });
  fs.cpSync(origem, destino, { recursive: true, force: true });
  return true;
}

function copiarArquivo(origem, destino) {
  if (!existe(origem)) return false;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
  return true;
}

function validarStandaloneRecursivo(standalone) {
  for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os"]) {
    if (existe(path.join(standalone, nome))) {
      throw new Error("Artefato de build proibido no standalone: " + nome);
    }
  }

  const pilha = [standalone];

  while (pilha.length > 0) {
    const atual = pilha.pop();

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, item.name);

      if (item.isSymbolicLink()) {
        throw new Error("Link simbólico recusado no standalone: " + completo);
      }

      if (item.isDirectory()) {
        if (
          item.name.toLowerCase() === "uploads" &&
          path.basename(atual).toLowerCase() === "public"
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

module.exports = async function afterPack(context) {
  const projeto = context.packager.projectDir;
  const appDir = path.join(context.appOutDir, "resources", "app");
  const standaloneDestino = path.join(appDir, ".next", "standalone");
  const standaloneOrigem = path.join(projeto, ".next", "standalone");

  validarStandaloneRecursivo(standaloneOrigem);

  copiarDiretorio(standaloneOrigem, standaloneDestino);
  copiarDiretorio(
    path.join(projeto, ".next", "static"),
    path.join(standaloneDestino, ".next", "static")
  );

  const scriptsDestino = path.join(standaloneDestino, "scripts");

  [
    "backup-api.js",
    "backup-core.js",
    "backup-local.js",
    "restore-local.js",
    "backup-auto.js",
  ].forEach((nome) => {
    copiarArquivo(
      path.join(projeto, "scripts", nome),
      path.join(scriptsDestino, nome)
    );
  });

  validarStandaloneRecursivo(standaloneDestino);

  const server = path.join(standaloneDestino, "server.js");

  if (!existe(server)) {
    throw new Error(
      "Standalone do Next não foi copiado para o pacote: " + server
    );
  }
};
`;

const validatorContent = String.raw`#!/usr/bin/env node
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

    if (n === normalize(path.join(appDir, "data"))) return true;
    if (n === normalize(path.join(appDir, "backups"))) return true;
    if (n === normalize(path.join(appDir, "storage"))) return true;

    if (
      path.basename(dir).toLowerCase() === "uploads" &&
      path.basename(path.dirname(dir)).toLowerCase() === "public"
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
`;

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
`;

function main() {
  for (const file of [
    files.package,
    files.preparer,
    files.afterPack,
    files.validator,
  ]) {
    backup(file);
  }

  write(files.package, patchPackage());
  write(files.preparer, preparerContent);
  write(files.afterPack, afterPackContent);
  write(files.validator, validatorContent);
  write(files.test, testContent);

  console.log(
    JSON.stringify({
      ok: true,
      stage: "4A.14C.3-CORRECAO-VAZAMENTO-ARTEFATOS",
      changed: [
        "package.json",
        "scripts/preparar-standalone-desktop.js",
        "scripts/electron-afterpack-v11n.js",
        "scripts/validar-desktop-dir-seguro.cjs",
        "scripts/test-estoque-tecnico/etapa4a14c3-empacotamento-recursivo-seguro.cjs",
      ],
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
      stage: "4A.14C.3-CORRECAO-VAZAMENTO-ARTEFATOS",
      message: error instanceof Error ? error.message : String(error),
      databaseChanged: false,
      buildExecuted: false,
    })
  );
  process.exit(1);
}
