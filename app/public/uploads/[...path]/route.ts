/**
 * @file route.ts
 * @description Endpoint de compatibilidade para atender requisições diretas a arquivos estáticos em `/public/uploads/[...path]`.
 *
 * Mecanismos de Proteção:
 * 1. Sandboxing: Utiliza `caminhoEstaDentro` para garantir que o caminho requisitado não escape da pasta raiz de uploads.
 * 2. MIME Type: Mapeia tipos MIME para imagens (png, jpg, webp, gif, svg) e documentos PDF.
 * 3. Headers Anti-Cache: Impede cache agressivo de arquivos recém-atualizados.
 */

import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { caminhoEstaDentro, caminhoUploadPublico } from "@/lib/runtimeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tipagem para os parâmetros dinâmicos de rota catch-all do Next.js.
 */
type Params = Promise<{ path?: string[] }> | { path?: string[] };

/**
 * Tabela de mapeamento de extensões suportadas para tipos MIME correspondentes.
 */
const TIPOS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

/**
 * Determina o Content-Type apropriado para o arquivo solicitado com base na extensão.
 *
 * @param arquivo - Caminho ou nome do arquivo
 * @returns String MIME type correspondente
 */
function tipoConteudo(arquivo: string) {
  return TIPOS[path.extname(arquivo).toLowerCase()] || "application/octet-stream";
}

/**
 * Handler GET para entrega de arquivo do diretório público de uploads.
 *
 * @param _request - Requisição HTTP recebida
 * @param context - Contexto contendo os segmentos do caminho nos parâmetros
 * @returns Resposta HTTP com buffer do arquivo ou erro 400/404
 */
export async function GET(_request: Request, context: { params: Params }) {
  try {
    const params = await context.params;
    const partes = Array.isArray(params?.path) ? params.path : [];

    if (!partes.length) {
      return NextResponse.json({ message: "Arquivo não informado." }, { status: 400 });
    }

    const raiz = caminhoUploadPublico();
    const arquivo = caminhoUploadPublico(...partes);

    if (!caminhoEstaDentro(arquivo, raiz)) {
      return NextResponse.json({ message: "Caminho inválido." }, { status: 400 });
    }

    const buffer = await fs.readFile(arquivo);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": tipoConteudo(arquivo),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch {
    return NextResponse.json({ message: "Arquivo não encontrado." }, { status: 404 });
  }
}

