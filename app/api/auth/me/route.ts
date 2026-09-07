import { NextResponse } from "next/server";
import { obterUsuarioLogado } from "@/lib/authSistema";
import { obterLicencaLocal } from "@/lib/licencaLocal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
