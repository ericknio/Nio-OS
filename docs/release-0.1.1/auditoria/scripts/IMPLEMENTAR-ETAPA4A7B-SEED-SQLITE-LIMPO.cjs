#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const packagePath = path.join(root, "package.json");
const generatorPath = path.join(
  root,
  "scripts",
  "criar-seed-sqlite-limpo.cjs",
);
const testPath = path.join(
  root,
  "scripts",
  "test-estoque-tecnico",
  "etapa4a7b-seed-sqlite.cjs",
);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const EXPECTED_PACKAGE_SHA = "123a2bc50dd4d26f47c62ecd8863386be54dbbb57a7d2fa6983c449246cd1cd3";
const generatorContent = "#!/usr/bin/env node\n\"use strict\";\n\nconst fs = require(\"node:fs\");\nconst path = require(\"node:path\");\nconst { spawnSync } = require(\"node:child_process\");\nconst { DatabaseSync } = require(\"node:sqlite\");\n\nconst root = process.cwd();\nconst cli = path.join(root, \"scripts\", \"schema-migrator\", \"cli.cjs\");\nconst seedDir = path.join(root, \"build\", \"seed\", \"data\");\nconst seedFile = path.join(seedDir, \"nio-os.db\");\nconst tempFile = path.join(seedDir, `.nio-os-seed-${process.pid}-${Date.now()}.tmp.db`);\nconst tempBackupDir = path.join(root, \"build\", \"seed\", \".schema-backup\");\n\nconst EXPECTED_MIGRATIONS = new Map([\n  [\n    \"20260728_000_baseline_sqlite\",\n    \"83c7dce7bd156207533762b7bcedb68233fc56f90a961309529a9828af01955d\",\n  ],\n  [\n    \"20260804_001_technical_parts\",\n    \"57ad36c0c07e14457345ae506aa4c0e18dd1dfd28a71fc27d4c4e4639241224c\",\n  ],\n  [\n    \"20260806_002_technical_part_command_log\",\n    \"20013162c5f4f15f08618c72904a970a08e6aa2baa01ad5e3e8b66cdecfe5750\",\n  ],\n  [\n    \"20260806_003_service_order_technical_command_log\",\n    \"e7e05f31ccb1f8664030ea58e0d98172dd30681077e31b4052e1db92298eabd4\",\n  ],\n  [\n    \"20260810_004_technician_profit_share\",\n    \"b3678f0bd3ec0457e73214cf6805ca3ae0e1f98f6437b50c3cbb5329755e8f0e\",\n  ],\n]);\n\nfunction cleanup(file) {\n  for (const candidate of [file, `${file}-wal`, `${file}-shm`, `${file}-journal`]) {\n    try {\n      fs.rmSync(candidate, { force: true });\n    } catch {}\n  }\n}\n\nfunction userTables(db) {\n  return db\n    .prepare(\n      \"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name\",\n    )\n    .all()\n    .map((row) => String(row.name));\n}\n\nfunction validateSeed(file) {\n  const db = new DatabaseSync(file, { readOnly: true });\n\n  try {\n    const integrity = db.prepare(\"PRAGMA integrity_check\").all();\n    const foreignKeys = db.prepare(\"PRAGMA foreign_key_check\").all();\n    const tables = userTables(db);\n\n    if (\n      integrity.length !== 1 ||\n      String(integrity[0].integrity_check) !== \"ok\"\n    ) {\n      throw new Error(\"Seed recusado: integrity_check não retornou ok.\");\n    }\n\n    if (foreignKeys.length !== 0) {\n      throw new Error(\"Seed recusado: existem violações de chave estrangeira.\");\n    }\n\n    if (!tables.includes(\"NioSchemaMigration\")) {\n      throw new Error(\"Seed recusado: histórico do migrador não existe.\");\n    }\n\n    const migrationRows = db\n      .prepare(\n        'SELECT \"id\",\"checksum\" FROM \"NioSchemaMigration\" ORDER BY \"id\"',\n      )\n      .all();\n\n    if (migrationRows.length !== EXPECTED_MIGRATIONS.size) {\n      throw new Error(\n        `Seed recusado: esperado ${EXPECTED_MIGRATIONS.size} migrações, encontrado ${migrationRows.length}.`,\n      );\n    }\n\n    for (const row of migrationRows) {\n      const id = String(row.id);\n      const checksum = String(row.checksum);\n\n      if (EXPECTED_MIGRATIONS.get(id) !== checksum) {\n        throw new Error(`Seed recusado: checksum inválido em ${id}.`);\n      }\n    }\n\n    const nonEmptyBusinessTables = [];\n\n    for (const table of tables) {\n      if (table === \"NioSchemaMigration\") continue;\n\n      const safeTable = table.replaceAll('\"', '\"\"');\n      const count = Number(\n        db.prepare(`SELECT COUNT(*) AS c FROM \"${safeTable}\"`).get().c,\n      );\n\n      if (count !== 0) {\n        nonEmptyBusinessTables.push({ table, count });\n      }\n    }\n\n    if (nonEmptyBusinessTables.length > 0) {\n      throw new Error(\n        `Seed recusado: existem dados de negócio: ${JSON.stringify(nonEmptyBusinessTables)}`,\n      );\n    }\n\n    return {\n      integrityCheck: \"ok\",\n      foreignKeyViolations: 0,\n      tableCount: tables.length,\n      migrationCount: migrationRows.length,\n      businessRows: 0,\n    };\n  } finally {\n    db.close();\n  }\n}\n\nfunction main() {\n  if (!fs.existsSync(cli)) {\n    throw new Error(`Migrador interno não encontrado: ${cli}`);\n  }\n\n  fs.mkdirSync(seedDir, { recursive: true });\n  fs.mkdirSync(tempBackupDir, { recursive: true });\n\n  cleanup(tempFile);\n\n  const blank = new DatabaseSync(tempFile);\n  blank.close();\n\n  const result = spawnSync(\n    process.execPath,\n    [\n      cli,\n      \"--db\",\n      tempFile,\n      \"--apply\",\n      \"--json\",\n      \"--backup-dir\",\n      tempBackupDir,\n    ],\n    {\n      cwd: root,\n      encoding: \"utf8\",\n      shell: false,\n      env: (() => {\n        const env = { ...process.env };\n        delete env.DATABASE_URL;\n        return env;\n      })(),\n    },\n  );\n\n  if (result.error || result.status !== 0) {\n    cleanup(tempFile);\n    throw new Error(\n      result.error\n        ? `Falha ao executar migrador interno: ${result.error.message}`\n        : `Migrador interno falhou: ${String(result.stdout || result.stderr || \"\").trim()}`,\n    );\n  }\n\n  let migrationResult;\n\n  try {\n    migrationResult = JSON.parse(String(result.stdout || \"\").trim());\n  } catch {\n    cleanup(tempFile);\n    throw new Error(\"Migrador interno retornou JSON inválido.\");\n  }\n\n  if (migrationResult?.ok !== true) {\n    cleanup(tempFile);\n    throw new Error(\n      `Migrador interno recusou o seed: ${migrationResult?.code || \"MIGRATION_FAILED\"}`,\n    );\n  }\n\n  const validation = validateSeed(tempFile);\n\n  // Recria páginas do SQLite para remover qualquer espaço residual desnecessário.\n  const compact = new DatabaseSync(tempFile);\n  try {\n    compact.exec(\"VACUUM\");\n  } finally {\n    compact.close();\n  }\n\n  const validationAfterVacuum = validateSeed(tempFile);\n\n  cleanup(seedFile);\n  fs.renameSync(tempFile, seedFile);\n\n  try {\n    fs.rmSync(tempBackupDir, { recursive: true, force: true });\n  } catch {}\n\n  console.log(\n    JSON.stringify({\n      ok: true,\n      stage: \"4A.7B-SEED-SQLITE\",\n      seed: path.relative(root, seedFile).replaceAll(path.sep, \"/\"),\n      sizeBytes: fs.statSync(seedFile).size,\n      tableCount: validationAfterVacuum.tableCount,\n      migrationCount: validationAfterVacuum.migrationCount,\n      businessRows: validationAfterVacuum.businessRows,\n      integrityCheck: validationAfterVacuum.integrityCheck,\n      foreignKeyViolations: validationAfterVacuum.foreignKeyViolations,\n      sourceBusinessDatabaseRead: false,\n      prismaDbPushUsed: false,\n      schemaMigratorUsed: true,\n      databaseChanged: false,\n      liveDatabaseChanged: false,\n      promotionPerformed: false,\n    }),\n  );\n}\n\ntry {\n  main();\n} catch (error) {\n  cleanup(tempFile);\n\n  try {\n    fs.rmSync(tempBackupDir, { recursive: true, force: true });\n  } catch {}\n\n  console.error(\n    JSON.stringify({\n      ok: false,\n      stage: \"4A.7B-SEED-SQLITE\",\n      message: error instanceof Error ? error.message : String(error),\n      sourceBusinessDatabaseRead: false,\n      prismaDbPushUsed: false,\n      liveDatabaseChanged: false,\n      promotionPerformed: false,\n    }),\n  );\n  process.exit(1);\n}\n";
const testContent = "#!/usr/bin/env node\n\"use strict\";\n\nconst assert = require(\"node:assert/strict\");\nconst fs = require(\"node:fs\");\nconst path = require(\"node:path\");\n\nconst root = process.cwd();\nlet assertions = 0;\n\nfunction check(value, message) {\n  assertions += 1;\n  assert.ok(value, message);\n}\n\nconst pkg = JSON.parse(\n  fs.readFileSync(path.join(root, \"package.json\"), \"utf8\"),\n);\n\ncheck(\n  pkg.scripts[\"seed:sqlite\"] === \"node scripts/criar-seed-sqlite-limpo.cjs\",\n  \"script seed:sqlite configurado\",\n);\n\ncheck(\n  pkg.scripts[\"desktop:prepare\"] ===\n    \"npm run seed:sqlite && node scripts/preparar-standalone-desktop.js\",\n  \"desktop:prepare sempre gera seed limpo\",\n);\n\ncheck(\n  !Object.prototype.hasOwnProperty.call(pkg.scripts, \"prisma:push\"),\n  \"prisma:push continua removido\",\n);\n\ncheck(\n  !String(pkg.scripts[\"local:prepare\"] || \"\").includes(\"db push\"),\n  \"local:prepare continua sem db push\",\n);\n\nconst resources = Array.isArray(pkg.build?.extraResources)\n  ? pkg.build.extraResources\n  : [];\n\ncheck(resources.length === 1, \"há exatamente um extraResource de seed\");\ncheck(\n  resources[0].from === \"build/seed/data\",\n  \"seed vem de build/seed/data\",\n);\ncheck(resources[0].to === \"seed/data\", \"seed entra em resources/seed/data\");\ncheck(\n  Array.isArray(resources[0].filter) &&\n    resources[0].filter.length === 1 &&\n    resources[0].filter[0] === \"nio-os.db\",\n  \"apenas nio-os.db limpo é empacotado\",\n);\n\nconst packageText = fs.readFileSync(path.join(root, \"package.json\"), \"utf8\");\ncheck(\n  !packageText.includes('\"from\": \"data\"'),\n  \"banco real data/nio-os.db não é mais fonte do extraResources\",\n);\n\nconst generator = fs.readFileSync(\n  path.join(root, \"scripts\", \"criar-seed-sqlite-limpo.cjs\"),\n  \"utf8\",\n);\n\ncheck(generator.includes(\"schema-migrator\"), \"seed usa migrador interno\");\ncheck(!generator.includes(\"prisma db push\"), \"seed não usa prisma db push\");\ncheck(\n  generator.includes(\"sourceBusinessDatabaseRead: false\"),\n  \"seed declara não ler banco de negócio\",\n);\ncheck(\n  generator.includes(\"businessRows: 0\"),\n  \"seed valida ausência de dados de negócio\",\n);\n\nconsole.log(\n  JSON.stringify({\n    ok: true,\n    stage: \"4A.7B\",\n    assertions,\n    prismaDbPushUsed: false,\n    realBusinessDatabasePackaged: false,\n    liveDatabaseChanged: false,\n    desktopBuildRun: false,\n  }),\n);\n";

function sha256(text) {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(text, "utf8"))
    .digest("hex");
}

function backupAndWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, "utf8");
    if (current === content) return false;

    fs.copyFileSync(
      file,
      `${file}.bak-4a7b-${stamp}`,
    );
  }

  fs.writeFileSync(file, content, "utf8");
  return true;
}

function main() {
  if (!fs.existsSync(packagePath)) {
    throw new Error("package.json não encontrado.");
  }

  const packageText = fs.readFileSync(packagePath, "utf8");
  const packageSha = sha256(packageText);

  if (packageSha !== EXPECTED_PACKAGE_SHA) {
    throw new Error(
      `package.json mudou desde a 4A.7A. Esperado ${EXPECTED_PACKAGE_SHA}, atual ${packageSha}. Nenhum arquivo foi alterado.`,
    );
  }

  const pkg = JSON.parse(packageText);

  if (Object.prototype.hasOwnProperty.call(pkg.scripts, "prisma:push")) {
    throw new Error(
      "prisma:push reapareceu no package.json. A etapa foi abortada.",
    );
  }

  pkg.scripts["seed:sqlite"] =
    "node scripts/criar-seed-sqlite-limpo.cjs";
  pkg.scripts["desktop:prepare"] =
    "npm run seed:sqlite && node scripts/preparar-standalone-desktop.js";

  pkg.build.extraResources = [
    {
      from: "build/seed/data",
      to: "seed/data",
      filter: ["nio-os.db"],
    },
  ];

  const nextPackage = JSON.stringify(pkg, null, 2) + "\n";

  const changed = [];
  if (backupAndWrite(packagePath, nextPackage)) {
    changed.push("package.json");
  }
  if (backupAndWrite(generatorPath, generatorContent)) {
    changed.push("scripts/criar-seed-sqlite-limpo.cjs");
  }
  if (backupAndWrite(testPath, testContent)) {
    changed.push("scripts/test-estoque-tecnico/etapa4a7b-seed-sqlite.cjs");
  }

  console.log(
    JSON.stringify({
      ok: true,
      stage: "4A.7B-INSTALL",
      changed,
      seedSource: "blank SQLite + internal schema migrator",
      sourceBusinessDatabaseRead: false,
      realBusinessDatabasePackaged: false,
      prismaDbPushUsed: false,
      liveDatabaseChanged: false,
      schemaChanged: false,
      migrationRequired: false,
      desktopBuildRun: false,
      promotionPerformed: false,
    }),
  );
}

main();
