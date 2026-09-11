/**
 * @file route.ts
 * @description Endpoint para identificação da sessão do usuário atual e status da licença local.
 * Utilizado pelos componentes de UI (AuthGuard, UsuarioLogadoBox) para carregar o perfil logado
 * e verificar se o software está licenciado no dispositivo.
 */

import { NextResponse } from "next/server";
import { obterUsuarioLogado } from "@/lib/authSistema";
import { obterLicencaLocal } from "@/lib/licencaLocal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retorna os dados do usuário autenticado a partir do cookie de sessão e a licença local do Nio-OS.
 * Se o cookie for inexistente ou inválido, retorna autenticado: false com status 200 para tratamento
 * suave no frontend.
 *
 * @returns JSON com dados do usuário, flags de autenticação e licença
 */
export async function GET() {
  try {
    const usuario = await obterUsuarioLogado();

    if (!usuario) {
      return NextResponse.json(
        {
          autenticado: false,
          usuario: null,
          licenca: null,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const licenca = obterLicencaLocal();

    return NextResponse.json(
      {
        autenticado: true,
        usuario,
        licenca,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Erro ao buscar usuário logado:", error);

    return NextResponse.json(
      { message: "Erro ao buscar usuário logado." },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
