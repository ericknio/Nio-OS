// app/api/auth/minha-conta/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterUsuarioLogado } from "@/lib/authSistema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function email(valor: unknown) {
  const limpo = String(valor || "").trim().toLowerCase();
  return limpo || null;
}

function username(valor: unknown) {
  return String(valor || "").trim().toLowerCase();
}

function emailValido(valor: string | null) {
  if (!valor) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function usernameValido(valor: string) {
  return /^[a-z0-9._-]{3,30}$/.test(valor);
}

function respostaJson(message: string, status: number) {
  return NextResponse.json(
    {
      message,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function PATCH(request: Request) {
  try {
    const usuarioLogado = await obterUsuarioLogado();

    if (!usuarioLogado) {
      return respostaJson("Usuário não autenticado.", 401);
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body || typeof body !== "object") {
      return respostaJson("Dados inválidos para atualizar a conta.", 400);
    }

    const name = texto(body.name);
    const login = username(body.username);
    const userEmail = email(body.email);

    if (!name || name.length > 120) {
      return respostaJson("Informe o nome do usuário.", 400);
    }

    if (!login) {
      return respostaJson("Informe o login do usuário.", 400);
    }

    if (!usernameValido(login)) {
      return respostaJson(
        "O login deve ter 3 a 30 caracteres e usar apenas letras, números, ponto, traço ou underline.",
        400
      );
    }

    if (userEmail && userEmail.length > 160) {
      return respostaJson("O e-mail deve ter no máximo 160 caracteres.", 400);
    }

    if (userEmail && !emailValido(userEmail)) {
      return respostaJson("Informe um e-mail válido.", 400);
    }

    const usuarioDuplicado = await prisma.systemUser.findFirst({
      where: {
        id: {
          not: usuarioLogado.id,
        },
        OR: [
          {
            username: login,
          },
          ...(userEmail
            ? [
                {
                  email: userEmail,
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
    });

    if (usuarioDuplicado?.username === login) {
      return respostaJson("Já existe outro usuário com esse login.", 400);
    }

    if (userEmail && usuarioDuplicado?.email === userEmail) {
      return respostaJson("Já existe outro usuário com esse e-mail.", 400);
    }

    const usuario = await prisma.systemUser.update({
      where: {
        id: usuarioLogado.id,
      },
      data: {
        name,
        username: login,
        email: userEmail,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        message: "Conta atualizada com sucesso.",
        usuario,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Erro ao atualizar minha conta:", error);

    return respostaJson("Erro ao atualizar minha conta.", 500);
  }
}
