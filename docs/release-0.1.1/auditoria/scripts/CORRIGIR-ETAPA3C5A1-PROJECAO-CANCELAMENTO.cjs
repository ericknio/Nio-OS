#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const cancellationFile = "lib/estoqueTecnico/orderCancellationService.ts";
const typesFile = "lib/estoqueTecnico/types.ts";
const testFile = "scripts/test-estoque-tecnico/etapa3c5a1-projecao-cancelamento.cjs";

function abs(relative) {
  return path.join(root, ...relative.split("/"));
}

function required(relative) {
  const file = abs(relative);
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório não encontrado: ${relative}`);
  return fs.readFileSync(file, "utf8");
}

function backupAndWrite(relative, content, changed) {
  const file = abs(relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, "utf8");
    if (current === content) {
      console.log(`[OK JÁ ATUALIZADO] ${relative}`);
      return;
    }

    const backup = `${file}.bak-3c5a1-${stamp}`;
    fs.copyFileSync(file, backup);
    console.log(`[BACKUP] ${path.basename(backup)}`);
  }

  fs.writeFileSync(file, content, "utf8");
  changed.push(relative);
  console.log(`[GRAVADO] ${relative}`);
}

function patchCancellation(source) {
  if (
    source.includes("technicianUserId: order.technicianUserId") &&
    source.includes("technicianProfitPercentSnapshot:")
  ) {
    return source;
  }

  const anchor = `      technicianResponsible: order.technicianResponsible,
      partsCost: order.partsCost,`;

  if (!source.includes(anchor)) {
    throw new Error(
      "Projeção de cancelamento incompatível com a revisão esperada. Nenhum arquivo será alterado."
    );
  }

  return source.replace(
    anchor,
    `      technicianResponsible: order.technicianResponsible,
      technicianUserId: order.technicianUserId,
      ...(context.canViewFinancialData
        ? {
            technicianProfitPercentSnapshot:
              order.technicianProfitPercentSnapshot,
          }
        : {}),
      partsCost: order.partsCost,`
  );
}

const testContent = `#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
let assertions = 0;
function read(relative) {
  const file = path.join(root, ...relative.split("/"));
  if (!fs.existsSync(file)) throw new Error(\`Arquivo não encontrado: \${relative}\`);
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
`;

function main() {
  const types = required(typesFile);
  if (!types.includes("export type ConsumeReadyOrderProjection")) {
    throw new Error("ConsumeReadyOrderProjection não encontrado.");
  }
  if (!types.includes("technicianUserId: string | null;")) {
    throw new Error("3C.5A não está instalada: technicianUserId ausente.");
  }
  if (!types.includes("technicianProfitPercentSnapshot?: number | null;")) {
    throw new Error("3C.5A não está instalada: snapshot ausente.");
  }

  const current = required(cancellationFile);
  if (!current.includes("function project(")) {
    throw new Error("Função project do cancelamento não encontrada.");
  }

  const next = patchCancellation(current);

  const changed = [];
  backupAndWrite(cancellationFile, next, changed);
  backupAndWrite(testFile, testContent, changed);

  console.log(JSON.stringify({
    ok: true,
    stage: "3C.5A.1",
    changed,
    fix: "cancel-result-projection-technicianUserId",
    sensitiveSnapshotPermission: "relatorios.financeiro",
    databaseChanged: false,
    schemaChanged: false,
    migrationRequired: false
  }));
}

main();
