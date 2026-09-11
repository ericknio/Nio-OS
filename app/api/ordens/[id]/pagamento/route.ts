/**
 * @file route.ts
 * @description Endpoint de gerenciamento e recebimento de pagamentos de uma Ordem de Serviço (`/api/ordens/[id]/pagamento`).
 * Suporta pagamentos fracionados (parciais) ou integrais, valida percentuais acumulados até 100%,
 * aplica bloqueio de concorrência otimista (OCC), registra em `ServiceOrderPayment` e gera eventos no histórico.
 */

import { NextResponse } from "next/server";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolverOperadorPadrao } from "@/lib/operadorSistema";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/** Formas de pagamento aceitas para liquidação de Ordens de Serviço. */
const formasPagamentoPermitidas: PaymentMethod[] = [
  PaymentMethod.DINHEIRO,
  PaymentMethod.PIX,
  PaymentMethod.CARTAO,
  PaymentMethod.PARCELADO,
];

/** Mapeamento textual amigável das formas de pagamento. */
const nomesPagamento: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO: "Cartão",
  PARCELADO: "Parcelado",
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
};

/**
 * Converte valor numérico para padrão monetário BRL.
 * @param valor - Quantia monetária
 * @returns String formatada (R$)
 */
function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Converte string ou número em percentual numérico com suporte a vírgula decimal.
 * @param valor - Dado bruto
 * @returns Número percentual float
 */
function numeroPercentual(valor: unknown) {
  const numero = Number(String(valor ?? "").replace(",", "."));

  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Limita o tamanho do texto prevenindo estouros no banco.
 * @param valor - Dado de entrada
 * @param limite - Tamanho máximo (default: 500)
 * @returns String limitada ou null se vazia
 */
function limitarTexto(valor: unknown, limite = 500) {
  const texto = String(valor || "").trim();

  return texto ? texto.slice(0, limite) : null;
}

/**
 * Extrai o nome do operador autenticado na sessão.
 * @param usuario - Dados da sessão
 * @returns Nome limpo do usuário
 */
function nomeOperadorUsuario(usuario: unknown) {
  const dados = usuario as {
    name?: string | null;
    username?: string | null;
  } | null;

  return String(dados?.name || dados?.username || "").trim();
}

/**
 * Lista todos os recebimentos registrados para a Ordem de Serviço informada.
 * Exige permissão financeira ('pagamentos.ver', 'pagamentos.registrar' ou 'relatorios.financeiro').
 * 
 * @param _request - Requisição HTTP recebida
 * @param context - Parâmetros da rota contendo `id` da OS
 * @returns JSON com array de pagamentos ordenados do mais recente ao mais antigo
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi([
      "pagamentos.ver",
      "pagamentos.registrar",
      "relatorios.financeiro",
    ]);

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await context.params;

    const pagamentos = await prisma.serviceOrderPayment.findMany({
      where: {
        serviceOrderId: id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(pagamentos);
  } catch (error) {
    console.error("Erro ao buscar pagamentos:", error);

    return NextResponse.json(
      { message: "Erro ao buscar pagamentos." },
      { status: 500 }
    );
  }
}

/**
 * Registra um pagamento (parcial ou total) para a Ordem de Serviço.
 * 
 * Regras e concorrência:
 * - Valida se a OS não está cancelada, finalizada ou sem valor total.
 * - Garante que o percentual informado acumulado com pagamentos anteriores não ultrapasse 100%.
 * - Utiliza atualização com OCC (Optimistic Concurrency Control) via `updateMany` condicional ao percentual prévio.
 * - Cria registro individual em `ServiceOrderPayment` e gera evento no histórico.
 * - Exige permissão 'pagamentos.registrar'.
 * 
 * @param request - Requisição HTTP com JSON contendo `paymentMethod`, `paymentPercent` e `note`
 * @param context - Parâmetros da rota contendo `id` da OS
 * @returns JSON com a ordem atualizada e lista de pagamentos
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("pagamentos.registrar");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));

    const paymentMethodRecebido = String(body.paymentMethod || "")
      .trim()
      .toUpperCase();
    const paymentMethod = paymentMethodRecebido as PaymentMethod;

    const userName =
      nomeOperadorUsuario(acesso.usuario) || (await resolverOperadorPadrao(null));

    const note = limitarTexto(body.note);
    const paymentPercent = numeroPercentual(body.paymentPercent);

    if (!formasPagamentoPermitidas.includes(paymentMethod)) {
      return NextResponse.json(
        { message: "Forma de pagamento inválida." },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(paymentPercent) ||
      paymentPercent <= 0 ||
      paymentPercent > 100
    ) {
      return NextResponse.json(
        { message: "Informe um percentual entre 1% e 100%." },
        { status: 400 }
      );
    }

    const ordem = await prisma.$transaction(async (tx) => {
      const ordemExistente = await tx.serviceOrder.findUnique({
        where: {
          id,
        },
        include: {
          finalization: true,
        },
      });

      if (!ordemExistente) {
        throw new Error("ORDEM_NAO_ENCONTRADA");
      }

      if (ordemExistente.status === OrderStatus.CANCELADO) {
        throw new Error("ORDEM_CANCELADA");
      }

      if (
        ordemExistente.status === OrderStatus.ENTREGUE ||
        ordemExistente.finalization
      ) {
        throw new Error("ORDEM_FINALIZADA");
      }

      const totalAmount = Number(ordemExistente.totalAmount || 0);

      if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
        throw new Error("ORDEM_SEM_TOTAL_VALIDO");
      }

      const percentualJaPago = Number(ordemExistente.paymentPercent || 0);
      const valorJaPago = Number(ordemExistente.paidAmount || 0);

      if (percentualJaPago >= 100) {
        throw new Error("ORDEM_JA_PAGA");
      }

      const novoPercentualTotal = percentualJaPago + paymentPercent;

      if (novoPercentualTotal > 100) {
        throw new Error(`PAGAMENTO_EXCEDE_100:${percentualJaPago}`);
      }

      const valorPagamento = Number(
        ((totalAmount * paymentPercent) / 100).toFixed(2)
      );

      const novoValorPago = Number((valorJaPago + valorPagamento).toFixed(2));

      const tipoPagamento =
        novoPercentualTotal >= 100 ? "Pagamento total" : "Pagamento parcial";

      const atualizacao = await tx.serviceOrder.updateMany({
        where: {
          id,
          paymentPercent: percentualJaPago,
        },
        data: {
          paymentMethod,
          paymentPercent: novoPercentualTotal,
          paidAmount: novoValorPago,
          paymentReceivedAt: new Date(),
        },
      });

      if (atualizacao.count === 0) {
        throw new Error("CONCORRENCIA_DETECTADA");
      }

      await tx.serviceOrderPayment.create({
        data: {
          serviceOrderId: id,
          amount: valorPagamento,
          percent: paymentPercent,
          paymentMethod,
          note,
          userName,
        },
      });

      await tx.orderHistory.create({
        data: {
          serviceOrderId: id,
          userName,
          action:
            novoPercentualTotal >= 100
              ? "PAGAMENTO_TOTAL"
              : "PAGAMENTO_PARCIAL",
          description: `${tipoPagamento} registrado. Forma: ${
            nomesPagamento[paymentMethod] || paymentMethod
          }. Percentual deste pagamento: ${paymentPercent}%. Valor: ${formatarMoeda(
            valorPagamento
          )}. Total pago: ${novoPercentualTotal}%.`,
        },
      });

      return await tx.serviceOrder.findUnique({
        where: { id },
        include: {
          customer: true,
          histories: {
            orderBy: {
              createdAt: "desc",
            },
          },
          finalization: true,
          payments: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      });
    });

    if (!ordem) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json(ordem);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ORDEM_NAO_ENCONTRADA") {
        return NextResponse.json({ message: "Ordem não encontrada." }, { status: 404 });
      }
      if (error.message === "ORDEM_CANCELADA") {
        return NextResponse.json(
          { message: "Não é possível receber pagamento de uma OS cancelada." },
          { status: 400 }
        );
      }
      if (error.message === "ORDEM_FINALIZADA") {
        return NextResponse.json(
          {
            message:
              "Não é possível registrar pagamento em uma OS finalizada/entregue. Reabra a OS primeiro.",
          },
          { status: 400 }
        );
      }
      if (error.message === "ORDEM_SEM_TOTAL_VALIDO") {
        return NextResponse.json(
          { message: "A OS não possui valor total válido para receber pagamento." },
          { status: 400 }
        );
      }
      if (error.message === "ORDEM_JA_PAGA") {
        return NextResponse.json(
          { message: "Esta OS já está com pagamento completo." },
          { status: 400 }
        );
      }
      if (error.message.startsWith("PAGAMENTO_EXCEDE_100:")) {
        const jaPago = Number(error.message.split(":")[1] || 0);
        return NextResponse.json(
          {
            message: `Pagamento excede 100%. Já consta ${jaPago}% pago. Restante: ${
              100 - jaPago
            }%.`,
          },
          { status: 400 }
        );
      }
      if (error.message === "CONCORRENCIA_DETECTADA") {
        return NextResponse.json(
          {
            message:
              "Esta OS foi alterada simultaneamente por outro usuário. Por favor, recarregue a página.",
          },
          { status: 409 }
        );
      }
    }

    console.error("Erro ao registrar pagamento:", error);

    return NextResponse.json(
      { message: "Erro ao registrar pagamento." },
      { status: 500 }
    );
  }
}