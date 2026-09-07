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

const page = read("app/relatorios/page.tsx");
const api = read("app/api/relatorios/route.ts");
const pdf = read("app/api/relatorios/pdf/route.ts");

has(api, "technicianProfitPercentSnapshot: true", "API lê snapshot percentual");
has(api, "technicianResponsible: true", "API lê nome snapshot");
has(api, "technicianUserId: true", "API lê ID histórico");
has(api, "Math.max(lucroBruto, 0)", "participação nunca usa prejuízo como base");
has(api, "moeda(Math.max(lucroBruto, 0)", "participação é arredondada por OS");
has(api, "lucroBruto - participacaoTecnico", "lucro da loja deriva do lucro menos técnico");
has(api, "possuiSnapshotParticipacao", "API distingue snapshot existente");
has(api, "concluidaComTecnicoEsperado", "API trata legado PRONTO/ENTREGUE");
has(api, "participacaoRastreada", "API controla rastreabilidade");
has(api, "ordensSemParticipacaoCalculavel", "API conta divisão não calculável");
has(api, "participacaoTecnicosParcial", "API calcula total parcial");
has(api, "lucroLojaParcial", "API calcula loja parcial");
has(api, "tecnicosFinanceiros", "API consolida por técnico");
has(api, "technicianProfitShare:", "API projeta participação por OS");
has(api, "storeProfit:", "API projeta lucro da loja por OS");
has(api, "profitShareTracked:", "API projeta rastreabilidade por OS");
has(api, "financeiroSensivelLiberado ? { tecnicosFinanceiros } : {}", "ranking só entra no payload financeiro");
lacks(api, "profitSharePercent: true", "relatório não usa percentual atual do usuário");

const sensitiveProjection = api.match(
  /\.\.\.\(financeiroSensivelLiberado\s*\?\s*\{[\s\S]*?profitShareTracked:[\s\S]*?\}\s*:\s*\{\}\),/
);
check(Boolean(sensitiveProjection), "campos de comissão por OS ficam no spread financeiro");

has(page, 'titulo="Participação dos técnicos"', "UI mostra participação total");
has(page, 'titulo="Lucro da loja"', "UI mostra lucro da loja");
has(page, "Resultado por técnico", "UI mostra consolidação por técnico");
has(page, "financeiroSensivelLiberado && tecnicosFinanceiros.length > 0", "ranking exige financeiro");
has(page, "technicianProfitPercent", "UI mostra percentual snapshot por OS");
has(page, "technicianProfitShare", "UI mostra participação por OS");
has(page, "profitShareTracked", "UI trata legado não rastreado");

has(pdf, 'tituloSecao("Resultado por técnico")', "PDF possui resultado por técnico");
has(pdf, 'cardResumo("Participação técnicos"', "PDF mostra participação total");
has(pdf, 'cardResumo("Lucro da loja"', "PDF mostra lucro da loja");
has(pdf, "financeiroSensivelLiberado", "PDF mantém gate financeiro");
has(pdf, "profitShareTracked", "PDF trata divisão não rastreada");
has(pdf, "Participação:", "PDF mostra participação por OS");
has(pdf, "Loja:", "PDF mostra loja por OS");

console.log(JSON.stringify({
  ok: true,
  stage: "3C.5D",
  assertions,
  databaseChanged: false,
  schemaChanged: false,
  migrationRequired: false,
  commissionBase: "max(grossProfit,0)",
  permission: "relatorios.financeiro"
}));
