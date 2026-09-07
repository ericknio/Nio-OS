// lib/numeroSequencial.ts
import { prisma } from "@/lib/prisma";

type ServiceOrderCounterDelegate = {
  findFirst(args: {
    orderBy: { osNumber: "desc" };
    select: { osNumber: true };
  }): Promise<{ osNumber: number | null } | null>;
};

type ProductSaleCounterDelegate = {
  findFirst(args: {
    orderBy: { saleNumber: "desc" };
    select: { saleNumber: true };
  }): Promise<{ saleNumber: number | null } | null>;
};

type BancoSequencial = {
  serviceOrder: ServiceOrderCounterDelegate;
  productSale: ProductSaleCounterDelegate;
};

const bancoPadrao = prisma as unknown as BancoSequencial;

function numeroSequencial(valor: unknown) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

export async function proximoNumeroOS(
  tx: Pick<BancoSequencial, "serviceOrder"> = bancoPadrao
) {
  const ultima = await tx.serviceOrder.findFirst({
    orderBy: { osNumber: "desc" },
    select: { osNumber: true },
  });

  return numeroSequencial(ultima?.osNumber) + 1;
}

export async function gerarProximoNumeroOS(
  tx?: Pick<BancoSequencial, "serviceOrder">
) {
  return proximoNumeroOS(tx ?? bancoPadrao);
}

export async function proximoNumeroVendaProduto(
  tx: Pick<BancoSequencial, "productSale"> = bancoPadrao
) {
  const ultima = await tx.productSale.findFirst({
    orderBy: { saleNumber: "desc" },
    select: { saleNumber: true },
  });

  return numeroSequencial(ultima?.saleNumber) + 1;
}

export async function gerarProximoNumeroVendaProduto(
  tx?: Pick<BancoSequencial, "productSale">
) {
  return proximoNumeroVendaProduto(tx ?? bancoPadrao);
}

export async function gerarProximoNumeroVenda(
  tx?: Pick<BancoSequencial, "productSale">
) {
  return proximoNumeroVendaProduto(tx ?? bancoPadrao);
}

export async function executarComRetrySequencial<T>(
  operacao: () => Promise<T>,
  maxTentativas = 3
): Promise<T> {
  let tentativa = 0;
  while (tentativa < maxTentativas) {
    try {
      return await operacao();
    } catch (erro: unknown) {
      tentativa++;
      const erroPrisma = erro as { code?: string; message?: string };
      const isUniqueCollision =
        erroPrisma?.code === "P2002" ||
        String(erroPrisma?.message || "").includes("UNIQUE constraint failed");

      if (isUniqueCollision && tentativa < maxTentativas) {
        const espera = Math.floor(Math.random() * 40) + 10;
        await new Promise((resolve) => setTimeout(resolve, espera));
        continue;
      }
      throw erro;
    }
  }
  throw new Error("FALHA_CONCORRENCIA_SEQUENCIAL");
}
