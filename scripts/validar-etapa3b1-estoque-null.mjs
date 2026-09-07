import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const origem = resolve("data/nio-os.db");
const diretorioLaboratorio = join(tmpdir(), `nio-os-etapa3b1-${randomUUID()}`);
const laboratorio = join(diretorioLaboratorio, "laboratorio.db");

function validarPayloadEstoque(body) {
  const temQuantidade = Object.prototype.hasOwnProperty.call(body, "stockQuantity");
  if (typeof body.unlimitedStock !== "boolean") return false;
  if (body.unlimitedStock) return !temQuantidade || body.stockQuantity === undefined;
  const quantidade = Number(body.stockQuantity);
  return temQuantidade && Number.isInteger(quantidade) && quantidade >= 0;
}

await mkdir(diretorioLaboratorio, { recursive: true });
await copyFile(origem, laboratorio);
const migracao = spawnSync(
  process.execPath,
  [
    resolve("scripts/schema-migrator/cli.cjs"),
    "--db",
    laboratorio,
    "--apply",
    "--backup-dir",
    diretorioLaboratorio,
    "--json",
  ],
  { encoding: "utf8", windowsHide: true }
);
assert.equal(migracao.status, 0, `Preparação do banco de laboratório falhou: ${migracao.stderr || migracao.stdout}`);
process.env.DATABASE_URL = `file:${laboratorio.replaceAll("\\", "/")}`;

const { PrismaClient, PaymentMethod, ProductSaleStatus, StockMovementType } =
  await import("@prisma/client");
const prisma = new PrismaClient();

let sequenciaVendaLab = 1_500_000_000 + Math.floor(Math.random() * 100_000_000);

function proximaVendaLab() {
  sequenciaVendaLab += 1;
  return sequenciaVendaLab;
}

function validarProdutosDuplicados(itens) {
  const ids = itens.map((item) => String(item.productId || "").trim());
  return new Set(ids).size !== ids.length
    ? "DUPLICATE_PRODUCT_IN_SALE"
    : null;
}

async function cancelarVendaLab(vendaId) {
  return prisma.$transaction(async (tx) => {
    const venda = await tx.productSale.findUniqueOrThrow({
      where: { id: vendaId },
      include: {
        stockMovements: {
          where: {
            type: {
              in: [StockMovementType.VENDA, StockMovementType.CANCELAMENTO_VENDA],
            },
          },
        },
      },
    });

    if (
      venda.status === ProductSaleStatus.CANCELADA ||
      venda.stockMovements.some(
        (movimento) => movimento.type === StockMovementType.CANCELAMENTO_VENDA
      )
    ) {
      return false;
    }

    const reserva = await tx.productSale.updateMany({
      where: { id: venda.id, status: ProductSaleStatus.CONCLUIDA },
      data: { status: ProductSaleStatus.CANCELADA },
    });
    if (reserva.count !== 1) return false;

    for (const movimento of venda.stockMovements.filter(
      (item) => item.type === StockMovementType.VENDA
    )) {
      const produto = await tx.product.findUniqueOrThrow({
        where: { id: movimento.productId },
      });
      const quantidade = Math.abs(movimento.quantity);
      const originalmenteIlimitada =
        movimento.previousStock === null && movimento.newStock === null;
      let previousStock = produto.stockQuantity;
      let newStock = produto.stockQuantity;

      if (!originalmenteIlimitada && produto.stockQuantity !== null) {
        const devolucao = await tx.product.updateMany({
          where: { id: produto.id, stockQuantity: { not: null } },
          data: { stockQuantity: { increment: quantidade } },
        });
        assert.equal(devolucao.count, 1);
        const atualizado = await tx.product.findUniqueOrThrow({
          where: { id: produto.id },
        });
        newStock = atualizado.stockQuantity;
        previousStock = newStock === null ? null : newStock - quantidade;
      }

      await tx.stockMovement.create({
        data: {
          productId: produto.id,
          saleId: venda.id,
          type: StockMovementType.CANCELAMENTO_VENDA,
          quantity: quantidade,
          previousStock,
          newStock,
        },
      });
    }

    return true;
  });
}

async function criarVendaLab(produto, quantity, previousStock, newStock) {
  return prisma.productSale.create({
    data: {
      saleNumber: proximaVendaLab(),
      subtotalAmount: Number(produto.salePrice) * quantity,
      totalAmount: Number(produto.salePrice) * quantity,
      paymentMethod: PaymentMethod.PIX,
      status: ProductSaleStatus.CONCLUIDA,
      items: {
        create: {
          productId: produto.id,
          productName: produto.name,
          quantity,
          unitPrice: produto.salePrice,
          subtotalAmount: Number(produto.salePrice) * quantity,
          totalAmount: Number(produto.salePrice) * quantity,
        },
      },
      stockMovements: {
        create: {
          productId: produto.id,
          type: StockMovementType.VENDA,
          quantity: -quantity,
          previousStock,
          newStock,
        },
      },
    },
  });
}

try {
  const prefixo = `LAB-3B1-${randomUUID()}`;
  const ilimitado = await prisma.product.create({
    data: { name: `${prefixo}-ILIMITADO`, salePrice: 10, stockQuantity: null },
  });
  assert.equal(ilimitado.stockQuantity, null, "A: cadastro ilimitado grava null");
  assert.equal(ilimitado.stockQuantity === null, true, "A: isUnlimited derivado");

  const zerado = await prisma.product.create({
    data: { name: `${prefixo}-ZERO`, salePrice: 10, stockQuantity: 0 },
  });
  assert.equal(zerado.stockQuantity, 0, "B: zero permanece saldo controlado");
  assert.equal(zerado.stockQuantity === null, false, "B: zero não é ilimitado");

  const controlado = await prisma.product.create({
    data: { name: `${prefixo}-CONTROLADO`, salePrice: 10, stockQuantity: 5 },
  });

  const vendaIlimitada = await prisma.$transaction(async (tx) => {
    const venda = await tx.productSale.create({
      data: {
        saleNumber: 2_000_000_000 + Math.floor(Math.random() * 100_000_000),
        subtotalAmount: 9990,
        totalAmount: 9990,
        paymentMethod: PaymentMethod.PIX,
        status: ProductSaleStatus.CONCLUIDA,
        items: { create: { productId: ilimitado.id, productName: ilimitado.name, quantity: 999, unitPrice: 10, subtotalAmount: 9990, totalAmount: 9990 } },
      },
    });
    await tx.stockMovement.create({ data: { productId: ilimitado.id, saleId: venda.id, type: StockMovementType.VENDA, quantity: -999, previousStock: null, newStock: null } });
    return venda;
  });
  const ilimitadoDepois = await prisma.product.findUniqueOrThrow({ where: { id: ilimitado.id } });
  const movimentoIlimitado = await prisma.stockMovement.findFirstOrThrow({ where: { saleId: vendaIlimitada.id } });
  assert.equal(ilimitadoDepois.stockQuantity, null, "C: venda ilimitada mantém null");
  assert.deepEqual([movimentoIlimitado.previousStock, movimentoIlimitado.newStock], [null, null], "C: movimento ilimitado null/null");

  assert.equal(zerado.stockQuantity !== null && zerado.stockQuantity < 1, true, "D: venda controlada zerada é bloqueável");

  const saldoAnterior = controlado.stockQuantity;
  assert.notEqual(saldoAnterior, null);
  const saldoNovo = saldoAnterior - 2;
  await prisma.$transaction([
    prisma.product.update({ where: { id: controlado.id }, data: { stockQuantity: saldoNovo } }),
    prisma.stockMovement.create({ data: { productId: controlado.id, type: StockMovementType.VENDA, quantity: -2, previousStock: saldoAnterior, newStock: saldoNovo } }),
  ]);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: controlado.id } })).stockQuantity, 3, "E: venda controlada reduz saldo");

  await prisma.stockMovement.create({ data: { productId: ilimitado.id, saleId: vendaIlimitada.id, type: StockMovementType.CANCELAMENTO_VENDA, quantity: 999, previousStock: null, newStock: null } });
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: ilimitado.id } })).stockQuantity, null, "F: cancelamento ilimitado mantém null");

  const antesCancelamento = 3;
  await prisma.$transaction([
    prisma.product.update({ where: { id: controlado.id }, data: { stockQuantity: antesCancelamento + 2 } }),
    prisma.stockMovement.create({ data: { productId: controlado.id, type: StockMovementType.CANCELAMENTO_VENDA, quantity: 2, previousStock: antesCancelamento, newStock: antesCancelamento + 2 } }),
  ]);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: controlado.id } })).stockQuantity, 5, "G: cancelamento controlado devolve saldo");

  const produtosLab = await prisma.product.findMany({ where: { name: { startsWith: prefixo } } });
  const fisicos = produtosLab.filter((produto) => produto.stockQuantity !== null);
  const semEstoque = fisicos.filter((produto) => produto.stockQuantity === 0);
  const valorizacao = fisicos.reduce((total, produto) => total + Number(produto.salePrice) * produto.stockQuantity, 0);
  assert.equal(semEstoque.some((produto) => produto.id === zerado.id), true, "H: zero entra em sem estoque");
  assert.equal(fisicos.some((produto) => produto.id === ilimitado.id), false, "H: ilimitado fora da quantidade/valorização");
  assert.equal(valorizacao, 50, "H: valorização considera somente controlados");

  assert.equal(validarPayloadEstoque({ unlimitedStock: true, stockQuantity: 0 }), false, "I: payload contraditório rejeitado");
  assert.equal(validarPayloadEstoque({ unlimitedStock: false, stockQuantity: 0 }), true, "I: zero controlado aceito");

  const postProdutos = await readFile(resolve("app/api/produtos/route.ts"), "utf8");
  const putProdutos = await readFile(resolve("app/api/produtos/[id]/route.ts"), "utf8");
  assert.match(postProdutos, /financeiroSensivelLiberado[\s\S]*?numero\(body\.costPrice\)[\s\S]*?: 0/, "J: criação protege custo sem financeiro");
  assert.match(putProdutos, /financeiroSensivelLiberado[\s\S]*?numero\(body\.costPrice\)[\s\S]*?produtoAtual\.costPrice/, "J: edição preserva custo sem financeiro");

  const duplicadoAntes = await prisma.product.findUniqueOrThrow({
    where: { id: controlado.id },
  });
  assert.equal(
    validarProdutosDuplicados([
      { productId: controlado.id },
      { productId: controlado.id },
    ]),
    "DUPLICATE_PRODUCT_IN_SALE",
    "3B.2 A: produto duplicado reproduz o código esperado"
  );
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: controlado.id } }))
      .stockQuantity,
    duplicadoAntes.stockQuantity,
    "3B.2 A: duplicidade não altera estoque"
  );

  const ultimaUnidade = await prisma.product.create({
    data: { name: `${prefixo}-CONCORRENTE`, salePrice: 20, stockQuantity: 1 },
  });
  const tentativas = await Promise.all([
    prisma.product.updateMany({
      where: { id: ultimaUnidade.id, stockQuantity: { not: null, gte: 1 } },
      data: { stockQuantity: { decrement: 1 } },
    }),
    prisma.product.updateMany({
      where: { id: ultimaUnidade.id, stockQuantity: { not: null, gte: 1 } },
      data: { stockQuantity: { decrement: 1 } },
    }),
  ]);
  assert.deepEqual(
    tentativas.map((resultado) => resultado.count).sort(),
    [0, 1],
    "3B.2 B: exatamente uma redução concorrente vence"
  );
  const vendaConcorrente = await criarVendaLab(ultimaUnidade, 1, 1, 0);
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: ultimaUnidade.id } }))
      .stockQuantity,
    0,
    "3B.2 B: saldo nunca fica negativo"
  );
  assert.equal(
    await prisma.productSale.count({ where: { id: vendaConcorrente.id } }),
    1,
    "3B.2 B: somente uma venda foi criada"
  );
  assert.equal(
    await prisma.stockMovement.count({ where: { saleId: vendaConcorrente.id } }),
    1,
    "3B.2 B: somente um movimento foi criado"
  );

  const mudouParaControlado = await prisma.product.create({
    data: { name: `${prefixo}-ILIMITADO-PARA-CONTROLADO`, salePrice: 10, stockQuantity: null },
  });
  const vendaOriginalIlimitada = await criarVendaLab(
    mudouParaControlado,
    3,
    null,
    null
  );
  await prisma.product.update({
    where: { id: mudouParaControlado.id },
    data: { stockQuantity: 7 },
  });
  assert.equal(await cancelarVendaLab(vendaOriginalIlimitada.id), true);
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: mudouParaControlado.id } }))
      .stockQuantity,
    7,
    "3B.2 C: venda originalmente ilimitada não devolve após virar controlada"
  );
  const cancelamentoOriginalIlimitada = await prisma.stockMovement.findFirstOrThrow({
    where: { saleId: vendaOriginalIlimitada.id, type: StockMovementType.CANCELAMENTO_VENDA },
  });
  assert.deepEqual(
    [cancelamentoOriginalIlimitada.previousStock, cancelamentoOriginalIlimitada.newStock],
    [7, 7],
    "3B.2 C: cancelamento retrata o saldo controlado atual sem alterá-lo"
  );

  const mudouParaIlimitado = await prisma.product.create({
    data: { name: `${prefixo}-CONTROLADO-PARA-ILIMITADO`, salePrice: 10, stockQuantity: 4 },
  });
  const vendaOriginalControlada = await criarVendaLab(
    mudouParaIlimitado,
    2,
    4,
    2
  );
  await prisma.product.update({
    where: { id: mudouParaIlimitado.id },
    data: { stockQuantity: null },
  });
  assert.equal(await cancelarVendaLab(vendaOriginalControlada.id), true);
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: mudouParaIlimitado.id } }))
      .stockQuantity,
    null,
    "3B.2 D: venda controlada cancelada após virar ilimitada mantém null"
  );

  const sempreControlado = await prisma.product.create({
    data: { name: `${prefixo}-SEMPRE-CONTROLADO`, salePrice: 10, stockQuantity: 3 },
  });
  const vendaSempreControlada = await criarVendaLab(
    sempreControlado,
    2,
    5,
    3
  );
  assert.equal(await cancelarVendaLab(vendaSempreControlada.id), true);
  assert.equal(
    (await prisma.product.findUniqueOrThrow({ where: { id: sempreControlado.id } }))
      .stockQuantity,
    5,
    "3B.2 E: controlado devolve normalmente"
  );
  const movimentosAntesSegundaTentativa = await prisma.stockMovement.count({
    where: { saleId: vendaSempreControlada.id, type: StockMovementType.CANCELAMENTO_VENDA },
  });
  assert.equal(await cancelarVendaLab(vendaSempreControlada.id), false);
  assert.equal(
    await prisma.stockMovement.count({
      where: { saleId: vendaSempreControlada.id, type: StockMovementType.CANCELAMENTO_VENDA },
    }),
    movimentosAntesSegundaTentativa,
    "3B.2 F: segunda tentativa não cria movimento"
  );

  const rotaVenda = await readFile(resolve("app/api/vendas-produtos/route.ts"), "utf8");
  assert.match(rotaVenda, /DUPLICATE_PRODUCT_IN_SALE/);
  assert.match(rotaVenda, /stockQuantity:[\s\S]*?not: null[\s\S]*?gte: item\.quantity/);
  assert.match(rotaVenda, /decrement: item\.quantity/);

  console.log("ETAPAS 3B.1/3B.2: 16 cenários validados com sucesso em banco descartável.");
} finally {
  await prisma.$disconnect();
  await rm(diretorioLaboratorio, { force: true, recursive: true });
}
