#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, ...relative.split("/")), "utf8");

const page = read("app/ordens/[id]/page.tsx");
const ui = read("app/ordens/[id]/GerenciarPecasTecnicasOS.tsx");
const collection = read("app/api/ordens/[id]/pecas-tecnicas/route.ts");
const item = read("app/api/ordens/[id]/pecas-tecnicas/[itemId]/route.ts");

let assertions = 0;
const check = (fn) => { fn(); assertions += 1; };

check(() => assert.match(page, /GerenciarPecasTecnicasOS/));
check(() => assert.match(page, /statusOrdem=\{ordem\.status\}/));
check(() => assert.match(page, /valorPecasAtual=\{ordem\.partsCost\}/));
check(() => assert.match(page, /bloqueadoPorPagamento=\{temPagamentoRegistrado\}/));
check(() => assert.match(page, /Permissao precisa="ordens\.editar"/));

check(() => assert.match(collection, /exigirPermissaoApi\("ordens\.editar"\)/g));
check(() => assert.match(collection, /requireSameOrigin\(request\)/));
check(() => assert.match(collection, /reserveTechnicalPartForOrder/));
check(() => assert.match(collection, /listTechnicalPartsForOrder/));
check(() => assert.match(collection, /listTechnicalParts/));
check(() => assert.match(collection, /getTechnicalPartById/));
check(() => assert.match(collection, /unitPrice:\s*Number\(part\.defaultSalePrice/));
check(() => assert.doesNotMatch(collection, /body\.unitPrice|input\.unitPrice/));
check(() => assert.match(collection, /assertAllowedKeys/));
check(() => assert.match(collection, /technicalPartVersion/));
check(() => assert.match(collection, /confirmReplaceLegacyPartsCost/));
check(() => assert.match(collection, /active:\s*true/));
check(() => assert.match(collection, /pageSize:\s*20/));
check(() => assert.match(collection, /canViewFinancialData:\s*false/));
check(() => assert.doesNotMatch(collection, /currentCostPrice|unitCostSnapshot|totalCostSnapshot/));
check(() => assert.doesNotMatch(collection, /prisma\./));
check(() => assert.doesNotMatch(collection, /\.update\s*\(/));
check(() => assert.doesNotMatch(collection, /console\.(?:log|warn|error)\s*\(/));

check(() => assert.match(item, /requireOwnedItem\(id, itemId\)/g));
check(() => assert.match(item, /states:\s*\["RESERVED", "CONSUMED", "RELEASED", "REVERSED"\]/));
check(() => assert.match(item, /changeReservedTechnicalPartQuantity/));
check(() => assert.match(item, /releaseTechnicalPartFromOrder/));
check(() => assert.match(item, /technicalPartVersion/));
check(() => assert.match(item, /expectedQuantity/));
check(() => assert.match(item, /newQuantity/));
check(() => assert.match(item, /requireSameOrigin\(request\)/g));
check(() => assert.doesNotMatch(item, /prisma\./));
check(() => assert.doesNotMatch(item, /\.update\s*\(/));
check(() => assert.doesNotMatch(item, /console\.(?:log|warn|error)\s*\(/));

check(() => assert.match(ui, /STATUS_MUTAVEIS/));
check(() => assert.match(ui, /globalThis\.crypto\.randomUUID\(\)/));
check(() => assert.match(ui, /"Idempotency-Key":\s*tentativa\.key/));
check(() => assert.match(ui, /AbortController/));
check(() => assert.match(ui, /30_000/));
check(() => assert.match(ui, /lock\.current/));
check(() => assert.match(ui, /tentativaRef\.current/));
check(() => assert.match(ui, /response\.status >= 500/));
check(() => assert.match(ui, /mesma tentativa segura será reutilizada/));
check(() => assert.doesNotMatch(ui, /Math\.random/));
check(() => assert.doesNotMatch(ui, /localStorage|sessionStorage/));
check(() => assert.doesNotMatch(ui, /console\.(?:log|warn|error)\s*\(/));
check(() => assert.doesNotMatch(ui, /unitPrice\s*:/));
check(() => assert.doesNotMatch(ui, /currentCostPrice|unitCostSnapshot|totalCostSnapshot/));
check(() => assert.match(ui, /technicalPartVersion:\s*peca\.version/));
check(() => assert.match(ui, /technicalPartVersion:\s*item\.technicalPart\.version/));
check(() => assert.match(ui, /expectedQuantity:\s*item\.quantity/));
check(() => assert.match(ui, /newQuantity/));
check(() => assert.match(ui, /confirmReplaceLegacyPartsCost/));
check(() => assert.match(ui, /valor será substituído pela soma dos itens técnicos/));
check(() => assert.match(ui, /alreadyActive/));
check(() => assert.match(ui, /quantityAvailable/));
check(() => assert.match(ui, /Alterar reserva/));
check(() => assert.match(ui, /Liberar reserva/));

process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
