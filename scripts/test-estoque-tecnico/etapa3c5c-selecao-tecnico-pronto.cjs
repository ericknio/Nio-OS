#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
let assertions = 0;

function read(relative) {
  const file = path.join(root, ...relative.split("/"));
  if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${relative}`);
  return fs.readFileSync(file, "utf8");
}
function check(value, message) {
  assertions += 1;
  assert.ok(value, message);
}
function has(text, value, message) {
  check(text.includes(value), message);
}
function lacks(text, value, message) {
  check(!text.includes(value), message);
}

const ui = read("app/ordens/[id]/StatusRapidoOS.tsx");
const statusRoute = read("app/api/ordens/[id]/status/route.ts");
const techniciansRoute = read("app/api/ordens/tecnicos/route.ts");
const core = read("lib/estoqueTecnico/orderConsumptionService.ts");
const repository = read("lib/estoqueTecnico/orderRepository.ts");

has(ui, 'fetch("/api/ordens/tecnicos"', "UI busca técnicos em endpoint dedicado");
has(ui, "type Tecnico", "UI usa projeção mínima de técnico");
has(ui, "technicianUserId", "UI trabalha com ID do técnico");
has(ui, "<select", "UI usa seleção em vez de texto livre");
has(ui, "Selecione um técnico", "UI orienta seleção cadastrada");
has(ui, "globalThis.crypto.randomUUID()", "idempotência segura permanece");
has(ui, "AbortController", "timeout/abort permanece");
has(ui, "30_000", "timeout de 30s permanece");
has(ui, "tentativaPronto.technicianUserId === technicianUserId", "retry é vinculado ao mesmo técnico");
has(ui, '"Idempotency-Key": tentativa.key', "mesma chave é enviada no retry");
has(ui, "technicianUserId: tentativa.technicianUserId", "PATCH envia somente ID do técnico");
lacks(ui, 'placeholder="Digite o nome do técnico"', "campo livre de técnico foi removido");
lacks(ui, "technicianResponsible:", "cliente não envia nome do técnico");
lacks(ui, "profitSharePercent", "cliente não recebe/manipula percentual");

has(techniciansRoute, 'exigirPermissaoApi("ordens.marcar_pronto")', "endpoint exige permissão correta");
has(techniciansRoute, "SystemUserRole.TECNICO", "endpoint filtra perfil técnico");
has(techniciansRoute, "SystemUserStatus.ATIVO", "endpoint filtra técnico ativo");
has(techniciansRoute, "id: true", "endpoint retorna ID");
has(techniciansRoute, "name: true", "endpoint retorna nome");
lacks(techniciansRoute, "profitSharePercent", "endpoint não expõe percentual");
lacks(techniciansRoute, "profitShareEnabled", "endpoint não expõe flag financeira");
has(techniciansRoute, '"Cache-Control": "no-store"', "endpoint não usa cache");

has(statusRoute, '"technicianUserId"', "rota PRONTO aceita ID");
lacks(statusRoute, '"technicianResponsible",', "allowlist da rota não aceita nome livre");
has(statusRoute, "typeof body.technicianUserId", "rota valida ID");
has(statusRoute, "technicianUserId: String(body.technicianUserId).trim()", "rota encaminha ID ao core");
has(statusRoute, "requireIdempotencyKey", "rota mantém idempotência");
has(statusRoute, "usuarioPodeVerDadosFinanceirosSensiveis", "rota mantém proteção financeira");

has(core, '"technicianUserId"', "core aceita ID");
has(core, "findActiveTechnicianForReady(database, input.technicianUserId)", "core relê técnico dentro da transação");
has(core, "technician.name.trim()", "nome é obtido server-side");
has(core, "technician.profitShareEnabled", "flag é obtida server-side");
has(core, "technician.profitSharePercent", "percentual é obtido server-side");
has(core, "technicianProfitPercentSnapshot", "core grava snapshot");
has(core, "hashIdempotentPayload(input)", "ID participa do payload idempotente");

has(repository, `"role" = 'TECNICO'`, "repositório exige perfil técnico");
has(repository, `"status" = 'ATIVO'`, "repositório exige técnico ativo");
has(repository, '"technicianUserId" = ?', "repositório grava vínculo");
has(repository, '"technicianProfitPercentSnapshot" = ?', "repositório grava snapshot");

console.log(JSON.stringify({
  ok: true,
  stage: "3C.5C",
  assertions,
  databaseChanged: false,
  schemaChanged: false,
  migrationRequired: false,
  browserSendsProfitPercent: false
}));
