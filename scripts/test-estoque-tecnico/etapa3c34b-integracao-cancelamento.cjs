#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const routePath = path.join(root, "app/api/ordens/[id]/cancelar/route.ts");
const pagePath = path.join(root, "app/ordens/[id]/cancelar/page.tsx");

const route = fs.readFileSync(routePath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");

let assertions = 0;
function check(fn) {
  fn();
  assertions += 1;
}

// Server-side
check(() => assert.match(route, /cancelServiceOrderAndReleaseReservedTechnicalParts/));
check(() => assert.match(route, /exigirPermissaoApi\("ordens\.cancelar"\)/));
check(() => assert.match(route, /requireIdempotencyKey/));
check(() => assert.match(route, /request\.headers\.get\("Idempotency-Key"\)/));
check(() => assert.match(route, /usuarioPodeVerDadosFinanceirosSensiveis\(acesso\.usuario\)/));
check(() => assert.match(route, /operatorId:\s*acesso\.usuario\.id\s*\|\|\s*null/));
check(() => assert.match(route, /operatorName:\s*userName/));
check(() => assert.match(route, /expectedCurrentStatus/));
check(() => assert.match(route, /confirmation:\s*true/));
check(() => assert.match(route, /reason:\s*motivo/));
check(() => assert.match(route, /Cache-Control/));
check(() => assert.match(route, /Retry-After/));
check(() => assert.doesNotMatch(route, /prisma\.serviceOrder\.update\s*\(/));
check(() => assert.doesNotMatch(route, /histories:\s*\{\s*create:/));
check(() => assert.doesNotMatch(route, /console\.(log|error|warn)\s*\(/));

// Client-side
check(() => assert.match(page, /useRef/));
check(() => assert.match(page, /requestEmAndamentoRef/));
check(() => assert.match(page, /tentativaCancelamentoRef/));
check(() => assert.match(page, /globalThis\.crypto\.randomUUID\(\)/));
check(() => assert.doesNotMatch(page, /Math\.random/));
check(() => assert.match(page, /"Idempotency-Key":\s*tentativa\.key/));
check(() => assert.match(page, /expectedCurrentStatus:\s*tentativa\.expectedCurrentStatus/));
check(() => assert.match(page, /confirmation:\s*true/));
check(() => assert.match(page, /AbortController/));
check(() => assert.match(page, /30_000/));
check(() => assert.match(page, /clearTimeout\(timeoutId\)/));
check(() => assert.match(page, /maxLength=\{1000\}/));
check(() => assert.doesNotMatch(page, /\buserName\s*:/));
check(() => assert.doesNotMatch(page, /localStorage|sessionStorage/));
check(() => assert.doesNotMatch(page, /console\.(log|error|warn)\s*\(/));

process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
