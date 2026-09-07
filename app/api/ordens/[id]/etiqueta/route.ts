import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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

const nomesStatus: Record<string, string> = {
  RECEBIDO: "Recebido",
  EM_ANALISE: "Em análise",
  AGUARDANDO_PECA: "Aguard. peça",
  EM_REPARO: "Em reparo",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

function formatarData(data: unknown) {
  if (!data) return "-";

  const d = new Date(String(data));

  if (Number.isNaN(d.getTime())) {
    return "-";
  }

  return d.toLocaleDateString("pt-BR");
}

function gerarPDFEtiqueta(ordem: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [240, 120],
        margin: 8,
        autoFirstPage: true,
      });

      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const numeroOS = String(ordem.osNumber || "").padStart(3, "0");

      const cliente = ordem.customer?.name || "-";
      const whatsapp = ordem.customer?.whatsapp || "-";
      const equipamento =
        nomesEquipamento[ordem.equipmentType] || ordem.equipmentType || "-";
      const marcaModelo = [ordem.brand, ordem.model]
        .filter(Boolean)
        .join(" ");
      const status = nomesStatus[ordem.status] || ordem.status || "-";
      const serieOuImei = ordem.imei || ordem.serialNumber || "-";

      doc
        .roundedRect(6, 6, 228, 108, 6)
        .fillColor("#ffffff")
        .fill()
        .strokeColor("#111827")
        .lineWidth(1)
        .stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("#111827")
        .text(`OS Nº ${numeroOS}`, 12, 12, {
          width: 216,
          align: "center",
        });

      doc
        .moveTo(12, 35)
        .lineTo(228, 35)
        .strokeColor("#d1d5db")
        .lineWidth(1)
        .stroke();

      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#475569")
        .text("CLIENTE", 12, 43);

      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#111827")
        .text(cliente, 12, 52, {
          width: 142,
          height: 13,
          ellipsis: true,
        });

      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#475569")
        .text("STATUS", 164, 43);

      doc
        .roundedRect(164, 52, 58, 15, 4)
        .fillColor("#f1f5f9")
        .fill()
        .strokeColor("#cbd5e1")
        .stroke();

      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#111827")
        .text(status, 168, 56, {
          width: 50,
          height: 9,
          align: "center",
          ellipsis: true,
        });

      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#475569")
        .text("WHATSAPP", 12, 70);

      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#111827")
        .text(whatsapp, 12, 79, {
          width: 82,
          height: 10,
          ellipsis: true,
        });

      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#475569")
        .text("ENTRADA", 100, 70);

      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#111827")
        .text(formatarData(ordem.openedAt), 100, 79, {
          width: 54,
          height: 10,
          ellipsis: true,
        });

      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#475569")
        .text("PREVISÃO", 164, 70);

      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#111827")
        .text(formatarData(ordem.expectedDeliveryDate), 164, 79, {
          width: 58,
          height: 10,
          ellipsis: true,
        });

      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#475569")
        .text("EQUIP.", 12, 93);

      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor("#111827")
        .text(equipamento, 12, 102, {
          width: 62,
          height: 10,
          ellipsis: true,
        });

      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#475569")
        .text("MARCA/MODELO", 80, 93);

      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#111827")
        .text(marcaModelo || "-", 80, 102, {
          width: 72,
          height: 10,
          ellipsis: true,
        });

      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#475569")
        .text("IMEI/SÉRIE", 158, 93);

      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#111827")
        .text(serieOuImei, 158, 102, {
          width: 64,
          height: 10,
          ellipsis: true,
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.imprimir");

    if (!acesso.ok) {
      return acesso.response;
    }

    
    const userName = nomeOperador(acesso.usuario);
const { id } = await context.params;

    const ordem = await prisma.serviceOrder.findUnique({
      where: {
        id,
      },
      include: {
        customer: true,
      },
    });

    if (!ordem) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    const pdfBuffer = await gerarPDFEtiqueta(ordem);

    await prisma.serviceOrder.update({
      where: {
        id,
      },
      data: {
        histories: {
          create: {
            userName,
            action: "ETIQUETA_OS",
            description: "Etiqueta da ordem de serviço gerada em PDF.",
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