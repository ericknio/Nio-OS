/**
 * @file route.ts
 * @description Endpoint de geração de etiqueta térmica em PDF para identificação física de aparelhos (`/api/ordens/[id]/etiqueta`).
 * Gera um documento em formato compacto (240x120 pt / aprox. 85x42mm) utilizando PDFKit, com bordas arredondadas,
 * número da OS em destaque, dados do cliente, WhatsApp, status, datas e IMEI/Serial, pronto para impressão térmica.
 */

import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import { buscarConfiguracoesSistema } from "@/lib/configuracoesSistema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Normaliza o nome do usuário autenticado para registro de histórico.
 * @param usuario - Dados do usuário logado
 * @returns Nome do operador ou 'Sistema'
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

/** Mapa de tradução amigável dos tipos de equipamento para a etiqueta compacta. */
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

/** Mapa de tradução e abreviação dos status de OS para o badge da etiqueta. */
const nomesStatus: Record<string, string> = {
  RECEBIDO: "Recebido",
  EM_ANALISE: "Em análise",
  AGUARDANDO_PECA: "Aguard. peça",
  EM_REPARO: "Em reparo",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

/**
 * Converte data para o formato pt-BR (DD/MM/AAAA) ou retorna '-' se nula.
 * @param data - Dado de data
 * @returns String formatada
 */
function formatarData(data: unknown) {
  if (!data) return "-";

  const d = new Date(String(data));

  if (Number.isNaN(d.getTime())) {
    return "-";
  }

  return d.toLocaleDateString("pt-BR");
}

/**
 * Desenha e compila o buffer binário do PDF da etiqueta adesiva de bancada via PDFKit.
 * Formato universal para impressoras térmicas (80x40mm / 230x115 pt) com margens seguras,
 * sem bordas externas rígidas que causam efeito torto e com QR Code de consulta rápida.
 * 
 * @param ordem - Registro completo da Ordem de Serviço com dados do cliente
 * @param config - Configurações gerais da empresa
 * @returns Promise com o Buffer binário do PDF montado
 */
async function gerarPDFEtiqueta(ordem: any, config: any = {}): Promise<Buffer> {
  const numeroOS = String(ordem.osNumber || "").padStart(3, "0");
  const qrData = `OS-${numeroOS}`;

  const qrBuffer = await QRCode.toBuffer(qrData, {
    margin: 1,
    width: 140,
    errorCorrectionLevel: "M",
  });

  return new Promise((resolve, reject) => {
    try {
      // 230 x 115 pt (aprox. 81 x 40.5 mm) - Padrão universal para rolo térmico 80x40mm
      const doc = new PDFDocument({
        size: [230, 115],
        margin: 0,
        autoFirstPage: true,
      });

      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const cliente = ordem.customer?.name || "Cliente não informado";
      const whatsapp = ordem.customer?.whatsapp || "-";
      const equipamento =
        nomesEquipamento[ordem.equipmentType] || ordem.equipmentType || "Aparelho";
      const marcaModelo = [ordem.brand, ordem.model].filter(Boolean).join(" ");
      const status = nomesStatus[ordem.status] || ordem.status || "-";
      const serieOuImei = ordem.imei || ordem.serialNumber || "-";
      const nomeEmpresa =
        config?.nomeFantasia || config?.razaoSocial || "ORDEM DE SERVIÇO";

      // 1. Cabeçalho: Nome da Loja à esquerda e OS grande à direita
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#334155")
        .text(nomeEmpresa.toUpperCase(), 8, 8, {
          width: 125,
          height: 10,
          ellipsis: true,
        });

      doc
        .font("Helvetica-Bold")
        .fontSize(15)
        .fillColor("#0f172a")
        .text(`OS Nº ${numeroOS}`, 125, 6, {
          width: 97,
          align: "right",
        });

      // Linha divisória sutil
      doc
        .moveTo(8, 25)
        .lineTo(222, 25)
        .strokeColor("#94a3b8")
        .lineWidth(0.8)
        .stroke();

      // 2. Coluna da Esquerda: Dados da OS
      // Linha 1: Cliente
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#64748b")
        .text("CLIENTE:", 8, 29);

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#0f172a")
        .text(cliente, 48, 28, {
          width: 114,
          height: 11,
          ellipsis: true,
        });

      // Linha 2: Contato & Entrada
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#64748b")
        .text("WHATS:", 8, 42);

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#0f172a")
        .text(whatsapp, 48, 42, {
          width: 68,
          height: 10,
          ellipsis: true,
        });

      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#64748b")
        .text("ENTR:", 118, 42);

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#0f172a")
        .text(formatarData(ordem.openedAt), 144, 42, {
          width: 44,
          height: 10,
        });

      // Linha 3: Equipamento e Marca/Modelo
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#64748b")
        .text("EQUIP:", 8, 55);

      const equipTexto = marcaModelo ? `${equipamento} - ${marcaModelo}` : equipamento;
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#0f172a")
        .text(equipTexto, 48, 55, {
          width: 114,
          height: 10,
          ellipsis: true,
        });

      // Linha 4: IMEI / Serial
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#64748b")
        .text("SÉRIE/IMEI:", 8, 68);

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#0f172a")
        .text(serieOuImei, 58, 68, {
          width: 104,
          height: 10,
          ellipsis: true,
        });

      // Linha 5: Status da OS com badge
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#64748b")
        .text("STATUS:", 8, 81);

      doc
        .roundedRect(48, 80, 68, 13, 3)
        .fillColor("#f1f5f9")
        .fill()
        .strokeColor("#cbd5e1")
        .lineWidth(0.5)
        .stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#1e293b")
        .text(status.toUpperCase(), 48, 83, {
          width: 68,
          align: "center",
          ellipsis: true,
        });

      // Linha 6: Previsão de entrega ou Técnico
      if (ordem.expectedDeliveryDate) {
        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .fillColor("#64748b")
          .text(`PREVISÃO: ${formatarData(ordem.expectedDeliveryDate)}`, 8, 97);
      } else if (ordem.technicianResponsible) {
        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .fillColor("#64748b")
          .text(`TÉC: ${ordem.technicianResponsible}`, 8, 97, {
            width: 114,
            ellipsis: true,
          });
      }

      // 3. Coluna da Direita: QR Code da OS
      doc.image(qrBuffer, 166, 45, {
        width: 56,
        height: 56,
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Gera e retorna a etiqueta adesiva térmica em formato PDF inline para impressão imediata.
 * Registra o evento de impressão no histórico de auditoria da OS.
 * Exige permissão 'ordens.imprimir'.
 * 
 * @param _request - Requisição HTTP recebida
 * @param context - Parâmetros da rota contendo `id` da OS
 * @returns Resposta HTTP binária (Content-Type: application/pdf) com o PDF da etiqueta
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.imprimir");

    if (!acesso.ok) {
      return acesso.response;
    }

    const userName = nomeOperador(acesso.usuario);
    const { id } = await context.params;

    const [ordem, config] = await Promise.all([
      prisma.serviceOrder.findUnique({
        where: {
          id,
        },
        include: {
          customer: true,
        },
      }),
      buscarConfiguracoesSistema().catch(() => ({})),
    ]);

    if (!ordem) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    const pdfBuffer = await gerarPDFEtiqueta(ordem, config);

    await prisma.serviceOrder.update({
      where: {
        id,
      },
      data: {
        histories: {
          create: {
            userName,
            action: "ETIQUETA_OS",
            description: "Etiqueta térmica da ordem de serviço gerada em PDF.",
          },
        },
      },
    });

    const pdfArrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    ) as ArrayBuffer;

    const numeroOS = String(ordem.osNumber || id).padStart(3, "0");

    return new Response(pdfArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="etiqueta-os-${numeroOS}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar etiqueta da OS:", error);

    return NextResponse.json(
      { message: "Erro ao gerar etiqueta da OS." },
      { status: 500 }
    );
  }
}