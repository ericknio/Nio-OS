/**
 * @file route.ts
 * @description Endpoint de logout do Nio-OS.
 * Invalida e expira o cookie de sessão HTTP-only no navegador do cliente,
 * finalizando a autenticação de forma segura.
 */

import { NextResponse } from "next/server";
import { limparSessaoUsuario } from "@/lib/authSistema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Encerra a sessão ativa do usuário atual.
 * Remove o cookie `nio_os_session` através de `limparSessaoUsuario()`.
 *
 * @returns JSON confirmando o encerramento da sessão ou status 500 em falha
 */
export async function POST() {
  try {
    await limparSessaoUsuario();

    return NextResponse.json(
      {
        message: "Sessão encerrada com sucesso.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Erro ao sair:", error);

    return NextResponse.json(
      { message: "Erro ao sair." },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
