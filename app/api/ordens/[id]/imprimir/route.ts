import { prisma } from "@/lib/prisma";
import { caminhoUploadPublico } from "@/lib/runtimeStorage";
import {
  buscarConfiguracoesSistema,
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

function formatarMoeda(valor: unknown) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(data: Date | string | null | undefined) {
  if (!data) return "-";
  return new Date(data).toLocaleDateString("pt-BR");
}

function nomeStatus(status: string) {
  const nomes: Record<string, string> = {
    RECEBIDO: "Recebido",
    EM_ANALISE: "Em análise",
    AGUARDANDO_PECA: "Aguardando peça",
    EM_REPARO: "Em reparo",
    PRONTO: "Pronto",
    ENTREGUE: "Entregue",
    CANCELADO: "Cancelado",
  };

  return nomes[status] || status;
}

function nomeEquipamento(tipo: string) {
  const nomes: Record<string, string> = {
    NOTEBOOK: "Notebook",
    COMPUTADOR: "Computador",
    CELULAR: "Celular",
    TABLET: "Tablet",
    VIDEOGAME: "Videogame",
    IMPRESSORA: "Impressora",
    OUTRO: "Outro",
  };

  return nomes[tipo] || tipo;
}

function secao(doc: PDFKit.PDFDocument, titulo: string, y: number) {
  doc.roundedRect(30, y, 535, 18, 4).fill("#e2e8f0");
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9).text(titulo, 36, y + 5);
  doc.fillColor("#000000");
}

function campo(
  doc: PDFKit.PDFDocument,
  titulo: string,
  valor: string,
  x: number,
  y: number,
  largura = 160
) {
  doc.font("Helvetica-Bold").fontSize(7).text(titulo, x, y);
  doc.font("Helvetica").fontSize(8).text(valor || "-", x, y + 9, {
    width: largura,
    height: 18,
    ellipsis: true,
  });
}

function desenharLogo(
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

    doc.image(caminhoLogo, 30, 22, {
      fit: [70, 55],
    });

    return true;
  } catch (error) {
    console.error("Erro ao carregar logo:", error);
    return false;
  }
}





function blocoTexto(
  doc: PDFKit.PDFDocument,
  titulo: string,
  valor: string,
  x: number,
  y: number,
  largura: number,
  altura: number
) {
  doc.font("Helvetica-Bold").fontSize(7).text(titulo, x, y);
  doc.roundedRect(x, y + 10, largura, altura, 4).stroke("#cbd5e1");
  doc.font("Helvetica").fontSize(8).text(valor || "-", x + 6, y + 16, {
    width: largura - 12,
    height: altura - 10,
    ellipsis: true,
  });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.imprimir");

if (!acesso.ok) {
  return acesso.response;
}
    
    const userName = nomeOperador(acesso.usuario);
const mostrarFinanceiro = usuarioTemPermissao(acesso.usuario, [
      "pagamentos.ver",
      "pagamentos.registrar",
      "relatorios.financeiro",
    ]);
    const { id } = await context.params;

    const PDFKitModule = await import("pdfkit");
    const PDFDocument = PDFKitModule.default;

    const ordem = await prisma.serviceOrder.findUnique({
         where: { id },
         include: {
        customer: true,
        finalization: true,
        attachments: {
         orderBy: {
           createdAt: "desc",
          },
        },
     },
    });

    if (!ordem) {
      return new Response("Ordem não encontrada.", { status: 404 });
    }

    const anexos = ordem.attachments || [];
    const baseUrl = new URL(request.url).origin;
    const empresa = await buscarConfiguracoesSistema(baseUrl);
    const enderecoEmpresa = montarEnderecoEmpresa(empresa);
    const contatoEmpresa = montarContatoEmpresa(empresa);
    const numeroOS = String(ordem.osNumber).padStart(3, "0");

    const doc = new PDFDocument({
      size: "A4",
      margin: 30,
    });

    const chunks: Buffer[] = [];

    const pdfBufferPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    // Cabeçalho com logo e dados da configuração
const temLogo = desenharLogo(doc, empresa.logoUrl);
const textoEmpresaX = temLogo ? 110 : 30;
const textoEmpresaWidth = temLogo ? 260 : 340;

doc
  .font("Helvetica-Bold")
  .fontSize(15)
  .fillColor("#0f172a")
  .text(empresa.nomeEmpresa || "Assistência Técnica", textoEmpresaX, 26, {
    width: textoEmpresaWidth,
    ellipsis: true,
  });

let linhaEmpresaY = 48;

if (empresa.documento) {
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#334155")
    .text(`CPF/CNPJ: ${empresa.documento}`, textoEmpresaX, linhaEmpresaY, {
      width: textoEmpresaWidth,
      ellipsis: true,
    });

  linhaEmpresaY += 12;
}

if (enderecoEmpresa) {
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#334155")
    .text(enderecoEmpresa, textoEmpresaX, linhaEmpresaY, {
      width: textoEmpresaWidth,
      ellipsis: true,
    });

  linhaEmpresaY += 12;
}

if (contatoEmpresa) {
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#334155")
    .text(contatoEmpresa, textoEmpresaX, linhaEmpresaY, {
      width: textoEmpresaWidth,
      ellipsis: true,
    });
}

doc.fillColor("#000000");

    doc.font("Helvetica-Bold").fontSize(17).text(`OS Nº ${numeroOS}`, 405, 30, {
      width: 160,
      align: "right",
    });

    doc.font("Helvetica").fontSize(9).text(
      `Data: ${formatarData(ordem.openedAt)}`,
      405,
      55,
      {
        width: 160,
        align: "right",
      }
    );

    doc.moveTo(30, 95).lineTo(565, 95).stroke("#94a3b8");

    // Cliente
    secao(doc, "DADOS DO CLIENTE", 105);

    campo(doc, "Nome", ordem.customer.name, 36, 132, 240);
    campo(doc, "CPF", ordem.customer.cpf || "-", 290, 132, 120);
    campo(doc, "WhatsApp", ordem.customer.whatsapp || "-", 430, 132, 120);

    campo(doc, "Telefone", ordem.customer.secondaryPhone || "-", 36, 162, 150);
    campo(doc, "E-mail", ordem.customer.email || "-", 200, 162, 180);
    campo(
      doc,
      "Cidade/UF",
      `${ordem.customer.city || "-"} ${ordem.customer.state || ""}`,
      400,
      162,
      140
    );

    campo(
      doc,
      "Endereço",
      `${ordem.customer.address || "-"} ${ordem.customer.number || ""} ${
        ordem.customer.complement || ""
      } - ${ordem.customer.district || ""}`,
      36,
      192,
      500
    );

    // Equipamento
    secao(doc, "DADOS DO EQUIPAMENTO", 225);

    campo(doc, "Equipamento", nomeEquipamento(ordem.equipmentType), 36, 252, 120);
    campo(doc, "Marca", ordem.brand || "-", 170, 252, 120);
    campo(doc, "Modelo", ordem.model || "-", 305, 252, 120);
    campo(doc, "Status", nomeStatus(ordem.status), 440, 252, 110);

    campo(doc, "Nº Série", ordem.serialNumber || "-", 36, 282, 150);
    campo(doc, "IMEI", ordem.imei || "-", 200, 282, 150);
    campo(doc, "Senha", ordem.devicePassword ? "*****" : "-", 365, 282, 90);
    campo(doc, "Previsão", formatarData(ordem.expectedDeliveryDate), 470, 282, 80);

    // Descrição
    secao(doc, "DESCRIÇÃO DA ORDEM", 315);

    blocoTexto(
      doc,
      "Acessórios entregues",
      ordem.deliveredAccessories || "-",
      36,
      342,
      250,
      42
    );

    blocoTexto(
      doc,
      "Peças necessárias",
      ordem.requiredParts || "-",
      305,
      342,
      250,
      42
    );

    blocoTexto(
      doc,
      "Defeito informado pelo cliente",
      ordem.reportedDefect || "-",
      36,
      405,
      519,
      58
    );

    blocoTexto(
      doc,
      "Observações gerais",
      ordem.technicalNotes || "-",
      36,
      485,
      519,
      58
    );

// Valores
secao(doc, "VALOR DO SERVIÇO", 565);

doc
  .roundedRect(36, 592, 519, 42, 6)
  .fillColor("#f8fafc")
  .fill()
  .strokeColor("#cbd5e1")
  .stroke();

doc
  .font("Helvetica-Bold")
  .fontSize(9)
  .fillColor("#475569")
  .text(
    mostrarFinanceiro
      ? "Valor total do serviço"
      : "Valor não exibido neste documento",
    48,
    602
  );

doc
  .font("Helvetica-Bold")
  .fontSize(mostrarFinanceiro ? 18 : 12)
  .fillColor("#0f172a")
  .text(
    mostrarFinanceiro
      ? formatarMoeda(ordem.totalAmount)
      : "Usuário sem permissão financeira",
    48,
    mostrarFinanceiro ? 616 : 618,
    {
      width: 495,
      align: "right",
    }
  );

doc.fillColor("#000000");

    // Declaração
    doc.moveTo(30, 645).lineTo(565, 645).stroke("#94a3b8");

    doc.font("Helvetica-Bold").fontSize(9).text("DECLARAÇÃO", 36, 660);

    doc.font("Helvetica").fontSize(8).text(
      "Declaro que deixei o equipamento acima descrito para análise e/ou reparo, estando ciente das informações registradas nesta Ordem de Serviço.",
      36,
      677,
      {
        width: 519,
        height: 35,
        align: "justify",
      }
    );

    
    // Anexos
    const anexosTexto =
      anexos.length > 0
        ? anexos
            .slice(0, 4)
            .map(
            (anexo: { originalName: string }, index: number) =>
            `${index + 1}. ${anexo.originalName}`
            )
            .join("  |  ")
        : "Nenhum anexo registrado.";

    doc
      .roundedRect(30, 730, 535, 38, 6)
      .fillColor("#f8fafc")
      .fill()
      .strokeColor("#e5e7eb")
      .stroke();

    doc
      .fontSize(7)
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .text("Anexos da OS", 38, 738);

    doc
      .fontSize(7)
      .fillColor("#475569")
      .font("Helvetica")
      .text(anexosTexto, 38, 750, {
        width: 520,
        height: 14,
        ellipsis: true,
     });

    if (anexos.length > 4) {
    doc
       .fontSize(6)
       .fillColor("#64748b")
       .text(`+ ${anexos.length - 4} anexo(s) não exibido(s) no PDF compacto.`, 38, 764);
    }
    // Rodapé
    doc.fontSize(7).fillColor("#64748b").text(
  empresa.rodape ||
    "Documento gerado automaticamente pelo sistema de Ordem de Serviço.",
  30,
  790,
  {
    width: 535,
    align: "center",
  }
);

    doc.end();

    const pdfBuffer = await pdfBufferPromise;

      await prisma.serviceOrder.update({
      where: { id },
      data: {
       histories: {
         create: {
            userName,
           action: "IMPRESSAO_OS",
           description: "PDF da ordem de serviço foi gerado para impressão.",
         },
        },
      },
    });

    const pdfArrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    ) as ArrayBuffer;

    return new Response(pdfArrayBuffer, {
      status: 200,
      headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="OS-${numeroOS}.pdf"`,
    },
    });
    } catch (error) {
    console.error("Erro ao gerar PDF da ordem:", error);

    const message =
      error instanceof Error ? error.message : "Erro desconhecido ao gerar PDF.";

    return new Response(`Erro ao gerar PDF da ordem: ${message}`, {
      status: 500,
    });
  }
}



