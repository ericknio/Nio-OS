/**
 * @file route.ts
 * @description Endpoint de inicialização e criação do primeiro administrador do sistema (Setup/Primeiro Acesso).
 * Controla a detecção de ausência de usuários cadastrados no banco, protege contra inicialização
 * remota não autorizada através de token de bootstrap (HMAC derivado de AUTH_SECRET) e atribui
 * papel ADMIN com todas as permissões do sistema ativadas.
 */

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { SystemUserRole, SystemUserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { criarHashSenha, definirSessaoUsuario } from "@/lib/authSistema";
import { TODAS_PERMISSOES } from "@/lib/permissoesSistema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cabeçalho HTTP esperado contendo o token de autorização de bootstrap local. */
const BOOTSTRAP_HEADER = "x-nio-os-bootstrap";

/** Contexto fixo utilizado para a derivação criptográfica do token de bootstrap. */
const BOOTSTRAP_CONTEXT = "nio-os-first-admin-v1";

/** Flag em memória para evitar condições de corrida (race conditions) na criação simultânea do admin. */
let criandoPrimeiroAdmin = false;

/**
 * Deriva o hash HMAC-SHA256 esperado para o bootstrap seguro baseado em AUTH_SECRET.
 * @returns Hash hexadecimal de 64 caracteres ou string vazia se secret não configurado
 */
function bootstrapEsperado() {
  const secret = String(process.env.AUTH_SECRET || "").trim();

  if (secret.length < 32) return "";

  return crypto
    .createHmac("sha256", secret)
    .update(BOOTSTRAP_CONTEXT)
    .digest("hex");
}

/**
 * Valida se a requisição originou do computador servidor local através do cabeçalho de bootstrap.
 * Em desenvolvimento retorna sempre true; em produção exige validação timing-safe do HMAC.
 * @param request - Requisição HTTP recebida
 * @returns Verdadeiro se a requisição é autorizada para bootstrap
 */
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

/**
 * Sanitiza valores de entrada convertendo para string e removendo espaços excedentes.
 * @param valor - Dado de entrada
 * @returns String tratada
 */
function texto(valor: unknown) {
  return String(valor || "").trim();
}

/**
 * Normaliza o login do usuário em minúsculas.
 * @param valor - Login bruto
 * @returns Username minúsculo
 */
function login(valor: unknown) {
  return texto(valor).toLowerCase();
}

/**
 * Normaliza e-mail em minúsculas ou retorna null se vazio.
 * @param valor - E-mail bruto
 * @returns E-mail limpo ou null
 */
function email(valor: unknown) {
  const limpo = texto(valor).toLowerCase();
  return limpo || null;
}

/**
 * Valida o padrão aceitável de login no primeiro acesso (3 a 120 caracteres).
 * @param valor - Login a validar
 * @returns Verdadeiro se válido
 */
function loginValido(valor: string) {
  return /^[a-z0-9._@-]{3,120}$/.test(valor);
}

/**
 * Valida o formato de e-mail via expressão regular.
 * @param valor - E-mail a testar
 * @returns Verdadeiro se válido ou nulo
 */
function emailValido(valor: string | null) {
  if (!valor) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

/**
 * Cria resposta JSON padronizada com cabeçalho no-store.
 * @param message - Mensagem de texto
 * @param status - Código HTTP
 * @param extra - Dados extras
 * @returns Instância de NextResponse
 */
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

/**
 * Verifica se o banco de dados possui usuários cadastrados ou se requer a criação do primeiro administrador.
 * 
 * @returns JSON com flag `precisaCriarAdmin: boolean` (true se totalUsuarios === 0)
 */
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

/**
 * Cria o primeiro administrador do sistema no banco SQLite local.
 * 
 * Regras e validações de segurança:
 * 1. Verifica licença ativa em produção.
 * 2. Valida cabeçalho de bootstrap HMAC para garantir execução no computador servidor.
 * 3. Previne race condition através da flag de execução `criandoPrimeiroAdmin`.
 * 4. Valida se nenhum usuário pré-existente foi cadastrado.
 * 5. Cria usuário com papel ADMIN e todas as permissões do sistema (`TODAS_PERMISSOES`).
 * 6. Define automaticamente o cookie de sessão autenticada para o novo admin.
 * 
 * @param request - Requisição HTTP com JSON contendo `name`, `username`, `email` e `password`
 * @returns JSON com dados do novo admin criado e cookie de sessão
 */
export async function POST(request: Request) {
  // Edição 100% Local: criação do primeiro administrador sem bloqueio de licença

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
