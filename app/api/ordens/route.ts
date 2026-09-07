import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  EquipmentType,
  OrderStatus,
  PaymentMethod,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { proximoNumeroOS } from "@/lib/numeroSequencial";
import {
  getTechnicalPartById,
  releaseTechnicalPartFromOrder,
  reserveTechnicalPartForOrder,
  StockDomainError,
  toFutureHttpError,
} from "@/lib/estoqueTecnico";
import { stockError, validationError } from "@/lib/estoqueTecnico/errors";
import {
  exigirPermissaoApi,
  usuarioTemPermissao,
} from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UsuarioSessao = NonNullable<Parameters<typeof usuarioTemPermissao>[0]>;

function calcularTotal(partsCost: number, laborCost: number, discount: number) {
  return Math.max(partsCost + laborCost - discount, 0);
}

function textoOuNulo(valor: unknown) {
  const texto = String(valor || "").trim();
  return texto || null;
}

function numeroSeguro(valor: unknown) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

function nomeOperador(usuario: UsuarioSessao) {
  return usuario.name?.trim() || usuario.username?.trim() || "Sistema";
}

function dataOuNulo(valor: unknown) {
  const texto = String(valor || "").trim();

  if (!texto) return null;

  const data = new Date(texto);

  return Number.isNaN(data.getTime()) ? null : data;
}

function statusInicialValido(valor: unknown): OrderStatus {
  const status = String(valor || "").trim().toUpperCase();

  if (status === OrderStatus.RECEBIDO) return OrderStatus.RECEBIDO;
  if (status === OrderStatus.EM_ANALISE) return OrderStatus.EM_ANALISE;
  if (status === OrderStatus.AGUARDANDO_PECA) {
    return OrderStatus.AGUARDANDO_PECA;
  }
  if (status === OrderStatus.EM_REPARO) return OrderStatus.EM_REPARO;

  return OrderStatus.RECEBIDO;
}

type PecaTecnicaCriacao = {
  technicalPartId: string;
  technicalPartVersion: number;
  quantity: number;
};

type PecaTecnicaAtual = PecaTecnicaCriacao & {
  name: string;
  brand: string | null;
  compatibleModel: string | null;
  defaultSalePrice: number;
};

function validarPecasTecnicas(valor: unknown): PecaTecnicaCriacao[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor)) {
    throw validationError("As peças técnicas informadas são inválidas.");
  }
  if (valor.length > 20) {
    throw validationError("Uma OS pode receber no máximo 20 peças técnicas na criação.");
  }

  const ids = new Set<string>();

  return valor.map((item, indice) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw validationError("Uma peça técnica informada é inválida.", {
        field: `technicalParts.${indice}`,
      });
    }

    const entrada = item as Record<string, unknown>;
    const permitidas = new Set([
      "technicalPartId",
      "technicalPartVersion",
      "quantity",
    ]);

    for (const chave of Object.keys(entrada)) {
      if (!permitidas.has(chave)) {
        throw validationError("A peça técnica possui campo não permitido.", {
          field: `technicalParts.${indice}.${chave}`,
        });
      }
    }

    const technicalPartId = String(entrada.technicalPartId || "").trim();
    const technicalPartVersion = Number(entrada.technicalPartVersion);
    const quantity = Number(entrada.quantity);

    if (!technicalPartId || technicalPartId.length > 191) {
      throw validationError("A identificação da peça técnica é inválida.");
    }
    if (!Number.isSafeInteger(technicalPartVersion) || technicalPartVersion < 0) {
      throw validationError("A versão da peça técnica é inválida.");
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw validationError("A quantidade da peça técnica é inválida.");
    }
    if (ids.has(technicalPartId)) {
      throw validationError("A mesma peça técnica não pode ser repetida na criação da OS.");
    }

    ids.add(technicalPartId);
    return { technicalPartId, technicalPartVersion, quantity };
  });
}

function carregarPecasTecnicasAtuais(
  entradas: PecaTecnicaCriacao[],
): PecaTecnicaAtual[] {
  return entradas.map((entrada) => {
    const atual = getTechnicalPartById(entrada.technicalPartId, {
      canViewFinancialData: false,
    }) as Record<string, unknown>;

    const version = Number(atual.version);
    const quantityOnHand =
      atual.quantityOnHand === null ? null : Number(atual.quantityOnHand);
    const quantityAvailable =
      atual.quantityAvailable === null ? null : Number(atual.quantityAvailable);

    if (atual.isActive !== true) {
      throw stockError(
        "TECHNICAL_PART_INACTIVE",
        409,
        "Uma das peças selecionadas está inativa.",
      );
    }
    if (version !== entrada.technicalPartVersion) {
      throw stockError(
        "VERSION_CONFLICT",
        409,
        "Uma das peças selecionadas foi alterada. Atualize a busca e tente novamente.",
      );
    }
    if (
      quantityOnHand !== null &&
      (quantityAvailable === null || quantityAvailable < entrada.quantity)
    ) {
      throw stockError(
        "INSUFFICIENT_AVAILABLE_STOCK",
        409,
        "O estoque disponível de uma das peças é insuficiente.",
      );
    }

    return {
      ...entrada,
      name: String(atual.name || "Peça técnica"),
      brand: atual.brand ? String(atual.brand) : null,
      compatibleModel: atual.compatibleModel
        ? String(atual.compatibleModel)
        : null,
      defaultSalePrice: Math.max(numeroSeguro(atual.defaultSalePrice), 0),
    };
  });
}

export async function GET(request: Request) {
  try {
    const acesso = await exigirPermissaoApi("ordens.ver");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { searchParams } = new URL(request.url);

    const busca = searchParams.get("busca")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const equipamento = searchParams.get("equipamento")?.trim() || "";

    const filtros: Prisma.ServiceOrderWhereInput[] = [];

    if (busca) {
      const buscaNumerica = Number(busca);
      const filtrosBusca: Prisma.ServiceOrderWhereInput[] = [
        {
          customer: {
            name: {
              contains: busca,
            },
          },
        },
        {
          brand: {
            contains: busca,
          },
        },
        {
          model: {
            contains: busca,
          },
        },
        {
          serialNumber: {
            contains: busca,
          },
        },
        {
          imei: {
            contains: busca,
          },
        },
      ];

      if (Number.isInteger(buscaNumerica) && buscaNumerica > 0) {
        filtrosBusca.push({
          osNumber: buscaNumerica,
        });
      }

      filtros.push({
        OR: filtrosBusca,
      });
    }

    if (status && Object.values(OrderStatus).includes(status as OrderStatus)) {
      filtros.push({
        status: status as OrderStatus,
      });
    }

    if (
      equipamento &&
      Object.values(EquipmentType).includes(equipamento as EquipmentType)
    ) {
      filtros.push({
        equipmentType: equipamento as EquipmentType,
      });
    }

    const where: Prisma.ServiceOrderWhereInput =
      filtros.length > 0
        ? {
            AND: filtros,
          }
        : {};

    const limiteParam = Number(searchParams.get("limite") || 300);
    const take =
      Number.isSafeInteger(limiteParam) && limiteParam > 0
        ? Math.min(limiteParam, 1000)
        : 300;

    const ordens = await prisma.serviceOrder.findMany({
      where,
      orderBy: {
        openedAt: "desc",
      },
      take,
      include: {
        customer: true,
      },
    });

    return NextResponse.json(ordens);
  } catch (error) {
    console.error("Erro ao buscar ordens:", error);

    return NextResponse.json(
      { message: "Erro ao buscar ordens." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirPermissaoApi("ordens.criar");

    if (!acesso.ok) {
      return acesso.response;
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { message: "Dados inválidos para criar OS." },
        { status: 400 }
      );
    }

    const userName = nomeOperador(acesso.usuario);

    if (!body.customerId) {
      return NextResponse.json(
        { message: "Selecione um cliente." },
        { status: 400 }
      );
    }

    if (!body.equipmentType) {
      return NextResponse.json(
        { message: "Selecione o tipo de equipamento." },
        { status: 400 }
      );
    }

    const equipamentoRecebido = String(
      body.equipmentType || ""
    ).trim() as EquipmentType;

    if (!Object.values(EquipmentType).includes(equipamentoRecebido)) {
      return NextResponse.json(
        { message: "Tipo de equipamento inválido." },
        { status: 400 }
      );
    }

    if (
      equipamentoRecebido === EquipmentType.OUTRO &&
      !String(body.equipmentOther || "").trim()
    ) {
      return NextResponse.json(
        { message: "Informe qual é o equipamento." },
        { status: 400 }
      );
    }

    if (!body.reportedDefect || String(body.reportedDefect).trim() === "") {
      return NextResponse.json(
        { message: "Informe o defeito relatado pelo cliente." },
        { status: 400 }
      );
    }

    const cliente = await prisma.customer.findUnique({
      where: {
        id: String(body.customerId),
      },
      select: {
        id: true,
      },
    });

    if (!cliente) {
      return NextResponse.json(
        { message: "Cliente não encontrado." },
        { status: 404 }
      );
    }

    const pecasTecnicasEntrada = validarPecasTecnicas(body.technicalParts);
    const pecasTecnicasAtuais =
      carregarPecasTecnicasAtuais(pecasTecnicasEntrada);

    const partsCost =
      pecasTecnicasAtuais.length > 0 ? 0 : numeroSeguro(body.partsCost);
    const laborCost = numeroSeguro(body.laborCost);
    const discount = numeroSeguro(body.discount);
    const totalAmount = calcularTotal(partsCost, laborCost, discount);

    const primeiraPeca = pecasTecnicasAtuais[0];
    const brand =
      textoOuNulo(body.brand) || textoOuNulo(primeiraPeca?.brand);
    const model =
      textoOuNulo(body.model) ||
      textoOuNulo(primeiraPeca?.compatibleModel);

    let paymentMethod: PaymentMethod = PaymentMethod.AGUARDANDO_PAGAMENTO;

    const paymentMethodRecebido = String(
      body.paymentMethod || PaymentMethod.AGUARDANDO_PAGAMENTO
    ).trim() as PaymentMethod;

      if (!Object.values(PaymentMethod).includes(paymentMethodRecebido)) {
        return NextResponse.json(
          { message: "Forma de pagamento inválida." },
          { status: 400 }
        );
      }

    paymentMethod = paymentMethodRecebido;

    const status = statusInicialValido(body.status);

    const technicianUserId = body.technicianUserId
      ? String(body.technicianUserId).trim()
      : null;
    let technicianResponsible: string | null = null;
    let technicianProfitPercentSnapshot: number | null = null;

    if (technicianUserId) {
      const tecnico = await prisma.systemUser.findUnique({
        where: { id: technicianUserId },
        select: {
          id: true,
          name: true,
          profitShareEnabled: true,
          profitSharePercent: true,
        },
      });
      if (tecnico) {
        technicianResponsible = tecnico.name.trim();
        technicianProfitPercentSnapshot = tecnico.profitShareEnabled
          ? Number(tecnico.profitSharePercent || 0)
          : 0;
      }
    }

    const ordem = await prisma.$transaction(async (tx) => {
      const osNumber = await proximoNumeroOS(tx);

      return tx.serviceOrder.create({
        data: {
          osNumber,
          customerId: String(body.customerId),

        equipmentType: equipamentoRecebido,
        equipmentOther:
          equipamentoRecebido === EquipmentType.OUTRO
            ? textoOuNulo(body.equipmentOther)
            : null,

        brand,
        model,
        serialNumber: textoOuNulo(body.serialNumber),
        imei: textoOuNulo(body.imei),
        devicePassword: textoOuNulo(body.devicePassword),

        deliveredAccessories: textoOuNulo(body.deliveredAccessories),
        reportedDefect: String(body.reportedDefect).trim(),
        technicalNotes: textoOuNulo(body.technicalNotes),
        requiredParts: textoOuNulo(body.requiredParts),
        technicianUserId: technicianResponsible ? technicianUserId : null,
        technicianResponsible,
        technicianProfitPercentSnapshot,

        partsCost,
        laborCost,
        discount,
        totalAmount,

        paidAmount: 0,
        paymentPercent: 0,
        paymentReceivedAt: null,

        paymentMethod,
        status,

        expectedDeliveryDate: dataOuNulo(body.expectedDeliveryDate),

        histories: {
          create: {
            userName,
            action: "CRIACAO_OS",
            description: "Ordem de serviço criada.",
          },
        },
      },
        include: {
          customer: true,
          histories: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      });
    });

    if (pecasTecnicasAtuais.length === 0) {
      return NextResponse.json(ordem, { status: 201 });
    }

    const reservadas: Array<{
      itemId: string;
      technicalPartId: string;
      quantity: number;
    }> = [];

    try {
      for (const peca of pecasTecnicasAtuais) {
        const resultado = reserveTechnicalPartForOrder(
          ordem.id,
          {
            technicalPartId: peca.technicalPartId,
            technicalPartVersion: peca.technicalPartVersion,
            quantity: peca.quantity,
            unitPrice: peca.defaultSalePrice,
            confirmReplaceLegacyPartsCost: false,
          },
          {
            operatorId: acesso.usuario.id || null,
            operatorName: userName,
            canViewFinancialData: false,
            idempotencyKey: randomUUID(),
          },
        );

        reservadas.push({
          itemId: resultado.item.id,
          technicalPartId: resultado.item.technicalPartId,
          quantity: resultado.item.quantity,
        });
      }
    } catch (errorReserva) {
      let compensacaoCompleta = true;

      for (const item of [...reservadas].reverse()) {
        try {
          const pecaAtual = getTechnicalPartById(item.technicalPartId, {
            canViewFinancialData: false,
          }) as Record<string, unknown>;

          releaseTechnicalPartFromOrder(
            item.itemId,
            {
              technicalPartVersion: Number(pecaAtual.version),
              expectedQuantity: item.quantity,
              reason:
                "Compensação automática: falha ao concluir as peças da criação da OS.",
            },
            {
              operatorId: acesso.usuario.id || null,
              operatorName: userName,
              canViewFinancialData: false,
              idempotencyKey: randomUUID(),
            },
          );
        } catch {
          compensacaoCompleta = false;
        }
      }

      const mapped = toFutureHttpError(errorReserva);

      return NextResponse.json(
        {
          ...mapped.body,
          message: compensacaoCompleta
            ? "A OS foi criada, mas as peças não puderam ser concluídas. As reservas realizadas nesta tentativa foram liberadas. Abra a OS e tente novamente."
            : "A OS foi criada, mas ocorreu uma falha ao concluir as peças. Abra a OS e revise as reservas antes de continuar.",
          orderCreated: true,
          id: ordem.id,
          osNumber: ordem.osNumber,
          reservationsCompensated: compensacaoCompleta,
        },
        { status: compensacaoCompleta ? 409 : 500 },
      );
    }

    const ordemAtualizada = await prisma.serviceOrder.findUnique({
      where: { id: ordem.id },
      include: {
        customer: true,
        histories: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    return NextResponse.json(ordemAtualizada || ordem, { status: 201 });
  } catch (error) {
    if (error instanceof StockDomainError) {
      const mapped = toFutureHttpError(error);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }

    return NextResponse.json(
      { message: "Erro ao criar ordem de serviço." },
      { status: 500 },
    );
  }
}
