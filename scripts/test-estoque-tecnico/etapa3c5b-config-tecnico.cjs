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

const page = read("app/usuarios-sistema/page.tsx");
const api = read("app/api/usuarios-sistema/route.ts");
const apiId = read("app/api/usuarios-sistema/[id]/route.ts");
const core = read("lib/server/usuariosSistemaCore.ts");
const schema = read("prisma/schema.prisma");

has(schema, "profitShareEnabled Boolean @default(false)", "schema 3C.5A presente");
has(schema, "profitSharePercent Decimal @default(0)", "percentual no schema presente");

has(core, "profitShareEnabled: true", "select retorna flag");
has(core, "profitSharePercent: true", "select retorna percentual");
has(core, "participacaoLucroParaSalvar", "validador central existe");
has(core, "role !== SystemUserRole.TECNICO", "não técnico força participação desligada");
has(core, "recebido <= 0 || recebido > 100", "servidor valida faixa do percentual");
has(core, "Math.round(recebido * 100) / 100", "servidor arredonda a duas casas");
has(core, "profitShareEnabled ? Number(profitSharePercent || 0) : 0", "formatação normaliza Decimal");

has(api, "participacaoLucroParaSalvar(body, role)", "POST valida participação server-side");
has(api, "profitShareEnabled: profitShare.enabled", "POST salva flag validada");
has(api, "profitSharePercent: profitShare.percent", "POST salva percentual validado");

has(apiId, "participacaoLucroParaSalvar(body, role)", "PATCH valida participação server-side");
has(apiId, "profitShareEnabled: profitShare.enabled", "PATCH salva flag validada");
has(apiId, "profitSharePercent: profitShare.percent", "PATCH salva percentual validado");

has(page, "Participa do lucro das OS", "UI exibe configuração para técnico");
has(page, "Percentual do técnico *", "UI possui percentual");
has(page, 'form.role === "TECNICO"', "UI condiciona configuração ao perfil técnico");
has(page, 'min="0.01"', "input possui mínimo");
has(page, 'max="100"', "input possui máximo");
has(page, 'step="0.01"', "input usa duas casas");
has(page, "profitShareEnabled:", "payload envia flag");
has(page, "profitSharePercent:", "payload envia percentual");
has(page, "Participação no lucro:", "lista mostra configuração");
has(page, "será congelado na própria OS", "UI explica snapshot histórico");

check(!api.includes("technicianProfitPercentSnapshot"), "API de usuários não grava snapshot de OS");
check(!apiId.includes("technicianProfitPercentSnapshot"), "PATCH de usuário não altera snapshot de OS");
check(!page.includes("technicianProfitPercentSnapshot"), "UI de usuários não manipula snapshot de OS");

console.log(JSON.stringify({
  ok: true,
  stage: "3C.5B",
  assertions,
  databaseChanged: false,
  schemaChanged: false,
  migrationRequired: false
}));
