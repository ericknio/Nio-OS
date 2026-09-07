import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import { caminhoStorageRuntime, caminhoUploadPublico } from "@/lib/runtimeStorage";

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
  if (ext === ".pdf") return "application/pdf";

  return "application/octet-stream";
}

function nomeDownloadSeguro(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120) || "anexo";
}

async function arquivoExiste(caminho: string) {
  try {
    const info = await stat(caminho);
    return info.isFile();
  } catch {
    return false;
  }
}

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
