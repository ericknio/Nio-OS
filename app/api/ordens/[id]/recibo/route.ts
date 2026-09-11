/**
 * @file route.ts
 * @description Endpoint para geração de Recibo de Pagamento em PDF da Ordem de Serviço (`/api/ordens/[id]/recibo`).
 * Renderiza documento fiscal/operacional A4 contendo dados da empresa, cliente, equipamento,
 * resumo financeiro (total, pago, saldo devedor), relação detalhada de pagamentos recebidos
 * e termo de quitação/declaração formal com registro em auditoria.
 */

import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { caminhoUploadPublico } from "@/lib/runtimeStorage";
import {
  buscarConfiguracoesSistema,
  ConfiguracoesSistema,
  montarContatoEmpresa,
  montarEnderecoEmpresa,
} from "@/lib/configuracoesSistema";
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

/**
 * Obtém o nome legível do operador autenticado para trilhas de auditoria.
 * @param usuario - Dados do usuário autenticado
 * @returns Nome, username, e-mail ou 'Sistema'
 */
function nomeOperador(usuario: {
  name?: string | null;
  username?: string | null;
  email?: string | null;
} | null | undefined) {
  return (
    String(usuario?.name || usuario?.username || usuario?.email || "").trim() ||
    "Sistema"
  );
}

/**
 * Dicionário para tradução de constantes de formas de pagamento em nomes amigáveis.
 */
const nomesPagamento: Record<string, string> = {
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO: "Cartão",
  PARCELADO: "Parcelado",
};

/**
 * Formata um valor numérico em moeda Real Brasileiro (BRL).
 * @param valor - Valor numérico a ser formatado
 * @returns String formatada (ex: R$ 150,00)
 */
function formatarMoeda(valor: unknown) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Formata timestamp ou string ISO em data pt-BR (DD/MM/AAAA).
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
 * Formata timestamp em data e hora pt-BR (DD/MM/AAAA HH:mm).
 * @param data - Data a formatar
 * @returns Data e hora formatadas
 */
function formatarDataHora(data: unknown) {
  if (!data) return "-";

  const d = new Date(String(data));

  if (Number.isNaN(d.getTime())) return "-";

  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  const hora = String(d.getHours()).padStart(2, "0");
  const minuto = String(d.getMinutes()).padStart(2, "0");

  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

/**
 * Desenha a logomarca da empresa no documento PDF do recibo.
 * @param doc - Instância do PDFKit Document
 * @param logoUrl - Caminho ou URL da logomarca
 * @param _resto - Parâmetros adicionais não utilizados
 * @returns Booleano indicando se a logo foi desenhada com sucesso
 */
function desenharLogoRecibo(
  doc: any,
  logoUrl: string | null | undefined,
  ..._resto: unknown[]
) {
  if (!logoUrl) {
    return false;
  }

  try {
    const caminhoLimpo = String(logoUrl)
      .split("?")[0]
      .replace(/^\/+/, "")
      .replace(/^uploads[\\/]+/, "");
    const caminhoLogo = caminhoUploadPublico(caminhoLimpo);

    doc.image(caminhoLogo, 40, 34, {
      fit: [62, 62],
    });

    return true;
  } catch (error) {
    console.error("Erro ao carregar logo no recibo:", error);
    return false;
  }
}

/**
 * Gera o buffer binário do PDF do Recibo de Pagamento com layout profissional.
 * @param params - Objeto contendo ordem de serviço completa e configurações da empresa
 * @returns Promise com o Buffer do PDF gerado
 */
function gerarPDFRecibo({
  ordem,
  empresa,
}: {
  ordem: any;
  empresa: ConfiguracoesSistema;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
      });

      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const total = Number(ordem.totalAmount || 0);
      const pago = Number(ordem.paidAmount || 0);
      const percentual = Number(ordem.paymentPercent || 0);
      const restante = Math.max(total - pago, 0);
      const numeroOS = String(ordem.osNumber || ordem.id).padStart(3, "0");

      // Cabeçalho com logo e dados da configuração
const enderecoEmpresa = montarEnderecoEmpresa(empresa);
const contatoEmpresa = montarContatoEmpresa(empresa);
const temLogo = desenharLogoRecibo(doc, empresa.logoUrl);

const textoEmpresaX = temLogo ? 116 : 40;
const textoEmpresaWidth = temLogo ? 300 : 360;

doc
  .fontSize(16)
  .font("Helvetica-Bold")
  .fillColor("#111827")
  .text(empresa.nomeEmpresa || "Sistema de Ordem de Serviço", textoEmpresaX, 38, {
    width: textoEmpresaWidth,
    ellipsis: true,
  });

let linhaEmpresaY = 60;

if (empresa.documento) {
  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor("#475569")
    .text(`CPF/CNPJ: ${empresa.documento}`, textoEmpresaX, linhaEmpresaY, {
      width: textoEmpresaWidth,
      ellipsis: true,
    });

  linhaEmpresaY += 12;
}

if (enderecoEmpresa) {
  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor("#475569")
    .text(enderecoEmpresa, textoEmpresaX, linhaEmpresaY, {
      width: textoEmpresaWidth,
      ellipsis: true,
    });

  linhaEmpresaY += 12;
}

if (contatoEmpresa) {
  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor("#475569")
    .text(contatoEmpresa, textoEmpresaX, linhaEmpresaY, {
      width: textoEmpresaWidth,
      ellipsis: true,
    });
}

doc
  .fontSize(9)
  .font("Helvetica-Bold")
  .fillColor("#111827")
  .text(`OS Nº ${numeroOS}`, 420, 40, {
    width: 135,
    align: "right",
  });

doc
  .fontSize(8)
  .font("Helvetica")
  .fillColor("#475569")
  .text(`Emissão: ${formatarData(new Date())}`, 420, 56, {
    width: 135,
    align: "right",
  });

doc
  .moveTo(40, 108)
  .lineTo(555, 108)
  .strokeColor("#d1d5db")
  .lineWidth(1)
  .stroke();

doc.y = 122;

      // Título
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .fillColor("#111827")
        .text("RECIBO DE PAGAMENTO", {
          align: "center",
        });

      doc.moveDown(0.5);

      doc
        .fontSize(11)
        .font("Helvetica")
        .fillColor("#475569")
        .text(`Ordem de Serviço Nº ${numeroOS}`, {
          align: "center",
        });

      doc.moveDown(1.5);

      // Dados principais
      const clienteNome = ordem.customer?.name || "-";
      const equipamento = ordem.equipmentType || "-";
      const marcaModelo = [ordem.brand, ordem.model].filter(Boolean).join(" ") || "-";

      doc
        .roundedRect(40, doc.y, 515, 118, 8)
        .fillColor("#f8fafc")
        .fill()
        .strokeColor("#e5e7eb")
        .stroke();

      const boxY = doc.y + 14;

      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#111827")
        .text("Cliente:", 55, boxY)
        .font("Helvetica")
        .text(clienteNome, 140, boxY);

      doc
        .font("Helvetica-Bold")
        .text("CPF:", 55, boxY + 18)
        .font("Helvetica")
        .text(ordem.customer?.cpf || "-", 140, boxY + 18);

      doc
        .font("Helvetica-Bold")
        .text("WhatsApp:", 55, boxY + 36)
        .font("Helvetica")
        .text(ordem.customer?.whatsapp || "-", 140, boxY + 36);

      doc
        .font("Helvetica-Bold")
        .text("Equipamento:", 55, boxY + 54)
        .font("Helvetica")
        .text(equipamento, 140, boxY + 54);

      doc
        .font("Helvetica-Bold")
        .text("Marca/Modelo:", 55, boxY + 72)
        .font("Helvetica")
        .text(marcaModelo, 140, boxY + 72);

      doc
        .font("Helvetica-Bold")
        .text("Data emissão:", 55, boxY + 90)
        .font("Helvetica")
        .text(formatarData(new Date()), 140, boxY + 90);

      doc.y = boxY + 120;

      // Resumo financeiro
      doc.moveDown(1);

      doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .fillColor("#111827")
        .text("Resumo do pagamento");

      doc.moveDown(0.6);

      const startY = doc.y;
      const cardW = 160;
      const gap = 17;

      function card(titulo: string, valor: string, x: number, y: number) {
        doc
          .roundedRect(x, y, cardW, 58, 8)
          .fillColor("#f8fafc")
          .fill()
          .strokeColor("#e5e7eb")
          .stroke();

        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor("#64748b")
          .text(titulo, x + 10, y + 10, {
            width: cardW - 20,
          });

        doc
          .fontSize(13)
          .font("Helvetica-Bold")
          .fillColor("#111827")
          .text(valor, x + 10, y + 28, {
            width: cardW - 20,
          });
      }

      card("Total da OS", formatarMoeda(total), 40, startY);
      card("Valor pago", `${formatarMoeda(pago)} (${percentual}%)`, 40 + cardW + gap, startY);
      card("Valor restante", formatarMoeda(restante), 40 + (cardW + gap) * 2, startY);

      doc.y = startY + 78;

      // Status
      const statusPagamento = percentual >= 100 ? "Pagamento total" : "Pagamento parcial";

      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#111827")
        .text("Status: ", 40, doc.y, {
          continued: true,
        })
        .font("Helvetica")
        .text(statusPagamento);

      doc.moveDown(0.5);

      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("Forma principal: ", {
          continued: true,
        })
        .font("Helvetica")
        .text(nomesPagamento[ordem.paymentMethod] || ordem.paymentMethod || "-");

      doc.moveDown(1);

      // Lista de pagamentos
      doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .fillColor("#111827")
        .text("Pagamentos registrados");

      doc.moveDown(0.5);

      const pagamentos = ordem.payments || [];

      if (pagamentos.length === 0) {
        doc
          .fontSize(10)
          .font("Helvetica")
          .fillColor("#64748b")
          .text("Nenhum pagamento detalhado registrado.");
      } else {
        pagamentos.forEach((pagamento: any, index: number) => {
          const y = doc.y;

          doc
            .roundedRect(40, y, 515, 44, 6)
            .fillColor("#f8fafc")
            .fill()
            .strokeColor("#e5e7eb")
            .stroke();

          doc
            .fontSize(9)
            .font("Helvetica-Bold")
            .fillColor("#111827")
            .text(
              `${index + 1}. ${formatarMoeda(pagamento.amount)} - ${pagamento.percent}%`,
              52,
              y + 9,
              {
                width: 250,
              }
            );

          doc
            .fontSize(8)
            .font("Helvetica")
            .fillColor("#475569")
            .text(
              `Forma: ${nomesPagamento[pagamento.paymentMethod] || pagamento.paymentMethod}`,
              52,
              y + 24,
              {
                width: 250,
              }
            );

          doc
            .fontSize(8)
            .font("Helvetica")
            .fillColor("#475569")
            .text(formatarDataHora(pagamento.createdAt), 390, y + 9, {
              width: 150,
              align: "right",
            });

          if (pagamento.note) {
            doc
              .fontSize(7)
              .fillColor("#64748b")
              .text(`Obs: ${pagamento.note}`, 260, y + 24, {
                width: 280,
                align: "right",
                ellipsis: true,
              });
          }

          doc.y = y + 52;
        });
      }

      // Declaração
      doc.moveDown(1.5);

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#111827")
        .text(
          `Declaramos para os devidos fins que recebemos de ${clienteNome} o valor de ${formatarMoeda(
            pago
          )}, referente à Ordem de Serviço Nº ${numeroOS}.`,
          40,
          doc.y,
          {
            width: 515,
            align: "justify",
          }
        );

      // Rodapé
      doc
        .fontSize(8)
        .fillColor("#64748b")
        .text(
          empresa.rodape || "Recibo gerado automaticamente pelo sistema de Ordem de Serviço.",
          40,
          780,
          {
            width: 515,
            align: "center",
          }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Manipulador GET para gerar o Recibo de Pagamento em PDF da Ordem de Serviço.
 * Exige permissões `ordens.imprimir` e permissão financeira (`pagamentos.ver`, `pagamentos.registrar` ou `relatorios.financeiro`).
 * Requer que a OS possua pelo menos um pagamento registrado (`paymentPercent > 0`).
 * Registra o histórico `RECIBO_PAGAMENTO` e retorna o arquivo PDF para visualização em navegador (inline).
 * @param request - Requisição HTTP recebida
 * @param context - Contexto contendo `params.id` da OS
 * @returns Resposta com binário PDF (`application/pdf`) ou erro JSON
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.imprimir");

    if (!acesso.ok) {
      return acesso.response;
    }

    if (
      !usuarioTemPermissao(acesso.usuario, [
        "pagamentos.ver",
        "pagamentos.registrar",
        "relatorios.financeiro",
      ])
    ) {
      return NextResponse.json(
        { message: "Você não tem permissão financeira para gerar recibo." },
        { status: 403 }
      );
    }

    const userName = nomeOperador(acesso.usuario);

    const { id } = await context.params;

    const ordem = await prisma.serviceOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        finalization: true,
        payments: {
          orderBy: {
            createdAt: "desc",
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

    if (Number(ordem.paymentPercent || 0) <= 0) {
      return NextResponse.json(
        { message: "Esta OS ainda não possui pagamento registrado." },
        { status: 400 }
      );
    }

    const { origin } = new URL(request.url);
    const empresa = await buscarConfiguracoesSistema(origin);

    const pdfBuffer = await gerarPDFRecibo({
      ordem,
      empresa,
    });

    await prisma.serviceOrder.update({
      where: { id },
      data: {
        histories: {
          create: {
            userName,
            action: "RECIBO_PAGAMENTO",
            description: "Recibo de pagamento gerado em PDF.",
          },
        },
      },
    });

    const pdfArrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    ) as ArrayBuffer;

    const numeroOS = String(ordem.osNumber || ordem.id).padStart(3, "0");

    return new Response(pdfArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="recibo-os-${numeroOS}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar recibo:", error);

    return NextResponse.json(
      { message: "Erro ao gerar recibo de pagamento." },
      { status: 500 }
    );
  }
}



