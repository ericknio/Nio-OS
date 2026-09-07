"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { limparCacheUsuarioPermissoes } from "@/app/Permissao";

export default function SairPage() {
  const router = useRouter();
  const [mensagem, setMensagem] = useState("Encerrando sessão...");

  useEffect(() => {
    let ativo = true;

    async function sair() {
      try {
        limparCacheUsuarioPermissoes();

        const response = await fetch("/api/auth/logout", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!response.ok && ativo) {
          setMensagem("Não foi possível encerrar a sessão pelo servidor.");
        }

        if (ativo) {
          setMensagem("Sessão encerrada. Redirecionando para o login...");
        }

        setTimeout(() => {
          router.replace("/login");
          router.refresh();
        }, 500);
      } catch {
        if (ativo) {
          setMensagem("Erro ao encerrar sessão. Redirecionando...");
        }

        setTimeout(() => {
          router.replace("/login");
          router.refresh();
        }, 700);
      }
    }

    sair();

    return () => {
      ativo = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100">
      <section className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-6 text-center shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
        <p className="text-sm font-bold text-blue-600">Nio-OS</p>

        <h1 className="mt-1 text-3xl font-black tracking-tight">Sair</h1>

        <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
          {mensagem}
        </p>

        <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-blue-600" />
        </div>
      </section>
    </main>
  );
}