/**
 * @file route.ts
 * @description Endpoint analítico para geração de relatórios de vendas de balcão (PDV) e movimentação de produtos.
 * Realiza agregações temporais (por dia da semana e dias corridos no período), estatísticas de ticket médio,
 * margens de lucro, impostos, rankings (mais/menos vendidos, maior/menor lucro, produtos parados em estoque)
 * e comissões de atendentes.
 *
 * Aplica controle de acesso baseado em papéis (RBAC):
 * - Usuários com permissão financeira visualizam métricas sensíveis completas (custo, lucro, imposto e comissão de todos).
 * - Usuários com perfil ATENDENTE visualizam exclusivamente suas próprias vendas e comissões,
 *   sem expor custos, lucros ou indicadores globais da empresa.
 */

import { NextResponse } from "next/server";
import { ProductSaleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirModuloProdutosAtivoApi } from "@/lib/moduloProdutos";
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

/**
 * Nomes dos dias da semana em português indexados de 0 (Domingo) a 6 (Sábado).
 */
const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

/**
 * Converte um valor arbitrário em número finito válido.
 *
 * @param valor - Dado de entrada a ser convertido
 * @returns Número resultante ou 0 caso inválido/infinito
 */
function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Converte um valor em número inteiro não-negativo (arredondado para baixo).
 *
 * @param valor - Valor a ser convertido
 * @returns Inteiro >= 0
 */
function inteiro(valor: unknown) {
  return Math.max(0, Math.floor(numero(valor)));
}

/**
 * Sanitiza e normaliza um valor como string sem espaços excedentes.
 *
 * @param valor - Dado de entrada
 * @returns String normalizada
 */
function texto(valor: unknown) {
  return String(valor || "").trim();
}

/**
 * Retorna o primeiro instante (00:00:00.000) do primeiro dia do mês corrente.
 *
 * @returns Instância Date configurada para o início do mês atual
 */
function dataInicioMesAtual() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Retorna o último instante (23:59:59.999) do último dia do mês corrente.
 *
 * @returns Instância Date configurada para o final do mês atual
 */
function dataFimMesAtual() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Converte com segurança uma string no formato AAAA-MM-DD em um objeto Date local válido.
 * Valida os componentes de ano, mês e dia para evitar transbordamentos de datas inválidas.
 *
 * @param data - String no formato YYYY-MM-DD
 * @returns Objeto Date local ou null se formato ou data inválida
 */
function criarDataLocalSegura(data: string) {
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

/**
 * Define o horário da data informada para o primeiro milissegundo do dia (00:00:00.000).
 *
 * @param data - Data de referência
 * @returns Nova instância Date no início do dia
 */
function inicioDoDia(data: Date) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Define o horário da data informada para o último milissegundo do dia (23:59:59.999).
 *
 * @param data - Data de referência
 * @returns Nova instância Date no final do dia
 */
function fimDoDia(data: Date) {
  const d = new Date(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Formata um objeto Date em string no padrão YYYY-MM-DD compatível com inputs HTML.
 *
 * @param data - Data a ser formatada
 * @returns String no formato AAAA-MM-DD
 */
function formatarDataInput(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

/**
 * Constrói a estrutura diária com acumuladores zerados para o período solicitado,
 * filtrando apenas os dias em que a loja esteve aberta conforme as configurações.
 *
 * @param inicio - Data de início do período
 * @param fim - Data final do período
 * @param diasFuncionamento - Array com os índices dos dias da semana em que há expediente
 * @returns Array de objetos com métricas financeiras diárias zeradas
 */
function criarDiasDoPeriodo(
  inicio: Date,
  fim: Date,
  diasFuncionamento: number[]
) {
  const dias: {
    data: string;
    label: string;
    vendas: number;
    itensVendidos: number;
    totalVendido: number;
    custoTotal: number;
    impostoTotal: number;
    lucroTotal: number;
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
      const data = formatarDataInput(atual);

      dias.push({
        data,
        label: atual.toLocaleDateString("pt-BR"),
        vendas: 0,
        itensVendidos: 0,
        totalVendido: 0,
        custoTotal: 0,
        impostoTotal: 0,
        lucroTotal: 0,
      });
    }

    atual.setDate(atual.getDate() + 1);
  }

  return dias;
}

/**
 * Consulta as diretrizes de funcionamento da loja (dias úteis e horários de abertura/fechamento)
 * cadastradas nas configurações da empresa (`CompanySettings`), normalizando os valores para fallback padrão.
 *
 * @returns Objeto contendo os dias abertos, seus rótulos formatados e horários de expediente
 */
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

/**
 * Handler GET para geração do relatório analítico de produtos e vendas de balcão (PDV).
 *
 * Processamento e Regras de Negócio:
 * 1. Valida se o módulo de produtos está ativo na licença/configurações do sistema.
 * 2. Verifica as permissões de acesso (`relatorios.ver` ou `relatorios.financeiro`). Atendentes ativos
 *    sem permissão global recebem visão restrita filtrada automaticamente pelo seu ID de usuário.
 * 3. Valida e filtra o intervalo de datas (`dataInicio` e `dataFim`).
 * 4. Carrega as vendas concluídas (`ProductSaleStatus.CONCLUIDA`) no período.
 * 5. Agrega métricas consolidadas: total vendido, custos de mercadoria vendida, impostos incidentes,
 *    lucro operacional, comissões devidas aos atendentes e ticket médio.
 * 6. Constrói agrupamentos temporais por dia da semana e dias corridos no período.
 * 7. Monta rankings: produtos mais vendidos, menos vendidos, maior lucro e produtos sem saída no período.
 * 8. Sanitiza a resposta ocultando margens, custos e métricas sensíveis se o usuário logado não possuir
 *    privilégios financeiros globais.
 *
 * @param request - Requisição HTTP com query params opcionais `dataInicio` e `dataFim` (YYYY-MM-DD)
 * @returns Resposta JSON com resumo financeiro, diagnósticos temporais, rankings e comissões de atendentes
 */
export async function GET(request: Request) {
  try {
    const bloqueioModuloProdutos = await exigirModuloProdutosAtivoApi();

    if (bloqueioModuloProdutos) {
      return bloqueioModuloProdutos;
    }

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
        usuarioLogado.role === "ATENDENTE"
      ) {
        usuario = usuarioLogado;
      } else {
        return acesso.response;
      }
    }

    const financeiroSensivelLiberado =
      usuarioPodeVerDadosFinanceirosSensiveis(usuario);
    const ehApenasAtendente =
      usuario?.role === "ATENDENTE" && !financeiroSensivelLiberado;

    const { searchParams } = new URL(request.url);

    const dataInicioParam = texto(searchParams.get("dataInicio"));
    const dataFimParam = texto(searchParams.get("dataFim"));

    const inicioInformado = dataInicioParam
      ? criarDataLocalSegura(dataInicioParam)
      : null;

    const fimInformado = dataFimParam ? criarDataLocalSegura(dataFimParam) : null;

    if (dataInicioParam && !inicioInformado) {
      return NextResponse.json(
        { message: "Data inicial inválida." },
        { status: 400 }
      );
    }

    if (dataFimParam && !fimInformado) {
      return NextResponse.json(
        { message: "Data final inválida." },
        { status: 400 }
      );
    }

    const inicio = inicioInformado
      ? inicioDoDia(inicioInformado)
      : dataInicioMesAtual();

    const fim = fimInformado ? fimDoDia(fimInformado) : dataFimMesAtual();

    if (fim < inicio) {
      return NextResponse.json(
        { message: "A data final não pode ser menor que a data inicial." },
        { status: 400 }
      );
    }

    const funcionamento = await buscarFuncionamentoLoja();

    const filtroAtendente = ehApenasAtendente && usuario?.id
      ? { attendantUserId: usuario.id }
      : {};

    const vendas = await prisma.productSale.findMany({
      where: {
        status: ProductSaleStatus.CONCLUIDA,
        soldAt: {
          gte: inicio,
          lte: fim,
        },
        ...filtroAtendente,
      },
      orderBy: {
        soldAt: "desc",
      },
      include: {
        items: true,
        attendantUser: {
          select: {
            id: true,
            name: true,
            username: true,
            pdvProfitSharePercent: true,
          },
        },
      },
    });

    const produtosAtivos = ehApenasAtendente
      ? []
      : await prisma.product.findMany({
          where: {
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            category: true,
            salePrice: true,
            costPrice: true,
            taxPercent: true,
            stockQuantity: true,
          },
          orderBy: {
            name: "asc",
          },
        });

    const diasSemanaTodos = DIAS_SEMANA.map((dia, index) => ({
      diaSemana: index,
      label: dia,
      lojaAberta: funcionamento.diasAbertos.includes(index),
      vendas: 0,
      itensVendidos: 0,
      totalVendido: 0,
      custoTotal: 0,
      impostoTotal: 0,
      lucroTotal: 0,
    }));

    const diasPeriodo = criarDiasDoPeriodo(
      inicio,
      fim,
      funcionamento.diasAbertos
    );
    const diasPeriodoMap = new Map(diasPeriodo.map((dia) => [dia.data, dia]));

    const produtosMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        category: string | null;
        quantity: number;
        totalVendido: number;
        custoTotal: number;
        impostoTotal: number;
        lucroTotal: number;
      }
    >();

    let totalVendido = 0;
    let custoTotal = 0;
    let impostoTotal = 0;
    let lucroTotal = 0;
    let totalComissaoAtendentes = 0;
    let itensVendidos = 0;

    const atendentesMap = new Map<
      string,
      {
        id: string;
        name: string;
        username: string;
        percentualComissao: number;
        vendas: number;
        itensVendidos: number;
        totalVendido: number;
        lucroTotal: number;
        comissaoTotal: number;
        lucroLiquidoLoja: number;
      }
    >();

    let todosAtendentes = await prisma.systemUser.findMany({
      where: {
        status: "ATIVO",
        OR: [
          { role: "ATENDENTE" },
          { pdvProfitShareEnabled: true },
        ],
      },
      select: {
        id: true,
        name: true,
        username: true,
        pdvProfitShareEnabled: true,
        pdvProfitSharePercent: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    if (ehApenasAtendente && usuario?.id) {
      todosAtendentes = todosAtendentes.filter((att) => att.id === usuario.id);
    }

    for (const att of todosAtendentes) {
      atendentesMap.set(att.id, {
        id: att.id,
        name: att.name,
        username: att.username,
        percentualComissao: att.pdvProfitShareEnabled ? numero(att.pdvProfitSharePercent) : 0,
        vendas: 0,
        itensVendidos: 0,
        totalVendido: 0,
        lucroTotal: 0,
        comissaoTotal: 0,
        lucroLiquidoLoja: 0,
      });
    }

    for (const venda of vendas) {
      const totalVenda = numero(venda.totalAmount);
      const custoVenda = numero(venda.costAmount);
      const impostoVenda = numero(venda.taxAmount);
      const lucroVenda = numero(venda.profitAmount);
      const comissaoVenda = numero(venda.attendantProfitShare);

      totalVendido += totalVenda;
      custoTotal += custoVenda;
      impostoTotal += impostoVenda;
      lucroTotal += lucroVenda;
      totalComissaoAtendentes += comissaoVenda;

      const quantidadeItensVenda = venda.items.reduce(
        (total, item) => total + inteiro(item.quantity),
        0
      );

      itensVendidos += quantidadeItensVenda;

      if (venda.attendantUser) {
        const attId = venda.attendantUser.id;
        const atualAtt = atendentesMap.get(attId) || {
          id: attId,
          name: venda.attendantUser.name,
          username: venda.attendantUser.username,
          percentualComissao: numero(venda.attendantProfitPercentSnapshot) || numero(venda.attendantUser.pdvProfitSharePercent),
          vendas: 0,
          itensVendidos: 0,
          totalVendido: 0,
          lucroTotal: 0,
          comissaoTotal: 0,
          lucroLiquidoLoja: 0,
        };

        if (!atualAtt.percentualComissao && venda.attendantProfitPercentSnapshot) {
          atualAtt.percentualComissao = numero(venda.attendantProfitPercentSnapshot);
        }

        atualAtt.vendas += 1;
        atualAtt.itensVendidos += quantidadeItensVenda;
        atualAtt.totalVendido += totalVenda;
        atualAtt.lucroTotal += lucroVenda;
        atualAtt.comissaoTotal += comissaoVenda;
        atualAtt.lucroLiquidoLoja = Math.round((atualAtt.lucroTotal - atualAtt.comissaoTotal) * 100) / 100;

        atendentesMap.set(attId, atualAtt);
      }

      const dataVenda = new Date(venda.soldAt);
      const diaSemana = dataVenda.getDay();
      const dataKey = formatarDataInput(dataVenda);

      if (diasSemanaTodos[diaSemana]?.lojaAberta) {
        diasSemanaTodos[diaSemana].vendas += 1;
        diasSemanaTodos[diaSemana].itensVendidos += quantidadeItensVenda;
        diasSemanaTodos[diaSemana].totalVendido += totalVenda;
        diasSemanaTodos[diaSemana].custoTotal += custoVenda;
        diasSemanaTodos[diaSemana].impostoTotal += impostoVenda;
        diasSemanaTodos[diaSemana].lucroTotal += lucroVenda;
      }

      const diaPeriodo = diasPeriodoMap.get(dataKey);

      if (diaPeriodo) {
        diaPeriodo.vendas += 1;
        diaPeriodo.itensVendidos += quantidadeItensVenda;
        diaPeriodo.totalVendido += totalVenda;
        diaPeriodo.custoTotal += custoVenda;
        diaPeriodo.impostoTotal += impostoVenda;
        diaPeriodo.lucroTotal += lucroVenda;
      }

      for (const item of venda.items) {
        const productId = item.productId || `manual:${item.productName}`;
        const atual =
          produtosMap.get(productId) ||
          {
            productId,
            productName: item.productName,
            category: null,
            quantity: 0,
            totalVendido: 0,
            custoTotal: 0,
            impostoTotal: 0,
            lucroTotal: 0,
          };

        atual.quantity += inteiro(item.quantity);
        atual.totalVendido += numero(item.totalAmount);
        atual.custoTotal += numero(item.costAmount);
        atual.impostoTotal += numero(item.taxAmount);
        atual.lucroTotal += numero(item.profitAmount);

        produtosMap.set(productId, atual);
      }
    }

    const produtosVendidos = Array.from(produtosMap.values());

    const maisVendidos = [...produtosVendidos]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const menosVendidos = [...produtosVendidos]
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 5);

    const maiorLucro = [...produtosVendidos]
      .sort((a, b) => b.lucroTotal - a.lucroTotal)
      .slice(0, 5);

    const menorLucro = [...produtosVendidos]
      .sort((a, b) => a.lucroTotal - b.lucroTotal)
      .slice(0, 5);

    const idsVendidos = new Set(
      produtosVendidos
        .filter((produto) => !produto.productId.startsWith("manual:"))
        .map((produto) => produto.productId)
    );

    const produtosSemVenda = produtosAtivos
      .filter((produto) => !idsVendidos.has(produto.id))
      .slice(0, 20)
      .map((produto) => ({
        productId: produto.id,
        productName: produto.name,
        category: produto.category,
        salePrice: numero(produto.salePrice),
        costPrice: numero(produto.costPrice),
        taxPercent: numero(produto.taxPercent),
      }));

    const diasSemana = diasSemanaTodos.filter((dia) => dia.lojaAberta);

    const diaSemanaMaisForte = [...diasSemana].sort(
      (a, b) => b.totalVendido - a.totalVendido
    )[0] || null;

    const diaSemanaMaisFraco = [...diasSemana].sort(
      (a, b) => a.totalVendido - b.totalVendido
    )[0] || null;

    const diasComVenda = diasPeriodo.filter((dia) => dia.totalVendido > 0);

    const diaMesMaisForte =
      [...diasComVenda].sort((a, b) => b.totalVendido - a.totalVendido)[0] ||
      null;

    const diaMesMaisFraco =
      [...diasPeriodo].sort((a, b) => a.totalVendido - b.totalVendido)[0] ||
      null;
    const valorEstoqueVenda = produtosAtivos.reduce((total, produto) => {
      if (produto.stockQuantity === null) return total;
      return total + numero(produto.salePrice) * produto.stockQuantity;
    }, 0);
    const valorEstoqueCusto = financeiroSensivelLiberado
      ? produtosAtivos.reduce((total, produto) => {
          if (produto.stockQuantity === null) return total;
          return total + numero(produto.costPrice) * produto.stockQuantity;
        }, 0)
      : null;

    const vendasAtendentes = vendas
      .filter((venda) => Boolean(venda.attendantUser))
      .map((venda) => ({
        id: venda.id,
        saleNumber: venda.saleNumber,
        soldAt: venda.soldAt.toISOString(),
        customerName: venda.customerName || null,
        paymentMethod: venda.paymentMethod,
        attendantId: venda.attendantUser!.id,
        attendantName: venda.attendantUser!.name,
        attendantUsername: venda.attendantUser!.username,
        totalAmount: numero(venda.totalAmount),
        profitAmount: financeiroSensivelLiberado ? numero(venda.profitAmount) : null,
        attendantProfitPercentSnapshot:
          numero(venda.attendantProfitPercentSnapshot) ||
          numero(venda.attendantUser?.pdvProfitSharePercent),
        attendantProfitShare: numero(venda.attendantProfitShare),
        storeProfit: financeiroSensivelLiberado
          ? Math.round(
              (numero(venda.profitAmount) - numero(venda.attendantProfitShare)) *
                100
            ) / 100
          : null,
        items: venda.items.map((item) => ({
          id: item.id,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: numero(item.unitPrice),
          totalAmount: numero(item.totalAmount),
        })),
      }));

    return NextResponse.json({
      financeiroSensivelLiberado,
      ehApenasAtendente,
      funcionamento,
      periodo: {
        dataInicio: formatarDataInput(inicio),
        dataFim: formatarDataInput(fim),
      },
      resumo: {
        vendas: vendas.length,
        itensVendidos,
        totalVendido,
        valorEstoqueVenda: ehApenasAtendente ? null : valorEstoqueVenda,
        valorEstoqueCusto: financeiroSensivelLiberado ? valorEstoqueCusto : null,
        custoTotal: financeiroSensivelLiberado ? custoTotal : null,
        impostoTotal: financeiroSensivelLiberado ? impostoTotal : null,
        lucroTotal: financeiroSensivelLiberado ? lucroTotal : null,
        totalComissaoAtendentes,
        ticketMedio: vendas.length > 0 ? totalVendido / vendas.length : 0,
        margemMedia: financeiroSensivelLiberado
          ? totalVendido > 0
            ? (lucroTotal / totalVendido) * 100
            : 0
          : null,
      },
      diagnostico: ehApenasAtendente
        ? null
        : {
            diaSemanaMaisForte,
            diaSemanaMaisFraco,
            diaMesMaisForte,
            diaMesMaisFraco,
          },
      diasSemana: ehApenasAtendente
        ? []
        : diasSemana.map((dia) => ({
            ...dia,
            custoTotal: financeiroSensivelLiberado ? dia.custoTotal : null,
            impostoTotal: financeiroSensivelLiberado ? dia.impostoTotal : null,
            lucroTotal: financeiroSensivelLiberado ? dia.lucroTotal : null,
          })),
      diasPeriodo: ehApenasAtendente
        ? []
        : diasPeriodo.map((dia) => ({
            ...dia,
            custoTotal: financeiroSensivelLiberado ? dia.custoTotal : null,
            impostoTotal: financeiroSensivelLiberado ? dia.impostoTotal : null,
            lucroTotal: financeiroSensivelLiberado ? dia.lucroTotal : null,
          })),
      rankings: {
        maisVendidos: ehApenasAtendente
          ? []
          : maisVendidos.map((produto) => ({
              ...produto,
              custoTotal: financeiroSensivelLiberado ? produto.custoTotal : null,
              impostoTotal: financeiroSensivelLiberado
                ? produto.impostoTotal
                : null,
              lucroTotal: financeiroSensivelLiberado ? produto.lucroTotal : null,
            })),
        menosVendidos: ehApenasAtendente
          ? []
          : menosVendidos.map((produto) => ({
              ...produto,
              custoTotal: financeiroSensivelLiberado ? produto.custoTotal : null,
              impostoTotal: financeiroSensivelLiberado
                ? produto.impostoTotal
                : null,
              lucroTotal: financeiroSensivelLiberado ? produto.lucroTotal : null,
            })),
        maiorLucro: financeiroSensivelLiberado ? maiorLucro : [],
        menorLucro: financeiroSensivelLiberado ? menorLucro : [],
        produtosSemVenda: ehApenasAtendente
          ? []
          : produtosSemVenda.map((produto) => ({
              ...produto,
              costPrice: financeiroSensivelLiberado ? produto.costPrice : null,
              taxPercent: financeiroSensivelLiberado ? produto.taxPercent : null,
            })),
        atendentes: financeiroSensivelLiberado
          ? Array.from(atendentesMap.values()).sort(
              (a, b) =>
                b.totalVendido - a.totalVendido ||
                b.comissaoTotal - a.comissaoTotal
            )
          : ehApenasAtendente
            ? Array.from(atendentesMap.values())
                .filter((a) => a.id === usuario?.id)
                .map((a) => ({
                  ...a,
                  lucroTotal: 0,
                  lucroLiquidoLoja: null,
                }))
            : [],
      },
      vendasAtendentes,
    });
  } catch (error) {
    console.error("Erro ao gerar relatório de produtos:", error);

    return NextResponse.json(
      { message: "Erro ao gerar relatório de produtos." },
      { status: 500 }
    );
  }
}
