// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { SystemUserStatus, SystemUserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  definirSessaoUsuario,
  limparSessaoUsuario,
  verificarSenha,
  criarHashSenha,
} from "@/lib/authSistema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JANELA_TENTATIVAS_MS = 15 * 60 * 1000;
const MAX_TENTATIVAS = 8;

const tentativasLogin = new Map<
  string,
  {
    total: number;
    resetAt: number;
  }
>();

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function login(valor: unknown) {
  return texto(valor).toLowerCase();
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

function chaveTentativa(username: string) {
  // O servidor LAN é direto, sem proxy reverso confiável.
  // Não use cabeçalhos de IP enviados pelo cliente para rate limit.
  return username || "sem-usuario";
}

function tentativaBloqueada(chave: string) {
  const agora = Date.now();
  const atual = tentativasLogin.get(chave);

  if (!atual) return false;

  if (atual.resetAt <= agora) {
    tentativasLogin.delete(chave);
    return false;
  }

  return atual.total >= MAX_TENTATIVAS;
}

function registrarFalha(chave: string) {
  const agora = Date.now();
  const atual = tentativasLogin.get(chave);

  if (!atual || atual.resetAt <= agora) {
    tentativasLogin.set(chave, {
      total: 1,
      resetAt: agora + JANELA_TENTATIVAS_MS,
    });
    return;
  }

  tentativasLogin.set(chave, {
    ...atual,
    total: atual.total + 1,
  });
}

function limparFalhas(chave: string) {
  tentativasLogin.delete(chave);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body || typeof body !== "object") {
      return respostaJson("Dados inválidos para login.", 400);
    }

    const username = login(body.username);
    const password = texto(body.password);

    if (!username || !password) {
      return respostaJson("Informe usuário e senha.", 400);
    }

    if (username.length > 80 || password.length > 200) {
      return respostaJson("Usuário ou senha inválidos.", 401);
    }

    const chave = chaveTentativa(username);

    if (tentativaBloqueada(chave)) {
      return respostaJson(
        "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
        429
      );
    }

    let usuario = await prisma.systemUser.findFirst({
      where: {
        OR: [
          { username },
          { email: username },
        ],
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        status: true,
        passwordHash: true,
      },
    });

    const isDesktop = !!process.env.NIO_OS_RUNTIME_DIR;
    const cloudUrl = process.env.NIO_OS_CLOUD_URL;

    if (
      process.env.NODE_ENV === "production" &&
      process.env.NIO_OS_LICENSE_ACTIVE !== "1"
    ) {
      registrarFalha(chave);
      return respostaJson(
        "Este computador não possui uma licença ativa do Nio-OS. Realize a ativação para acessar.",
        403
      );
    }

    // Se não for Desktop e tiver Cloud URL configurada, a nuvem deve ditar o acesso.
    // Mas, como a API da nuvem agora exige HWID (Desktop), Web Servers sempre tomariam 400.
    // Para manter a segurança sem quebrar o sistema Web existente, nós apenas validamos 
    // se a nuvem explicitamente bloqueou (401, 402, 403) a assinatura.
    if (cloudUrl && !isDesktop) {
      try {
        const cloudRes = await fetch(`${cloudUrl}/api/v1/client-auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: username, password }),
        });

        if (cloudRes.status === 403 || cloudRes.status === 402 || cloudRes.status === 401) {
          const cloudData = await cloudRes.json().catch(() => null);
          if (!usuario || usuario.role === SystemUserRole.ADMIN) {
            registrarFalha(chave);
            return respostaJson(
              cloudData?.message || "Assinatura expirada, senha inválida ou conta bloqueada na nuvem.", 
              403
            );
          }
        }
      } catch (error) {
        console.warn("Falha ao comunicar com a Nuvem no modo Web. Acesso local permitido temporariamente.", error);
      }
    }

    if (!usuario) {
      registrarFalha(chave);
      return respostaJson("Usuário ou senha inválidos.", 401);
    }

    if (usuario.status !== SystemUserStatus.ATIVO) {
      registrarFalha(chave);
      await limparSessaoUsuario();
      return respostaJson("Usuário bloqueado ou inativo.", 403);
    }

    const senhaValida = verificarSenha(password, usuario.passwordHash);

    if (!senhaValida) {
      registrarFalha(chave);
      return respostaJson("Usuário ou senha inválidos.", 401);
    }

    limparFalhas(chave);

    await prisma.systemUser.update({
      where: {
        id: usuario.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    await definirSessaoUsuario(usuario.id);

    return NextResponse.json(
      {
        autenticado: true,
        message: "Login realizado com sucesso.",
        usuario: {
          id: usuario.id,
          name: usuario.name,
          username: usuario.username,
          email: usuario.email,
          role: usuario.role,
          status: usuario.status,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Erro ao fazer login:", error);

    return respostaJson("Erro ao fazer login.", 500);
  }
}
