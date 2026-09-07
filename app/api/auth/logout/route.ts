// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { limparSessaoUsuario } from "@/lib/authSistema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
