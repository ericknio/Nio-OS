import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
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

function nomeOperador(usuario: UsuarioSessao | null | undefined) {
  return usuario?.name?.trim() || usuario?.username?.trim() || "Sistema";
}

function podeVerDadosPagamento(usuario: UsuarioSessao | null | undefined) {
  if (!usuario) return false;

  return usuarioTemPermissao(usuario, [
    "pagamentos.ver",
    "pagamentos.registrar",
    "relatorios.financeiro",
  ]);
}

function ocultarDadosPagamentoDaOrdem(ordem: any, mostrarPagamentos: boolean) {
  if (mostrarPagamentos) return ordem;

  return {
    ...ordem,
    paidAmount: null,
    paymentPercent: null,
    paymentReceivedAt: null,
    paymentMethod: null,
    payments: [],
    finalization: ordem.finalization
      ? {
          ...ordem.finalization,
          finalAmount: null,
          paymentMethod: null,
        }
      : null,
  };
}

export async function PATCH(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.reabrir");

    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;
    const userName = nomeOperador(acesso.usuario);

    const ordemExistente = await prisma.serviceOrder.findUnique({
      where: { id },
      include: { finalization: true },
    });

    if (!ordemExistente) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    const estaFinalizada =
      ordemExistente.status === OrderStatus.ENTREGUE ||
      Boolean(ordemExistente.finalization);

    const estaCancelada = ordemExistente.status === OrderStatus.CANCELADO;

    if (!estaFinalizada && !estaCancelada) {
      return NextResponse.json(
        { message: "Esta OS já está aberta." },
        { status: 400 }
      );
    }

    const ordem = await prisma.$transaction(async (tx) => {
      if (ordemExistente.finalization) {
        await tx.orderFinalization.deleteMany({
          where: { serviceOrderId: id },
        });
      }

      return tx.serviceOrder.update({
        where: { id },
        data: {
          status: OrderStatus.RECEBIDO,
          finalizedAt: null,
          histories: {
            create: {
              userName,
              action: "REABERTURA_OS",
              description:
                "Ordem de serviço reaberta. Finalização removida e status alterado para Recebido.",
            },
          },
        },
        include: {
          customer: true,
          histories: { orderBy: { createdAt: "desc" } },
          finalization: true,
          attachments: true,
          payments: { orderBy: { createdAt: "desc" } },
        },
      });
    });

    return NextResponse.json(
      ocultarDadosPagamentoDaOrdem(ordem, podeVerDadosPagamento(acesso.usuario))
    );
  } catch (error) {
    console.error("Erro ao reabrir OS:", error);

    return NextResponse.json(
      { message: "Erro ao reabrir ordem de serviço." },
      { status: 500 }
    );
  }
}
