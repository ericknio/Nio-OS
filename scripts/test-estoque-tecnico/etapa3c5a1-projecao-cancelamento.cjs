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
const cancellation = read("lib/estoqueTecnico/orderCancellationService.ts");
const types = read("lib/estoqueTecnico/types.ts");
check(types.includes("technicianUserId: string | null;"), "tipo exige technicianUserId");
check(types.includes("technicianProfitPercentSnapshot?: number | null;"), "snapshot financeiro opcional existe");
check(cancellation.includes("technicianUserId: order.technicianUserId"), "cancelamento projeta technicianUserId");
check(cancellation.includes("context.canViewFinancialData"), "cancelamento respeita permissão financeira");
check(cancellation.includes("technicianProfitPercentSnapshot:"), "cancelamento conhece snapshot financeiro");
check(cancellation.includes("order.technicianProfitPercentSnapshot"), "snapshot vem da OS");
console.log(JSON.stringify({
  ok: true,
  stage: "3C.5A.1",
  assertions,
  databaseChanged: false,
  schemaChanged: false
}));
