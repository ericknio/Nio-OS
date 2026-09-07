#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (relative) =>
  fs.readFileSync(path.join(root, ...relative.split("/")), "utf8");

const collection = read("app/api/estoque-tecnico/route.ts");
const item = read("app/api/estoque-tecnico/[id]/route.ts");
const movements = read("app/api/estoque-tecnico/[id]/movimentos/route.ts");
const http = read("lib/server/estoqueTecnicoHttp.ts");
const service = read("lib/estoqueTecnico/movementService.ts");
const repository = read("lib/estoqueTecnico/movementRepository.ts");
const index = read("lib/estoqueTecnico/index.ts");

let assertions = 0;
const check = (fn) => { fn(); assertions += 1; };

check(() => assert.match(collection, /exigirPermissaoApi\("estoque\.ver"\)/));
check(() => assert.match(collection, /exigirPermissaoApi\("estoque\.ajustar"\)/));
check(() => assert.match(collection, /createTechnicalPart/));
check(() => assert.match(collection, /listTechnicalParts/));
check(() => assert.match(collection, /queryBoolean\(params, "unlimited"\)/));
check(() => assert.match(collection, /queryBoolean\(params, "outOfStock"\)/));
check(() => assert.match(collection, /queryBoolean\(params, "belowMin"\)/));
check(() => assert.doesNotMatch(collection, /prisma\./));
check(() => assert.doesNotMatch(collection, /console\.(?:log|warn|error)\s*\(/));

check(() => assert.match(item, /getTechnicalPartById/));
check(() => assert.match(item, /updateTechnicalPartMetadata/));
check(() => assert.match(item, /deactivateTechnicalPart/));
check(() => assert.match(item, /reactivateTechnicalPart/));
check(() => assert.match(item, /changeTechnicalPartToControlled/));
check(() => assert.match(item, /changeTechnicalPartToUnlimited/));
check(() => assert.match(item, /UPDATE_METADATA/));
check(() => assert.match(item, /DEACTIVATE/));
check(() => assert.match(item, /REACTIVATE/));
check(() => assert.match(item, /TO_CONTROLLED/));
check(() => assert.match(item, /TO_UNLIMITED/));
check(() => assert.doesNotMatch(item, /prisma\./));

check(() => assert.match(movements, /listTechnicalPartMovements/));
check(() => assert.match(movements, /registerTechnicalPartEntry/));
check(() => assert.match(movements, /registerPositiveAdjustment/));
check(() => assert.match(movements, /registerNegativeAdjustment/));
check(() => assert.match(movements, /ENTRY/));
check(() => assert.match(movements, /POSITIVE_ADJUSTMENT/));
check(() => assert.match(movements, /NEGATIVE_ADJUSTMENT/));
check(() => assert.doesNotMatch(movements, /prisma\./));

check(() => assert.match(http, /requireIdempotencyKey/));
check(() => assert.match(http, /request\.headers\.get\("Idempotency-Key"\)/));
check(() => assert.match(http, /usuarioPodeVerDadosFinanceirosSensiveis/));
check(() => assert.match(http, /operatorId:\s*usuario\.id\s*\|\|\s*null/));
check(() => assert.match(http, /Cache-Control/));
check(() => assert.match(http, /Retry-After/));
check(() => assert.match(http, /sameOriginOrNoOrigin/));
check(() => assert.match(http, /"PERMISSION_DENIED"/));
check(() => assert.match(http, /assertQueryKeys/));
check(() => assert.match(http, /Content-Type application\/json/));
check(() => assert.match(http, /keys\.length !== 2/));
check(() => assert.doesNotMatch(http, /console\.(?:log|warn|error)\s*\(/));

check(() => assert.match(service, /sanitizeTechnicalPartMovement/));
check(() => assert.match(service, /TECHNICAL_PART_NOT_FOUND/));
check(() => assert.match(service, /pageSize > 100/));
check(() => assert.match(repository, /ORDER BY "createdAt" DESC, "id" DESC/));
check(() => assert.match(repository, /WHERE "technicalPartId" = \?/));
check(() => assert.match(index, /listTechnicalPartMovements/));

for (const source of [collection, item, movements]) {
  check(() => assert.match(source, /stockHttpError/));
  check(() => assert.match(source, /jsonNoStore/));
}

process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
