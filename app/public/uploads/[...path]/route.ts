import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { caminhoEstaDentro, caminhoUploadPublico } from "@/lib/runtimeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ path?: string[] }> | { path?: string[] };

const TIPOS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

function tipoConteudo(arquivo: string) {
  return TIPOS[path.extname(arquivo).toLowerCase()] || "application/octet-stream";
}

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
