#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();
let assertions = 0;

function read(relative) {
  const file = path.join(root, ...relative.split("/"));
  if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${relative}`);
  return fs.readFileSync(file, "utf8");
}
function check(value, message) {
  assert.ok(value, message);
  assertions += 1;
}
function has(text, value, message) {
  check(text.includes(value), message);
}

const schema = read("prisma/schema.prisma");
const migrationsSource = read("scripts/schema-migrator/migrations.cjs");
const repository = read("lib/estoqueTecnico/orderRepository.ts");
const types = read("lib/estoqueTecnico/types.ts");
const consumption = read("lib/estoqueTecnico/orderConsumptionService.ts");
const statusRoute = read("app/api/ordens/[id]/status/route.ts");

has(schema, "profitShareEnabled Boolean @default(false)", "SystemUser possui flag de participação");
has(schema, "profitSharePercent Decimal @default(0)", "SystemUser possui percentual");
has(schema, "technicianUserId                  String?", "OS possui ID do técnico");
has(schema, "technicianProfitPercentSnapshot   Decimal?", "OS possui snapshot percentual");
has(schema, '@relation("ServiceOrderTechnician"', "relação nomeada da OS existe");
has(schema, "technicianServiceOrders", "relação inversa do técnico existe");
has(schema, "@@index([technicianUserId])", "índice Prisma do técnico existe");

has(migrationsSource, "20260810_004_technician_profit_share", "migração 004 registrada");
has(migrationsSource, 'ADD COLUMN "profitShareEnabled"', "migração adiciona flag");
has(migrationsSource, 'ADD COLUMN "profitSharePercent"', "migração adiciona percentual");
has(migrationsSource, 'ADD COLUMN "technicianUserId"', "migração adiciona técnico na OS");
has(migrationsSource, 'ADD COLUMN "technicianProfitPercentSnapshot"', "migração adiciona snapshot");
has(migrationsSource, "ServiceOrder_technicianUserId_idx", "migração cria índice");
has(migrationsSource, '"profitSharePercent" <= 100', "percentual limitado a 100");
has(migrationsSource, '"technicianProfitPercentSnapshot" <= 100', "snapshot limitado a 100");

const manifest = require(path.join(root, "scripts/schema-migrator/migrations.cjs"));
const ids = manifest.migrations.map((item) => item.id);
check(ids.includes("20260810_004_technician_profit_share"), "004 está registrada");
check(new Set(ids).size === ids.length, "IDs de migração são únicos");

const expectedPrevious = new Map([
  ["20260804_001_technical_parts", "57ad36c0c07e14457345ae506aa4c0e18dd1dfd28a71fc27d4c4e4639241224c"],
  ["20260806_002_technical_part_command_log", "20013162c5f4f15f08618c72904a970a08e6aa2baa01ad5e3e8b66cdecfe5750"],
  ["20260806_003_service_order_technical_command_log", "e7e05f31ccb1f8664030ea58e0d98172dd30681077e31b4052e1db92298eabd4"],
]);
for (const [id, checksum] of expectedPrevious) {
  const migration = manifest.migrations.find((item) => item.id === id);
  check(Boolean(migration), `migração anterior ${id} permanece`);
  check(migration.checksum === checksum, `checksum anterior ${id} permanece imutável`);
}
const migration004 = manifest.migrations.find(
  (item) => item.id === "20260810_004_technician_profit_share",
);
check(Boolean(migration004), "migração 004 encontrada");
check(
  migration004.checksum === "b3678f0bd3ec0457e73214cf6805ca3ae0e1f98f6437b50c3cbb5329755e8f0e",
  "checksum da 004 é determinístico",
);

has(types, "export type ProfitShareTechnicianRecord", "tipo interno do técnico existe");
has(types, "technicianUserId: string | null;", "tipo da OS possui technicianUserId");
has(types, "technicianProfitPercentSnapshot: number | null;", "tipo da OS possui snapshot");

has(repository, "findActiveTechnicianForReady", "repositório resolve técnico");
has(repository, `"role" = 'TECNICO'`, "somente perfil técnico é aceito");
has(repository, `"status" = 'ATIVO'`, "somente técnico ativo é aceito");
has(repository, '"profitShareEnabled"', "repositório lê flag server-side");
has(repository, '"profitSharePercent"', "repositório lê percentual server-side");
has(repository, '"technicianUserId" = ?', "update da OS grava o técnico");
has(repository, '"technicianProfitPercentSnapshot" = ?', "update da OS grava o snapshot");

has(consumption, '"technicianUserId"', "comando novo aceita ID do técnico");
has(consumption, "findActiveTechnicianForReady(database, input.technicianUserId)", "core relê técnico dentro da transação");
has(consumption, "technician.profitShareEnabled", "core decide participação pelo servidor");
has(consumption, "? Math.round((technician.profitSharePercent", "core deriva snapshot do percentual cadastrado");
has(consumption, ": 0;", "técnico sem participação recebe snapshot zero");
has(consumption, "Informe exatamente um técnico responsável.", "entrada impede ID e nome simultâneos");
has(consumption, "technicianResponsible = technician.name.trim();", "nome é snapshot do cadastro");
has(consumption, "technicianUserId = technician.id;", "ID vem do cadastro server-side");
has(consumption, "context.canViewFinancialData", "projeção financeira respeita permissão");
has(consumption, "technicianProfitPercentSnapshot: order.technicianProfitPercentSnapshot", "snapshot só entra na projeção financeira autorizada");

has(statusRoute, "sanitizarOrdemStatus", "rota possui sanitização dedicada");
has(statusRoute, "technicianProfitPercentSnapshot: null", "rota oculta snapshot sem permissão financeira");
has(statusRoute, "usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario)", "rota usa permissão financeira sensível");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nio-3c5a-"));
const dbPath = path.join(tmp, "lab.db");
const db = new DatabaseSync(dbPath);
try {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE "SystemUser" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "status" TEXT NOT NULL
    );
    CREATE TABLE "ServiceOrder" (
      "id" TEXT NOT NULL PRIMARY KEY
    );
  `);
  db.exec(migration004.sql);

  const userCols = db.prepare(`PRAGMA table_info("SystemUser")`).all();
  const orderCols = db.prepare(`PRAGMA table_info("ServiceOrder")`).all();
  check(userCols.some((c) => c.name === "profitShareEnabled" && Number(c.notnull) === 1), "flag criada NOT NULL");
  check(userCols.some((c) => c.name === "profitSharePercent" && Number(c.notnull) === 1), "percentual criado NOT NULL");
  check(orderCols.some((c) => c.name === "technicianUserId" && Number(c.notnull) === 0), "technicianUserId é opcional");
  check(orderCols.some((c) => c.name === "technicianProfitPercentSnapshot" && Number(c.notnull) === 0), "snapshot é opcional");

  db.prepare(`INSERT INTO "SystemUser" ("id","name","role","status") VALUES ('t1','Técnico 1','TECNICO','ATIVO')`).run();
  const defaults = db.prepare(`SELECT "profitShareEnabled","profitSharePercent" FROM "SystemUser" WHERE "id"='t1'`).get();
  check(Number(defaults.profitShareEnabled) === 0, "participação inicia desativada");
  check(Number(defaults.profitSharePercent) === 0, "percentual inicia zero");

  db.prepare(`INSERT INTO "ServiceOrder" ("id","technicianUserId","technicianProfitPercentSnapshot") VALUES ('o1','t1',30)`).run();
  check(db.prepare(`SELECT "technicianUserId" AS v FROM "ServiceOrder" WHERE "id"='o1'`).get().v === "t1", "FK aceita técnico existente");

  assert.throws(
    () => db.prepare(`UPDATE "SystemUser" SET "profitSharePercent" = 100.01 WHERE "id"='t1'`).run(),
    /constraint/i,
  );
  assertions += 1;
  assert.throws(
    () => db.prepare(`UPDATE "ServiceOrder" SET "technicianProfitPercentSnapshot" = -1 WHERE "id"='o1'`).run(),
    /constraint/i,
  );
  assertions += 1;

  db.prepare(`DELETE FROM "SystemUser" WHERE "id"='t1'`).run();
  const afterDelete = db.prepare(`SELECT "technicianUserId","technicianProfitPercentSnapshot" FROM "ServiceOrder" WHERE "id"='o1'`).get();
  check(afterDelete.technicianUserId === null, "exclusão do usuário aplica SET NULL no vínculo");
  check(Number(afterDelete.technicianProfitPercentSnapshot) === 30, "snapshot histórico permanece após exclusão do usuário");

  check(db.prepare("PRAGMA foreign_key_check").all().length === 0, "sem violações de FK");
  check(db.prepare("PRAGMA integrity_check").get().integrity_check === "ok", "integridade SQLite OK");
} finally {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  stage: "3C.5A",
  assertions,
  migration: "20260810_004_technician_profit_share",
  checksum: migration004.checksum,
  databaseChangedByTest: false,
}));
