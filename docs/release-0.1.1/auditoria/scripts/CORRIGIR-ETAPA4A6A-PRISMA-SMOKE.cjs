#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const target = path.join(root, "VALIDAR-ETAPA4A6-BANCO-CANDIDATO.cjs");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const oldBlock = 'function prismaSmokeTest(candidateFile) {\n  const tempDir = path.join(root, "data");\n  const smokeDb = path.join(\n    tempDir,\n    `nio-os-4a6-prisma-smoke-${Date.now()}.db`\n  );\n\n  fs.copyFileSync(candidateFile, smokeDb);\n\n  const smokeScript = `\nconst path = require("node:path");\nconst { PrismaClient } = require("@prisma/client");\n\nconst dbPath = process.argv[1];\nconst normalized = dbPath.replaceAll("\\\\\\\\", "/");\nconst url = normalized.startsWith("/") ? "file:" + normalized : "file:/" + normalized;\n\nconst prisma = new PrismaClient({\n  datasources: { db: { url } }\n});\n\n(async () => {\n  try {\n    const rows = {};\n    for (const table of [\n      "Customer",\n      "ServiceOrder",\n      "ServiceOrderPayment",\n      "SystemUser",\n      "TechnicalPart",\n      "ServiceOrderPart",\n      "Product",\n      "ProductSale"\n    ]) {\n      const result = await prisma.$queryRawUnsafe(\n        \'SELECT COUNT(*) AS c FROM "\' + table + \'"\'\n      );\n      rows[table] = Number(result[0].c);\n    }\n\n    process.stdout.write(JSON.stringify({ ok: true, rows }) + "\\\\n");\n  } finally {\n    await prisma.$disconnect();\n  }\n})().catch((error) => {\n  console.error(error && error.message ? error.message : error);\n  process.exitCode = 1;\n});\n`;\n\n  const result = spawnSync(\n    process.execPath,\n    ["-e", smokeScript, smokeDb],\n    {\n      cwd: root,\n      encoding: "utf8",\n      shell: false,\n    }\n  );\n\n  try {\n    fs.rmSync(smokeDb, { force: true });\n    fs.rmSync(`${smokeDb}-journal`, { force: true });\n    fs.rmSync(`${smokeDb}-wal`, { force: true });\n    fs.rmSync(`${smokeDb}-shm`, { force: true });\n  } catch {}\n\n  if (result.status !== 0 || result.error) {\n    return {\n      ok: false,\n      error: result.error\n        ? String(result.error.message || result.error)\n        : String(result.stderr || result.stdout || "Prisma smoke falhou."),\n    };\n  }\n\n  try {\n    return JSON.parse(String(result.stdout || "").trim());\n  } catch {\n    return {\n      ok: false,\n      error: "Saída do Prisma smoke não pôde ser interpretada.",\n      stdout: String(result.stdout || ""),\n    };\n  }\n}';
const newBlock = 'function prismaSmokeTest(candidateFile) {\n  const prismaDir = path.join(root, "prisma");\n  const smokeDb = path.join(\n    prismaDir,\n    `nio-os-4a6-prisma-smoke-${Date.now()}.db`\n  );\n\n  if (!fs.existsSync(prismaDir)) {\n    return {\n      ok: false,\n      error: `Diretório Prisma não encontrado: ${prismaDir}`,\n    };\n  }\n\n  fs.copyFileSync(candidateFile, smokeDb);\n\n  const smokeUrl = `file:./${path.basename(smokeDb)}`;\n\n  const smokeScript = `\nconst { PrismaClient } = require("@prisma/client");\n\nconst url = process.argv[1];\n\nconst prisma = new PrismaClient({\n  datasources: { db: { url } }\n});\n\n(async () => {\n  try {\n    const rows = {};\n    for (const table of [\n      "Customer",\n      "ServiceOrder",\n      "ServiceOrderPayment",\n      "SystemUser",\n      "TechnicalPart",\n      "ServiceOrderPart",\n      "Product",\n      "ProductSale"\n    ]) {\n      const result = await prisma.$queryRawUnsafe(\n        \'SELECT COUNT(*) AS c FROM "\' + table + \'"\'\n      );\n      rows[table] = Number(result[0].c);\n    }\n\n    process.stdout.write(JSON.stringify({ ok: true, rows }) + "\\\\n");\n  } finally {\n    await prisma.$disconnect();\n  }\n})().catch((error) => {\n  console.error(error && error.message ? error.message : error);\n  process.exitCode = 1;\n});\n`;\n\n  const result = spawnSync(\n    process.execPath,\n    ["-e", smokeScript, smokeUrl],\n    {\n      cwd: prismaDir,\n      encoding: "utf8",\n      shell: false,\n    }\n  );\n\n  try {\n    fs.rmSync(smokeDb, { force: true });\n    fs.rmSync(`${smokeDb}-journal`, { force: true });\n    fs.rmSync(`${smokeDb}-wal`, { force: true });\n    fs.rmSync(`${smokeDb}-shm`, { force: true });\n  } catch {}\n\n  if (result.status !== 0 || result.error) {\n    return {\n      ok: false,\n      error: result.error\n        ? String(result.error.message || result.error)\n        : String(result.stderr || result.stdout || "Prisma smoke falhou."),\n    };\n  }\n\n  try {\n    return JSON.parse(String(result.stdout || "").trim());\n  } catch {\n    return {\n      ok: false,\n      error: "Saída do Prisma smoke não pôde ser interpretada.",\n      stdout: String(result.stdout || ""),\n    };\n  }\n}';

if (!fs.existsSync(target)) {
  throw new Error(`Arquivo não encontrado: ${target}`);
}

const current = fs.readFileSync(target, "utf8");

if (current.includes(newBlock)) {
  console.log(JSON.stringify({
    ok: true,
    stage: "4A.6A",
    changed: false,
    alreadyFixed: true,
    productLogicChanged: false,
    databaseChanged: false,
    schemaChanged: false,
    migrationRequired: false
  }));
  process.exit(0);
}

if (!current.includes(oldBlock)) {
  throw new Error(
    "O validador 4A.6 difere da versão esperada. Nenhum arquivo foi alterado."
  );
}

const backup = `${target}.bak-4a6a-${stamp}`;
fs.copyFileSync(target, backup);

const next = current.replace(oldBlock, newBlock);
fs.writeFileSync(target, next, "utf8");

console.log(`[BACKUP] ${path.basename(backup)}`);
console.log(`[GRAVADO] ${path.basename(target)}`);
console.log(JSON.stringify({
  ok: true,
  stage: "4A.6A",
  changed: true,
  fix:
    "Prisma smoke usa cópia descartável dentro de prisma/ e URL relativa file:./..., evitando parsing de caminho absoluto do Windows.",
  productLogicChanged: false,
  databaseChanged: false,
  schemaChanged: false,
  migrationRequired: false
}));
