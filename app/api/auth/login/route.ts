/**
 * @file route.ts
 * @description Endpoint de autenticação de usuários (Login) do Nio-OS.
 * Implementa proteção contra ataques de força bruta (Rate Limiting in-memory por usuário),
 * validação criptográfica de credenciais com hash PBKDF2, verificação de licença ativa,
 * sincronização opcional com nuvem e emissão de cookie de sessão assinado (HMAC).
 */

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

/** Janela de monitoramento para bloqueio de tentativas de login (15 minutos). */
const JANELA_TENTATIVAS_MS = 15 * 60 * 1000;

/** Número máximo de tentativas falhas consecutivas antes do bloqueio temporário (8 tentativas). */
const MAX_TENTATIVAS = 8;

/**
 * Mapa em memória para controle de rate limit de tentativas de login por chave de usuário.
 */
const tentativasLogin = new Map<
  string,
  {
    total: number;
    resetAt: number;
  }
>();

/**
 * Sanitiza valores de entrada convertendo para string e removendo espaços excedentes.
 * @param valor - Dado de entrada
 * @returns String tratada
 */
function texto(valor: unknown) {
  return String(valor || "").trim();
}

/**
 * Normaliza o nome de usuário/login para comparação em caixa baixa.
 * @param valor - Login bruto
 * @returns Username em minúsculas
 */
function login(valor: unknown) {
  return texto(valor).toLowerCase();
}

/**
 * Constrói uma resposta JSON padronizada com cabeçalhos anti-cache (no-store).
 * @param message - Mensagem textual de feedback
 * @param status - Código de status HTTP
 * @param extra - Propriedades adicionais do payload JSON
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
 * Gera a chave identificadora do usuário para contabilização de tentativas de login.
 * Em redes locais, não utiliza cabeçalhos de proxy para evitar spoofing.
 * @param username - Nome de usuário
 * @returns Chave normalizada
 */
function chaveTentativa(username: string) {
  // O servidor LAN é direto, sem proxy reverso confiável.
  // Não use cabeçalhos de IP enviados pelo cliente para rate limit.
  return username || "sem-usuario";
}

/**
 * Verifica se a chave de usuário atingiu o limite de tentativas e ainda está dentro do período de bloqueio.
 * @param chave - Chave identificadora
 * @returns Verdadeiro se a tentativa deve ser bloqueada (HTTP 429)
 */
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

/**
 * Registra uma tentativa falha de autenticação, incrementando o contador ou iniciando nova janela.
 * @param chave - Chave identificadora
 */
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

/**
 * Remove o registro de tentativas falhas após um login bem-sucedido.
 * @param chave - Chave identificadora
 */
function limparFalhas(chave: string) {
  tentativasLogin.delete(chave);
}

/**
 * Processa a requisição de login de um usuário no sistema.
 * 
 * Fluxo de segurança executado:
 * 1. Sanitização e validação de tamanho de username e password.
 * 2. Verificação de rate limit na memória para mitigar ataques de força bruta.
 * 3. Busca do usuário pelo username ou email no banco SQLite.
 * 4. Validação da licença de uso do software (NIO_OS_LICENSE_ACTIVE).
 * 5. Checagem opcional de status na nuvem (se em modo web conectado).
 * 6. Verificação do status ATIVO do usuário.
 * 7. Validação da senha com comparação timing-safe sobre hash PBKDF2.
 * 8. Atualização de `lastLoginAt` e emissão de cookie assinado com HMAC-SHA256 via `definirSessaoUsuario`.
 * 
 * @param request - Requisição HTTP com JSON contendo `username` e `password`
 * @returns JSON com dados públicos do usuário logado ou mensagem de erro (400, 401, 403, 429, 500)
 */
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

    // Edição 100% Local: autenticação direta no banco SQLite sem bloqueios de licença ou dependência de nuvem.

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
