/**
 * @file route.ts
 * @description Endpoint para duplicação/clonagem de uma Ordem de Serviço existente (`/api/ordens/[id]/duplicar`).
 * Copia dados do cliente, equipamento, defeito relatado e valores previstos, gerando um novo número
 * sequencial atômico (`gerarProximoNumeroOS`), reiniciando o status em RECEBIDO e registrando a origem no histórico.
 */

import { NextResponse } from "next/server";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { gerarProximoNumeroOS } from "@/lib/numeroSequencial";
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
 * @returns Número finito ou 0
 */
function numeroSeguro(valor: unknown) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Retorna o nome ou username do operador para auditoria.
 * @param usuario - Objeto do usuário autenticado
 * @returns Identificação do operador
 */
function nomeOperador(usuario: UsuarioSessao | null | undefined) {
  return usuario?.name?.trim() || usuario?.username?.trim() || "Sistema";
}

/**
 * Valida se o usuário tem permissão para visualizar dados financeiros de pagamento.
 * @param usuario - Objeto do usuário logado
 * @returns Verdadeiro se puder visualizar dados de pagamento
 */
function podeVerDadosPagamento(usuario: UsuarioSessao | null | undefined) {
  if (!usuario) return false;

  return usuarioTemPermissao(usuario, [
    "pagamentos.ver",
    "pagamentos.registrar",
    "relatorios.financeiro",
  ]);
}

/**
 * Oculta campos financeiros confidenciais da ordem duplicada caso o operador não tenha permissão de visualização.
 * @param ordem - Registro completo da nova OS
 * @param mostrarPagamentos - Flag de autorização financeira
 * @returns Ordem com dados protegidos ou completos
 */
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

/**
 * Duplica uma Ordem de Serviço existente, gerando uma nova com número sequencial próprio e status RECEBIDO.
 * Exige permissão 'ordens.criar'.
 * 
 * @param _request - Requisição HTTP recebida
 * @param context - Parâmetros da rota contendo `id` da OS original
 * @returns JSON com a nova OS clonada (status 201)
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.criar");

    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;
    const userName = nomeOperador(acesso.usuario);
    const usuarioPodeCopiarFormaPagamento = usuarioTemPermissao(acesso.usuario, [
      "pagamentos.registrar",
      "relatorios.financeiro",
    ]);

    const ordemOriginal = await prisma.serviceOrder.findUnique({
      where: { id },
    });

    if (!ordemOriginal) {
      return NextResponse.json(
        { message: "Ordem original não encontrada." },
        { status: 404 }
      );
    }

    const numeroOriginal = String(ordemOriginal.osNumber).padStart(3, "0");

    const novaOrdem = await prisma.serviceOrder.create({
      data: {
        
        osNumber: await gerarProximoNumeroOS(),customerId: ordemOriginal.customerId,
        equipmentType: ordemOriginal.equipmentType,
        equipmentOther: ordemOriginal.equipmentOther,
        brand: ordemOriginal.brand,
        model: ordemOriginal.model,
        serialNumber: ordemOriginal.serialNumber,
        imei: ordemOriginal.imei,
        devicePassword: ordemOriginal.devicePassword,
        deliveredAccessories: ordemOriginal.deliveredAccessories,
        reportedDefect: ordemOriginal.reportedDefect,
        technicalNotes: ordemOriginal.technicalNotes,
        requiredParts: ordemOriginal.requiredParts,
        partsCost: numeroSeguro(ordemOriginal.partsCost),
        laborCost: numeroSeguro(ordemOriginal.laborCost),
        discount: numeroSeguro(ordemOriginal.discount),
        totalAmount: numeroSeguro(ordemOriginal.totalAmount),
        paymentMethod: usuarioPodeCopiarFormaPagamento
          ? ordemOriginal.paymentMethod
          : PaymentMethod.AGUARDANDO_PAGAMENTO,
        status: "RECEBIDO",
        expectedDeliveryDate: ordemOriginal.expectedDeliveryDate,
        histories: {
          create: {
            userName,
            action: "DUPLICACAO_OS",
            description: `Ordem duplicada a partir da OS Nº ${numeroOriginal}.`,
          },
        },
      },
      include: {
        customer: true,
        histories: { orderBy: { createdAt: "desc" } },
      },
    });

    return NextResponse.json(
      ocultarDadosPagamentoDaOrdem(
        novaOrdem,
        podeVerDadosPagamento(acesso.usuario)
      ),
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao duplicar ordem:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Erro ao duplicar ordem de serviço.";

    return NextResponse.json({ message }, { status: 500 });
  }
}
