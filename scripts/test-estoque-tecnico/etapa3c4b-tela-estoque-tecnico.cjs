#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (relative) =>
  fs.readFileSync(path.join(root, ...relative.split("/")), "utf8");

const menu = read("app/SistemaFrame.tsx");
const guard = read("app/AuthGuard.tsx");
const page = read("app/estoque-tecnico/page.tsx");

let assertions = 0;
const check = (fn) => { fn(); assertions += 1; };

check(() => assert.match(menu, /label:\s*"Estoque técnico"/));
check(() => assert.match(menu, /href:\s*"\/estoque-tecnico"/));
check(() => assert.match(menu, /permissao:\s*"estoque\.ver"/));
const technicalStart = menu.indexOf('label: "Estoque técnico"');
const technicalEnd = menu.indexOf("},", technicalStart);
const technicalMenu = menu.slice(technicalStart, technicalEnd + 2);
check(() => assert.ok(technicalStart >= 0 && technicalEnd > technicalStart));
check(() => assert.doesNotMatch(technicalMenu, /modulo:\s*"produtos"/));

check(() => assert.match(guard, /href:\s*"\/estoque-tecnico"[\s\S]*?permissao:\s*"estoque\.ver"/));
check(() => assert.match(guard, /pathname\.startsWith\("\/estoque-tecnico"\)[\s\S]*?return "estoque\.ver"/));
check(() => assert.ok(guard.indexOf('href: "/estoque-tecnico"') < guard.indexOf('href: "/produtos"')));

check(() => assert.match(page, /tem\("estoque\.ver"\)/));
check(() => assert.match(page, /tem\("estoque\.ajustar"\)/));
check(() => assert.match(page, /tem\("relatorios\.financeiro"\)/));
check(() => assert.match(page, /\/api\/estoque-tecnico\?/));
check(() => assert.match(page, /\/api\/estoque-tecnico\/\$\{partId\}/));
check(() => assert.match(page, /\/movimentos\?page=/));
check(() => assert.match(page, /operation:\s*"UPDATE_METADATA"/));
check(() => assert.match(page, /"DEACTIVATE"/));
check(() => assert.match(page, /"REACTIVATE"/));
check(() => assert.match(page, /"TO_CONTROLLED"/));
check(() => assert.match(page, /"TO_UNLIMITED"/));
check(() => assert.match(page, /"ENTRY"/));
check(() => assert.match(page, /"POSITIVE_ADJUSTMENT"/));
check(() => assert.match(page, /"NEGATIVE_ADJUSTMENT"/));

check(() => assert.match(page, /globalThis\.crypto\.randomUUID\(\)/));
check(() => assert.match(page, /"Idempotency-Key":\s*pending\.key/));
check(() => assert.match(page, /AbortController/));
check(() => assert.match(page, /30_000/));
check(() => assert.match(page, /writeLock\.current/));
check(() => assert.match(page, /pendingWrite\.current/));
check(() => assert.match(page, /response\.status < 500/));
check(() => assert.match(page, /mesma tentativa segura será reutilizada/));
check(() => assert.doesNotMatch(page, /Math\.random/));
check(() => assert.doesNotMatch(page, /localStorage|sessionStorage/));
check(() => assert.doesNotMatch(page, /console\.(?:log|warn|error)\s*\(/));
check(() => assert.doesNotMatch(page, /prisma\./));

check(() => assert.match(page, /currentCostPrice:\s*nonNegativeMoney/));
check(() => assert.match(page, /podeVerFinanceiro\s*\?/));
check(() => assert.match(page, /movement\.unitCostSnapshot/));
check(() => assert.match(page, /defaultSalePrice/));

check(() => assert.match(page, /outOfStock/));
check(() => assert.match(page, /belowMin/));
check(() => assert.match(page, /unlimited/));
check(() => assert.match(page, /active/));
check(() => assert.match(page, /category/));
check(() => assert.match(page, /brand/));
check(() => assert.match(page, /sort/));
check(() => assert.match(page, /pageSize/));

check(() => assert.match(page, /quantityReserved/));
check(() => assert.match(page, /quantityAvailable/));
check(() => assert.match(page, /quantityOnHand === null/));
check(() => assert.match(page, /Estoque ilimitado não aceita movimentação física/));
check(() => assert.match(page, /servidor bloqueará operações incompatíveis/i));

check(() => assert.match(page, /Histórico de movimentações/));
check(() => assert.match(page, /MANUAL_REVERSAL/));
check(() => assert.match(page, /CONSUMPTION/));
check(() => assert.match(page, /RESERVATION/));
check(() => assert.match(page, /STOCK_MODE_CHANGE/));

check(() => assert.match(page, /queryOverride \?\? listQuery/));
check(() => assert.match(page, /sort=name_asc/));
check(() => assert.doesNotMatch(page, /\/api\/produtos/));
check(() => assert.doesNotMatch(page, /stockQuantity/));

process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
