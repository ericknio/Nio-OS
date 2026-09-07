#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const packagePath = path.join(root, "package.json");
const afterPackPath = path.join(root, "scripts", "electron-afterpack-v11n.js");
const staticTestPath = path.join(
  root,
  "scripts",
  "test-estoque-tecnico",
  "etapa4a10b-empacotamento-seguro.cjs",
);
const validatorPath = path.join(
  root,
  "scripts",
  "validar-desktop-dir-seguro.cjs",
);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const EXPECTED_PACKAGE_SHA = "da9bc4a30c55aa6d645b10e1395da6828d4fa2d75adb6461d6a1e04fedd37a32";
const EXPECTED_AFTERPACK_SHA = "107c41d743f2a500ba408c5431e2f78560c626992652a8da5bc513920c589944";
const staticTestContent = "#!/usr/bin/env node\n\"use strict\";\n\nconst assert = require(\"node:assert/strict\");\nconst fs = require(\"node:fs\");\nconst path = require(\"node:path\");\n\nconst root = process.cwd();\nlet assertions = 0;\n\nfunction check(value, message) {\n  assertions += 1;\n  assert.ok(value, message);\n}\n\nfunction read(relative) {\n  return fs.readFileSync(path.join(root, ...relative.split(\"/\")), \"utf8\");\n}\n\nconst pkg = JSON.parse(read(\"package.json\"));\n\ncheck(\n  pkg.scripts[\"desktop:prepare\"] ===\n    \"npm run local:prepare && npm run seed:sqlite && node scripts/preparar-standalone-desktop.js\",\n  \"desktop:prepare centraliza build + seed + standalone\",\n);\n\nfor (const name of [\n  \"desktop:dir\",\n  \"desktop:portable\",\n  \"desktop:installer\",\n  \"desktop:release\",\n  \"desktop:win\",\n]) {\n  check(\n    String(pkg.scripts[name] || \"\").startsWith(\"npm run desktop:prepare && \"),\n    `${name} passa obrigatoriamente por desktop:prepare`,\n  );\n}\n\ncheck(\n  pkg.scripts[\"desktop:instalador\"] === \"npm run desktop:installer\",\n  \"desktop:instalador é alias seguro\",\n);\n\nconst files = pkg.build?.files || [];\n\nfor (const required of [\n  \"desktop/**/*\",\n  \".next/standalone/**/*\",\n  \"scripts/schema-migrator/**/*\",\n  \"prisma/**/*\",\n  \"package.json\",\n  \"!data/**/*\",\n  \"!backups/**/*\",\n  \"!storage/**/*\",\n  \"!public/uploads/**/*\",\n  \"!.next/standalone/data/**/*\",\n  \"!.next/standalone/backups/**/*\",\n  \"!.next/standalone/storage/**/*\",\n  \"!.next/standalone/public/uploads/**/*\",\n]) {\n  check(files.includes(required), `build.files contém ${required}`);\n}\n\nfor (const forbidden of [\n  \"public/**/*\",\n  \"public/**\",\n  \"scripts/**\",\n  \"node_modules/**\",\n  \".next/standalone/**\",\n]) {\n  check(!files.includes(forbidden), `build.files não reabre ${forbidden}`);\n}\n\nconst resources = pkg.build?.extraResources || [];\ncheck(resources.length === 1, \"há um único extraResources\");\ncheck(\n  resources[0]?.from === \"build/seed/data\" &&\n    resources[0]?.to === \"seed/data\",\n  \"extraResources aponta apenas para seed limpo\",\n);\n\nconst afterPack = read(\"scripts/electron-afterpack-v11n.js\");\n\ncheck(\n  !afterPack.includes(\n    'copiarDiretorio(path.join(projeto, \"public\"), path.join(standaloneDestino, \"public\"))',\n  ),\n  \"afterPack não copia public bruto\",\n);\n\ncheck(\n  afterPack.includes(\"validarStandaloneSemDadosReais\"),\n  \"afterPack valida standalone antes de copiar\",\n);\n\nconsole.log(\n  JSON.stringify({\n    ok: true,\n    stage: \"4A.10B\",\n    assertions,\n    realDataPackagingBlocked: true,\n    rawPublicCopyBlocked: true,\n    seedRequiredForEveryDesktopTarget: true,\n    desktopBuildRun: false,\n  }),\n);\n";
const validatorContent = "#!/usr/bin/env node\n\"use strict\";\n\nconst fs = require(\"node:fs\");\nconst path = require(\"node:path\");\nconst { DatabaseSync } = require(\"node:sqlite\");\n\nconst root = process.cwd();\nconst unpacked = path.join(root, \"release\", \"win-unpacked\");\nconst resources = path.join(unpacked, \"resources\");\nconst appDir = path.join(resources, \"app\");\nconst seedDb = path.join(resources, \"seed\", \"data\", \"nio-os.db\");\n\nconst forbiddenAppPaths = [\n  path.join(appDir, \"data\"),\n  path.join(appDir, \"backups\"),\n  path.join(appDir, \"storage\"),\n  path.join(appDir, \"public\", \"uploads\"),\n  path.join(appDir, \".next\", \"standalone\", \"data\"),\n  path.join(appDir, \".next\", \"standalone\", \"backups\"),\n  path.join(appDir, \".next\", \"standalone\", \"storage\"),\n  path.join(appDir, \".next\", \"standalone\", \"public\", \"uploads\"),\n];\n\nfunction hasFiles(base) {\n  if (!fs.existsSync(base)) return false;\n\n  const stack = [base];\n\n  while (stack.length > 0) {\n    const current = stack.pop();\n\n    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {\n      const full = path.join(current, entry.name);\n\n      if (entry.isSymbolicLink()) {\n        throw new Error(`Link simbólico inesperado: ${full}`);\n      }\n\n      if (entry.isDirectory()) stack.push(full);\n      else if (entry.isFile()) return true;\n    }\n  }\n\n  return false;\n}\n\nfunction findNamedFiles(base, fileName) {\n  const found = [];\n  if (!fs.existsSync(base)) return found;\n\n  const stack = [base];\n\n  while (stack.length > 0) {\n    const current = stack.pop();\n\n    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {\n      const full = path.join(current, entry.name);\n\n      if (entry.isSymbolicLink()) continue;\n      if (entry.isDirectory()) stack.push(full);\n      else if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {\n        found.push(full);\n      }\n    }\n  }\n\n  return found;\n}\n\nfunction userTables(db) {\n  return db\n    .prepare(\n      \"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name\",\n    )\n    .all()\n    .map((row) => String(row.name));\n}\n\nfunction validateSeed() {\n  if (!fs.existsSync(seedDb)) {\n    throw new Error(`Seed não encontrado: ${seedDb}`);\n  }\n\n  const db = new DatabaseSync(seedDb, { readOnly: true });\n\n  try {\n    const integrity = db.prepare(\"PRAGMA integrity_check\").all();\n    const fk = db.prepare(\"PRAGMA foreign_key_check\").all();\n    const tables = userTables(db);\n\n    if (\n      integrity.length !== 1 ||\n      String(integrity[0].integrity_check) !== \"ok\"\n    ) {\n      throw new Error(\"Seed empacotado falhou no integrity_check.\");\n    }\n\n    if (fk.length !== 0) {\n      throw new Error(\"Seed empacotado possui violações de FK.\");\n    }\n\n    if (tables.length !== 22) {\n      throw new Error(`Seed empacotado possui ${tables.length} tabelas; esperado 22.`);\n    }\n\n    const migrationCount = Number(\n      db.prepare('SELECT COUNT(*) AS c FROM \"NioSchemaMigration\"').get().c,\n    );\n\n    if (migrationCount !== 5) {\n      throw new Error(`Seed possui ${migrationCount} migrações; esperado 5.`);\n    }\n\n    const nonEmpty = [];\n\n    for (const table of tables) {\n      if (table === \"NioSchemaMigration\") continue;\n      const safe = table.replaceAll('\"', '\"\"');\n      const count = Number(\n        db.prepare(`SELECT COUNT(*) AS c FROM \"${safe}\"`).get().c,\n      );\n\n      if (count !== 0) nonEmpty.push({ table, count });\n    }\n\n    if (nonEmpty.length > 0) {\n      throw new Error(`Seed contém dados de negócio: ${JSON.stringify(nonEmpty)}`);\n    }\n\n    return {\n      integrityCheck: \"ok\",\n      foreignKeyViolations: 0,\n      tableCount: tables.length,\n      migrationCount,\n      businessRows: 0,\n      sizeBytes: fs.statSync(seedDb).size,\n    };\n  } finally {\n    db.close();\n  }\n}\n\nfunction main() {\n  if (!fs.existsSync(unpacked)) {\n    throw new Error(\n      \"release/win-unpacked não existe. Rode npm run desktop:dir primeiro.\",\n    );\n  }\n\n  for (const forbidden of forbiddenAppPaths) {\n    if (hasFiles(forbidden)) {\n      throw new Error(`Dados reais encontrados no pacote: ${forbidden}`);\n    }\n  }\n\n  const envFiles = findNamedFiles(appDir, \".env\");\n  if (envFiles.length > 0) {\n    throw new Error(\n      `Arquivo .env encontrado dentro do app empacotado: ${envFiles.join(\", \")}`,\n    );\n  }\n\n  const databases = findNamedFiles(resources, \"nio-os.db\");\n  const normalizedSeed = path.resolve(seedDb);\n  const unexpectedDatabases = databases.filter(\n    (file) => path.resolve(file) !== normalizedSeed,\n  );\n\n  if (unexpectedDatabases.length > 0) {\n    throw new Error(\n      `Banco nio-os.db inesperado no pacote: ${unexpectedDatabases.join(\", \")}`,\n    );\n  }\n\n  if (databases.length !== 1) {\n    throw new Error(\n      `Esperado exatamente 1 nio-os.db no pacote (seed); encontrado ${databases.length}.`,\n    );\n  }\n\n  for (const required of [\n    path.join(appDir, \"desktop\", \"main.cjs\"),\n    path.join(appDir, \".next\", \"standalone\", \"server.js\"),\n    path.join(appDir, \"scripts\", \"schema-migrator\", \"cli.cjs\"),\n  ]) {\n    if (!fs.existsSync(required)) {\n      throw new Error(`Arquivo runtime obrigatório ausente: ${required}`);\n    }\n  }\n\n  const seed = validateSeed();\n\n  console.log(\n    JSON.stringify({\n      ok: true,\n      stage: \"4A.10C-DESKTOP-DIR-VALIDADO\",\n      unpacked: \"release/win-unpacked\",\n      unexpectedDatabases: 0,\n      envFilesInsideApp: 0,\n      realDataPathsWithFiles: 0,\n      seed,\n      packagedExeExists: fs.existsSync(\n        path.join(unpacked, \"Nio-OS.exe\"),\n      ),\n      packagedDesktopBootStillPending: true,\n    }),\n  );\n}\n\nmain();\n";

function sha256(text) {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(text, "utf8"))
    .digest("hex");
}

function requireExact(file, expectedSha, label) {
  if (!fs.existsSync(file)) {
    throw new Error(`${label} não encontrado.`);
  }

  const current = fs.readFileSync(file, "utf8");
  const actual = sha256(current);

  if (actual !== expectedSha) {
    throw new Error(
      `${label} mudou desde a inspeção 4A.10A. Esperado ${expectedSha}, atual ${actual}. Nenhum arquivo foi alterado.`,
    );
  }

  return current;
}

function backupAndWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, "utf8");
    if (current === content) return false;

    fs.copyFileSync(
      file,
      `${file}.bak-4a10b-${stamp}`,
    );
  }

  fs.writeFileSync(file, content, "utf8");
  return true;
}

function patchPackage(source) {
  const pkg = JSON.parse(source);

  pkg.scripts["desktop:prepare"] =
    "npm run local:prepare && npm run seed:sqlite && node scripts/preparar-standalone-desktop.js";
  pkg.scripts["desktop:dir"] =
    "npm run desktop:prepare && electron-builder --dir";
  pkg.scripts["desktop:portable"] =
    "npm run desktop:prepare && electron-builder --win portable";
  pkg.scripts["desktop:installer"] =
    "npm run desktop:prepare && electron-builder --win nsis";
  pkg.scripts["desktop:release"] =
    "npm run desktop:prepare && electron-builder --win portable nsis";
  pkg.scripts["desktop:win"] =
    "npm run desktop:prepare && electron-builder --win";
  pkg.scripts["desktop:instalador"] =
    "npm run desktop:installer";

  pkg.build.files = [
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
    "!.next/standalone/public/uploads/**/*"
  ];

  return JSON.stringify(pkg, null, 2) + "\n";
}

function patchAfterPack(source) {
  const dangerous =
    '  copiarDiretorio(path.join(projeto, "public"), path.join(standaloneDestino, "public"));\n';

  if (!source.includes(dangerous)) {
    throw new Error(
      "Cópia bruta de public não foi encontrada no afterPack esperado.",
    );
  }

  let next = source.replace(dangerous, "");

  const anchor = `function copiarArquivo(origem, destino) {
  if (!existe(origem)) return false;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
  return true;
}
`;

  if (!next.includes(anchor)) {
    throw new Error("Anchor do afterPack não encontrado.");
  }

  const helper = anchor + `
function pastaTemArquivos(caminho) {
  if (!existe(caminho)) return false;

  const pilha = [caminho];

  while (pilha.length > 0) {
    const atual = pilha.pop();

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, item.name);

      if (item.isSymbolicLink()) {
        throw new Error(
          "Link simbólico recusado no standalone: " + completo,
        );
      }

      if (item.isDirectory()) pilha.push(completo);
      else if (item.isFile()) return true;
    }
  }

  return false;
}

function validarStandaloneSemDadosReais(standalone) {
  const proibidos = [
    "data",
    "backups",
    "storage",
    path.join("public", "uploads"),
  ];

  for (const relativo of proibidos) {
    const caminho = path.join(standalone, relativo);

    if (pastaTemArquivos(caminho)) {
      throw new Error(
        "Dados reais detectados no standalone antes do empacotamento: " +
          caminho,
      );
    }
  }
}
`;

  next = next.replace(anchor, helper);

  const callAnchor =
    '  const standaloneDestino = path.join(appDir, ".next", "standalone");\n\n';

  if (!next.includes(callAnchor)) {
    throw new Error("Ponto de validação do standalone não encontrado.");
  }

  next = next.replace(
    callAnchor,
    callAnchor +
      '  validarStandaloneSemDadosReais(path.join(projeto, ".next", "standalone"));\n\n',
  );

  return next;
}

function main() {
  const packageSource = requireExact(
    packagePath,
    EXPECTED_PACKAGE_SHA,
    "package.json",
  );
  const afterPackSource = requireExact(
    afterPackPath,
    EXPECTED_AFTERPACK_SHA,
    "electron-afterpack-v11n.js",
  );

  const outputs = new Map([
    [packagePath, patchPackage(packageSource)],
    [afterPackPath, patchAfterPack(afterPackSource)],
    [staticTestPath, staticTestContent],
    [validatorPath, validatorContent],
  ]);

  const changed = [];

  for (const [file, content] of outputs) {
    if (backupAndWrite(file, content)) {
      changed.push(path.relative(root, file).replaceAll(path.sep, "/"));
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      stage: "4A.10B",
      changed,
      liveDatabaseChanged: false,
      desktopBuildRun: false,
      installerBuildRun: false,
    }),
  );
}

main();
