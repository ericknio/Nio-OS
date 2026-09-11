/**
 * @file route.ts
 * @description Endpoint seguro para visualização e download de anexos vinculados a Ordens de Serviço.
 *
 * Mecanismos de Segurança e Proteção:
 * 1. RBAC: Exige autenticação ativa e permissão `ordens.anexos`.
 * 2. Prevenção de Path Traversal: Sanitiza o parâmetro da rota validando se `path.basename` coincide exatamente.
 * 3. Integridade de Metadados: Consulta a tabela `ServiceOrderAttachment` para obter nome original e MIME type.
 * 4. Retrocompatibilidade: Procura primeiramente no storage protegido em runtime (`caminhoStorageRuntime`)
 *    e, como fallback, no diretório de uploads legado (`caminhoUploadPublico`).
 * 5. Cabeçalhos de Segurança: Envia `X-Content-Type-Options: nosniff` e `Cache-Control: no-store` para impedir
 *    sniffing de tipo de conteúdo ou cache em proxies intermediários.
 */

import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import { caminhoStorageRuntime, caminhoUploadPublico } from "@/lib/runtimeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contexto da rota dinâmica do Next.js App Router contendo os parâmetros de URL assíncronos.
 */
type RouteContext = {
  params: Promise<{
    arquivo: string;
  }>;
};

/**
 * Determina o MIME type a partir da extensão do arquivo para fallback quando não houver registro no banco.
 *
 * @param nomeArquivo - Nome ou extensão do arquivo
 * @returns String com o tipo MIME correspondente
 */
function contentTypePorExtensao(nomeArquivo: string) {
  const ext = path.extname(nomeArquivo).toLowerCase();

  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".pdf") return "application/pdf";

  return "application/octet-stream";
}

/**
 * Sanitiza o nome original do arquivo removendo acentos, espaços e caracteres especiais
 * para uso seguro no header HTTP `Content-Disposition`.
 *
 * @param nome - Nome original informado
 * @returns Nome seguro normalizado para download
 */
function nomeDownloadSeguro(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120) || "anexo";
}

/**
 * Verifica de forma assíncrona se um caminho em disco existe e corresponde a um arquivo regular.
 *
 * @param caminho - Caminho absoluto no sistema de arquivos
 * @returns True se o arquivo existir e for arquivo válido; false caso contrário
 */
async function arquivoExiste(caminho: string) {
  try {
    const info = await stat(caminho);
    return info.isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve o caminho físico do arquivo em disco buscando prioritariamente no storage protegido
 * de runtime e, secundariamente, no storage público legado.
 *
 * @param nomeSeguro - Nome do arquivo validado contra path traversal
 * @returns Caminho absoluto do arquivo ou null se não existir fisicamente
 */
async function resolverCaminhoArquivo(nomeSeguro: string) {
  const caminhoProtegido = caminhoStorageRuntime(
    "uploads",
    "anexos",
    nomeSeguro
  );

  if (await arquivoExiste(caminhoProtegido)) {
    return caminhoProtegido;
  }

  // Compatibilidade com anexos antigos que foram salvos em public/uploads/anexos.
  const caminhoAntigo = caminhoUploadPublico(
    "anexos",
    nomeSeguro
  );

  if (await arquivoExiste(caminhoAntigo)) {
    return caminhoAntigo;
  }

  return null;
}

/**
 * Handler GET para entrega do binário do anexo da ordem de serviço.
 *
 * @param _request - Requisição HTTP recebida
 * @param context - Contexto contendo o parâmetro dinâmico `arquivo`
 * @returns Resposta binária com headers de segurança ou erro HTTP apropriado
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.anexos");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { arquivo } = await context.params;
    const nomeSeguro = path.basename(decodeURIComponent(arquivo || ""));

    if (!nomeSeguro || nomeSeguro !== decodeURIComponent(arquivo || "")) {
      return NextResponse.json(
        { message: "Anexo não informado." },
        { status: 400 }
      );
    }

    const anexo = await prisma.serviceOrderAttachment.findFirst({
      where: {
        fileName: nomeSeguro,
      },
      select: {
        fileName: true,
        originalName: true,
        mimeType: true,
      },
    });

    if (!anexo) {
      return NextResponse.json(
        { message: "Anexo não encontrado." },
        { status: 404 }
      );
    }

    const filePath = await resolverCaminhoArquivo(nomeSeguro);

    if (!filePath) {
      return NextResponse.json(
        { message: "Arquivo do anexo não encontrado." },
        { status: 404 }
      );
    }

    const buffer = await readFile(filePath);
    const contentType = anexo.mimeType || contentTypePorExtensao(nomeSeguro);
    const downloadName = nomeDownloadSeguro(anexo.originalName || nomeSeguro);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${downloadName}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Erro ao carregar anexo da OS:", error);

    return NextResponse.json(
      { message: "Erro ao carregar anexo da OS." },
      { status: 500 }
    );
  }
}

