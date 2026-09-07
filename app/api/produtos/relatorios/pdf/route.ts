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

function formatarMoeda(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "R$ 0,00";
}

function formatarData(dataIso?: string | null) {
  if (!dataIso) return "-";
  try {
    const d = new Date(dataIso);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("pt-BR");
  } catch {
    return "-";
  }
}

function formatarDataHora(dataIso?: string | null) {
  if (!dataIso) return "-";
  try {
    const d = new Date(dataIso);
    return isNaN(d.getTime())
      ? "-"
      : d.toLocaleDateString("pt-BR") +
          " " +
          d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
}

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

function formatarDataPeriodo(dataIso: string) {
  const d = criarDataLocalSegura(dataIso);
  if (!d) return dataIso;
  return d.toLocaleDateString("pt-BR");
}

function resolverCaminhoLogoLocal(logoUrl?: string) {
  if (!logoUrl) return null;
  try {
    const limpo = logoUrl.split("?")[0].replace(/^(\/|\\)+/, "");
    const baseUploads = path.normalize(caminhoUploadPublico());
    let caminho = "";

    if (limpo.startsWith("uploads/")) {
      caminho = path.join(baseUploads, limpo.replace(/^uploads\//, ""));
    } else {
      caminho = path.join(process.cwd(), "public", limpo);
    }

    caminho = path.normalize(caminho);
    return fs.existsSync(caminho) ? caminho : null;
  } catch {
    return null;
  }
}

async function gerarBufferPDFAtendentes(
  relatorio: any,
  empresa: EmpresaConfig,
  periodoInicio: string,
  periodoFim: string,
  atendenteFiltro: string,
  ehApenasAtendente = false
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
      const todos = atendenteFiltro === "TODOS";

      const atendentesBase = Array.isArray(relatorio?.rankings?.atendentes)
        ? relatorio.rankings.atendentes
        : [];
      const atendentes = todos
        ? atendentesBase
        : atendentesBase.filter((item: any) => item?.id === atendenteFiltro);

      const vendasBase = Array.isArray(relatorio?.vendasAtendentes)
        ? relatorio.vendasAtendentes
        : [];
      const vendas = vendasBase.filter(
        (venda: any) =>
          Boolean(venda?.attendantId) &&
          (todos || venda?.attendantId === atendenteFiltro)
      );

      const resumo = atendentes.reduce(
        (acc: any, item: any) => ({
          vendas: acc.vendas + Number(item?.vendas || 0),
          itensVendidos: acc.itensVendidos + Number(item?.itensVendidos || 0),
          totalVendido: acc.totalVendido + Number(item?.totalVendido || 0),
          comissaoTotal: acc.comissaoTotal + Number(item?.comissaoTotal || 0),
          lucroLiquidoLoja:
            acc.lucroLiquidoLoja + Number(item?.lucroLiquidoLoja || 0),
        }),
        {
          vendas: 0,
          itensVendidos: 0,
          totalVendido: 0,
          comissaoTotal: 0,
          lucroLiquidoLoja: 0,
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
          .fontSize(7.5)
          .fillColor("#666666")
          .text(titulo.toUpperCase(), x + 7, y + 8, {
            width: width - 14,
            align: "center",
          });
        doc
          .font("Helvetica-Bold")
          .fontSize(10.5)
          .fillColor("#111111")
          .text(valor, x + 7, y + 23, {
            width: width - 14,
            align: "center",
          });
      };

      // Cabeçalho da Empresa
      const logoPath = resolverCaminhoLogoLocal(empresa.logoUrl);
      const topY = doc.y;

      if (logoPath) {
        try {
          doc.image(logoPath, margin, topY, { fit: [100, 48] });
        } catch {
          // ignora falha de imagem
        }
      }

      const infoX = logoPath ? margin + 115 : margin;
      const infoW = logoPath ? contentWidth - 115 : contentWidth;

      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#111111")
        .text(
          empresa.nomeFantasia ||
            empresa.nomeEmpresa ||
            empresa.companyName ||
            "SISTEMA OS",
          infoX,
          topY,
          { width: infoW, align: logoPath ? "left" : "center" }
        );

      doc.moveDown(0.15);

      const dadosContato: string[] = [];
      if (empresa.cnpj || empresa.documento) {
        dadosContato.push(`CNPJ: ${empresa.cnpj || empresa.documento}`);
      }
      if (empresa.telefone || empresa.phone || empresa.whatsapp) {
        dadosContato.push(
          `Tel: ${empresa.telefone || empresa.phone || empresa.whatsapp}`
        );
      }
      if (empresa.endereco || empresa.address) {
        dadosContato.push(empresa.endereco || empresa.address || "");
      }

      if (dadosContato.length > 0) {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#555555")
          .text(dadosContato.join(" | "), infoX, doc.y, {
            width: infoW,
            align: logoPath ? "left" : "center",
          });
      }

      doc.y = Math.max(doc.y, topY + 54);

      doc.moveDown(0.5);
      doc
        .moveTo(margin, doc.y)
        .lineTo(doc.page.width - margin, doc.y)
        .strokeColor("#cccccc")
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.4);

      // Título do Relatório
      const tituloRelatorio = ehApenasAtendente
        ? "RELATÓRIO DE COMISSÃO - ATENDENTE"
        : "RELATÓRIO DE VENDAS E COMISSÃO POR ATENDENTE";

      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#111111")
        .text(tituloRelatorio, margin, doc.y, {
          width: contentWidth,
          align: "center",
        });

      doc.moveDown(0.15);
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor("#555555")
        .text(
          `Período: ${formatarDataPeriodo(periodoInicio)} a ${formatarDataPeriodo(
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
            ? "Atendente: Todos os atendentes"
            : `Atendente: ${atendentes[0]?.name || "Não encontrado"}`,
          { width: contentWidth, align: "center" }
        );

      tituloSecao("Resumo do Período");

      const cardW = (contentWidth - 30) / 4;
      const yResumo = doc.y;

      if (ehApenasAtendente) {
        card("Vendas Realizadas", String(resumo.vendas), margin, yResumo, cardW);
        card(
          "Itens Vendidos",
          String(resumo.itensVendidos),
          margin + cardW + 10,
          yResumo,
          cardW
        );
        card(
          "Total Vendido",
          formatarMoeda(resumo.totalVendido),
          margin + (cardW + 10) * 2,
          yResumo,
          cardW
        );
        card(
          "Sua Comissão",
          formatarMoeda(resumo.comissaoTotal),
          margin + (cardW + 10) * 3,
          yResumo,
          cardW
        );
      } else {
        card("Vendas", String(resumo.vendas), margin, yResumo, cardW);
        card(
          "Total Vendido",
          formatarMoeda(resumo.totalVendido),
          margin + cardW + 10,
          yResumo,
          cardW
        );
        card(
          "Comissão Atendentes",
          formatarMoeda(resumo.comissaoTotal),
          margin + (cardW + 10) * 2,
          yResumo,
          cardW
        );
        card(
          "Lucro Loja",
          formatarMoeda(resumo.lucroLiquidoLoja),
          margin + (cardW + 10) * 3,
          yResumo,
          cardW
        );
      }

      doc.y = yResumo + 62;

      // Resumo por Atendente (somente para Admin com "TODOS")
      if (!ehApenasAtendente && todos && atendentes.length > 0) {
        tituloSecao("Resumo por Atendente");

        atendentes.forEach((att: any, index: number) => {
          verificarEspaco(30);

          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor("#111111")
            .text(
              `${index + 1}. ${att?.name || "Atendente"} (${att?.percentualComissao || 0}%)`,
              margin,
              doc.y
            );

          doc.moveDown(0.1);

          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#555555")
            .text(
              `${Number(att?.vendas || 0)} vendas (${Number(att?.itensVendidos || 0)} itens) | Total: ${formatarMoeda(
                att?.totalVendido
              )} | Comissão: ${formatarMoeda(
                att?.comissaoTotal
              )} | Loja: ${formatarMoeda(att?.lucroLiquidoLoja)}`,
              margin,
              doc.y,
              { width: contentWidth }
            );

          doc.moveDown(0.35);
        });
      }

      // Detalhamento de Vendas e Itens
      tituloSecao("Vendas e Itens Realizados");

      if (vendas.length === 0) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#555555")
          .text("Nenhuma venda encontrada para esta seleção.", margin, doc.y);
      } else {
        vendas.forEach((venda: any) => {
          verificarEspaco(55);

          const percentual = Number(
            venda?.attendantProfitPercentSnapshot || 0
          ).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor("#111111")
            .text(
              `Cupom Nº ${venda.saleNumber} - ${venda.attendantName || "Atendente"} - ${formatarDataHora(
                venda.soldAt
              )}${venda.customerName ? ` | Cliente: ${venda.customerName}` : ""}`,
              margin,
              doc.y,
              { width: contentWidth }
            );

          doc.moveDown(0.12);

          // Itens da venda
          if (Array.isArray(venda.items) && venda.items.length > 0) {
            venda.items.forEach((item: any) => {
              verificarEspaco(16);
              doc
                .font("Helvetica")
                .fontSize(7.8)
                .fillColor("#444444")
                .text(
                  `  • ${item.quantity}x ${item.productName} - ${formatarMoeda(
                    item.unitPrice
                  )} = ${formatarMoeda(item.totalAmount)}`,
                  margin + 8,
                  doc.y,
                  { width: contentWidth - 16 }
                );
              doc.moveDown(0.08);
            });
          }

          // Resumo da linha da venda
          const textoLinha = ehApenasAtendente
            ? `Total da Venda: ${formatarMoeda(
                venda.totalAmount
              )} | % Comissão: ${percentual}% | Sua Comissão: ${formatarMoeda(
                venda.attendantProfitShare
              )}`
            : `Total: ${formatarMoeda(
                venda.totalAmount
              )} | %: ${percentual}% | Comissão: ${formatarMoeda(
                venda.attendantProfitShare
              )} | Loja: ${formatarMoeda(venda.storeProfit)}`;

          doc
            .font("Helvetica-Bold")
            .fontSize(8)
            .fillColor(ehApenasAtendente ? "#1e40af" : "#333333")
            .text(textoLinha, margin, doc.y, { width: contentWidth });

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const modo = searchParams.get("modo") || "atendentes";
    let atendenteFiltro = String(searchParams.get("atendente") || "TODOS").slice(
      0,
      180
    );

    const acesso = await exigirPermissaoApi([
      "relatorios.ver",
      "relatorios.financeiro",
    ]);

    let usuario = acesso.usuario;
    let ehApenasAtendente = false;

    if (!acesso.ok) {
      const usuarioLogado = await obterUsuarioLogado();
      if (
        usuarioLogado &&
        usuarioLogado.status === "ATIVO" &&
        usuarioLogado.role === "ATENDENTE"
      ) {
        usuario = usuarioLogado;
        ehApenasAtendente = true;
      } else {
        return acesso.response;
      }
    } else {
      ehApenasAtendente =
        usuario?.role === "ATENDENTE" &&
        !usuarioPodeVerDadosFinanceirosSensiveis(usuario);
    }

    if (ehApenasAtendente && usuario?.id) {
      atendenteFiltro = usuario.id;
    }

    const inicio = searchParams.get("inicio") || "";
    const fim = searchParams.get("fim") || "";

    if (!inicio || !fim) {
      return Response.json(
        { error: "Informe o período inicial e final." },
        { status: 400 }
      );
    }

    const inicioValido = criarDataLocalSegura(inicio);
    const fimValido = criarDataLocalSegura(fim);

    if (!inicioValido || !fimValido) {
      return Response.json(
        { error: "Período inválido para gerar PDF." },
        { status: 400 }
      );
    }

    if (fimValido < inicioValido) {
      return Response.json(
        { error: "A data final não pode ser menor que a data inicial." },
        { status: 400 }
      );
    }

    const urlRelatorio = new URL("/api/produtos/relatorios", origin);
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
            "Não foi possível carregar os dados do relatório de produtos.",
        },
        { status: relatorioResponse.status }
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

    if (atendenteFiltro !== "TODOS") {
      const existe = Array.isArray(relatorio?.rankings?.atendentes)
        ? relatorio.rankings.atendentes.some(
            (item: any) => item?.id === atendenteFiltro
          )
        : false;

      if (!existe && !ehApenasAtendente) {
        return Response.json(
          { error: "Atendente não encontrado no período informado." },
          { status: 404 }
        );
      }
    }

    const buffer = await gerarBufferPDFAtendentes(
      relatorio,
      empresa,
      inicio,
      fim,
      atendenteFiltro,
      ehApenasAtendente
    );

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="relatorio-atendentes-${inicio}-a-${fim}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar PDF do relatório de atendentes:", error);
    return Response.json(
      { error: "Erro ao gerar PDF do relatório de atendentes." },
      { status: 500 }
    );
  }
}
