#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${relative}`);
  return { file, text: fs.readFileSync(file, "utf8") };
}

function write(file, text) {
  fs.writeFileSync(file, text, "utf8");
}

const changed = [];

// -----------------------------------------------------------------------------
// 1) errors.ts — registrar o novo código sem alterar mapeamentos existentes.
// -----------------------------------------------------------------------------
{
  const relative = "lib/estoqueTecnico/errors.ts";
  const { file, text } = read(relative);
  let next = text;

  if (!next.includes('"SERVICE_ORDER_PART_NOT_CONSUMED"')) {
    const match = next.match(/export\s+type\s+StockErrorCode\s*=\s*([\s\S]*?);/);
    if (!match) {
      throw new Error(`Não encontrei o type StockErrorCode em ${relative}. Nenhuma alteração aplicada a este arquivo.`);
    }

    const full = match[0];
    if (!full.includes('"SERVICE_ORDER_PART_NOT_RESERVED"')) {
      throw new Error(`Não encontrei SERVICE_ORDER_PART_NOT_RESERVED no StockErrorCode de ${relative}.`);
    }

    const patched = full.replace(
      '"SERVICE_ORDER_PART_NOT_RESERVED"',
      '"SERVICE_ORDER_PART_NOT_RESERVED" | "SERVICE_ORDER_PART_NOT_CONSUMED"',
    );

    next = next.replace(full, patched);
  }

  if (next !== text) {
    write(file, next);
    changed.push(relative);
    console.log(`[CORRIGIDO] ${relative}`);
  } else {
    console.log(`[OK] ${relative}`);
  }
}

// -----------------------------------------------------------------------------
// 2) orderRepository.ts — permitir a ação de histórico do estorno manual.
// -----------------------------------------------------------------------------
{
  const relative = "lib/estoqueTecnico/orderRepository.ts";
  const { file, text } = read(relative);
  let next = text;

  if (!next.includes('"PECA_TECNICA_ESTORNO_MANUAL"')) {
    const oldUnion =
      '"PECA_TECNICA_RESERVA_AUMENTADA" | "PECA_TECNICA_RESERVA_REDUZIDA" | "PECA_TECNICA_LIBERADA"';

    if (!next.includes(oldUnion)) {
      throw new Error(`União de ações esperada não encontrada em ${relative}.`);
    }

    next = next.replace(
      oldUnion,
      `${oldUnion} | "PECA_TECNICA_ESTORNO_MANUAL"`,
    );
  }

  if (next !== text) {
    write(file, next);
    changed.push(relative);
    console.log(`[CORRIGIDO] ${relative}`);
  } else {
    console.log(`[OK] ${relative}`);
  }
}

// -----------------------------------------------------------------------------
// 3) etapa3c35a-estorno-manual.cjs — concorrência determinística.
// A versão faz parte do payload idempotente. Os dois workers da MESMA tentativa
// precisam receber a MESMA versão capturada antes da corrida; não podem relê-la
// independentemente depois que um dos workers já concluiu o estorno.
// -----------------------------------------------------------------------------
{
  const relative =
    "scripts/test-estoque-tecnico/etapa3c35a-estorno-manual.cjs";
  const { file, text } = read(relative);
  let next = text;

  const oldWorkerVersion = `    const current = new DatabaseSync(workerData.location.databasePath);
    const version = Number(
      current.prepare(\`SELECT "version" FROM "TechnicalPart" WHERE "id" = ?\`)
        .get(workerData.partId).version,
    );
    current.close();
`;

  const newWorkerVersion = `    let version;
    if (workerData.version !== undefined) {
      version = Number(workerData.version);
    } else {
      const current = new DatabaseSync(workerData.location.databasePath);
      version = Number(
        current.prepare(\`SELECT "version" FROM "TechnicalPart" WHERE "id" = ?\`)
          .get(workerData.partId).version,
      );
      current.close();
    }
`;

  if (next.includes(oldWorkerVersion)) {
    next = next.replace(oldWorkerVersion, newWorkerVersion);
  } else if (!next.includes("if (workerData.version !== undefined)")) {
    throw new Error(`Bloco de versão do worker não encontrado em ${relative}.`);
  }

  const oldRunWorker = `  function runWorker(itemId, partId, quantity, key) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: {
          worker: true,
          location,
          itemId,
          partId,
          quantity,
          key,
        },
      });
`;

  const newRunWorker = `  function runWorker(itemId, partId, quantity, key, version) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: {
          worker: true,
          location,
          itemId,
          partId,
          quantity,
          key,
          version,
        },
      });
`;

  if (next.includes(oldRunWorker)) {
    next = next.replace(oldRunWorker, newRunWorker);
  } else if (!next.includes("function runWorker(itemId, partId, quantity, key, version)")) {
    throw new Error(`Função runWorker esperada não encontrada em ${relative}.`);
  }

  const oldDifferentKeys = `    const raceResults = await Promise.all([
      runWorker(race.itemId, race.partId, 2),
      runWorker(race.itemId, race.partId, 2),
    ]);
`;

  const newDifferentKeys = `    const raceVersion = Number(raceBefore.version);
    const raceResults = await Promise.all([
      runWorker(race.itemId, race.partId, 2, undefined, raceVersion),
      runWorker(race.itemId, race.partId, 2, undefined, raceVersion),
    ]);
`;

  if (next.includes(oldDifferentKeys)) {
    next = next.replace(oldDifferentKeys, newDifferentKeys);
  } else if (!next.includes("const raceVersion = Number(raceBefore.version);")) {
    throw new Error(`Bloco de concorrência com chaves diferentes não encontrado em ${relative}.`);
  }

  const oldSameKey = `    const sameKeyResults = await Promise.all([
      runWorker(sameKeyRace.itemId, sameKeyRace.partId, 1, sameKey),
      runWorker(sameKeyRace.itemId, sameKeyRace.partId, 1, sameKey),
    ]);
`;

  const newSameKey = `    const sameKeyVersion = Number(sameKeyBefore.version);
    const sameKeyResults = await Promise.all([
      runWorker(sameKeyRace.itemId, sameKeyRace.partId, 1, sameKey, sameKeyVersion),
      runWorker(sameKeyRace.itemId, sameKeyRace.partId, 1, sameKey, sameKeyVersion),
    ]);
`;

  if (next.includes(oldSameKey)) {
    next = next.replace(oldSameKey, newSameKey);
  } else if (!next.includes("const sameKeyVersion = Number(sameKeyBefore.version);")) {
    throw new Error(`Bloco de concorrência com mesma chave não encontrado em ${relative}.`);
  }

  if (next !== text) {
    write(file, next);
    changed.push(relative);
    console.log(`[CORRIGIDO] ${relative}`);
  } else {
    console.log(`[OK] ${relative}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  changed,
  databaseChanged: false,
  schemaChanged: false,
}));
