#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const file = path.join(process.cwd(), "scripts/test-estoque-tecnico/etapa3c33a-consumo-pronto.cjs");
const source = fs.readFileSync(file, "utf8");

const oldBlock = `    for (const operation of ["release", "change"]) {
      const orderId = createOrder(); const partId = createPart(); const item = reserve(orderId, partId, 2);
      race = await Promise.all([
        runWorker("ready", { orderId }),
        runWorker(operation, { itemId: item.item.id, quantity: 2, delayMs: 150 }),
      ]);
      check(() => assert.equal(race.filter((entry) => entry.ok).length, 1));
      const current = scalar(\`SELECT "quantityOnHand", "quantityReserved" FROM "TechnicalPart" WHERE "id" = ?\`, partId);
      check(() => assert.ok(Number(current.quantityReserved) >= 0 && Number(current.quantityReserved) <= Number(current.quantityOnHand)));
    }
`;

const newBlock = `    // Concorrência PRONTO x mutação da reserva.
    // BEGIN IMMEDIATE serializa as operações, mas a ordem de aquisição do lock entre
    // workers não é determinística. Se a mutação terminar primeiro, PRONTO pode ser
    // executado depois de forma válida; portanto, duas operações bem-sucedidas podem
    // representar uma serialização correta, e não uma corrida inconsistente.
    for (const operation of ["release", "change"]) {
      const orderId = createOrder(); const partId = createPart(); const item = reserve(orderId, partId, 2);
      const beforeRace = state(item.item.id, partId, orderId);
      race = await Promise.all([
        runWorker("ready", { orderId }),
        runWorker(operation, { itemId: item.item.id, quantity: 2, delayMs: 150 }),
      ]);

      const successes = race.filter((entry) => entry.ok).length;
      check(() => assert.ok(successes === 1 || successes === 2, \`Resultado concorrente inválido: \${JSON.stringify(race)}\`));

      const current = state(item.item.id, partId, orderId);
      check(() => assert.equal(current.status, "PRONTO"));
      check(() => assert.ok(Number(current.quantityReserved) >= 0));
      check(() => assert.ok(current.quantityOnHand === null || Number(current.quantityReserved) <= Number(current.quantityOnHand)));

      const consumptionCount = Number(scalar(\`SELECT COUNT(*) AS n FROM "TechnicalPartMovement"
        WHERE "serviceOrderPartId" = ? AND "type" = 'CONSUMPTION'\`, item.item.id).n);

      if (operation === "release") {
        const releaseCount = Number(scalar(\`SELECT COUNT(*) AS n FROM "TechnicalPartMovement"
          WHERE "serviceOrderPartId" = ? AND "type" = 'RELEASE'\`, item.item.id).n);

        // Ou PRONTO consumiu primeiro, ou RELEASE terminou primeiro e PRONTO apenas
        // concluiu a OS sem consumir esse item. Nunca ambos no mesmo item.
        check(() => assert.equal(consumptionCount + releaseCount, 1));
        check(() => assert.equal(successes, 1 + releaseCount));
        check(() => assert.equal(current.state, releaseCount === 1 ? "RELEASED" : "CONSUMED"));
        check(() => assert.equal(Number(current.quantityReserved), 0));
        check(() => assert.equal(
          Number(current.quantityOnHand),
          releaseCount === 1 ? Number(beforeRace.quantityOnHand) : Number(beforeRace.quantityOnHand) - Number(item.item.quantity),
        ));
      } else {
        const increaseCount = Number(scalar(\`SELECT COUNT(*) AS n FROM "TechnicalPartMovement"
          WHERE "serviceOrderPartId" = ? AND "type" = 'RESERVATION_INCREASE'\`, item.item.id).n);

        // PRONTO sempre consome o item. Se o aumento terminou antes, ele também é um
        // sucesso válido e a quantidade consumida passa a refletir o novo total.
        check(() => assert.equal(consumptionCount, 1));
        check(() => assert.ok(increaseCount === 0 || increaseCount === 1));
        check(() => assert.equal(successes, 1 + increaseCount));
        check(() => assert.equal(current.state, "CONSUMED"));
        check(() => assert.equal(Number(current.quantityReserved), 0));
        check(() => assert.equal(Number(current.quantity), 2 + increaseCount));
        check(() => assert.equal(Number(current.quantityOnHand), Number(beforeRace.quantityOnHand) - Number(current.quantity)));
      }
    }
`;

if (!source.includes(oldBlock)) {
  throw new Error("Bloco concorrente esperado não foi encontrado. Nenhuma alteração foi feita.");
}

const updated = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, updated, "utf8");
console.log(JSON.stringify({ ok: true, file: "scripts/test-estoque-tecnico/etapa3c33a-consumo-pronto.cjs", productionChanged: false }));
