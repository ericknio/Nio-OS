// app/api/auth/setup/route.ts
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { SystemUserRole, SystemUserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { criarHashSenha, definirSessaoUsuario } from "@/lib/authSistema";
import { TODAS_PERMISSOES } from "@/lib/permissoesSistema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOTSTRAP_HEADER = "x-nio-os-bootstrap";
const BOOTSTRAP_CONTEXT = "nio-os-first-admin-v1";

let criandoPrimeiroAdmin = false;

function bootstrapEsperado() {
  const secret = String(process.env.AUTH_SECRET || "").trim();

  if (secret.length < 32) return "";

  return crypto
    .createHmac("sha256", secret)
    .update(BOOTSTRAP_CONTEXT)
    .digest("hex");
}

function bootstrapDesktopValido(request: Request) {
  if (process.env.NODE_ENV !== "production") return true;

  const esperado = bootstrapEsperado();
  const recebido = String(request.headers.get(BOOTSTRAP_HEADER) || "")
    .trim()
    .toLowerCase();

  if (
    !esperado ||
    !/^[a-f0-9]{64}$/.test(recebido) ||
    esperado.length !== recebido.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(esperado, "utf8"),
    Buffer.from(recebido, "utf8")
  );
}

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function login(valor: unknown) {
  return texto(valor).toLowerCase();
}

function email(valor: unknown) {
  const limpo = texto(valor).toLowerCase();
  return limpo || null;
}

function loginValido(valor: string) {
  return /^[a-z0-9._@-]{3,120}$/.test(valor);
}

function emailValido(valor: string | null) {
  if (!valor) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function respostaJson(message: string, status: number, extra?: object) {
  return NextResponse.json(
    {
      message,
      ...(extra || {}),
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function GET() {
  try {
    const totalUsuarios = await prisma.systemUser.count();

    return NextResponse.json(
      {
        precisaCriarAdmin: totalUsuarios === 0,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Erro ao verificar setup:", error);

    return respostaJson("Erro ao verificar primeiro acesso.", 500);
  }
}

export async function POST(request: Request) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NIO_OS_LICENSE_ACTIVE !== "1"
  ) {
    return respostaJson(
      "Este computador não possui uma licença ativa do Nio-OS. Realize a ativação para acessar.",
      403
    );
  }

  if (!bootstrapDesktopValido(request)) {
    return respostaJson(
      "O primeiro administrador deve ser criado no computador servidor.",
      403
    );
  }

  if (criandoPrimeiroAdmin) {
    return respostaJson(
      "A criação do primeiro administrador já está em andamento.",
      409
    );
  }

  criandoPrimeiroAdmin = true;

  try {
    const totalUsuarios = await prisma.systemUser.count();

    if (totalUsuarios > 0) {
      return respostaJson("O primeiro administrador já foi criado.", 409);
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body || typeof body !== "object") {
      return respostaJson("Dados inválidos para criar administrador.", 400);
    }

    const name = texto(body.name);
    const username = login(body.username);
    const userEmail = email(body.email);
    const password = texto(body.password);

    if (!name || name.length > 120) {
      return respostaJson("Informe o nome do administrador.", 400);
    }

    if (!loginValido(username)) {
      return respostaJson(
        "Login inválido. Use de 3 a 30 caracteres com letras, números, ponto, traço ou underline.",
        400
      );
    }

    if (userEmail && !emailValido(userEmail)) {
      return respostaJson("Informe um e-mail válido.", 400);
    }

    if (!password || password.length < 6 || password.length > 200) {
      return respostaJson(
        "A senha precisa ter entre 6 e 200 caracteres.",
        400
      );
    }

    if ((await prisma.systemUser.count()) > 0) {
      return respostaJson("O primeiro administrador já foi criado.", 409);
    }

    const usuario = await prisma.systemUser.create({
      data: {
        name,
        username,
        email: userEmail,
        passwordHash: criarHashSenha(password),
        role: SystemUserRole.ADMIN,
        status: SystemUserStatus.ATIVO,
        lastLoginAt: new Date(),
        permissions: {
          create: TODAS_PERMISSOES.map((key) => ({
            key,
          })),
        },
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        status: true,
      },
    });

    await definirSessaoUsuario(usuario.id);

    return NextResponse.json(
      {
        message: "Administrador criado com sucesso.",
        usuario,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Erro ao criar primeiro admin:", {
      name: error instanceof Error ? error.name : "Erro",
    });

    return respostaJson("Erro ao criar primeiro administrador.", 500);
  } finally {
    criandoPrimeiroAdmin = false;
  }
}
