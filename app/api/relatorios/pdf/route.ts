/**
 * @file route.ts
 * @description Endpoint para geração e exportação de Relatórios Gerenciais em PDF (`/api/relatorios/pdf`).
 * Suporta dois modos de exportação: Relatório Geral Operacional de OS (com resumo, rankings e tabela analítica)
 * e Relatório Financeiro de Técnicos (com detalhamento de ordens concluídas, lucro gerado e participação/comissão individual).
 */

import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { caminhoUploadPublico } from "@/lib/runtimeStorage";
import {
  exigirPermissaoApi,
  usuarioPodeVerDadosFinanceirosSensiveis,
} from "@/lib/permissaoApi";
import { obterUsuarioLogado } from "@/lib/authSistema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estrutura de dados cadastrais da empresa para impressão no cabeçalho dos relatórios.
 */
type EmpresaConfig = {
  nomeEmpresa?: string;
  companyName?: string;
  nomeFantasia?: string;
  cnpj?: string;
  documento?: string;
  endereco?: string;
  address?: string;
  telefone?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  logoUrl?: string;
  rodape?: string;
  footerText?: string;
};

/**
 * Mapeamento dos códigos de status de OS para textos em caixa alta.
 */
const nomesStatus: Record<string, string> = {
  RECEBIDO: "RECEBIDO",
  EM_ANALISE: "EM ANÁLISE",
  AGUARDANDO_PECA: "AGUARDANDO PEÇA",
  EM_REPARO: "EM REPARO",
  PRONTO: "PRONTO",
  ENTREGUE: "ENTREGUE",
  CANCELADO: "CANCELADO",
};

/**
 * Mapeamento de tipos de equipamentos cadastrados.
 */
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

/**
 * Formata um valor numérico em moeda Real Brasileiro (BRL).
 * @param valor - Valor a formatar
 * @returns String formatada em BRL
 */
function formatarMoeda(valor: unknown) {
  const numero = Number(valor ?? 0);
  const seguro = Number.isFinite(numero) ? numero : 0;

  return seguro.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Formata valor em data pt-BR (DD/MM/AAAA).
 * @param data - Data a formatar
 * @returns Data formatada ou hífen se inválida
 */
function formatarData(data: unknown) {
  if (!data) return "-";

  const d = new Date(String(data));

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("pt-BR");
}

/**
 * Faz parsing seguro de data no formato AAAA-MM-DD para objeto Date local.
 * @param data - String no formato AAAA-MM-DD
 * @returns Instância de Date ou null se inválida
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
 * Valida o caminho do arquivo de logotipo da empresa garantindo confinamento ao diretório de uploads.
 * Previne ataques de travessia de diretório (Path Traversal).
 * @param logoUrl - URL ou caminho do logotipo
 * @returns Caminho absoluto seguro no disco ou null se inválido
 */
function caminhoLogoSeguro(logoUrl?: string) {
  const uploadsDir = path.resolve(caminhoUploadPublico());
  const logoLimpa = String(logoUrl || "/uploads/logo.png").split("?")[0];

  if (!logoLimpa.startsWith("/uploads/")) {
    return null;
  }

  const relativo = logoLimpa.replace(/^\/+uploads[\\/]+/, "");
  const caminhoResolvido = path.resolve(uploadsDir, relativo);
  const dentro =
    caminhoResolvido === uploadsDir ||
    caminhoResolvido.startsWith(uploadsDir + path.sep);

  return dentro ? caminhoResolvido : null;
}

/**
 * Trata valores nulos ou indefinidos retornando '-' como fallback.
 * @param valor - Valor de entrada
 * @returns String tratada
 */
function texto(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return "-";
  return String(valor);
}

/**
 * Trunca uma string adicionando reticências caso ultrapasse o limite de caracteres.
 * @param textoOriginal - Texto original
 * @param tamanho - Comprimento máximo permitido
 * @returns Texto truncado ou original
 */
function cortar(textoOriginal: unknown, tamanho: number) {
  const valor = texto(textoOriginal);

  if (valor.length <= tamanho) return valor;

  return `${valor.slice(0, tamanho - 3)}...`;
}

/**
 * Obtém o número legível e padronizado da Ordem de Serviço com padding de zeros.
 * @param ordem - Objeto da OS
 * @returns Número da OS (ex: '042') ou '-'
 */
function numeroOS(ordem: any) {
  const valor =
    ordem?.osNumber ??
    ordem?.numeroOS ??
    ordem?.numero ??
    ordem?.orderNumber ??
    "";

  if (!valor) return "-";

  return String(valor).padStart(3, "0");
}

/**
 * Extrai o nome do cliente associado à ordem de serviço com fallbacks.
 * @param ordem - Objeto da OS
 * @returns Nome do cliente
 */
function nomeCliente(ordem: any) {
  return (
    ordem?.customer?.name ||
    ordem?.cliente?.name ||
    ordem?.cliente?.nome ||
    ordem?.customerName ||
    ordem?.clienteNome ||
    ordem?.nomeCliente ||
    "-"
  );
}

/**
 * Extrai o nome amigável do equipamento da ordem de serviço.
 * @param ordem - Objeto da OS
 * @returns Nome legível do equipamento
 */
function nomeEquipamento(ordem: any) {
  if (ordem?.nomeEquipamento) {
    return ordem.nomeEquipamento;
  }

  if (ordem?.equipmentType === "OUTRO") {
    return ordem?.equipmentOther || "Outro";
  }

  if (ordem?.equipmentType) {
    return nomesEquipamento[ordem.equipmentType] || ordem.equipmentType;
  }

  return (
    ordem?.equipamento ||
    ordem?.tipoEquipamento ||
    ordem?.aparelho ||
    "-"
  );
}

/**
 * Obtém o valor monetário total da ordem de serviço.
 * @param ordem - Objeto da OS
 * @returns Valor numérico
 */
function valorOrdem(ordem: any) {
  return (
    ordem?.totalAmount ??
    ordem?.valorTotal ??
    ordem?.total ??
    ordem?.valorServico ??
    ordem?.valorRecebido ??
    0
  );
}

/**
 * Extrai a quantidade numérica de itens/contadores de relatórios agregados.
 * @param item - Objeto contendo propriedade de contagem
 * @returns Número seguro
 */
function totalItem(item: any) {
  const valor =
    item?.total ??
    item?.quantidade ??
    item?.count ??
    item?.totalOrdens ??
    item?._count?.equipmentType ??
    item?._count?.customerId ??
    item?._count?.id ??
    item?._count?._all ??
    0;

  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Gera o buffer binário do relatório em PDF geral de Ordens de Serviço (A4 Retrato).
 * @param relatorio - Dados do relatório retornados pela API `/api/relatorios`
 * @param empresa - Configurações cadastrais da empresa
 * @param periodoInicio - Data inicial formatada
 * @param periodoFim - Data final formatada
 * @returns Promise com o Buffer binário do PDF
 */
async function gerarBufferPDF(
  relatorio: any,
  empresa: EmpresaConfig,
  periodoInicio: string,
  periodoFim: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 35,
        bufferPages: true,
      });

      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width;
      const margin = 35;
      const contentWidth = pageWidth - margin * 2;

      function linha(y?: number) {
        const posY = y ?? doc.y;

        doc
          .moveTo(margin, posY)
          .lineTo(pageWidth - margin, posY)
          .strokeColor("#cccccc")
          .lineWidth(0.5)
          .stroke();
      }

      function verificarEspaco(altura = 60) {
        if (doc.y + altura > doc.page.height - 55) {
          doc.addPage();
        }
      }

      function tituloSecao(titulo: string) {
        verificarEspaco(35);

        doc.moveDown(0.5);

        doc
          .fontSize(12)
          .fillColor("#111111")
          .font("Helvetica-Bold")
          .text(titulo, margin, doc.y);

        doc.moveDown(0.3);
        linha();
        doc.moveDown(0.6);
      }

      function cardResumo(titulo: string, valor: string, x: number, y: number, w: number) {
        doc
          .roundedRect(x, y, w, 48, 6)
          .strokeColor("#dddddd")
          .lineWidth(0.8)
          .stroke();

        doc
          .fontSize(8)
          .fillColor("#666666")
          .font("Helvetica")
          .text(titulo, x + 8, y + 8, {
            width: w - 16,
          });

        doc
          .fontSize(12)
          .fillColor("#111111")
          .font("Helvetica-Bold")
          .text(valor, x + 8, y + 25, {
            width: w - 16,
          });
      }

      const logoPath = caminhoLogoSeguro(empresa?.logoUrl);

      if (logoPath && fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, margin, 25, {
            fit: [80, 45],
          });
        } catch {
          // ignora logo inválida
        }
      }

      const nomeEmpresa =
        empresa?.nomeFantasia ||
        empresa?.nomeEmpresa ||
        empresa?.companyName ||
        "Relatório";

      const documento = empresa?.documento || empresa?.cnpj || "";
      const telefone = empresa?.telefone || empresa?.phone || "";
      const endereco = empresa?.endereco || empresa?.address || "";

      doc
        .fontSize(15)
        .fillColor("#111111")
        .font("Helvetica-Bold")
        .text(nomeEmpresa, 130, 28, {
          width: pageWidth - 165,
          align: "right",
        });

      doc
        .fontSize(8)
        .fillColor("#555555")
        .font("Helvetica")
        .text(
          [
            documento ? `CPF/CNPJ: ${documento}` : "",
            telefone ? `Tel: ${telefone}` : "",
            empresa?.whatsapp ? `WhatsApp: ${empresa.whatsapp}` : "",
            empresa?.email ? `E-mail: ${empresa.email}` : "",
          ]
            .filter(Boolean)
            .join("  |  "),
          130,
          48,
          {
            width: pageWidth - 165,
            align: "right",
          }
        );

      doc
        .fontSize(8)
        .fillColor("#555555")
        .text(endereco || "", 130, 62, {
          width: pageWidth - 165,
          align: "right",
        });

      doc.y = 95;
      linha();

      doc.moveDown(1);

      doc
        .fontSize(16)
        .fillColor("#111111")
        .font("Helvetica-Bold")
        .text("Relatório de Ordens de Serviço", margin, doc.y, {
          width: contentWidth,
          align: "center",
        });

      doc.moveDown(0.4);

      doc
        .fontSize(9)
        .fillColor("#555555")
        .font("Helvetica")
        .text(`Período: ${formatarData(periodoInicio)} até ${formatarData(periodoFim)}`, {
          width: contentWidth,
          align: "center",
        });

      doc.moveDown(1);

      tituloSecao("Resumo operacional");

      const resumo = relatorio?.resumo || {};

      const totalOS = resumo.totalOS ?? resumo.totalOrdens ?? 0;
      const abertas = resumo.osAbertas ?? resumo.ordensAbertas ?? resumo.abertas ?? 0;
      const entregues =
        resumo.osEntregues ??
        resumo.ordensEntregues ??
        resumo.entregues ??
        resumo.osConcluidas ??
        0;
      const canceladas =
        resumo.osCanceladas ?? resumo.ordensCanceladas ?? resumo.canceladas ?? 0;
      const valorRecebido = resumo.valorRecebido ?? resumo.totalRecebido ?? 0;
      const valorGerado = resumo.valorGerado ?? 0;
      const valorPendente = resumo.valorPendente ?? 0;
      const valorCobradoPecas = resumo.valorCobradoPecas ?? 0;
      const faturamentoBruto = resumo.faturamentoBruto ?? valorGerado;
      const receitaLiquida = resumo.receitaLiquida ?? valorGerado;
      const descontoTotal = resumo.descontoTotal ?? 0;
      const financeiroSensivelLiberado =
        relatorio?.financeiroSensivelLiberado === true;
      const custoPecas = resumo.custoPecas ?? 0;
      const lucroBruto = resumo.lucroBruto;
      const lucroBrutoParcial = resumo.lucroBrutoParcial ?? 0;
      const ordensSemCustoRastreado = resumo.ordensSemCustoRastreado ?? 0;

      const cardW = (contentWidth - 20) / 3;
      const startY = doc.y;

      cardResumo("Total de OS", String(totalOS), margin, startY, cardW);
      cardResumo("OS abertas", String(abertas), margin + cardW + 10, startY, cardW);
      cardResumo("OS entregues", String(entregues), margin + (cardW + 10) * 2, startY, cardW);

      const startY2 = startY + 58;

      cardResumo("OS canceladas", String(canceladas), margin, startY2, cardW);
      cardResumo("Valor recebido", formatarMoeda(valorRecebido), margin + cardW + 10, startY2, cardW);
      cardResumo("Valor gerado", formatarMoeda(valorGerado), margin + (cardW + 10) * 2, startY2, cardW);

      const startY3 = startY2 + 58;

      cardResumo("Faturamento bruto", formatarMoeda(faturamentoBruto), margin, startY3, cardW);
      cardResumo("Descontos", formatarMoeda(descontoTotal), margin + cardW + 10, startY3, cardW);
      cardResumo("Receita líquida", formatarMoeda(receitaLiquida), margin + (cardW + 10) * 2, startY3, cardW);

      let resumoFinalY = startY3 + 62;

      if (financeiroSensivelLiberado) {
        const startY4 = startY3 + 58;
        const lucroExibido =
          lucroBruto === null || lucroBruto === undefined
            ? lucroBrutoParcial
            : lucroBruto;

        cardResumo("Custo das peças", formatarMoeda(custoPecas), margin, startY4, cardW);
        cardResumo("Lucro bruto", formatarMoeda(lucroExibido), margin + cardW + 10, startY4, cardW);
        cardResumo("OS sem custo rastreado", String(ordensSemCustoRastreado), margin + (cardW + 10) * 2, startY4, cardW);

        resumoFinalY = startY4 + 62;
      }

      doc.y = resumoFinalY;

      doc
        .fontSize(9)
        .fillColor("#555555")
        .font("Helvetica")
        .text(
          `Valor pendente: ${formatarMoeda(valorPendente)}  |  Valor cobrado em peças: ${formatarMoeda(valorCobradoPecas)}`,
          margin,
          doc.y
        );

      if (financeiroSensivelLiberado && ordensSemCustoRastreado > 0) {
        doc.moveDown(0.35);
        doc
          .fontSize(8)
          .fillColor("#8a4b08")
          .text(
            `Atenção: ${ordensSemCustoRastreado} OS possui valor de peça antigo/manual sem custo histórico rastreado. O lucro exibido é parcial.`,
            margin,
            doc.y,
            { width: contentWidth }
          );
      }

      const modelos =
        relatorio?.modelosMaisConsertados ||
        relatorio?.modelos ||
        [];

      const listaModelos =
        Array.isArray(modelos) && modelos.length > 0
          ? modelos
          : (() => {
              const mapa = new Map<string, number>();
              const ordensBase = Array.isArray(relatorio?.ordens)
                ? relatorio.ordens
                : [];
              for (const o of ordensBase) {
                const brand = String(o?.brand || "").trim();
                const model = String(o?.model || "").trim();
                let nome = "Modelo não informado";
                if (brand && model) {
                  nome = model.toLowerCase().includes(brand.toLowerCase())
                    ? model
                    : `${brand} ${model}`;
                } else if (model) {
                  nome = model;
                } else if (brand) {
                  nome = `${brand} (Não especificado)`;
                }
                mapa.set(nome, (mapa.get(nome) || 0) + 1);
              }
              return Array.from(mapa.entries())
                .map(([nome, total]) => ({ nome, total, quantidade: total }))
                .sort((a, b) => b.total - a.total);
            })();

      if (Array.isArray(listaModelos) && listaModelos.length > 0) {
        tituloSecao("Top 5 modelos mais consertados");

        listaModelos.slice(0, 5).forEach((item: any, index: number) => {
          verificarEspaco(18);

          const nome =
            item?.nome ||
            item?.name ||
            item?.modelo ||
            "-";

          doc
            .fontSize(9)
            .fillColor("#111111")
            .font("Helvetica")
            .text(`${index + 1}. ${nome} - ${totalItem(item)} OS`, margin, doc.y);

          doc.moveDown(0.25);
        });
      }

      const equipamentos =
        relatorio?.equipamentosMaisConsertados ||
        relatorio?.equipamentos ||
        [];

      if (Array.isArray(equipamentos) && equipamentos.length > 0) {
        tituloSecao("Top 5 equipamentos mais consertados");

        equipamentos.slice(0, 5).forEach((item: any, index: number) => {
          verificarEspaco(18);

          const nome =
            item?.nome ||
            item?.name ||
            item?.equipamento ||
            item?.tipo ||
            (item?.equipmentType
              ? nomesEquipamento[item.equipmentType] || item.equipmentType
              : "-");

          doc
            .fontSize(9)
            .fillColor("#111111")
            .font("Helvetica")
            .text(`${index + 1}. ${nome} - ${totalItem(item)} OS`, margin, doc.y);

          doc.moveDown(0.25);
        });
      }

      const clientes =
        relatorio?.clientesMaisAtivos ||
        relatorio?.clientesAtivos ||
        relatorio?.clientes ||
        [];

      if (Array.isArray(clientes) && clientes.length > 0) {
        tituloSecao("Top 5 clientes que mais consertam");

        clientes.slice(0, 5).forEach((item: any, index: number) => {
          verificarEspaco(18);

          const nome =
            item?.name ||
            item?.nome ||
            item?.clienteNome ||
            item?.cliente?.name ||
            item?.cliente?.nome ||
            "Cliente não encontrado";

          doc
            .fontSize(9)
            .fillColor("#111111")
            .font("Helvetica")
            .text(`${index + 1}. ${nome} - ${totalItem(item)} OS`, margin, doc.y);

          doc.moveDown(0.25);
        });
      }

      const ordens =
        relatorio?.ordens ||
        relatorio?.listaOrdens ||
        relatorio?.ordensPeriodo ||
        [];

      if (Array.isArray(ordens) && ordens.length > 0) {
        tituloSecao("Ordens do período");

        const tableX = margin;
        const colunas = financeiroSensivelLiberado
          ? [
              { key: "numero", label: "OS", width: 40, align: "left" as const },
              { key: "data", label: "Data", width: 48, align: "left" as const },
              { key: "cliente", label: "Cliente", width: 95, align: "left" as const },
              { key: "equipamento", label: "Equip.", width: 70, align: "left" as const },
              { key: "status", label: "Status", width: 55, align: "left" as const },
              { key: "bruto", label: "Bruto", width: 72, align: "right" as const },
              { key: "custo", label: "Custo", width: 72, align: "right" as const },
              { key: "lucro", label: "Lucro", width: 73, align: "right" as const },
            ]
          : [
              { key: "numero", label: "OS", width: 45, align: "left" as const },
              { key: "data", label: "Data", width: 55, align: "left" as const },
              { key: "cliente", label: "Cliente", width: 125, align: "left" as const },
              { key: "equipamento", label: "Equipamento", width: 105, align: "left" as const },
              { key: "status", label: "Status", width: 80, align: "left" as const },
              { key: "valor", label: "Total", width: 115, align: "right" as const },
            ];

        function escreverCelulas(
          valores: Record<string, string>,
          y: number,
          bold = false
        ) {
          let x = tableX;

          for (const coluna of colunas) {
            doc
              .fontSize(financeiroSensivelLiberado ? 7 : 8)
              .fillColor("#222222")
              .font(bold ? "Helvetica-Bold" : "Helvetica")
              .text(valores[coluna.key] || "-", x + 3, y, {
                width: coluna.width - 6,
                align: coluna.align,
                lineBreak: false,
              });

            x += coluna.width;
          }
        }

        function cabecalhoTabela() {
          verificarEspaco(28);

          const y = doc.y;
          doc.rect(tableX, y, contentWidth, 20).fillColor("#eeeeee").fill();

          escreverCelulas(
            Object.fromEntries(colunas.map((coluna) => [coluna.key, coluna.label])),
            y + 6,
            true
          );

          doc.y = y + 25;
        }

        cabecalhoTabela();

        ordens.forEach((ordem: any) => {
          verificarEspaco(24);

          const y = doc.y;
          const status = nomesStatus[ordem?.status] || ordem?.status || "-";
          const custoRastreado = ordem?.costTracked !== false;
          const lucroDisponivel =
            custoRastreado &&
            ordem?.grossProfit !== null &&
            ordem?.grossProfit !== undefined;

          escreverCelulas(
            financeiroSensivelLiberado
              ? {
                  numero: cortar(`Nº ${numeroOS(ordem)}`, 9),
                  data: formatarData(ordem?.openedAt || ordem?.createdAt || ordem?.dataEntrada),
                  cliente: cortar(nomeCliente(ordem), 18),
                  equipamento: cortar(nomeEquipamento(ordem), 12),
                  status: cortar(status, 10),
                  bruto: formatarMoeda(ordem?.grossAmount ?? valorOrdem(ordem)),
                  custo: custoRastreado
                    ? formatarMoeda(ordem?.technicalPartsCost ?? 0)
                    : "N/I",
                  lucro: lucroDisponivel
                    ? formatarMoeda(ordem?.grossProfit)
                    : "N/I",
                }
              : {
                  numero: cortar(`Nº ${numeroOS(ordem)}`, 12),
                  data: formatarData(ordem?.openedAt || ordem?.createdAt || ordem?.dataEntrada),
                  cliente: cortar(nomeCliente(ordem), 24),
                  equipamento: cortar(nomeEquipamento(ordem), 20),
                  status: cortar(status, 14),
                  valor: formatarMoeda(valorOrdem(ordem)),
                },
            y
          );

          doc.y = y + 18;
          doc
            .moveTo(tableX, doc.y)
            .lineTo(tableX + contentWidth, doc.y)
            .strokeColor("#eeeeee")
            .lineWidth(0.4)
            .stroke();

          doc.y += 5;
        });
      }

      const range = doc.bufferedPageRange();

      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        const footerY = doc.page.height - 35;

        doc
          .fontSize(7)
          .fillColor("#777777")
          .font("Helvetica")
          .text(
            empresa?.rodape ||
              empresa?.footerText ||
              "Relatório gerado pelo sistema de Ordem de Serviço.",
            margin,
            footerY - 10,
            {
              width: contentWidth,
              align: "center",
            }
          );

        doc
          .fontSize(7)
          .fillColor("#777777")
          .text(`Página ${i + 1} de ${range.count}`, margin, footerY + 2, {
            width: contentWidth,
            align: "center",
          });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Gera o buffer binário do relatório em PDF específico para técnicos e comissões.
 * Suporta filtragem por técnico individual ou visão geral consolidada de todos os técnicos,
 * aplicando restrições de sigilo para perfil técnico (não exibe lucro geral da loja).
 * @param relatorio - Dados analíticos retornados pela API de relatórios
 * @param empresa - Dados cadastrais da empresa
 * @param periodoInicio - Data inicial formatada
 * @param periodoFim - Data final formatada
 * @param tecnicoFiltro - Chave do técnico filtrado ou 'TODOS'
 * @param ehApenasTecnico - Indicador se o usuário autenticado é técnico com visão restrita
 * @returns Promise com o Buffer binário do PDF
 */
async function gerarBufferPDFTecnicos(
  relatorio: any,
  empresa: EmpresaConfig,
  periodoInicio: string,
  periodoFim: string,
  tecnicoFiltro: string,
  ehApenasTecnico = false
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 35,
        bufferPages: true,
      });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const margin = 35;
      const contentWidth = doc.page.width - margin * 2;
      const todos = tecnicoFiltro === "TODOS";
      const tecnicosBase = Array.isArray(relatorio?.tecnicosFinanceiros)
        ? relatorio.tecnicosFinanceiros
        : [];
      const tecnicos = todos
        ? tecnicosBase
        : tecnicosBase.filter(
            (item: any) => item?.technicianKey === tecnicoFiltro
          );
      const ordensBase = Array.isArray(relatorio?.ordens)
        ? relatorio.ordens
        : [];
      const ordens = ordensBase.filter(
        (ordem: any) =>
          Boolean(ordem?.technicianReportKey) &&
          (todos || ordem?.technicianReportKey === tecnicoFiltro)
      );

      const resumo = tecnicos.reduce(
        (acc: any, item: any) => ({
          totalOrders: acc.totalOrders + Number(item?.totalOrders || 0),
          grossProfitGenerated:
            acc.grossProfitGenerated +
            Number(item?.grossProfitGenerated || 0),
          technicianProfitShare:
            acc.technicianProfitShare +
            Number(item?.technicianProfitShare || 0),
          storeProfit: acc.storeProfit + Number(item?.storeProfit || 0),
          untrackedOrders:
            acc.untrackedOrders + Number(item?.untrackedOrders || 0),
        }),
        {
          totalOrders: 0,
          grossProfitGenerated: 0,
          technicianProfitShare: 0,
          storeProfit: 0,
          untrackedOrders: 0,
        }
      );

      const verificarEspaco = (altura = 45) => {
        if (doc.y + altura > doc.page.height - 55) doc.addPage();
      };

      const tituloSecao = (titulo: string) => {
        verificarEspaco(35);
        doc.moveDown(0.6);
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#111111")
          .text(titulo, margin, doc.y);
        doc.moveDown(0.25);
        doc
          .moveTo(margin, doc.y)
          .lineTo(doc.page.width - margin, doc.y)
          .strokeColor("#dddddd")
          .lineWidth(0.5)
          .stroke();
        doc.moveDown(0.5);
      };

      const card = (
        titulo: string,
        valor: string,
        x: number,
        y: number,
        width: number
      ) => {
        doc
          .roundedRect(x, y, width, 48, 6)
          .strokeColor("#dddddd")
          .lineWidth(0.8)
          .stroke();
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#666666")
          .text(titulo, x + 8, y + 8, { width: width - 16 });
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#111111")
          .text(valor, x + 8, y + 25, { width: width - 16 });
      };

      const logoPath = caminhoLogoSeguro(empresa?.logoUrl);
      if (logoPath && fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, margin, 25, { fit: [80, 45] });
        } catch {
          // Logo inválida não impede o relatório.
        }
      }

      const nomeEmpresa =
        empresa?.nomeFantasia ||
        empresa?.nomeEmpresa ||
        empresa?.companyName ||
        "Relatório";

      doc
        .font("Helvetica-Bold")
        .fontSize(15)
        .fillColor("#111111")
        .text(nomeEmpresa, 130, 28, {
          width: doc.page.width - 165,
          align: "right",
        });

      doc.y = 95;
      doc
        .moveTo(margin, doc.y)
        .lineTo(doc.page.width - margin, doc.y)
        .strokeColor("#cccccc")
        .lineWidth(0.5)
        .stroke();

      doc.moveDown(1);
      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("#111111")
        .text("Relatório de Lucro por Técnico", margin, doc.y, {
          width: contentWidth,
          align: "center",
        });

      doc.moveDown(0.35);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#555555")
        .text(
          `Período: ${formatarData(periodoInicio)} até ${formatarData(
            periodoFim
          )}`,
          { width: contentWidth, align: "center" }
        );

      doc.moveDown(0.15);
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#333333")
        .text(
          todos
            ? "Técnico: Todos os técnicos"
            : `Técnico: ${tecnicos[0]?.technicianName || "Não encontrado"}`,
          { width: contentWidth, align: "center" }
        );

      tituloSecao("Resumo");

      if (ehApenasTecnico) {
        const cardW = (contentWidth - 10) / 2;
        const yResumo = doc.y;

        card("Ordens de Serviço (OS)", String(resumo.totalOrders), margin, yResumo, cardW);
        card(
          "Sua Participação / Comissão",
          formatarMoeda(resumo.technicianProfitShare),
          margin + cardW + 10,
          yResumo,
          cardW
        );

        doc.y = yResumo + 62;
      } else {
        const cardW = (contentWidth - 30) / 4;
        const yResumo = doc.y;

        card("OS", String(resumo.totalOrders), margin, yResumo, cardW);
        card(
          "Lucro gerado",
          formatarMoeda(resumo.grossProfitGenerated),
          margin + cardW + 10,
          yResumo,
          cardW
        );
        card(
          "Participação",
          formatarMoeda(resumo.technicianProfitShare),
          margin + (cardW + 10) * 2,
          yResumo,
          cardW
        );
        card(
          "Lucro loja",
          formatarMoeda(resumo.storeProfit),
          margin + (cardW + 10) * 3,
          yResumo,
          cardW
        );

        doc.y = yResumo + 62;
      }

      if (resumo.untrackedOrders > 0) {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#8a4b08")
          .text(
            `${resumo.untrackedOrders} OS sem base suficiente para calcular a divisão financeira.`,
            margin,
            doc.y,
            { width: contentWidth }
          );
      }

      if (!ehApenasTecnico && todos && tecnicos.length > 0) {
        tituloSecao("Resumo por técnico");

        tecnicos.forEach((tecnico: any, index: number) => {
          verificarEspaco(30);

          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor("#111111")
            .text(
              `${index + 1}. ${tecnico?.technicianName || "Técnico"}`,
              margin,
              doc.y
            );

          doc.moveDown(0.1);

          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#555555")
            .text(
              `${Number(tecnico?.totalOrders || 0)} OS | Lucro: ${formatarMoeda(
                tecnico?.grossProfitGenerated
              )} | Participação: ${formatarMoeda(
                tecnico?.technicianProfitShare
              )} | Loja: ${formatarMoeda(tecnico?.storeProfit)}`,
              margin,
              doc.y,
              { width: contentWidth }
            );

          doc.moveDown(0.35);
        });
      }

      tituloSecao("Ordens de serviço");

      if (ordens.length === 0) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#555555")
          .text("Nenhuma OS encontrada para esta seleção.", margin, doc.y);
      } else {
        ordens.forEach((ordem: any) => {
          verificarEspaco(42);

          const rastreada =
            ordem?.profitShareTracked !== false &&
            (ehApenasTecnico
              ? ordem?.technicianProfitShare !== null &&
                ordem?.technicianProfitShare !== undefined
              : ordem?.grossProfit !== null &&
                ordem?.grossProfit !== undefined);
          const percentual = rastreada
            ? `${Number(ordem?.technicianProfitPercent || 0).toLocaleString(
                "pt-BR",
                { maximumFractionDigits: 2 }
              )}%`
            : "N/I";

          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor("#111111")
            .text(
              `OS Nº ${numeroOS(ordem)} - ${
                ordem?.technicianResponsible || "Técnico não rastreado"
              }`,
              margin,
              doc.y,
              { width: contentWidth }
            );

          doc.moveDown(0.12);

          const textoLinha = ehApenasTecnico
            ? `Equipamento: ${ordem?.equipmentType || "-"} ${
                ordem?.brand || ""
              } ${ordem?.model || ""} | % da OS: ${percentual} | Sua Comissão: ${
                rastreada
                  ? formatarMoeda(ordem?.technicianProfitShare)
                  : "N/I"
              }`
            : `Lucro: ${
                rastreada ? formatarMoeda(ordem?.grossProfit) : "N/I"
              } | %: ${percentual} | Participação: ${
                rastreada
                  ? formatarMoeda(ordem?.technicianProfitShare)
                  : "N/I"
              } | Loja: ${
                rastreada ? formatarMoeda(ordem?.storeProfit) : "N/I"
              }`;

          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#555555")
            .text(
              textoLinha,
              margin,
              doc.y,
              { width: contentWidth }
            );

          doc.moveDown(0.25);
          doc
            .moveTo(margin, doc.y)
            .lineTo(doc.page.width - margin, doc.y)
            .strokeColor("#eeeeee")
            .lineWidth(0.4)
            .stroke();
          doc.moveDown(0.35);
        });
      }

      const range = doc.bufferedPageRange();

      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor("#777777")
          .text(
            `Página ${i + 1} de ${range.count}`,
            margin,
            doc.page.height - 33,
            { width: contentWidth, align: "center" }
          );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Manipulador GET para exportação de relatórios em formato PDF.
 * Suporta o modo `geral` (exige `relatorios.ver` ou `relatorios.financeiro`)
 * e o modo `tecnicos` (exige `relatorios.financeiro` ou perfil técnico ativo).
 * Invoca internamente a API `/api/relatorios` e `/api/configuracoes` para renderizar o PDF compilado.
 * @param request - Requisição HTTP contendo query params (`modo`, `tecnico`, `inicio`, `fim`)
 * @returns Resposta com stream binário PDF (`application/pdf`)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const modo = searchParams.get("modo") === "tecnicos" ? "tecnicos" : "geral";
    let tecnicoFiltro = String(searchParams.get("tecnico") || "TODOS").slice(
      0,
      180
    );

    const acesso = await exigirPermissaoApi(
      modo === "tecnicos"
        ? "relatorios.financeiro"
        : ["relatorios.ver", "relatorios.financeiro"]
    );

    let usuario = acesso.usuario;
    let ehApenasTecnico = false;

    if (!acesso.ok) {
      const usuarioLogado = await obterUsuarioLogado();
      if (
        modo === "tecnicos" &&
        usuarioLogado &&
        usuarioLogado.status === "ATIVO" &&
        usuarioLogado.role === "TECNICO"
      ) {
        usuario = usuarioLogado;
        ehApenasTecnico = true;
      } else {
        return acesso.response;
      }
    } else {
      ehApenasTecnico =
        usuario?.role === "TECNICO" &&
        !usuarioPodeVerDadosFinanceirosSensiveis(usuario);
    }

    if (ehApenasTecnico && usuario?.id) {
      tecnicoFiltro = usuario.id;
    }

    const inicio = searchParams.get("inicio") || "";
    const fim = searchParams.get("fim") || "";

    if (!inicio || !fim) {
      return Response.json(
        {
          error: "Informe o período inicial e final.",
        },
        {
          status: 400,
        }
      );
    }

    const inicioValido = criarDataLocalSegura(inicio);
    const fimValido = criarDataLocalSegura(fim);

    if (!inicioValido || !fimValido) {
      return Response.json(
        {
          error: "Período inválido para gerar PDF.",
        },
        {
          status: 400,
        }
      );
    }

    if (fimValido < inicioValido) {
      return Response.json(
        {
          error: "A data final não pode ser menor que a data inicial.",
        },
        {
          status: 400,
        }
      );
    }

    const urlRelatorio = new URL("/api/relatorios", origin);
    urlRelatorio.searchParams.set("dataInicial", inicio);
    urlRelatorio.searchParams.set("dataFinal", fim);

    const cookieHeader = request.headers.get("cookie") || "";

const relatorioResponse = await fetch(urlRelatorio.toString(), {
  cache: "no-store",
  headers: {
    cookie: cookieHeader,
  },
});

    if (!relatorioResponse.ok) {
  const erro = await relatorioResponse.json().catch(() => null);

  return Response.json(
    {
      error:
        erro?.message ||
        erro?.error ||
        "Não foi possível carregar os dados do relatório.",
    },
    {
      status: relatorioResponse.status,
    }
  );
}

    const relatorio = await relatorioResponse.json();

    const urlConfiguracoes = new URL("/api/configuracoes", origin);

    const configuracoesResponse = await fetch(urlConfiguracoes.toString(), {
  cache: "no-store",
  headers: {
    cookie: cookieHeader,
  },
});

    let empresa: EmpresaConfig = {};

    if (configuracoesResponse.ok) {
      empresa = await configuracoesResponse.json();
    }

    if (modo === "tecnicos" && tecnicoFiltro !== "TODOS") {
      const existe = Array.isArray(relatorio?.tecnicosFinanceiros)
        ? relatorio.tecnicosFinanceiros.some(
            (item: any) => item?.technicianKey === tecnicoFiltro
          )
        : false;

      if (!existe) {
        return Response.json(
          { error: "Técnico não encontrado no período informado." },
          { status: 404 }
        );
      }
    }

    const buffer =
      modo === "tecnicos"
        ? await gerarBufferPDFTecnicos(
            relatorio,
            empresa,
            inicio,
            fim,
            tecnicoFiltro,
            ehApenasTecnico
          )
        : await gerarBufferPDF(relatorio, empresa, inicio, fim);

    return new Response(buffer as unknown as BodyInit, {
  status: 200,
  headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition":
      modo === "tecnicos"
        ? `inline; filename="relatorio-tecnicos-${inicio}-a-${fim}.pdf"`
        : `inline; filename="relatorio-${inicio}-a-${fim}.pdf"`,
    "Cache-Control": "no-store",
  },
});
  } catch (error) {
    console.error("Erro ao gerar PDF do relatório:", error);

    return Response.json(
      {
        error: "Erro ao gerar PDF do relatório.",
      },
      {
        status: 500,
      }
    );
  }
}
