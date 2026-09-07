#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (relative) =>
  fs.readFileSync(path.join(root, ...relative.split("/")), "utf8");

const orderApi = read("app/api/ordens/[id]/route.ts");
const reversalApi = read(
  "app/api/ordens/[id]/pecas-tecnicas/[itemId]/estornar/route.ts",
);
const page = read("app/ordens/[id]/page.tsx");
const component = read("app/ordens/[id]/PecasTecnicasOS.tsx");

let assertions = 0;
function check(fn) {
  fn();
  assertions += 1;
}

check(() => assert.match(orderApi, /technicalParts:\s*\{/));
check(() => assert.match(orderApi, /partNameSnapshot:\s*true/));
check(() => assert.match(orderApi, /partSkuSnapshot:\s*true/));
check(() => assert.match(orderApi, /unitPriceSnapshot:\s*true/));
check(() => assert.match(orderApi, /totalPriceSnapshot:\s*true/));
check(() => assert.match(orderApi, /technicalPart:\s*\{[\s\S]*?version:\s*true/));
check(() => assert.doesNotMatch(orderApi, /unitCostSnapshot:\s*true/));
check(() => assert.doesNotMatch(orderApi, /totalCostSnapshot:\s*true/));
check(() => assert.doesNotMatch(orderApi, /currentCostPrice:\s*true/));

check(() => assert.match(reversalApi, /exigirPermissaoApi\("ordens\.editar"\)/));
check(() => assert.match(reversalApi, /reverseConsumedTechnicalPartManually/));
check(() => assert.match(reversalApi, /Idempotency-Key/));
check(() => assert.match(reversalApi, /UUID_PATTERN/));
check(() => assert.match(reversalApi, /origemPermitida/));
check(() => assert.match(reversalApi, /serviceOrderId:\s*id/));
check(() => assert.match(reversalApi, /id:\s*itemId/));
check(() => assert.match(reversalApi, /physicalReturnConfirmed:\s*true/));
check(() => assert.match(reversalApi, /confirmation:\s*true/));
check(() => assert.match(reversalApi, /usuarioPodeVerDadosFinanceirosSensiveis/));
check(() => assert.match(reversalApi, /operatorId:\s*acesso\.usuario\.id\s*\|\|\s*null/));
check(() => assert.match(reversalApi, /Cache-Control/));
check(() => assert.match(reversalApi, /Retry-After/));
check(() => assert.doesNotMatch(reversalApi, /\.update\s*\(\s*\{/));
check(() => assert.doesNotMatch(reversalApi, /console\.(?:log|warn|error)\s*\(/));

check(() => assert.match(component, /useRef/));
check(() => assert.match(component, /requestLock\.current/));
check(() => assert.match(component, /globalThis\.crypto\.randomUUID\(\)/));
check(() => assert.doesNotMatch(component, /Math\.random/));
check(() => assert.match(component, /"Idempotency-Key":\s*tentativa\.key/));
check(() => assert.match(component, /AbortController/));
check(() => assert.match(component, /30_000/));
check(() => assert.match(component, /technicalPartVersion:\s*tentativa\.technicalPartVersion/));
check(() => assert.match(component, /expectedQuantity:\s*tentativa\.expectedQuantity/));
check(() => assert.match(component, /physicalReturnConfirmed:\s*true/));
check(() => assert.match(component, /confirmation:\s*true/));
check(() => assert.match(component, /maxLength=\{1000\}/));
check(() => assert.match(component, /retornou fisicamente ao estoque/i));
check(() => assert.doesNotMatch(component, /localStorage|sessionStorage/));
check(() => assert.doesNotMatch(component, /console\.(?:log|warn|error)\s*\(/));

check(() => assert.match(page, /import PecasTecnicasOS/));
check(() => assert.match(page, /itens=\{ordem\.technicalParts \|\| \[\]\}/));
check(() => assert.match(page, /podeEstornar=\{tem\("ordens\.editar"\)\}/));
check(() => assert.match(page, /bloqueadoPorPagamento=\{temPagamentoRegistrado\}/));
check(() => assert.match(page, /Boolean\(ordem\.payments\?\.length\)/));
check(() => assert.match(page, /aoAlterar=\{carregarOrdem\}/));

process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
