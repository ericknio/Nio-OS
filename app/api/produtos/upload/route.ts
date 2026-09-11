/**
 * @file route.ts
 * @description Endpoint para upload de fotos de produtos (`/api/produtos/upload`).
 * Recebe arquivos via `multipart/form-data`, valida o tipo MIME, tamanho máximo (3MB)
 * e assinaturas mágicas de bytes (PNG, JPEG, WEBP) para impedir upload de binários maliciosos,
 * persistindo no armazenamento seguro e retornando a URL pública.
 */

import { caminhoPublicoRuntime, caminhoUploadPublico } from "@/lib/runtimeStorage";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { exigirModuloProdutosAtivoApi } from "@/lib/moduloProdutos";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tipos MIME de imagens aceitos no upload.
 */
const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/webp"];

/**
 * Mapeamento de tipos MIME para extensões de arquivo correspondentes.
 */
const EXTENSOES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Valida a integridade e cabeçalho binário (magic bytes) do buffer da imagem.
 * @param buffer - Buffer do arquivo recebido
 * @param type - Tipo MIME declarado
 * @returns Booleano indicando se a assinatura binária é genuína
 */
function imagemValida(buffer: Buffer, type: string) {
  if (type === "image/png") {
    const assinatura = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    return buffer.length >= 8 && buffer.subarray(0, 8).equals(assinatura);
  }

  if (type === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
  }

  if (type === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }

  return false;
}

/**
 * Manipulador POST para receber e salvar a imagem do produto.
 * Exige que o módulo de produtos esteja ativo e permissão `produtos.criar` ou `produtos.editar`.
 * @param request - Requisição HTTP contendo FormData com o campo `imagem`
 * @returns Resposta JSON com a URL pública da imagem salva
 */
export async function POST(request: Request) {
  try {
    const bloqueioModuloProdutos = await exigirModuloProdutosAtivoApi();

    if (bloqueioModuloProdutos) {
      return bloqueioModuloProdutos;
    }

    const acesso = await exigirPermissaoApi([
      "produtos.criar",
      "produtos.editar",
    ]);

    if (!acesso.ok) {
      return acesso.response;
    }

    const formData = await request.formData().catch(() => null);
    const file = formData?.get("imagem");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "Nenhuma imagem enviada." },
        { status: 400 }
      );
    }

    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      return NextResponse.json(
        { message: "Envie uma imagem PNG, JPG ou WEBP." },
        { status: 400 }
      );
    }

    const maxSize = 3 * 1024 * 1024;

    if (file.size > maxSize) {
      return NextResponse.json(
        { message: "A imagem deve ter no máximo 3MB." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (!imagemValida(buffer, file.type)) {
      return NextResponse.json(
        { message: "O arquivo enviado não parece ser uma imagem válida." },
        { status: 400 }
      );
    }

    const extensao = EXTENSOES[file.type] || "png";
    const nomeArquivo = `produto-${Date.now()}-${randomUUID()}.${extensao}`;

    const uploadDir = caminhoUploadPublico("produtos");
    const filePath = path.join(uploadDir, nomeArquivo);

    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, buffer);

    return NextResponse.json({
      message: "Imagem enviada com sucesso.",
      imageUrl: `/api/uploads/produtos/${nomeArquivo}`,
    });
  } catch (error) {
    console.error("Erro ao enviar imagem do produto:", error);

    return NextResponse.json(
      { message: "Erro ao enviar imagem do produto." },
      { status: 500 }
    );
  }
}