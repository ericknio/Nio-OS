import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { caminhoUploadPublico } from "@/lib/runtimeStorage";
import { exigirModuloProdutosAtivoApi } from "@/lib/moduloProdutos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    arquivo: string;
  }>;
};

function contentTypePorExtensao(nomeArquivo: string) {
  const ext = path.extname(nomeArquivo).toLowerCase();

  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";

  return "application/octet-stream";
}

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