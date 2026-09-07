#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

const targets = {
  errors: "lib/estoqueTecnico/errors.ts",
  orderRepository: "lib/estoqueTecnico/orderRepository.ts",
  test: "scripts/test-estoque-tecnico/etapa3c35a-estorno-manual.cjs",
};

function load(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo não encontrado: ${relative}`);
  }
  return { relative, file, original: fs.readFileSync(file, "utf8") };
}

const files = {
  errors: load(targets.errors),
  orderRepository: load(targets.orderRepository),
  test: load(targets.test),
};

function patchErrors(source) {
  if (source.includes('"SERVICE_ORDER_PART_NOT_CONSUMED"')) {
    return source;
  }

  const anchor = '"SERVICE_ORDER_PART_NOT_RESERVED",';
  if (!source.includes(anchor)) {
    throw new Error(
      `Não encontrei ${anchor} em ${targets.errors}. Nenhum arquivo será alterado.`,
    );
  }

  return source.replace(
    anchor,
    `${anchor}\n"SERVICE_ORDER_PART_NOT_CONSUMED",`,
  );
}

function patchOrderRepository(source) {
  if (source.includes('"PECA_TECNICA_ESTORNO_MANUAL"')) {
    return source;
  }

  const oldUnion =
    '"PECA_TECNICA_RESERVA_AUMENTADA" | "PECA_TECNICA_RESERVA_REDUZIDA" | "PECA_TECNICA_LIBERADA"';

  if (!source.includes(oldUnion)) {
    throw new Error(
      `Não encontrei a união de ações esperada em ${targets.orderRepository}. Nenhum arquivo será alterado.`,
    );
  }

  return source.replace(
    oldUnion,
    `${oldUnion} | "PECA_TECNICA_ESTORNO_MANUAL"`,
  );
}

function replaceOrConfirm(source, oldText, newText, alreadyPresent, label) {
  if (source.includes(newText) || (alreadyPresent && source.includes(alreadyPresent))) {
    return source;
  }

  if (!source.includes(oldText)) {
    throw new Error(
      `Não encontrei o bloco "${label}" em ${targets.test}. Nenhum arquivo será alterado.`,
    );
  }

  return source.replace(oldText, newText);
}

function patchTest(source) {
  let next = source;

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

  next = replaceOrConfirm(
    next,
    oldWorkerVersion,
    newWorkerVersion,
    "workerData.version !== undefined",
    "leitura de versão no worker",
  );

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

  next = replaceOrConfirm(
    next,
    oldRunWorker,
    newRunWorker,
    "function runWorker(itemId, partId, quantity, key, version)",
    "assinatura runWorker",
  );

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

  next = replaceOrConfirm(
    next,
    oldDifferentKeys,
    newDifferentKeys,
    "const raceVersion = Number(raceBefore.version);",
    "concorrência com chaves diferentes",
  );

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

  next = replaceOrConfirm(
    next,
    oldSameKey,
    newSameKey,
    "const sameKeyVersion = Number(sameKeyBefore.version);",
    "concorrência com a mesma chave",
  );

  return next;
}

// Valida todas as transformações antes de gravar qualquer coisa.
const patched = {
  errors: patchErrors(files.errors.original),
  orderRepository: patchOrderRepository(files.orderRepository.original),
  test: patchTest(files.test.original),
};

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const changed = [];

for (const key of Object.keys(files)) {
  const entry = files[key];
  const next = patched[key];

  if (next === entry.original) {
    console.log(`[OK JÁ CORRIGIDO] ${entry.relative}`);
    continue;
  }

  const backup = `${entry.file}.bak-3c35a-a2-${timestamp}`;
  fs.copyFileSync(entry.file, backup);
  fs.writeFileSync(entry.file, next, "utf8");
  changed.push(entry.relative);

  console.log(`[CORRIGIDO] ${entry.relative}`);
  console.log(`  backup: ${path.basename(backup)}`);
}

console.log(JSON.stringify({
  ok: true,
  changed,
  databaseChanged: false,
  schemaChanged: false,
  productionCoreLogicChanged: false,
}));
