#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (relative) =>
  fs.readFileSync(path.join(root, ...relative.split("/")), "utf8");

const page = read("app/ordens/nova/page.tsx");
const component = read("app/ordens/nova/PecasNovaOS.tsx");
const catalog = read("app/api/ordens/nova/pecas-tecnicas/route.ts");
const orderRoute = read("app/api/ordens/route.ts");
const packageJson = read("package.json");

let assertions = 0;
const check = (fn) => { fn(); assertions += 1; };

check(() => assert.match(page, /titulo="Peças \/ Valores"/));
check(() => assert.match(page, /PecasNovaOS/));
check(() => assert.match(page, /totalPecasTecnicas/));
check(() => assert.match(page, /technicalParts:\s*pecasTecnicas\.map/));
check(() => assert.match(page, /technicalPartId:\s*item\.id/));
check(() => assert.match(page, /technicalPartVersion:\s*item\.version/));
check(() => assert.match(page, /quantity:\s*item\.quantity/));
check(() => assert.match(page, /partsCost:\s*0/));
check(() => assert.doesNotMatch(page, /label="Valor das peças"[\s\S]{0,180}onChange=\{\(valor\) => atualizarCampo\("partsCost"/));
check(() => assert.match(page, /Marca, modelo e valores são preenchidos automaticamente/));
check(() => assert.match(page, /brand:\s*atual\.brand\.trim\(\) \|\| peca\.brand/));
check(() => assert.match(page, /model:\s*atual\.model\.trim\(\) \|\| peca\.compatibleModel/));
check(() => assert.match(page, /orderCreated/));
check(() => assert.match(page, /router\.push\(`\/ordens\/\$\{dados\.id\}`\)/));
check(() => assert.match(page, /Peças técnicas/));

check(() => assert.match(component, /\/api\/ordens\/nova\/pecas-tecnicas/));
check(() => assert.match(component, /defaultSalePrice/));
check(() => assert.match(component, /quantityAvailable/));
check(() => assert.match(component, /compatibleModel/));
check(() => assert.match(component, /brand/));
check(() => assert.match(component, /quantity:\s*1/));
check(() => assert.match(component, /quantidade > atual\.quantityAvailable/));
check(() => assert.match(component, /onSelecionarPeca\(nova\)/));
check(() => assert.match(component, /Remover/));
check(() => assert.match(component, /Total das peças/));
check(() => assert.doesNotMatch(component, /currentCostPrice|unitCostSnapshot|totalCostSnapshot/));
check(() => assert.doesNotMatch(component, /localStorage|sessionStorage|Math\.random/));

check(() => assert.match(catalog, /exigirPermissaoApi\("ordens\.criar"\)/));
check(() => assert.match(catalog, /listTechnicalParts/));
check(() => assert.match(catalog, /active:\s*true/));
check(() => assert.match(catalog, /pageSize:\s*20/));
check(() => assert.match(catalog, /canViewFinancialData:\s*false/));
check(() => assert.match(catalog, /defaultSalePrice/));
check(() => assert.match(catalog, /quantityAvailable/));
check(() => assert.match(catalog, /compatibleModel/));
check(() => assert.doesNotMatch(catalog, /currentCostPrice|unitCostSnapshot|totalCostSnapshot/));
check(() => assert.doesNotMatch(catalog, /console\.(?:log|warn|error)\s*\(/));

check(() => assert.match(orderRoute, /validarPecasTecnicas/));
check(() => assert.match(orderRoute, /valor\.length > 20/));
check(() => assert.match(orderRoute, /A mesma peça técnica não pode ser repetida/));
check(() => assert.match(orderRoute, /technicalPartVersion/));
check(() => assert.match(orderRoute, /quantity/));
check(() => assert.match(orderRoute, /getTechnicalPartById/));
check(() => assert.match(orderRoute, /TECHNICAL_PART_INACTIVE/));
check(() => assert.match(orderRoute, /VERSION_CONFLICT/));
check(() => assert.match(orderRoute, /INSUFFICIENT_AVAILABLE_STOCK/));
check(() => assert.match(orderRoute, /pecasTecnicasAtuais\.length > 0 \? 0 : numeroSeguro\(body\.partsCost\)/));
check(() => assert.match(orderRoute, /textoOuNulo\(primeiraPeca\?\.brand\)/));
check(() => assert.match(orderRoute, /textoOuNulo\(primeiraPeca\?\.compatibleModel\)/));
check(() => assert.match(orderRoute, /reserveTechnicalPartForOrder/));
check(() => assert.match(orderRoute, /unitPrice:\s*peca\.defaultSalePrice/));
check(() => assert.doesNotMatch(orderRoute, /unitPrice:\s*body|unitPrice:\s*entrada/));
check(() => assert.match(orderRoute, /idempotencyKey:\s*randomUUID\(\)/));
check(() => assert.match(orderRoute, /releaseTechnicalPartFromOrder/));
check(() => assert.match(orderRoute, /Compensação automática/));
check(() => assert.match(orderRoute, /reservationsCompensated/));
check(() => assert.match(orderRoute, /orderCreated:\s*true/));
check(() => assert.match(orderRoute, /StockDomainError/));
check(() => assert.doesNotMatch(orderRoute, /console\.error\("Erro ao criar ordem:/));
check(() => assert.doesNotMatch(orderRoute, /prisma\.technicalPart|prisma\.serviceOrderPart|prisma\.technicalPartMovement/));

const parsed = JSON.parse(packageJson);
check(() => assert.equal(parsed.scripts?.dev, "next dev --webpack"));

process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
