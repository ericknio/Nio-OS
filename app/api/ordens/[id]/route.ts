import { NextResponse } from "next/server";
import { EquipmentType, OrderStatus, PaymentMethod } from "@prisma/client";
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

function calcularTotal(partsCost: number, laborCost: number, discount: number) {
  return Math.max(partsCost + laborCost - discount, 0);
}

function textoOuNulo(valor: unknown, limite = 1000) {
  const texto = String(valor || "")
    .trim()
    .slice(0, limite);

  return texto || null;
}

function textoObrigatorio(valor: unknown, limite = 1000) {
  return String(valor || "")
    .trim()
    .slice(0, limite);
}

function numeroSeguro(valor: unknown) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? Math.max(numero, 0) : 0;
}

function nomeOperador(usuario: UsuarioSessao | null | undefined) {
  return usuario?.name?.trim() || usuario?.username?.trim() || "Sistema";
}

function dataOuNulo(valor: unknown) {
  if (!valor) return null;

  const data = new Date(String(valor));

  if (Number.isNaN(data.getTime())) return "INVALIDA" as const;

  return data;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.ver");

    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;

    const ordem = await prisma.serviceOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        histories: { orderBy: { createdAt: "desc" } },
        finalization: true,
        attachments: { orderBy: { createdAt: "desc" } },
        payments: { orderBy: { createdAt: "desc" } },
        technicalParts: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            technicalPartId: true,
            partNameSnapshot: true,
            partSkuSnapshot: true,
            unitPriceSnapshot: true,
            quantity: true,
            totalPriceSnapshot: true,
            state: true,
            consumedAt: true,
            reversedAt: true,
            responsibleUserNameSnapshot: true,
            technicalPart: {
              select: {
                version: true,
              },
            },
          },
        },
      },
    });

    if (!ordem) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json(ordem);
  } catch (error) {
    console.error("Erro ao buscar ordem:", error);

    return NextResponse.json(
      { message: "Erro ao buscar ordem." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.editar");

    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { message: "Dados inválidos para editar a OS." },
        { status: 400 }
      );
    }

    const userName = nomeOperador(acesso.usuario);
    const customerId = textoObrigatorio(body.customerId, 80);

    if (!customerId) {
      return NextResponse.json(
        { message: "Selecione um cliente." },
        { status: 400 }
      );
    }

    const equipamentoRecebido = textoObrigatorio(
      body.equipmentType,
      40
    ) as EquipmentType;

    if (!Object.values(EquipmentType).includes(equipamentoRecebido)) {
      return NextResponse.json(
        { message: "Tipo de equipamento inválido." },
        { status: 400 }
      );
    }

    if (
      equipamentoRecebido === EquipmentType.OUTRO &&
      !textoObrigatorio(body.equipmentOther, 120)
    ) {
      return NextResponse.json(
        { message: "Informe qual é o equipamento." },
        { status: 400 }
      );
    }

    const reportedDefect = textoObrigatorio(body.reportedDefect, 4000);

    if (!reportedDefect) {
      return NextResponse.json(
        { message: "Informe o defeito relatado pelo cliente." },
        { status: 400 }
      );
    }

    const [ordemExistente, clienteExiste] = await Promise.all([
      prisma.serviceOrder.findUnique({
        where: { id },
        include: {
          finalization: true,
          payments: true,
          attachments: true,
        },
      }),
      prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      }),
    ]);

    if (!clienteExiste) {
      return NextResponse.json(
        { message: "Cliente selecionado não encontrado." },
        { status: 404 }
      );
    }

    if (!ordemExistente) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    if (ordemExistente.status === OrderStatus.CANCELADO) {
      return NextResponse.json(
        {
          message:
            "Não é possível editar uma OS cancelada. Reabra a OS primeiro.",
        },
        { status: 400 }
      );
    }

    if (
      ordemExistente.status === OrderStatus.ENTREGUE ||
      ordemExistente.finalization
    ) {
      return NextResponse.json(
        {
          message:
            "Não é possível editar uma OS finalizada/entregue. Reabra a OS primeiro.",
        },
        { status: 400 }
      );
    }

    const statusRecebido = textoObrigatorio(
      body.status || ordemExistente.status,
      40
    ) as OrderStatus;

    if (!Object.values(OrderStatus).includes(statusRecebido)) {
      return NextResponse.json(
        { message: "Status inválido." },
        { status: 400 }
      );
    }

    const statusPermitidosNaEdicao: OrderStatus[] = [
      OrderStatus.RECEBIDO,
      OrderStatus.EM_ANALISE,
      OrderStatus.AGUARDANDO_PECA,
      OrderStatus.EM_REPARO,
    ];

    const statusEhMesmoAtual = statusRecebido === ordemExistente.status;

    if (
      !statusEhMesmoAtual &&
      !statusPermitidosNaEdicao.includes(statusRecebido)
    ) {
      return NextResponse.json(
        {
          message:
            "Status inválido para edição. Use o status rápido para PRONTO, a finalização para ENTREGUE e a tela de cancelamento para CANCELADO.",
        },
        { status: 400 }
      );
    }

    if (ordemExistente.status === OrderStatus.PRONTO && !statusEhMesmoAtual) {
      return NextResponse.json(
        {
          message:
            "Esta OS está PRONTA. Para alterar o status, use o status rápido.",
        },
        { status: 400 }
      );
    }

    const statusParaSalvar = statusEhMesmoAtual
      ? ordemExistente.status
      : statusRecebido;

    const partsCost = numeroSeguro(body.partsCost);
    const laborCost = numeroSeguro(body.laborCost);
    const discount = numeroSeguro(body.discount);
    const totalAmount = calcularTotal(partsCost, laborCost, discount);

    let paymentMethod = ordemExistente.paymentMethod;

    const paymentMethodRecebido = textoObrigatorio(
      body.paymentMethod || "AGUARDANDO_PAGAMENTO",
      40
    ) as PaymentMethod;

      if (!Object.values(PaymentMethod).includes(paymentMethodRecebido)) {
        return NextResponse.json(
          { message: "Forma de pagamento inválida." },
          { status: 400 }
        );
      }

    paymentMethod = paymentMethodRecebido;

    const expectedDeliveryDate = dataOuNulo(body.expectedDeliveryDate);

    if (expectedDeliveryDate === "INVALIDA") {
      return NextResponse.json(
        { message: "Data prevista para entrega inválida." },
        { status: 400 }
      );
    }

    let technicianUserId: string | null = ordemExistente.technicianUserId;
    let technicianResponsible: string | null =
      ordemExistente.technicianResponsible;
    let technicianProfitPercentSnapshot: number | null =
      ordemExistente.technicianProfitPercentSnapshot !== null
        ? Number(ordemExistente.technicianProfitPercentSnapshot)
        : null;

    if ("technicianUserId" in body) {
      const reqTechId = body.technicianUserId
        ? String(body.technicianUserId).trim()
        : null;

      if (reqTechId) {
        const tecnico = await prisma.systemUser.findUnique({
          where: { id: reqTechId },
          select: {
            id: true,
            name: true,
            profitShareEnabled: true,
            profitSharePercent: true,
          },
        });

        if (tecnico) {
          technicianUserId = tecnico.id;
          technicianResponsible = tecnico.name.trim();
          technicianProfitPercentSnapshot = tecnico.profitShareEnabled
            ? Number(tecnico.profitSharePercent || 0)
            : 0;
        } else {
          technicianUserId = null;
          technicianResponsible = null;
          technicianProfitPercentSnapshot = null;
        }
      } else {
        technicianUserId = null;
        technicianResponsible = null;
        technicianProfitPercentSnapshot = null;
      }
    }

    const ordem = await prisma.serviceOrder.update({
      where: { id },
      data: {
        customerId,
        equipmentType: equipamentoRecebido,
        equipmentOther:
          equipamentoRecebido === EquipmentType.OUTRO
            ? textoOuNulo(body.equipmentOther, 120)
            : null,
        brand: textoOuNulo(body.brand, 120),
        model: textoOuNulo(body.model, 120),
        serialNumber: textoOuNulo(body.serialNumber, 120),
        imei: textoOuNulo(body.imei, 80),
        devicePassword: textoOuNulo(body.devicePassword, 120),
        deliveredAccessories: textoOuNulo(body.deliveredAccessories, 2000),
        reportedDefect,
        technicalNotes: textoOuNulo(body.technicalNotes, 4000),
        requiredParts: textoOuNulo(body.requiredParts, 2000),
        partsCost,
        laborCost,
        discount,
        totalAmount,
        paymentMethod,
        status: statusParaSalvar,
        expectedDeliveryDate,
        technicianUserId,
        technicianResponsible,
        technicianProfitPercentSnapshot,
        histories: {
          create: {
            userName,
            action: "EDICAO_OS",
            description: "Ordem de serviço editada.",
          },
        },
      },
      include: {
        customer: true,
        histories: { orderBy: { createdAt: "desc" } },
        finalization: true,
        attachments: { orderBy: { createdAt: "desc" } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    return NextResponse.json(ordem);
  } catch (error) {
    console.error("Erro ao editar ordem:", error);

    return NextResponse.json(
      { message: "Erro ao editar ordem de serviço." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.cancelar");

    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;

    const ordemExistente = await prisma.serviceOrder.findUnique({
      where: { id },
      include: {
        finalization: true,
        payments: true,
        attachments: true,
      },
    });

    if (!ordemExistente) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    const temPagamento =
      ordemExistente.payments.length > 0 ||
      numeroSeguro(ordemExistente.paidAmount) > 0 ||
      numeroSeguro(ordemExistente.paymentPercent) > 0;

    const temFinalizacao =
      ordemExistente.status === OrderStatus.ENTREGUE ||
      Boolean(ordemExistente.finalization);

    const temAnexo = ordemExistente.attachments.length > 0;

    if (temPagamento || temFinalizacao || temAnexo) {
      return NextResponse.json(
        {
          message:
            "Esta OS possui pagamento, finalização ou anexo. Por segurança, ela não pode ser excluída definitivamente. Use Cancelar OS.",
        },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.serviceOrderInternalNote.deleteMany({
        where: { serviceOrderId: id },
      }),
      prisma.orderHistory.deleteMany({
        where: { serviceOrderId: id },
      }),
      prisma.serviceOrder.delete({
        where: { id },
      }),
    ]);

    return NextResponse.json({
      message: "Ordem excluída com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao excluir ordem:", error);

    return NextResponse.json(
      { message: "Erro ao excluir ordem de serviço." },
      { status: 500 }
    );
  }
}
