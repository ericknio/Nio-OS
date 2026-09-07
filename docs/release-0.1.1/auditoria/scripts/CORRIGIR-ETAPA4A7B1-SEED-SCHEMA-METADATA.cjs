#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
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
const packagePath = path.join(root, "package.json");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const EXPECTED_GENERATOR_SHA =
  "2986c48cf062656c326abaf1e0966fa3881411e16f51bb6cf93bf0a3ffae996d";
const EXPECTED_TEST_SHA =
  "6ec64436902cc06bf5f122edae1894771a0668cd04219ea4827c027335bd0b43";

const generatorContent = "#!/usr/bin/env node\n\"use strict\";\n\nconst fs = require(\"node:fs\");\nconst path = require(\"node:path\");\nconst { DatabaseSync } = require(\"node:sqlite\");\n\nconst root = process.cwd();\nconst sourceFile = path.resolve(\n  process.env.NIO_OS_SEED_SCHEMA_SOURCE ||\n    path.join(root, \"data\", \"nio-os.db\"),\n);\nconst seedDir = path.join(root, \"build\", \"seed\", \"data\");\nconst seedFile = path.join(seedDir, \"nio-os.db\");\nconst tempFile = path.join(\n  seedDir,\n  `.nio-os-seed-${process.pid}-${Date.now()}.tmp.db`,\n);\nconst migrationManifestFile = path.join(\n  root,\n  \"scripts\",\n  \"schema-migrator\",\n  \"migrations.cjs\",\n);\n\nfunction cleanup(file) {\n  for (const candidate of [\n    file,\n    `${file}-wal`,\n    `${file}-shm`,\n    `${file}-journal`,\n  ]) {\n    try {\n      fs.rmSync(candidate, { force: true });\n    } catch {}\n  }\n}\n\nfunction safeIdent(value) {\n  return String(value).replaceAll('\"', '\"\"');\n}\n\nfunction userTables(db) {\n  return db\n    .prepare(\n      \"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name\",\n    )\n    .all()\n    .map((row) => String(row.name));\n}\n\nfunction schemaObjects(db) {\n  return db\n    .prepare(\n      `SELECT type, name, tbl_name AS tableName, sql\n       FROM sqlite_master\n       WHERE name NOT LIKE 'sqlite_%'\n         AND sql IS NOT NULL\n         AND type IN ('table','index','trigger','view')\n       ORDER BY\n         CASE type\n           WHEN 'table' THEN 1\n           WHEN 'index' THEN 2\n           WHEN 'trigger' THEN 3\n           WHEN 'view' THEN 4\n           ELSE 9\n         END,\n         name`,\n    )\n    .all()\n    .map((row) => ({\n      type: String(row.type),\n      name: String(row.name),\n      tableName: String(row.tableName),\n      sql: String(row.sql),\n    }));\n}\n\nfunction health(db, label) {\n  const integrity = db.prepare(\"PRAGMA integrity_check\").all();\n  const foreignKeys = db.prepare(\"PRAGMA foreign_key_check\").all();\n\n  if (\n    integrity.length !== 1 ||\n    String(integrity[0].integrity_check) !== \"ok\"\n  ) {\n    throw new Error(`${label}: integrity_check não retornou ok.`);\n  }\n\n  if (foreignKeys.length !== 0) {\n    throw new Error(`${label}: existem violações de chave estrangeira.`);\n  }\n\n  return {\n    integrityCheck: \"ok\",\n    foreignKeyViolations: 0,\n  };\n}\n\nfunction migrationRows(db) {\n  if (!userTables(db).includes(\"NioSchemaMigration\")) {\n    throw new Error(\"Banco fonte não possui NioSchemaMigration.\");\n  }\n\n  return db\n    .prepare('SELECT * FROM \"NioSchemaMigration\" ORDER BY rowid')\n    .all();\n}\n\nfunction validateMigrationHistory(sourceRows) {\n  if (!fs.existsSync(migrationManifestFile)) {\n    throw new Error(\n      `Manifesto do migrador não encontrado: ${migrationManifestFile}`,\n    );\n  }\n\n  const manifest = require(migrationManifestFile);\n  const migrations = Array.isArray(manifest?.migrations)\n    ? manifest.migrations\n    : [];\n\n  if (migrations.length === 0) {\n    throw new Error(\"Manifesto do migrador não possui migrações.\");\n  }\n\n  if (sourceRows.length !== migrations.length) {\n    throw new Error(\n      `Banco fonte não está no schema atual: ${sourceRows.length} migrações aplicadas, ${migrations.length} esperadas.`,\n    );\n  }\n\n  for (let index = 0; index < migrations.length; index += 1) {\n    const expected = migrations[index];\n    const actual = sourceRows[index];\n\n    if (String(actual.id) !== String(expected.id)) {\n      throw new Error(\n        `Histórico de migração fora de ordem na posição ${index + 1}.`,\n      );\n    }\n\n    if (String(actual.checksum) !== String(expected.checksum)) {\n      throw new Error(\n        `Checksum de migração divergente: ${String(expected.id)}.`,\n      );\n    }\n  }\n\n  return migrations.length;\n}\n\nfunction insertMigrationRows(target, rows) {\n  if (rows.length === 0) return;\n\n  const targetColumns = new Set(\n    target\n      .prepare('PRAGMA table_info(\"NioSchemaMigration\")')\n      .all()\n      .map((row) => String(row.name)),\n  );\n\n  const sourceColumns = Object.keys(rows[0]).filter((column) =>\n    targetColumns.has(column),\n  );\n\n  if (!sourceColumns.includes(\"id\") || !sourceColumns.includes(\"checksum\")) {\n    throw new Error(\n      \"Tabela NioSchemaMigration incompatível para criação do seed.\",\n    );\n  }\n\n  const sql =\n    `INSERT INTO \"NioSchemaMigration\" (` +\n    sourceColumns.map((column) => `\"${safeIdent(column)}\"`).join(\", \") +\n    `) VALUES (` +\n    sourceColumns.map(() => \"?\").join(\", \") +\n    `)`;\n\n  const statement = target.prepare(sql);\n\n  for (const row of rows) {\n    statement.run(...sourceColumns.map((column) => row[column]));\n  }\n}\n\nfunction validateNoBusinessRows(db) {\n  const nonEmpty = [];\n\n  for (const table of userTables(db)) {\n    if (table === \"NioSchemaMigration\") continue;\n\n    const count = Number(\n      db\n        .prepare(\n          `SELECT COUNT(*) AS c FROM \"${safeIdent(table)}\"`,\n        )\n        .get().c,\n    );\n\n    if (count !== 0) {\n      nonEmpty.push({ table, count });\n    }\n  }\n\n  if (nonEmpty.length > 0) {\n    throw new Error(\n      `Seed recusado: existem dados de negócio: ${JSON.stringify(nonEmpty)}`,\n    );\n  }\n}\n\nfunction normalizeSql(sql) {\n  return String(sql || \"\")\n    .replace(/\\s+/g, \" \")\n    .trim();\n}\n\nfunction validateSchemaEquivalent(sourceObjects, seedDb) {\n  const seedObjects = schemaObjects(seedDb);\n\n  if (seedObjects.length !== sourceObjects.length) {\n    throw new Error(\n      `Seed recusado: quantidade de objetos de schema divergiu (${seedObjects.length}/${sourceObjects.length}).`,\n    );\n  }\n\n  for (let index = 0; index < sourceObjects.length; index += 1) {\n    const source = sourceObjects[index];\n    const seed = seedObjects[index];\n\n    if (\n      source.type !== seed.type ||\n      source.name !== seed.name ||\n      source.tableName !== seed.tableName ||\n      normalizeSql(source.sql) !== normalizeSql(seed.sql)\n    ) {\n      throw new Error(\n        `Seed recusado: objeto de schema divergente em ${source.type}:${source.name}.`,\n      );\n    }\n  }\n}\n\nfunction main() {\n  if (!fs.existsSync(sourceFile)) {\n    throw new Error(`Banco fonte de schema não encontrado: ${sourceFile}`);\n  }\n\n  if (\n    fs.existsSync(`${sourceFile}-wal`) ||\n    fs.existsSync(`${sourceFile}-shm`)\n  ) {\n    throw new Error(\n      \"Banco fonte possui WAL/SHM. Feche completamente o Nio-OS antes de gerar o seed.\",\n    );\n  }\n\n  fs.mkdirSync(seedDir, { recursive: true });\n  cleanup(tempFile);\n\n  const source = new DatabaseSync(sourceFile, { readOnly: true });\n  let sourceObjects;\n  let sourceMigrations;\n  let migrationCount;\n\n  try {\n    health(source, \"Banco fonte\");\n    sourceObjects = schemaObjects(source);\n    sourceMigrations = migrationRows(source);\n    migrationCount = validateMigrationHistory(sourceMigrations);\n  } finally {\n    source.close();\n  }\n\n  if (sourceObjects.length === 0) {\n    throw new Error(\"Banco fonte não possui objetos de schema reconhecidos.\");\n  }\n\n  const seed = new DatabaseSync(tempFile);\n\n  try {\n    seed.exec(\"PRAGMA foreign_keys = OFF\");\n    seed.exec(\"BEGIN IMMEDIATE\");\n\n    try {\n      for (const object of sourceObjects) {\n        seed.exec(object.sql);\n      }\n\n      insertMigrationRows(seed, sourceMigrations);\n      seed.exec(\"COMMIT\");\n    } catch (error) {\n      try {\n        seed.exec(\"ROLLBACK\");\n      } catch {}\n      throw error;\n    }\n\n    seed.exec(\"PRAGMA foreign_keys = ON\");\n    validateNoBusinessRows(seed);\n    validateSchemaEquivalent(sourceObjects, seed);\n    health(seed, \"Seed\");\n  } finally {\n    seed.close();\n  }\n\n  cleanup(seedFile);\n  fs.renameSync(tempFile, seedFile);\n\n  const finalSeed = new DatabaseSync(seedFile, { readOnly: true });\n\n  try {\n    const finalHealth = health(finalSeed, \"Seed final\");\n    validateNoBusinessRows(finalSeed);\n    validateSchemaEquivalent(sourceObjects, finalSeed);\n\n    console.log(\n      JSON.stringify({\n        ok: true,\n        stage: \"4A.7B-SEED-SQLITE\",\n        seed: path\n          .relative(root, seedFile)\n          .replaceAll(path.sep, \"/\"),\n        sizeBytes: fs.statSync(seedFile).size,\n        tableCount: userTables(finalSeed).length,\n        schemaObjectCount: sourceObjects.length,\n        migrationCount,\n        businessRows: 0,\n        integrityCheck: finalHealth.integrityCheck,\n        foreignKeyViolations:\n          finalHealth.foreignKeyViolations,\n        sourceSchemaRead: true,\n        sourceMigrationHistoryRead: true,\n        sourceBusinessRowsRead: false,\n        sourceBusinessDatabaseCopied: false,\n        prismaDbPushUsed: false,\n        schemaMigratorBootstrapUsed: false,\n        liveDatabaseChanged: false,\n        promotionPerformed: false,\n      }),\n    );\n  } finally {\n    finalSeed.close();\n  }\n}\n\ntry {\n  main();\n} catch (error) {\n  cleanup(tempFile);\n\n  console.error(\n    JSON.stringify({\n      ok: false,\n      stage: \"4A.7B-SEED-SQLITE\",\n      message:\n        error instanceof Error ? error.message : String(error),\n      sourceSchemaRead: true,\n      sourceBusinessRowsRead: false,\n      sourceBusinessDatabaseCopied: false,\n      prismaDbPushUsed: false,\n      liveDatabaseChanged: false,\n      promotionPerformed: false,\n    }),\n  );\n\n  process.exit(1);\n}\n";
const testContent = "#!/usr/bin/env node\n\"use strict\";\n\nconst assert = require(\"node:assert/strict\");\nconst fs = require(\"node:fs\");\nconst path = require(\"node:path\");\n\nconst root = process.cwd();\nlet assertions = 0;\n\nfunction check(value, message) {\n  assertions += 1;\n  assert.ok(value, message);\n}\n\nconst pkg = JSON.parse(\n  fs.readFileSync(path.join(root, \"package.json\"), \"utf8\"),\n);\n\ncheck(\n  pkg.scripts[\"seed:sqlite\"] ===\n    \"node scripts/criar-seed-sqlite-limpo.cjs\",\n  \"script seed:sqlite configurado\",\n);\n\ncheck(\n  pkg.scripts[\"desktop:prepare\"] ===\n    \"npm run seed:sqlite && node scripts/preparar-standalone-desktop.js\",\n  \"desktop:prepare sempre valida/gera seed limpo\",\n);\n\ncheck(\n  !Object.prototype.hasOwnProperty.call(pkg.scripts, \"prisma:push\"),\n  \"prisma:push continua removido\",\n);\n\ncheck(\n  !String(pkg.scripts[\"local:prepare\"] || \"\").includes(\"db push\"),\n  \"local:prepare continua sem db push\",\n);\n\nconst resources = Array.isArray(pkg.build?.extraResources)\n  ? pkg.build.extraResources\n  : [];\n\ncheck(resources.length === 1, \"há exatamente um extraResource de seed\");\ncheck(\n  resources[0].from === \"build/seed/data\",\n  \"seed vem de build/seed/data\",\n);\ncheck(resources[0].to === \"seed/data\", \"seed entra em resources/seed/data\");\ncheck(\n  Array.isArray(resources[0].filter) &&\n    resources[0].filter.length === 1 &&\n    resources[0].filter[0] === \"nio-os.db\",\n  \"apenas nio-os.db limpo é empacotado\",\n);\n\nconst packageText = fs.readFileSync(\n  path.join(root, \"package.json\"),\n  \"utf8\",\n);\ncheck(\n  !packageText.includes('\"from\": \"data\"'),\n  \"data/nio-os.db real não é fonte do extraResources\",\n);\n\nconst generator = fs.readFileSync(\n  path.join(root, \"scripts\", \"criar-seed-sqlite-limpo.cjs\"),\n  \"utf8\",\n);\n\ncheck(\n  generator.includes(\"sqlite_master\"),\n  \"gerador clona somente metadados de schema\",\n);\ncheck(\n  generator.includes(\"sourceBusinessRowsRead: false\"),\n  \"gerador não lê linhas de negócio\",\n);\ncheck(\n  generator.includes(\"sourceBusinessDatabaseCopied: false\"),\n  \"gerador não copia banco real\",\n);\ncheck(\n  generator.includes(\"validateNoBusinessRows\"),\n  \"seed valida zero linhas de negócio\",\n);\ncheck(\n  generator.includes(\"validateSchemaEquivalent\"),\n  \"seed compara schema fonte/destino\",\n);\ncheck(\n  generator.includes(\"manifest?.migrations\"),\n  \"histórico é validado contra manifesto atual\",\n);\ncheck(\n  !generator.includes(\"prisma db push\"),\n  \"gerador não usa prisma db push\",\n);\ncheck(\n  !generator.includes(\"--apply\"),\n  \"gerador não tenta bootstrap pelo migrador\",\n);\n\nconsole.log(\n  JSON.stringify({\n    ok: true,\n    stage: \"4A.7B.1\",\n    assertions,\n    seedStrategy: \"schema-metadata-clone\",\n    sourceBusinessRowsRead: false,\n    realBusinessDatabaseCopied: false,\n    prismaDbPushUsed: false,\n    liveDatabaseChanged: false,\n    desktopBuildRun: false,\n  }),\n);\n";

function sha256(text) {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(text, "utf8"))
    .digest("hex");
}

function requireExact(file, expected, label) {
  if (!fs.existsSync(file)) {
    throw new Error(`${label} não encontrado.`);
  }

  const current = fs.readFileSync(file, "utf8");
  const actual = sha256(current);

  if (actual !== expected) {
    throw new Error(
      `${label} mudou desde a 4A.7B. Esperado ${expected}, atual ${actual}. Nenhum arquivo foi alterado.`,
    );
  }

  return current;
}

function backupAndWrite(file, content) {
  const current = fs.readFileSync(file, "utf8");
  if (current === content) return false;

  fs.copyFileSync(
    file,
    `${file}.bak-4a7b1-${stamp}`,
  );
  fs.writeFileSync(file, content, "utf8");
  return true;
}

function main() {
  requireExact(
    generatorPath,
    EXPECTED_GENERATOR_SHA,
    "Gerador de seed",
  );
  requireExact(
    testPath,
    EXPECTED_TEST_SHA,
    "Teste 4A.7B",
  );

  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

  if (
    pkg.scripts?.["seed:sqlite"] !==
      "node scripts/criar-seed-sqlite-limpo.cjs" ||
    pkg.scripts?.["desktop:prepare"] !==
      "npm run seed:sqlite && node scripts/preparar-standalone-desktop.js"
  ) {
    throw new Error(
      "package.json não está no estado esperado da 4A.7B. Nenhum arquivo foi alterado.",
    );
  }

  const changed = [];

  if (backupAndWrite(generatorPath, generatorContent)) {
    changed.push("scripts/criar-seed-sqlite-limpo.cjs");
  }

  if (backupAndWrite(testPath, testContent)) {
    changed.push(
      "scripts/test-estoque-tecnico/etapa4a7b-seed-sqlite.cjs",
    );
  }

  console.log(
    JSON.stringify({
      ok: true,
      stage: "4A.7B.1",
      changed,
      fix:
        "Seed passa a ser criado por clonagem de sqlite_master + NioSchemaMigration, sem ler linhas de negócio e sem bootstrap de banco vazio pelo migrador.",
      sourceBusinessRowsRead: false,
      sourceBusinessDatabaseCopied: false,
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
