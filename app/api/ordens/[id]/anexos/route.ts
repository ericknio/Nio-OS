/**
 * @file route.ts
 * @description Endpoint de gerenciamento de anexos vinculados a uma Ordem de Serviço específica (`/api/ordens/[id]/anexos`).
 * Suporta fotos de avarias, laudos e termos em PDF (máx. 10MB) com validação estrita de magic bytes binários,
 * gravação no diretório seguro de uploads do runtime e registro de auditoria no histórico da OS.
 */

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolverOperadorPadrao } from "@/lib/operadorSistema";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import { caminhoStorageRuntime } from "@/lib/runtimeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UsuarioSessao = {
  name?: string | null;
  username?: string | null;
  email?: string | null;
};

/** Tamanho máximo permitido por anexo (10MB). */
const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024;

/** Mapa de extensões permitidas e seus respectivos MIME types oficiais. */
const TIPOS_PERMITIDOS = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".pdf", "application/pdf"],
]);

/**
 * Resolve o identificador nominal do operador autenticado na sessão.
 * @param usuario - Objeto do usuário logado
 * @returns Nome, username ou 'Sistema'
 */
function nomeOperador(usuario: unknown) {
  const dadosUsuario = usuario as UsuarioSessao | null;

  return (
    dadosUsuario?.name || dadosUsuario?.username || dadosUsuario?.email || "Sistema"
  );
}

/**
 * Remove acentos, caracteres especiais e pontuações arriscadas para sanitizar o nome de arquivo.
 * @param nome - Nome original do arquivo
 * @returns Nome de arquivo seguro em minúsculas
 */
function limparNomeArquivo(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase();
}

/**
 * Extrai a extensão do arquivo em letras minúsculas com o ponto inicial (ex: .png).
 * @param nomeArquivo - Nome do arquivo
 * @returns Extensão normalizada
 */
function normalizarExtensao(nomeArquivo: string) {
  return path.extname(nomeArquivo || "").toLowerCase();
}

/**
 * Gera a rota interna protegida de streaming do anexo via API (`/api/uploads/anexos/<fileName>`).
 * @param fileName - Nome único do anexo no disco
 * @returns URL de acesso ao anexo
 */
function urlProtegidaAnexo(fileName: string) {
  return `/api/uploads/anexos/${encodeURIComponent(fileName)}`;
}

/**
 * Retorna o caminho absoluto do diretório onde os anexos de OS são fisicamente persistidos.
 * @returns Caminho do diretório de uploads
 */
function caminhoDiretorioAnexos() {
  return caminhoStorageRuntime("uploads", "anexos");
}

/**
 * Valida os magic bytes de arquivos PNG (0x89504E47).
 * @param buffer - Buffer do arquivo
 * @returns Verdadeiro se for PNG legítimo
 */
function parecePng(buffer: Buffer) {
  const assinatura = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  return buffer.length >= assinatura.length && buffer.subarray(0, 8).equals(assinatura);
}

/**
 * Valida a assinatura de arquivos JPEG (SOI marcador 0xFFD8FF).
 * @param buffer - Buffer do arquivo
 * @returns Verdadeiro se for JPEG legítimo
 */
function pareceJpeg(buffer: Buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

/**
 * Valida a assinatura de arquivos WEBP (RIFF...WEBP).
 * @param buffer - Buffer do arquivo
 * @returns Verdadeiro se for WEBP legítimo
 */
function pareceWebp(buffer: Buffer) {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

/**
 * Valida a assinatura de documentos PDF (%PDF).
 * @param buffer - Buffer do arquivo
 * @returns Verdadeiro se for PDF legítimo
 */
function parecePdf(buffer: Buffer) {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF";
}

/**
 * Avalia se os primeiros bytes do buffer coincidem com o formato declarado pela extensão.
 * @param buffer - Buffer do arquivo
 * @param extensao - Extensão normalizada (.png, .jpg, .webp, .pdf)
 * @returns Verdadeiro se o conteúdo for íntegro
 */
function arquivoPareceValido(buffer: Buffer, extensao: string) {
  if (extensao === ".png") return parecePng(buffer);
  if (extensao === ".jpg" || extensao === ".jpeg") return pareceJpeg(buffer);
  if (extensao === ".webp") return pareceWebp(buffer);
  if (extensao === ".pdf") return parecePdf(buffer);

  return false;
}

/**
 * Assegura que o anexo retornado ao cliente utilize a rota protegida de API em `url`.
 * @param anexo - Objeto de anexo do Prisma
 * @returns Anexo com URL padronizada
 */
function sanitizarAnexo<T extends { fileName: string; url: string | null }>(anexo: T) {
  return {
    ...anexo,
    url: urlProtegidaAnexo(anexo.fileName),
  };
}

/**
 * Lista todos os anexos vinculados a uma Ordem de Serviço específica.
 * Exige permissão 'ordens.anexos'.
 * 
 * @param _request - Requisição HTTP recebida
 * @param context - Parâmetros da rota contendo `id` da OS
 * @returns JSON com array de anexos e suas URLs protegidas
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.anexos");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { message: "ID da OS não informado." },
        { status: 400 }
      );
    }

    const ordemExiste = await prisma.serviceOrder.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!ordemExiste) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    const anexos = await prisma.serviceOrderAttachment.findMany({
      where: {
        serviceOrderId: id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(anexos.map(sanitizarAnexo));
  } catch (error) {
    console.error("Erro ao buscar anexos da OS:", error);

    return NextResponse.json(
      { message: "Erro ao buscar anexos da OS." },
      { status: 500 }
    );
  }
}

/**
 * Realiza o upload e vinculação de um novo anexo (imagem ou PDF) a uma Ordem de Serviço.
 * Grava fisicamente no diretório de uploads e adiciona registro no histórico de auditoria (`OrderHistory`).
 * 
 * @param request - Requisição HTTP com multipart/form-data contendo o arquivo
 * @param context - Parâmetros da rota contendo `id` da OS
 * @returns JSON com o anexo criado e status HTTP 201
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.anexos");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { message: "ID da OS não informado." },
        { status: 400 }
      );
    }

    const ordem = await prisma.serviceOrder.findUnique({
      where: { id },
      select: {
        id: true,
        osNumber: true,
      },
    });

    if (!ordem) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    const formData = await request.formData().catch(() => null);

    if (!formData) {
      return NextResponse.json(
        { message: "Dados inválidos para envio do anexo." },
        { status: 400 }
      );
    }

    const arquivo =
      formData.get("file") ||
      formData.get("arquivo") ||
      formData.get("anexo") ||
      formData.get("attachment");

    if (!(arquivo instanceof File)) {
      return NextResponse.json(
        { message: "Nenhum arquivo enviado." },
        { status: 400 }
      );
    }

    if (arquivo.size <= 0) {
      return NextResponse.json(
        { message: "O arquivo enviado está vazio." },
        { status: 400 }
      );
    }

    if (arquivo.size > TAMANHO_MAXIMO_ANEXO) {
      return NextResponse.json(
        { message: "O anexo deve ter no máximo 10MB." },
        { status: 400 }
      );
    }

    const originalName = arquivo.name || "arquivo";
    const extensao = normalizarExtensao(originalName);
    const mimePermitido = TIPOS_PERMITIDOS.get(extensao);

    if (!mimePermitido) {
      return NextResponse.json(
        {
          message:
            "Tipo de anexo não permitido. Envie PNG, JPG, WEBP ou PDF.",
        },
        { status: 400 }
      );
    }

    const bytes = await arquivo.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (!arquivoPareceValido(buffer, extensao)) {
      return NextResponse.json(
        {
          message:
            "O arquivo enviado não parece corresponder ao tipo informado.",
        },
        { status: 400 }
      );
    }

    const uploadDir = caminhoDiretorioAnexos();
    await mkdir(uploadDir, { recursive: true });

    const baseName = limparNomeArquivo(
      path.basename(originalName, extensao) || "anexo"
    );

    const numeroOS = String(ordem.osNumber || "sem-numero").replace(/\D/g, "") || "sem-numero";
    const fileName = `os-${numeroOS}-${Date.now()}-${randomUUID()}-${baseName}${extensao}`;
    const filePath = path.join(uploadDir, fileName);

    await writeFile(filePath, buffer, {
      flag: "wx",
    });

    const url = urlProtegidaAnexo(fileName);
    const userName = await resolverOperadorPadrao(nomeOperador(acesso.usuario));

    const anexo = await prisma.serviceOrderAttachment.create({
      data: {
        serviceOrderId: id,
        fileName,
        originalName,
        url,
        mimeType: mimePermitido,
        size: arquivo.size,
      },
    });

    await prisma.orderHistory.create({
      data: {
        serviceOrderId: id,
        userName,
        action: "ANEXO_ADICIONADO",
        description: `Anexo adicionado à OS: ${originalName}.`,
      },
    });

    return NextResponse.json(sanitizarAnexo(anexo), { status: 201 });
  } catch (error) {
    console.error("Erro ao salvar anexo da OS:", error);

    return NextResponse.json(
      { message: "Erro ao salvar anexo da OS." },
      { status: 500 }
    );
  }
}
