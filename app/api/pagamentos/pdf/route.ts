import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nomesPagamento: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  TRANSFERENCIA: "Transferência",
};

function criarDataLocal(data: string) {
  const [ano, mes, dia] = data.split("-").map(Number);

  return new Date(ano, mes - 1, dia);
}

function inicioDoDia(data: string) {
  const d = criarDataLocal(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDoDia(data: string) {
  const d = criarDataLocal(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatarMoeda(valor: unknown) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(data: unknown) {
  if (!data) return "-";

  const d = new Date(String(data));

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("pt-BR");
}

function formatarDataHora(data: unknown) {
  if (!data) return "-";

  const d = new Date(String(data));

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("pt-BR");
}

function gerarPDFPagamentos({
  pagamentos,
  dataInicial,
  dataFinal,
}: {
  pagamentos: any[];
  dataInicial: Date;
  dataFinal: Date;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 30,
      });

      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const totalRecebido = pagamentos.reduce((total, pagamento) => {
        return total + Number(pagamento.amount || 0);
      }, 0);

      const totalPagamentos = pagamentos.length;
      const ticketMedio =
        totalPagamentos > 0 ? totalRecebido / totalPagamentos : 0;

      // Cabeçalho
      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#111827")
        .text("Extrato de Pagamentos", {
          align: "center",
        });

      doc.moveDown(0.3);

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#475569")
        .text(
          `Periodo: ${formatarData(dataInicial)} ate ${formatarData(dataFinal)}`,
          {
            align: "center",
          }
        );

      doc.moveDown(1);

      // Cards resumo
      const cardY = doc.y;
      const cardW = 240;
      const cardH = 52;

      function card(titulo: string, valor: string, x: number) {
        doc
          .roundedRect(x, cardY, cardW, cardH, 8)
          .fillColor("#f8fafc")
          .fill()
          .strokeColor("#e5e7eb")
          .stroke();

        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#64748b")
          .text(titulo, x + 10, cardY + 10, {
            width: cardW - 20,
          });

        doc
          .font("Helvetica-Bold")
          .fontSize(14)
          .fillColor("#111827")
          .text(valor, x + 10, cardY + 27, {
            width: cardW - 20,
          });
      }

      card("Total recebido", formatarMoeda(totalRecebido), 30);
      card("Pagamentos", String(totalPagamentos), 290);
      card("Ticket medio", formatarMoeda(ticketMedio), 550);

      doc.y = cardY + cardH + 22;

      // Tabela
      const startX = 30;
      let y = doc.y;

      const colunas = {
        data: 85,
        os: 70,
        cliente: 160,
        forma: 105,
        percentual: 70,
        valor: 85,
        observacao: 210,
      };

      function desenharCabecalhoTabela() {
        doc
          .rect(startX, y, 780, 24)
          .fillColor("#f1f5f9")
          .fill();

        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor("#111827")
          .text("Data", startX + 6, y + 8, { width: colunas.data })
          .text("OS", startX + 6 + colunas.data, y + 8, {
            width: colunas.os,
          })
          .text("Cliente", startX + 6 + colunas.data + colunas.os, y + 8, {
            width: colunas.cliente,
          })
          .text(
            "Forma",
            startX + 6 + colunas.data + colunas.os + colunas.cliente,
            y + 8,
            { width: colunas.forma }
          )
          .text(
            "%",
            startX +
              6 +
              colunas.data +
              colunas.os +
              colunas.cliente +
              colunas.forma,
            y + 8,
            { width: colunas.percentual }
          )
          .text(
            "Valor",
            startX +
              6 +
              colunas.data +
              colunas.os +
              colunas.cliente +
              colunas.forma +
              colunas.percentual,
            y + 8,
            { width: colunas.valor }
          )
          .text(
            "Observacao",
            startX +
              6 +
              colunas.data +
              colunas.os +
              colunas.cliente +
              colunas.forma +
              colunas.percentual +
              colunas.valor,
            y + 8,
            { width: colunas.observacao }
          );

        y += 28;
      }

      desenharCabecalhoTabela();

      if (pagamentos.length === 0) {
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#64748b")
          .text("Nenhum pagamento encontrado no periodo.", startX, y + 10);
      } else {
        pagamentos.forEach((pagamento) => {
          if (y > 520) {
            doc.addPage();
            y = 30;
            desenharCabecalhoTabela();
          }

          const ordem = pagamento.serviceOrder;
          const cliente = ordem?.customer;
          const numeroOS = String(ordem?.osNumber || "").padStart(3, "0");

          doc
            .moveTo(startX, y - 4)
            .lineTo(810, y - 4)
            .strokeColor("#e5e7eb")
            .stroke();

          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#111827")
            .text(formatarDataHora(pagamento.createdAt), startX + 6, y, {
              width: colunas.data,
              height: 24,
              ellipsis: true,
            })
            .text(`Nº ${numeroOS}`, startX + 6 + colunas.data, y, {
              width: colunas.os,
              height: 24,
              ellipsis: true,
            })
            .text(
              cliente?.name || "-",
              startX + 6 + colunas.data + colunas.os,
              y,
              {
                width: colunas.cliente,
                height: 24,
                ellipsis: true,
              }
            )
            .text(
              nomesPagamento[pagamento.paymentMethod] ||
                pagamento.paymentMethod ||
                "-",
              startX + 6 + colunas.data + colunas.os + colunas.cliente,
              y,
              {
                width: colunas.forma,
                height: 24,
                ellipsis: true,
              }
            )
            .text(
              `${pagamento.percent}%`,
              startX +
                6 +
                colunas.data +
                colunas.os +
                colunas.cliente +
                colunas.forma,
              y,
              {
                width: colunas.percentual,
                height: 24,
              }
            )
            .text(
              formatarMoeda(pagamento.amount),
              startX +
                6 +
                colunas.data +
                colunas.os +
                colunas.cliente +
                colunas.forma +
                colunas.percentual,
              y,
              {
                width: colunas.valor,
                height: 24,
              }
            )
            .text(
              pagamento.note || "-",
              startX +
                6 +
                colunas.data +
                colunas.os +
                colunas.cliente +
                colunas.forma +
                colunas.percentual +
                colunas.valor,
              y,
              {
                width: colunas.observacao,
                height: 24,
                ellipsis: true,
              }
            );

          y += 30;
        });
      }

      // Rodapé
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#64748b")
        .text(
          "Documento gerado automaticamente pelo sistema de Ordem de Servico.",
          30,
          560,
          {
            width: 780,
            align: "center",
          }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function GET(request: Request) {
  try {
    const acesso = await exigirPermissaoApi([
      "pagamentos.ver",
      "relatorios.financeiro",
    ]);

    if (!acesso.ok) {
      return acesso.response;
    }

    const { searchParams } = new URL(request.url);

    const hoje = new Date();

    const inicioParam = searchParams.get("inicio");
    const fimParam = searchParams.get("fim");

    const dataInicial = inicioParam
      ? inicioDoDia(inicioParam)
      : new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0);

    const dataFinal = fimParam
      ? fimDoDia(fimParam)
      : new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);

    const pagamentos = await prisma.serviceOrderPayment.findMany({
      where: {
        createdAt: {
          gte: dataInicial,
          lte: dataFinal,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        serviceOrder: {
          include: {
            customer: true,
          },
        },
      },
    });

    const pdfBuffer = await gerarPDFPagamentos({
      pagamentos,
      dataInicial,
      dataFinal,
    });

    const pdfArrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    ) as ArrayBuffer;

    return new Response(pdfArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="extrato-pagamentos.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar PDF de pagamentos:", error);

    return NextResponse.json(
      { message: "Erro ao gerar PDF de pagamentos." },
      { status: 500 }
    );
  }
}
