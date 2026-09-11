/**
 * @file route.ts
 * @description Endpoint de entrega estática e streaming de fotos de produtos (`/api/produtos/upload/[arquivo]`).
 * Constrói o caminho de forma sanitizada usando `path.basename` para impedir travessia de diretório (Path Traversal),
 * detecta o Content-Type apropriado por extensão e responde com o fluxo binário da imagem.
 */

import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { caminhoUploadPublico } from "@/lib/runtimeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    arquivo: string;
  }>;
};

/**
 * Identifica o cabeçalho Content-Type MIME baseado na extensão do arquivo de imagem.
 * @param nomeArquivo - Nome do arquivo com extensão
 * @returns Tipo MIME correspondente (ex: image/png, image/jpeg, image/webp)
 */
function contentTypePorExtensao(nomeArquivo: string) {
  const ext = path.extname(nomeArquivo).toLowerCase();

  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";

  return "application/octet-stream";
}

/**
 * Manipulador GET para ler e transmitir a imagem do produto solicitada.
 * @param _request - Requisição HTTP
 * @param context - Contexto contendo `params.arquivo` com o nome do arquivo
 * @returns Resposta com binário Uint8Array da imagem ou status 404 se inexistente
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
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

    return new NextResponse(new Uint8Array(buffer), {
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