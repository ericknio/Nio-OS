#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

const files = [
  "scripts/test-estoque-tecnico/etapa3c1-core.cjs",
  "scripts/test-estoque-tecnico/etapa3c2-servicos.cjs",
  "scripts/test-estoque-tecnico/etapa3c21-endurecimento.cjs",
  "scripts/test-estoque-tecnico/etapa3c31-reserva-os.cjs",
  "scripts/test-estoque-tecnico/etapa3c32-alteracao-liberacao.cjs",
  "scripts/test-estoque-tecnico/etapa3c33a-consumo-pronto.cjs",
];

const target = '}).outputText;';
const replacement = '}).outputText.replace(/import\\.meta\\.url/g, "__filename");';

let changed = 0;

for (const relative of files) {
  const file = path.join(root, relative);

  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo não encontrado: ${relative}`);
  }

  const source = fs.readFileSync(file, "utf8");

  if (source.includes(replacement)) {
    console.log(`[OK já compatível] ${relative}`);
    continue;
  }

  const occurrences = source.split(target).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `Esperava exatamente 1 loader TypeScript em ${relative}, encontrei ${occurrences}. Nenhuma alteração adicional foi feita nesse arquivo.`
    );
  }

  const updated = source.replace(target, replacement);
  fs.writeFileSync(file, updated, "utf8");
  changed += 1;
  console.log(`[CORRIGIDO] ${relative}`);
}

console.log(JSON.stringify({ ok: true, changed, total: files.length }));
