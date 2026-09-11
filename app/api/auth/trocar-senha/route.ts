/**
 * @file route.ts
 * @description Endpoint seguro para alteração de senha pelo próprio usuário autenticado.
 * Valida a senha atual via timingSafeEqual e hash PBKDF2, exige confirmação idêntica da nova senha,
 * impede repetição da senha anterior e atualiza o hash no banco.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  criarHashSenha,
  obterUsuarioLogado,
  verificarSenha,
} from "@/lib/authSistema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Converte qualquer valor recebido para string limpa, removendo espaços excedentes nas pontas.
 * @param valor - Dado de entrada
 * @returns String tratada
 */
function texto(valor: unknown) {
  return String(valor || "").trim();
}

/**
 * Constrói resposta JSON padronizada com cabeçalho no-store.
 * @param message - Mensagem textual
 * @param status - Código de status HTTP
 * @returns NextResponse estruturado
 */
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

/**
 * Altera a senha do usuário atualmente autenticado.
 * 
 * Regras aplicadas:
 * 1. Exige autenticação prévia (retorna 401 se ausente).
 * 2. Valida preenchimento de senhaAtual, novaSenha e confirmarSenha.
 * 3. Garante tamanho mínimo de 6 caracteres para nova senha.
 * 4. Valida se confirmarSenha confere com novaSenha.
 * 5. Garante que novaSenha seja diferente da senhaAtual.
 * 6. Valida senhaAtual contra o hash salvo no banco.
 * 7. Gera novo hash PBKDF2 com salt criptográfico e persiste no SQLite.
 * 
 * @param request - Requisição HTTP com JSON contendo `senhaAtual`, `novaSenha` e `confirmarSenha`
 * @returns JSON com mensagem de sucesso ou erro (400, 401, 404, 500)
 */
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
      return respostaJson("Dados inválidos para trocar senha.", 400);
    }

    const senhaAtual = texto(body.senhaAtual);
    const novaSenha = texto(body.novaSenha);
    const confirmarSenha = texto(body.confirmarSenha);

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      return respostaJson("Preencha todos os campos de senha.", 400);
    }

    if (
      senhaAtual.length > 200 ||
      novaSenha.length > 200 ||
      confirmarSenha.length > 200
    ) {
      return respostaJson("A senha deve ter no máximo 200 caracteres.", 400);
    }

    if (novaSenha.length < 6) {
      return respostaJson("A nova senha precisa ter pelo menos 6 caracteres.", 400);
    }

    if (novaSenha !== confirmarSenha) {
      return respostaJson("A confirmação da senha não confere.", 400);
    }

    if (senhaAtual === novaSenha) {
      return respostaJson(
        "A nova senha precisa ser diferente da senha atual.",
        400
      );
    }

    const usuario = await prisma.systemUser.findUnique({
      where: {
        id: usuarioLogado.id,
      },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!usuario) {
      return respostaJson("Usuário não encontrado.", 404);
    }

    const senhaCorreta = verificarSenha(senhaAtual, usuario.passwordHash);

    if (!senhaCorreta) {
      return respostaJson("Senha atual incorreta.", 400);
    }

    await prisma.systemUser.update({
      where: {
        id: usuario.id,
      },
      data: {
        passwordHash: criarHashSenha(novaSenha),
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json(
      {
        message: "Senha alterada com sucesso.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Erro ao trocar senha:", error);

    return respostaJson("Erro ao trocar senha.", 500);
  }
}
