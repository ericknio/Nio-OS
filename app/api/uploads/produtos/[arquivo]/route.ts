/**
 * @file route.ts
 * @description Endpoint público para entrega e streaming de imagens e fotografias de produtos do catálogo.
 *
 * Mecanismos e Regras:
 * 1. Módulo: Valida se o módulo de produtos está ativo na licença da instalação.
 * 2. Prevenção de Path Traversal: Sanitiza o nome do arquivo através de `path.basename`.
 * 3. Armazenamento: Localiza o arquivo físico no diretório de uploads de produtos configurado no storage de runtime.
 * 4. Resposta Binária: Entrega o buffer com o MIME type adequado (png, jpeg, webp) e cabeçalhos de controle de cache.
 */

import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { caminhoUploadPublico } from "@/lib/runtimeStorage";
import { exigirModuloProdutosAtivoApi } from "@/lib/moduloProdutos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contexto da rota contendo os parâmetros de URL dinâmicos resolvidos de forma assíncrona.
 */
type RouteContext = {
  params: Promise<{
    arquivo: string;
  }>;
};

/**
 * Determina o cabeçalho Content-Type apropriado com base na extensão do arquivo de imagem.
 *
 * @param nomeArquivo - Nome do arquivo com extensão
 * @returns MIME type da imagem ou octet-stream para fallback
 */
function contentTypePorExtensao(nomeArquivo: string) {
  const ext = path.extname(nomeArquivo).toLowerCase();

  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";

  return "application/octet-stream";
}

/**
 * Handler GET para entrega da imagem do produto em formato binário.
 *
 * @param _request - Requisição HTTP recebida
 * @param context - Contexto contendo o nome do arquivo da imagem nos parâmetros
 * @returns Resposta com buffer da imagem ou status 404 se não localizada
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const bloqueioModuloProdutos = await exigirModuloProdutosAtivoApi();

    if (bloqueioModuloProdutos) {
      return bloqueioModuloProdutos;
    }

    const { arquivo } = await context.params;
    const nomeSeguro = path.basename(arquivo || "");

    if (!nomeSeguro) {
      return NextResponse.json(
        { message: "Imagem não informada." },
        { status: 400 }
      );
    }

    const filePath = caminhoUploadPublico("produtos", nomeSeguro);

    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypePorExtensao(nomeSeguro),
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Imagem não encontrada." },
      { status: 404 }
    );
  }
}