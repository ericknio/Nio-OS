/**
 * @file route.ts
 * @description Endpoint de geração do Termo de Garantia em PDF formato A4 (`/api/ordens/[id]/garantia`).
 * Renderiza documento formal contendo dados da empresa, cliente, equipamento, descrição do reparo,
 * peças aplicadas, cálculo da data de expiração da garantia e cláusulas contratuais de cobertura.
 */

import { prisma } from "@/lib/prisma";
import { caminhoUploadPublico } from "@/lib/runtimeStorage";
import {
  buscarConfiguracoesSistema,
  montarContatoEmpresa,
  montarEnderecoEmpresa,
} from "@/lib/configuracoesSistema";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
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

/**
 * Formata data no padrão brasileiro pt-BR (DD/MM/AAAA) ou retorna '-' se nula.
 * @param data - Data a formatar
 * @returns String formatada
 */
function formatarData(data: Date | string | null | undefined) {
  if (!data) return "-";
  return new Date(data).toLocaleDateString("pt-BR");
}

/**
 * Calcula a data de expiração somando a quantidade de dias de garantia à data de entrega.
 * @param data - Data inicial de entrega
 * @param dias - Quantidade de dias de cobertura
 * @returns Nova instância de Date calculada
 */
function somarDias(data: Date | string, dias: number) {
  const novaData = new Date(data);
  novaData.setDate(novaData.getDate() + dias);
  return novaData;
}

/**
 * Traduz a chave enumerada do tipo de equipamento para exibição em português.
 * @param tipo - Código do equipamento
 * @returns Nome amigável do equipamento
 */
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

/**
 * Desenha uma faixa de cabeçalho de seção retangular colorida no documento PDF.
 * @param doc - Documento PDFKit
 * @param titulo - Título da seção
 * @param y - Posição vertical Y no documento
 */
function secao(doc: PDFKit.PDFDocument, titulo: string, y: number) {
  doc.roundedRect(30, y, 535, 18, 4).fill("#e2e8f0");
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9).text(titulo, 36, y + 5);
  doc.fillColor("#000000");
}

/**
 * Renderiza um rótulo e valor textual simples em coordenadas específicas do PDF.
 * @param doc - Documento PDFKit
 * @param titulo - Rótulo do campo
 * @param valor - Conteúdo a exibir
 * @param x - Posição horizontal X
 * @param y - Posição vertical Y
 * @param largura - Largura do campo (default: 160)
 */
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

/**
 * Insere a imagem do logotipo da empresa no cabeçalho do documento PDF.
 * @param doc - Documento PDFKit
 * @param logoUrl - Caminho da logo
 * @returns Verdadeiro se a imagem foi carregada e desenhada com sucesso
 */
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

/**
 * Renderiza uma caixa retangular com borda arredondada contendo texto multi-linha (laudos e peças).
 * @param doc - Documento PDFKit
 * @param titulo - Título do bloco
 * @param valor - Texto do bloco
 * @param x - Posição X
 * @param y - Posição Y
 * @param largura - Largura do bloco
 * @param altura - Altura do bloco
 */
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

/**
 * Gera e retorna o documento PDF A4 completo do Termo de Garantia da Ordem de Serviço.
 * Registra o evento de impressão no histórico de auditoria da OS.
 * Exige permissão 'ordens.imprimir'.
 * 
 * @param request - Requisição HTTP recebida
 * @param context - Parâmetros da rota contendo `id` da OS
 * @returns Resposta HTTP binária (Content-Type: application/pdf) com o PDF da garantia
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.imprimir");

if (!acesso.ok) {
  return acesso.response;
}
    
    const userName = nomeOperador(acesso.usuario);
const { id } = await context.params;

    const PDFKitModule = await import("pdfkit");
    const PDFDocument = PDFKitModule.default;

    const ordem = await prisma.serviceOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        finalization: true,
      },
    });

    if (!ordem) {
      return new Response("Ordem não encontrada.", { status: 404 });
    }

    if (!ordem.finalization) {
      return new Response(
        "Esta ordem ainda não foi finalizada. Finalize a OS antes de imprimir a garantia.",
        { status: 400 }
      );
    }

    const baseUrl = new URL(request.url).origin;
    const empresa = await buscarConfiguracoesSistema(baseUrl);
    const enderecoEmpresa = montarEnderecoEmpresa(empresa);
    const contatoEmpresa = montarContatoEmpresa(empresa);
    const numeroOS = String(ordem.osNumber).padStart(3, "0");

    const validadeGarantia = somarDias(
      ordem.finalization.deliveredAt,
      ordem.finalization.warrantyDays
    );

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
const textoEmpresaWidth = temLogo ? 250 : 340;

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

    doc.font("Helvetica-Bold").fontSize(16).text("TERMO DE GARANTIA", 315, 30, {
      width: 250,
      align: "right",
    });

    doc.font("Helvetica-Bold").fontSize(12).text(`OS Nº ${numeroOS}`, 405, 56, {
      width: 160,
      align: "right",
    });

    doc.moveTo(30, 90).lineTo(565, 90).stroke("#94a3b8");

    // Cliente
    secao(doc, "DADOS DO CLIENTE", 100);

    campo(doc, "Nome", ordem.customer.name, 36, 127, 250);
    campo(doc, "CPF", ordem.customer.cpf || "-", 305, 127, 110);
    campo(doc, "WhatsApp", ordem.customer.whatsapp || "-", 430, 127, 120);
    campo(doc, "E-mail", ordem.customer.email || "-", 36, 157, 250);

    // Equipamento
    secao(doc, "EQUIPAMENTO", 190);

    campo(doc, "Equipamento", nomeEquipamento(ordem.equipmentType), 36, 217, 120);
    campo(doc, "Marca", ordem.brand || "-", 170, 217, 120);
    campo(doc, "Modelo", ordem.model || "-", 305, 217, 120);
    campo(doc, "IMEI", ordem.imei || "-", 440, 217, 110);
    campo(doc, "Nº Série", ordem.serialNumber || "-", 36, 247, 180);

    // Serviço
    secao(doc, "SERVIÇO REALIZADO", 280);

    blocoTexto(
      doc,
      "Descrição do reparo",
      ordem.finalization.repairDescription || "-",
      36,
      307,
      519,
      62
    );

    blocoTexto(
      doc,
      "Peças substituídas",
      ordem.finalization.replacedParts || "-",
      36,
      390,
      519,
      42
    );

    // Garantia
    secao(doc, "DADOS DA GARANTIA", 455);

    campo(
      doc,
      "Data da entrega",
      formatarData(ordem.finalization.deliveredAt),
      36,
      482,
      120
    );

    campo(
      doc,
      "Garantia",
      `${ordem.finalization.warrantyDays} dias`,
      170,
      482,
      100
    );

    campo(doc, "Válida até", formatarData(validadeGarantia), 305, 482, 120);

    

    // Termos
    secao(doc, "TERMOS DA GARANTIA", 525);

    const textoGarantia = empresa.warrantyText;

    doc.roundedRect(36, 552, 519, 145, 4).stroke("#cbd5e1");

    doc.font("Helvetica").fontSize(7.5).text(textoGarantia, 42, 560, {
      width: 507,
     height: 132,
     align: "justify",
     lineGap: 2,
     ellipsis: true,
    });

    

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
            action: "IMPRESSAO_GARANTIA",
            description: "Termo de garantia foi gerado para impressão.",
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
       "Content-Disposition": `inline; filename="garantia-os-${numeroOS}.pdf"`,
       },
    });
  } catch (error) {
    console.error("Erro ao gerar termo de garantia:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Erro desconhecido ao gerar garantia.";

    return new Response(`Erro ao gerar termo de garantia: ${message}`, {
      status: 500,
    });
  }
}



