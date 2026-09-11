/**
 * @file route.ts
 * @description Endpoint de finalização e entrega ao cliente de uma Ordem de Serviço (`/api/ordens/[id]/finalizar`).
 * Executa em transação atômica do Prisma:
 * 1. Valida se a ordem está no status PRONTO e possui técnico responsável definido.
 * 2. Cria o registro `OrderFinalization` com laudo de reparo, peças trocadas, garantia e recebedor.
 * 3. Quita eventual saldo financeiro restante criando um pagamento complementar automático.
 * 4. Altera o status da ordem para ENTREGUE e marca quitação em 100%.
 */

import { NextResponse } from "next/server";
import { OrderStatus, PaymentMethod, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  exigirPermissaoApi,
  usuarioTemPermissao,
} from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UsuarioSessao = NonNullable<Parameters<typeof usuarioTemPermissao>[0]>;

/**
 * Converte valor numérico com fallback seguro para zero.
 * @param valor - Dado de entrada
 * @returns Número finito ou zero
 */
function numeroSeguro(valor: unknown) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Trata e limita o tamanho de strings de texto prevenindo estouro de payload.
 * @param valor - Dado bruto
 * @param limite - Quantidade máxima de caracteres permitida
 * @returns String cortada
 */
function textoLimitado(valor: unknown, limite: number) {
  return String(valor || "")
    .trim()
    .slice(0, limite);
}

/**
 * Normaliza o nome do usuário autenticado para registro de histórico.
 * @param usuario - Dados do usuário logado
 * @returns Nome do operador ou 'Sistema'
 */
function nomeOperador(usuario: UsuarioSessao | null | undefined) {
  return usuario?.name?.trim() || usuario?.username?.trim() || "Sistema";
}

/**
 * Valida se uma data é legítima ou retorna a data atual / null em caso de valor inválido.
 * @param valor - Dado de data informado
 * @returns Instância de Date ou null se data inválida
 */
function dataValidaOuNula(valor: unknown) {
  if (!valor) return new Date();

  const data = new Date(String(valor));

  if (Number.isNaN(data.getTime())) return null;

  return data;
}

/**
 * Finaliza e registra a entrega da Ordem de Serviço ao cliente.
 * 
 * Requisitos operacionais e financeiros:
 * - Exige permissão 'ordens.finalizar' e 'pagamentos.registrar'.
 * - A OS deve estar previamente no status PRONTO com técnico responsável registrado.
 * - Criação de `OrderFinalization` com laudo de conserto, peças, prazo de garantia e recebedor.
 * - Registro automático de pagamento residual para atingir 100% de quitação.
 * - Atualização do status para ENTREGUE.
 * 
 * @param request - Requisição HTTP com JSON contendo `repairDescription`, `deliveredBy`, `finalAmount`, `paymentMethod`, `warrantyDays`, etc.
 * @param context - Parâmetros da rota contendo `id` da OS
 * @returns JSON com a ordem finalizada e termo de entrega gerado
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.finalizar");

    if (!acesso.ok) return acesso.response;

    if (!usuarioTemPermissao(acesso.usuario, "pagamentos.registrar")) {
      return NextResponse.json(
        {
          message:
            "Para finalizar uma OS com pagamento automático, o usuário precisa ter permissão para registrar pagamentos.",
        },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { message: "Dados inválidos para finalizar a OS." },
        { status: 400 }
      );
    }

    const operador = nomeOperador(acesso.usuario);
    const repairDescription = textoLimitado(body.repairDescription, 4000);
    const replacedParts = textoLimitado(body.replacedParts, 2000) || null;
    const deliveredBy = textoLimitado(body.deliveredBy, 120);
    const finalNotes = textoLimitado(body.finalNotes, 2000) || null;

    if (!repairDescription) {
      return NextResponse.json(
        { message: "Informe a descrição do reparo realizado." },
        { status: 400 }
      );
    }

    if (!deliveredBy) {
      return NextResponse.json(
        { message: "Informe quem entregou o aparelho ao cliente." },
        { status: 400 }
      );
    }

    const ordemExistente = await prisma.serviceOrder.findUnique({
      where: { id },
      include: {
        finalization: true,
        payments: true,
      },
    });

    if (!ordemExistente) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    if (ordemExistente.status === OrderStatus.CANCELADO) {
      return NextResponse.json(
        { message: "Não é possível finalizar uma OS cancelada." },
        { status: 400 }
      );
    }

    if (
      ordemExistente.status === OrderStatus.ENTREGUE ||
      ordemExistente.finalization
    ) {
      return NextResponse.json(
        { message: "Esta ordem já foi finalizada." },
        { status: 400 }
      );
    }

    if (ordemExistente.status !== OrderStatus.PRONTO) {
      return NextResponse.json(
        {
          message:
            "Para finalizar a OS, primeiro altere o status para PRONTO e informe o técnico responsável.",
        },
        { status: 400 }
      );
    }

    if (!ordemExistente.technicianResponsible?.trim()) {
      return NextResponse.json(
        {
          message:
            "Informe o técnico responsável pelo serviço antes de finalizar a OS.",
        },
        { status: 400 }
      );
    }

    const finalAmount = numeroSeguro(body.finalAmount);
    const warrantyDays = Math.round(numeroSeguro(body.warrantyDays ?? 90));
    const deliveredAt = dataValidaOuNula(body.deliveredAt);

    if (!deliveredAt) {
      return NextResponse.json(
        { message: "Informe uma data de entrega válida." },
        { status: 400 }
      );
    }

    const paymentMethodRecebido = String(
      body.paymentMethod || "AGUARDANDO_PAGAMENTO"
    ).trim();

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      return NextResponse.json(
        { message: "Informe um valor final válido para finalizar a OS." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(warrantyDays) || warrantyDays < 0) {
      return NextResponse.json(
        { message: "Informe uma garantia válida." },
        { status: 400 }
      );
    }

    if (
      !Object.values(PaymentMethod).includes(
        paymentMethodRecebido as PaymentMethod
      )
    ) {
      return NextResponse.json(
        { message: "Forma de pagamento inválida." },
        { status: 400 }
      );
    }

    if (paymentMethodRecebido === PaymentMethod.AGUARDANDO_PAGAMENTO) {
      return NextResponse.json(
        {
          message:
            "Selecione uma forma de pagamento real antes de finalizar. A OS finalizada será marcada como 100% paga.",
        },
        { status: 400 }
      );
    }

    const paymentMethod = paymentMethodRecebido as PaymentMethod;
    const agora = new Date();

    const valorJaPago = numeroSeguro(ordemExistente.paidAmount);
    const percentualJaPago = Math.min(
      Math.max(numeroSeguro(ordemExistente.paymentPercent), 0),
      100
    );

    const valorRestante = Number(
      Math.max(finalAmount - valorJaPago, 0).toFixed(2)
    );

    const percentualRestante = Math.max(100 - percentualJaPago, 0);

    const resultado = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const finalizacao = await tx.orderFinalization.create({
          data: {
            serviceOrderId: id,
            repairDescription,
            replacedParts,
            finalAmount,
            warrantyDays,
            deliveredAt,
            deliveredBy,
            paymentMethod,
            finalNotes,
          },
        });

        const historicos = [
          {
            userName: operador,
            action: "FINALIZACAO_OS",
            description: `Ordem de serviço finalizada e entregue ao cliente. Entregue por: ${deliveredBy}.`,
          },
          ...(valorRestante > 0
            ? [
                {
                  userName: operador,
                  action: "PAGAMENTO_AUTOMATICO",
                  description: `Pagamento restante registrado automaticamente na finalização da OS. Valor: ${valorRestante.toLocaleString(
                    "pt-BR",
                    {
                      style: "currency",
                      currency: "BRL",
                    }
                  )}.`,
                },
              ]
            : [
                {
                  userName: operador,
                  action: "PAGAMENTO_CONFIRMADO",
                  description:
                    "OS finalizada com pagamento já quitado anteriormente.",
                },
              ]),
        ];

        const ordem = await tx.serviceOrder.update({
          where: { id },
          data: {
            status: OrderStatus.ENTREGUE,
            finalizedAt: agora,
            totalAmount: finalAmount,
            paidAmount: finalAmount,
            paymentPercent: 100,
            paymentReceivedAt: agora,
            paymentMethod,
            ...(valorRestante > 0
              ? {
                  payments: {
                    create: {
                      amount: valorRestante,
                      percent: percentualRestante,
                      paymentMethod,
                      note: "Pagamento restante registrado automaticamente ao finalizar a OS.",
                      userName: operador,
                    },
                  },
                }
              : {}),
            histories: {
              create: historicos,
            },
          },
          include: {
            customer: true,
            finalization: true,
            payments: { orderBy: { createdAt: "desc" } },
            histories: { orderBy: { createdAt: "desc" } },
          },
        });

        return { ordem, finalizacao };
      }
    );

    return NextResponse.json({
      ordem: resultado.ordem,
      finalizacao: resultado.finalizacao,
    });
  } catch (error) {
    console.error("Erro ao finalizar ordem:", error);

    return NextResponse.json(
      { message: "Erro ao finalizar ordem de serviço." },
      { status: 500 }
    );
  }
}
