import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exigirPermissaoApi,
  usuarioPodeVerDadosFinanceirosSensiveis,
} from "@/lib/permissaoApi";
import { obterUsuarioLogado } from "@/lib/authSistema";
import {
  labelsDiasFuncionamento,
  lojaAbertaNaData,
  normalizarDiasFuncionamento,
  normalizarHora,
} from "@/lib/funcionamentoLoja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const nomesEquipamento: Record<string, string> = {
  NOTEBOOK: "Notebook",
  COMPUTADOR: "Computador",
  CELULAR: "Celular",
  TABLET: "Tablet",
  VIDEOGAME: "Videogame",
  IMPRESSORA: "Impressora",
  TV: "TV",
  OUTRO: "Outro",
};

function criarDataLocalSegura(data: string | null) {
  if (!data) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);

  if (!match) return null;

  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);

  const d = new Date(ano, mes - 1, dia);

  if (
    d.getFullYear() !== ano ||
    d.getMonth() !== mes - 1 ||
    d.getDate() !== dia
  ) {
    return null;
  }

  return d;
}

function inicioDoDia(data: Date) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDoDia(data: Date) {
  const d = new Date(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function moeda(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function percentual(valor: unknown) {
  return Math.min(Math.max(numero(valor), 0), 100);
}

function formatarDataInput(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function criarDiasDoPeriodo(inicio: Date, fim: Date, diasFuncionamento: number[]) {
  const dias: {
    data: string;
    label: string;
    totalOrdens: number;
    ordensAbertas: number;
    ordensEntregues: number;
    ordensCanceladas: number;
    totalAmount: number;
  }[] = [];

  const atual = new Date(
    inicio.getFullYear(),
    inicio.getMonth(),
    inicio.getDate(),
    0,
    0,
    0,
    0
  );

  const limite = new Date(
    fim.getFullYear(),
    fim.getMonth(),
    fim.getDate(),
    0,
    0,
    0,
    0
  );

  while (atual <= limite) {
    if (lojaAbertaNaData(atual, diasFuncionamento)) {
      dias.push({
        data: formatarDataInput(atual),
        label: atual.toLocaleDateString("pt-BR"),
        totalOrdens: 0,
        ordensAbertas: 0,
        ordensEntregues: 0,
        ordensCanceladas: 0,
        totalAmount: 0,
      });
    }

    atual.setDate(atual.getDate() + 1);
  }

  return dias;
}

async function buscarFuncionamentoLoja() {
  const configuracoes = await prisma.companySettings.findFirst({
    select: {
      businessDays: true,
      businessOpenTime: true,
      businessCloseTime: true,
    },
  });

  const diasAbertos = normalizarDiasFuncionamento(
    configuracoes?.businessDays
  );

  return {
    diasAbertos,
    labels: labelsDiasFuncionamento(diasAbertos),
    abertura: normalizarHora(configuracoes?.businessOpenTime, "08:00"),
    fechamento: normalizarHora(configuracoes?.businessCloseTime, "18:00"),
  };
}

function nomeEquipamento(ordem: {
  equipmentType?: string | null;
  equipmentOther?: string | null;
}) {
  if (ordem.equipmentType === "OUTRO") {
    return ordem.equipmentOther?.trim() || "Outro";
  }

  return nomesEquipamento[ordem.equipmentType || ""] || ordem.equipmentType || "-";
}

function nomeModelo(ordem: {
  brand?: string | null;
  model?: string | null;
}) {
  const brand = (ordem.brand || "").trim();
  const model = (ordem.model || "").trim();

  if (brand && model) {
    if (model.toLowerCase().includes(brand.toLowerCase())) {
      return model;
    }
    return `${brand} ${model}`;
  }

  if (model) return model;
  if (brand) return `${brand} (Não especificado)`;
  return "Modelo não informado";
}

export async function GET(request: Request) {
  try {
    const acesso = await exigirPermissaoApi([
      "relatorios.ver",
      "relatorios.financeiro",
    ]);

    let usuario = acesso.usuario;

    if (!acesso.ok) {
      const usuarioLogado = await obterUsuarioLogado();
      if (
        usuarioLogado &&
        usuarioLogado.status === "ATIVO" &&
        usuarioLogado.role === "TECNICO"
      ) {
        usuario = usuarioLogado;
      } else {
        return acesso.response;
      }
    }

    const financeiroSensivelLiberado =
      usuarioPodeVerDadosFinanceirosSensiveis(usuario);
    const ehApenasTecnico =
      usuario?.role === "TECNICO" && !financeiroSensivelLiberado;

    const { searchParams } = new URL(request.url);

    const dataInicialParam =
      searchParams.get("dataInicial") || searchParams.get("inicio");

    const dataFinalParam =
      searchParams.get("dataFinal") || searchParams.get("fim");

    const inicioInformado = criarDataLocalSegura(dataInicialParam);
    const fimInformado = criarDataLocalSegura(dataFinalParam);

    if (dataInicialParam && !inicioInformado) {
      return NextResponse.json(
        { message: "Data inicial inválida." },
        { status: 400 }
      );
    }

    if (dataFinalParam && !fimInformado) {
      return NextResponse.json(
        { message: "Data final inválida." },
        { status: 400 }
      );
    }

    const hoje = new Date();

    const dataInicial = inicioInformado
      ? inicioDoDia(inicioInformado)
      : new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0);

    const dataFinal = fimInformado
      ? fimDoDia(fimInformado)
      : new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);

    if (dataFinal < dataInicial) {
      return NextResponse.json(
        { message: "A data final não pode ser menor que a data inicial." },
        { status: 400 }
      );
    }

    const funcionamento = await buscarFuncionamentoLoja();

    const filtroTecnico = ehApenasTecnico && usuario
      ? {
          OR: [
            { technicianUserId: usuario.id },
            { technicianResponsible: usuario.name },
          ],
        }
      : {};

    const filtroOrdens = {
      openedAt: {
        gte: dataInicial,
        lte: dataFinal,
      },
      ...filtroTecnico,
    };

    const filtroPagamentos = {
      createdAt: {
        gte: dataInicial,
        lte: dataFinal,
      },
    };

    const [ordens, pagamentosPeriodo] = await Promise.all([
      prisma.serviceOrder.findMany({
        where: filtroOrdens,
        orderBy: {
          openedAt: "desc",
        },
        select: {
          id: true,
          osNumber: true,
          customerId: true,
          equipmentType: true,
          equipmentOther: true,
          brand: true,
          model: true,
          status: true,
          technicianUserId: true,
          technicianResponsible: true,
          technicianProfitPercentSnapshot: true,
          totalAmount: true,
          partsCost: true,
          laborCost: true,
          discount: true,
          paidAmount: true,
          openedAt: true,
          technicalParts: {
            select: {
              state: true,
              totalCostSnapshot: true,
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              whatsapp: true,
            },
          },
        },
      }),

      prisma.serviceOrderPayment.findMany({
            where: filtroPagamentos,
            select: {
              amount: true,
              paymentMethod: true,
            },
          }),
    ]);

    const totalOrdens = ordens.length;

    const ordensAbertas = ordens.filter(
      (ordem) => !["ENTREGUE", "CANCELADO"].includes(ordem.status)
    ).length;

    const ordensEntregues = ordens.filter(
      (ordem) => ordem.status === "ENTREGUE"
    ).length;

    const ordensCanceladas = ordens.filter(
      (ordem) => ordem.status === "CANCELADO"
    ).length;

    const diasSemanaTodos = DIAS_SEMANA.map((dia, index) => ({
      diaSemana: index,
      label: dia,
      lojaAberta: funcionamento.diasAbertos.includes(index),
      totalOrdens: 0,
      ordensAbertas: 0,
      ordensEntregues: 0,
      ordensCanceladas: 0,
      totalAmount: 0,
    }));

    const diasPeriodo = criarDiasDoPeriodo(
      dataInicial,
      dataFinal,
      funcionamento.diasAbertos
    );

    const diasPeriodoMap = new Map(diasPeriodo.map((dia) => [dia.data, dia]));

    for (const ordem of ordens) {
      const dataOrdem = new Date(ordem.openedAt);
      const diaSemana = dataOrdem.getDay();
      const dataKey = formatarDataInput(dataOrdem);
      const aberta = !["ENTREGUE", "CANCELADO"].includes(ordem.status);
      const entregue = ordem.status === "ENTREGUE";
      const cancelada = ordem.status === "CANCELADO";
      const total = ordem.status === "CANCELADO" ? 0 : numero(ordem.totalAmount);

      if (diasSemanaTodos[diaSemana]?.lojaAberta) {
        diasSemanaTodos[diaSemana].totalOrdens += 1;
        diasSemanaTodos[diaSemana].ordensAbertas += aberta ? 1 : 0;
        diasSemanaTodos[diaSemana].ordensEntregues += entregue ? 1 : 0;
        diasSemanaTodos[diaSemana].ordensCanceladas += cancelada ? 1 : 0;
        diasSemanaTodos[diaSemana].totalAmount += total;
      }

      const diaPeriodo = diasPeriodoMap.get(dataKey);

      if (diaPeriodo) {
        diaPeriodo.totalOrdens += 1;
        diaPeriodo.ordensAbertas += aberta ? 1 : 0;
        diaPeriodo.ordensEntregues += entregue ? 1 : 0;
        diaPeriodo.ordensCanceladas += cancelada ? 1 : 0;
        diaPeriodo.totalAmount += total;
      }
    }

    const diasSemana = diasSemanaTodos.filter((dia) => dia.lojaAberta);

    const diaSemanaMaisForte = [...diasSemana].sort(
      (a, b) => b.totalOrdens - a.totalOrdens
    )[0] || null;

    const diaSemanaMaisFraco = [...diasSemana].sort(
      (a, b) => a.totalOrdens - b.totalOrdens
    )[0] || null;

    const diasPeriodoComOrdem = diasPeriodo.filter(
      (dia) => dia.totalOrdens > 0
    );

    const diaMesMaisForte =
      [...diasPeriodoComOrdem].sort(
        (a, b) => b.totalOrdens - a.totalOrdens
      )[0] || null;

    const diaMesMaisFraco =
      [...diasPeriodo].sort((a, b) => a.totalOrdens - b.totalOrdens)[0] || null;

    const valorRecebido = pagamentosPeriodo.reduce(
      (total, pagamento) => total + Number(pagamento.amount || 0),
      0
    );

    const recebidoPorForma =
      pagamentosPeriodo.reduce<Record<string, number>>((acc, pagamento) => {
          const forma = pagamento.paymentMethod || "NAO_INFORMADO";
          acc[forma] = (acc[forma] || 0) + Number(pagamento.amount || 0);
          return acc;
        }, {});

    const ordensNaoCanceladas = ordens.filter(
      (ordem) => ordem.status !== "CANCELADO"
    );

    const financeiroPorOrdem = new Map(
      ordens.map((ordem) => {
        const cancelada = ordem.status === "CANCELADO";
        const pecasAtivas = ordem.technicalParts.filter(
          (item) => item.state === "RESERVED" || item.state === "CONSUMED"
        );
        const custoPecas = cancelada
          ? 0
          : pecasAtivas.reduce(
              (total, item) => total + numero(item.totalCostSnapshot),
              0
            );
        const valorPecas = cancelada ? 0 : numero(ordem.partsCost);
        const maoDeObra = cancelada ? 0 : numero(ordem.laborCost);
        const desconto = cancelada ? 0 : numero(ordem.discount);
        const faturamentoBruto = valorPecas + maoDeObra;
        const receitaLiquida = cancelada ? 0 : numero(ordem.totalAmount);

        const custoRastreado =
          cancelada || valorPecas <= 0 || pecasAtivas.length > 0;
        const lucroBruto = custoRastreado
          ? moeda(receitaLiquida - custoPecas)
          : null;

        const possuiSnapshotParticipacao =
          ordem.technicianProfitPercentSnapshot !== null &&
          ordem.technicianProfitPercentSnapshot !== undefined;
        const concluidaComTecnicoEsperado =
          ordem.status === "PRONTO" || ordem.status === "ENTREGUE";

        // Antes do PRONTO ainda não existe participação adquirida.
        // PRONTO/ENTREGUE antigo sem snapshot fica explicitamente não rastreado.
        const participacaoRastreada =
          cancelada || possuiSnapshotParticipacao || !concluidaComTecnicoEsperado;
        const percentualTecnico = possuiSnapshotParticipacao
          ? percentual(ordem.technicianProfitPercentSnapshot)
          : participacaoRastreada
            ? 0
            : null;

        const participacaoTecnico =
          lucroBruto === null || percentualTecnico === null
            ? null
            : moeda(Math.max(lucroBruto, 0) * (percentualTecnico / 100));
        const lucroLoja =
          lucroBruto === null || participacaoTecnico === null
            ? null
            : moeda(lucroBruto - participacaoTecnico);

        return [
          ordem.id,
          {
            faturamentoBruto,
            receitaLiquida,
            custoPecas,
            desconto,
            custoRastreado,
            lucroBruto,
            participacaoRastreada,
            percentualTecnico,
            participacaoTecnico,
            lucroLoja,
          },
        ] as const;
      })
    );

    const faturamentoBruto = ordensNaoCanceladas.reduce(
      (total, ordem) =>
        total + (financeiroPorOrdem.get(ordem.id)?.faturamentoBruto || 0),
      0
    );
    const receitaLiquida = ordensNaoCanceladas.reduce(
      (total, ordem) =>
        total + (financeiroPorOrdem.get(ordem.id)?.receitaLiquida || 0),
      0
    );
    const custoPecas = ordensNaoCanceladas.reduce(
      (total, ordem) =>
        total + (financeiroPorOrdem.get(ordem.id)?.custoPecas || 0),
      0
    );
    const ordensSemCustoRastreado = ordensNaoCanceladas.filter(
      (ordem) => financeiroPorOrdem.get(ordem.id)?.custoRastreado === false
    ).length;
    const lucroBrutoParcial = ordensNaoCanceladas.reduce((total, ordem) => {
      const lucro = financeiroPorOrdem.get(ordem.id)?.lucroBruto;
      return total + (lucro === null || lucro === undefined ? 0 : lucro);
    }, 0);
    const lucroBruto =
      ordensSemCustoRastreado === 0 ? lucroBrutoParcial : null;

    const ordensSemParticipacaoCalculavel = ordensNaoCanceladas.filter(
      (ordem) => {
        const financeiro = financeiroPorOrdem.get(ordem.id);
        return (
          financeiro?.custoRastreado === false ||
          financeiro?.participacaoRastreada === false
        );
      }
    ).length;

    const participacaoTecnicosParcial = moeda(
      ordensNaoCanceladas.reduce((total, ordem) => {
        const valor = financeiroPorOrdem.get(ordem.id)?.participacaoTecnico;
        return total + (valor === null || valor === undefined ? 0 : valor);
      }, 0)
    );

    const lucroLojaParcial = moeda(
      ordensNaoCanceladas.reduce((total, ordem) => {
        const valor = financeiroPorOrdem.get(ordem.id)?.lucroLoja;
        return total + (valor === null || valor === undefined ? 0 : valor);
      }, 0)
    );

    const participacaoTecnicos =
      ordensSemParticipacaoCalculavel === 0
        ? participacaoTecnicosParcial
        : null;
    const lucroLoja =
      ordensSemParticipacaoCalculavel === 0 ? lucroLojaParcial : null;

    const tecnicosFinanceiros = (financeiroSensivelLiberado || ehApenasTecnico)
      ? Array.from(
          ordensNaoCanceladas.reduce(
            (mapa, ordem) => {
              const nome = ordem.technicianResponsible?.trim();
              const financeiro = financeiroPorOrdem.get(ordem.id);
              const possuiSnapshot =
                ordem.technicianProfitPercentSnapshot !== null &&
                ordem.technicianProfitPercentSnapshot !== undefined;

              if (!nome || !possuiSnapshot) return mapa;

              const chave =
                ordem.technicianUserId?.trim() ||
                `nome:${nome.toLocaleLowerCase("pt-BR")}`;

              if (
                ehApenasTecnico &&
                usuario &&
                ordem.technicianUserId !== usuario.id &&
                nome !== usuario.name
              ) {
                return mapa;
              }

              const atual = mapa.get(chave) || {
                technicianKey: chave,
                technicianName: nome,
                totalOrders: 0,
                grossProfitGenerated: 0,
                technicianProfitShare: 0,
                storeProfit: 0,
                untrackedOrders: 0,
              };

              atual.totalOrders += 1;

              if (
                financeiro?.lucroBruto === null ||
                financeiro?.lucroBruto === undefined ||
                financeiro?.participacaoTecnico === null ||
                financeiro?.participacaoTecnico === undefined ||
                financeiro?.lucroLoja === null ||
                financeiro?.lucroLoja === undefined
              ) {
                atual.untrackedOrders += 1;
              } else {
                if (financeiroSensivelLiberado) {
                  atual.grossProfitGenerated = moeda(
                    atual.grossProfitGenerated + financeiro.lucroBruto
                  );
                  atual.storeProfit = moeda(
                    atual.storeProfit + financeiro.lucroLoja
                  );
                } else {
                  atual.grossProfitGenerated = 0;
                  atual.storeProfit = 0;
                }
                atual.technicianProfitShare = moeda(
                  atual.technicianProfitShare + financeiro.participacaoTecnico
                );
              }

              mapa.set(chave, atual);
              return mapa;
            },
            new Map<
              string,
              {
                technicianKey: string;
                technicianName: string;
                totalOrders: number;
                grossProfitGenerated: number;
                technicianProfitShare: number;
                storeProfit: number;
                untrackedOrders: number;
              }
            >()
          ).values()
        ).sort(
          (a, b) =>
            b.technicianProfitShare - a.technicianProfitShare ||
            a.technicianName.localeCompare(b.technicianName, "pt-BR")
        )
      : [];

    const valorGerado = receitaLiquida;
    const valorPendente = ordensNaoCanceladas.reduce(
      (total, ordem) =>
        total + Math.max(numero(ordem.totalAmount) - numero(ordem.paidAmount), 0),
      0
    );
    const valorCobradoPecas = ordensNaoCanceladas.reduce(
      (total, ordem) => total + numero(ordem.partsCost),
      0
    );
    const valorMaoDeObra = ordensNaoCanceladas.reduce(
      (total, ordem) => total + numero(ordem.laborCost),
      0
    );
    const descontoTotal = ordensNaoCanceladas.reduce(
      (total, ordem) => total + numero(ordem.discount),
      0
    );
    const ticketMedio =
      ordensNaoCanceladas.length > 0
        ? receitaLiquida / ordensNaoCanceladas.length
        : 0;

    const equipamentosMap = new Map<string, number>();

    for (const ordem of ordens) {
      const nome = nomeEquipamento(ordem);
      equipamentosMap.set(nome, (equipamentosMap.get(nome) || 0) + 1);
    }

    const equipamentos = Array.from(equipamentosMap.entries())
      .map(([nome, total]) => ({
        nome,
        total,
        quantidade: total,
      }))
      .sort((a, b) => b.total - a.total);

    const modelosMap = new Map<string, number>();

    for (const ordem of ordens) {
      const nome = nomeModelo(ordem);
      modelosMap.set(nome, (modelosMap.get(nome) || 0) + 1);
    }

    const modelosMaisConsertados = Array.from(modelosMap.entries())
      .map(([nome, total]) => ({
        nome,
        total,
        quantidade: total,
      }))
      .sort((a, b) => b.total - a.total);

    const clientesMap = new Map<
      string,
      {
        customerId: string;
        name: string;
        whatsapp: string | null;
        totalOrdens: number;
        total: number;
        quantidade: number;
      }
    >();

    for (const ordem of ordens) {
      const customerId = ordem.customerId || "sem-cliente";
      const atual = clientesMap.get(customerId);

      if (atual) {
        atual.totalOrdens += 1;
        atual.total += 1;
        atual.quantidade += 1;
        continue;
      }

      clientesMap.set(customerId, {
        customerId,
        name: ordem.customer?.name || "Cliente não encontrado",
        whatsapp: ordem.customer?.whatsapp || null,
        totalOrdens: 1,
        total: 1,
        quantidade: 1,
      });
    }

    const clientesMaisAtivos = Array.from(clientesMap.values()).sort(
      (a, b) => b.totalOrdens - a.totalOrdens
    );

    const ordensFormatadas = ordens.map((ordem) => {
      const financeiro = financeiroPorOrdem.get(ordem.id);

      return {
      id: ordem.id,
      osNumber: ordem.osNumber,
      numeroOS: ordem.osNumber,
      equipmentType: ordem.equipmentType,
      equipmentOther: ordem.equipmentOther,
      nomeEquipamento: nomeEquipamento(ordem),
      brand: ordem.brand,
      model: ordem.model,
      status: ordem.status,
      totalAmount: numero(ordem.totalAmount),
      openedAt: ordem.openedAt,
      customer: ordem.customer
        ? {
            id: ordem.customer.id,
            name: ordem.customer.name,
            whatsapp: ordem.customer.whatsapp,
          }
        : null,
      customerName: ordem.customer?.name || "-",
      customerWhatsapp: ordem.customer?.whatsapp || null,
      grossAmount: financeiro?.faturamentoBruto || 0,
      netAmount: financeiro?.receitaLiquida || 0,
      ...(financeiroSensivelLiberado
        ? {
            technicalPartsCost: financeiro?.custoPecas || 0,
            grossProfit: financeiro?.lucroBruto ?? null,
            costTracked: financeiro?.custoRastreado ?? true,
            technicianResponsible: ordem.technicianResponsible || null,
            technicianReportKey:
              ordem.technicianUserId?.trim() ||
              (ordem.technicianResponsible?.trim()
                ? `nome:${ordem.technicianResponsible
                    .trim()
                    .toLocaleLowerCase("pt-BR")}`
                : null),
            technicianProfitPercent: financeiro?.percentualTecnico ?? null,
            technicianProfitShare: financeiro?.participacaoTecnico ?? null,
            storeProfit: financeiro?.lucroLoja ?? null,
            profitShareTracked: financeiro?.participacaoRastreada ?? true,
          }
        : ehApenasTecnico
        ? {
            technicalPartsCost: null,
            grossProfit: null,
            costTracked: true,
            technicianResponsible: ordem.technicianResponsible || null,
            technicianReportKey:
              ordem.technicianUserId?.trim() ||
              (ordem.technicianResponsible?.trim()
                ? `nome:${ordem.technicianResponsible
                    .trim()
                    .toLocaleLowerCase("pt-BR")}`
                : null),
            technicianProfitPercent: financeiro?.percentualTecnico ?? null,
            technicianProfitShare: financeiro?.participacaoTecnico ?? null,
            storeProfit: null,
            profitShareTracked: financeiro?.participacaoRastreada ?? true,
          }
        : {}),
      };
    });

    return NextResponse.json({
      financeiroSensivelLiberado,
      financeiroLiberado: financeiroSensivelLiberado,
      ehApenasTecnico,
      funcionamento,
      periodo: {
        dataInicial: dataInicial.toISOString(),
        dataFinal: dataFinal.toISOString(),
      },
      resumo: {
        totalOrdens,
        ordensAbertas,
        ordensEntregues,
        ordensCanceladas,
        valorRecebido,
        totalRecebido: valorRecebido,
        recebidoPorForma: ehApenasTecnico ? {} : recebidoPorForma,
        valorGerado: ehApenasTecnico ? null : valorGerado,
        valorPendente: ehApenasTecnico ? null : valorPendente,
        valorCobradoPecas: ehApenasTecnico ? null : valorCobradoPecas,
        valorMaoDeObra: ehApenasTecnico ? null : valorMaoDeObra,
        descontoTotal: ehApenasTecnico ? null : descontoTotal,
        ticketMedio: ehApenasTecnico ? null : ticketMedio,
        faturamentoBruto: ehApenasTecnico ? null : faturamentoBruto,
        receitaLiquida: ehApenasTecnico ? null : receitaLiquida,
        custoPecas: financeiroSensivelLiberado ? custoPecas : null,
        lucroBruto: financeiroSensivelLiberado ? lucroBruto : null,
        lucroBrutoParcial: financeiroSensivelLiberado
          ? lucroBrutoParcial
          : null,
        ordensSemCustoRastreado: financeiroSensivelLiberado
          ? ordensSemCustoRastreado
          : null,
        lucroEstimado: financeiroSensivelLiberado ? lucroBruto : null,
        participacaoTecnicos: (financeiroSensivelLiberado || ehApenasTecnico)
          ? participacaoTecnicos
          : null,
        participacaoTecnicosParcial: (financeiroSensivelLiberado || ehApenasTecnico)
          ? participacaoTecnicosParcial
          : null,
        lucroLoja: financeiroSensivelLiberado ? lucroLoja : null,
        lucroLojaParcial: financeiroSensivelLiberado
          ? lucroLojaParcial
          : null,
        ordensSemParticipacaoCalculavel: financeiroSensivelLiberado
          ? ordensSemParticipacaoCalculavel
          : null,
      },
      ...((financeiroSensivelLiberado || ehApenasTecnico) ? { tecnicosFinanceiros } : {}),
      equipamentos: ehApenasTecnico ? [] : equipamentos,
      equipamentosMaisConsertados: ehApenasTecnico ? [] : equipamentos,
      modelos: ehApenasTecnico ? [] : modelosMaisConsertados,
      modelosMaisConsertados: ehApenasTecnico ? [] : modelosMaisConsertados,
      clientes: ehApenasTecnico ? [] : clientesMaisAtivos,
      clientesMaisAtivos: ehApenasTecnico ? [] : clientesMaisAtivos,
      diagnostico: ehApenasTecnico
        ? null
        : {
            diaSemanaMaisForte,
            diaSemanaMaisFraco,
            diaMesMaisForte,
            diaMesMaisFraco,
          },
      diasSemana: ehApenasTecnico ? [] : diasSemana,
      diasPeriodo: ehApenasTecnico ? [] : diasPeriodo,
      ordens: ordensFormatadas,
    });
  } catch (error) {
    console.error("Erro ao gerar relatório:", error);

    return NextResponse.json(
      { message: "Erro ao gerar relatório." },
      { status: 500 }
    );
  }
}
