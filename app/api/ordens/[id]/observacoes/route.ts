// app/api/ordens/[id]/observacoes/route.ts
// v1.1.0 - API de observações internas protegida e com operador da sessão

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const LIMITE_OBSERVACAO = 3000;

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function nomeOperador(usuario: unknown) {
  const dados = usuario as
    | {
        name?: string | null;
        nome?: string | null;
        username?: string | null;
        email?: string | null;
      }
    | null
    | undefined;

  return (
    texto(dados?.name) ||
    texto(dados?.nome) ||
    texto(dados?.username) ||
    texto(dados?.email) ||
    "Sistema"
  );
}

function sanitizarObservacao(observacao: {
  id: string;
  serviceOrderId: string;
  userName: string | null;
  note: string;
  createdAt: Date;
}) {
  return {
    id: observacao.id,
    serviceOrderId: observacao.serviceOrderId,
    userName: observacao.userName || "Sistema",
    note: observacao.note,
    createdAt: observacao.createdAt,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.observacoes");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await context.params;

    const ordem = await prisma.serviceOrder.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ordem) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    const observacoes = await prisma.serviceOrderInternalNote.findMany({
      where: {
        serviceOrderId: id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(observacoes.map(sanitizarObservacao));
  } catch (error) {
    console.error("Erro ao buscar observações da OS:", error);

    return NextResponse.json(
      { message: "Erro ao buscar observações da OS." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.observacoes");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { message: "Dados inválidos para salvar observação." },
        { status: 400 }
      );
    }

    const note = texto(
      body.note || body.observacao || body.observacaoInterna || body.texto
    );

    if (!note) {
      return NextResponse.json(
        { message: "Informe a observação." },
        { status: 400 }
      );
    }

    if (note.length > LIMITE_OBSERVACAO) {
      return NextResponse.json(
        {
          message: `A observação deve ter no máximo ${LIMITE_OBSERVACAO} caracteres.`,
        },
        { status: 400 }
      );
    }

    const ordem = await prisma.serviceOrder.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ordem) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    const userName = nomeOperador(acesso.usuario);

    const observacao = await prisma.serviceOrderInternalNote.create({
      data: {
        serviceOrderId: id,
        userName,
        note,
      },
    });

    await prisma.orderHistory.create({
      data: {
        serviceOrderId: id,
        userName,
        action: "OBSERVACAO_INTERNA",
        description: "Observação interna adicionada à OS.",
      },
    });

    return NextResponse.json(sanitizarObservacao(observacao), { status: 201 });
  } catch (error) {
    console.error("Erro ao salvar observação da OS:", error);

    return NextResponse.json(
      { message: "Erro ao salvar observação da OS." },
      { status: 500 }
    );
  }
}
