"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type EstadoModulo = "carregando" | "ativo" | "inativo";

const CHAVE_CACHE = "nio-os-products-module-enabled";

function lerCacheModuloProdutos(): EstadoModulo {
  if (typeof window === "undefined") return "carregando";

  const valor = window.localStorage.getItem(CHAVE_CACHE);

  if (valor === "false") return "inativo";

  return "carregando";
}

export function useModuloProdutosAtivo() {
  const [estado, setEstado] = useState<EstadoModulo>(lerCacheModuloProdutos);

  useEffect(() => {
    let ativo = true;

    async function carregarConfiguracao() {
      try {
        const response = await fetch(`/api/configuracoes?t=${Date.now()}`, {
          cache: "no-store",
        });

        const data = await response.json().catch(() => null);

        const moduloAtivo = response.ok && data?.productsModuleEnabled !== false;

        if (!ativo) return;

        window.localStorage.setItem(CHAVE_CACHE, String(moduloAtivo));
        setEstado(moduloAtivo ? "ativo" : "inativo");
      } catch {
        if (!ativo) return;

        const cache = window.localStorage.getItem(CHAVE_CACHE);
        setEstado(cache === "false" ? "inativo" : "ativo");
      }
    }

    carregarConfiguracao();

    return () => {
      ativo = false;
    };
  }, []);

  return {
    carregandoModuloProdutos: estado === "carregando",
    moduloProdutosAtivo: estado === "ativo",
  };
}

export function ModuloProdutosDesativado({
  titulo = "Módulo de produtos desativado",
  descricao = "Produtos, estoque, vendas e relatórios de produtos estão desativados nas configurações do sistema.",
}: {
  titulo?: string;
  descricao?: string;
}) {
  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
      <section className="mx-auto max-w-4xl rounded-3xl bg-white dark:bg-slate-900 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
        <p className="text-sm font-bold text-blue-600">Configuração do sistema</p>

        <h1 className="mt-1 text-3xl font-black tracking-tight">{titulo}</h1>

        <p className="mt-3 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
          {descricao}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
          >
            Voltar ao painel inicial
          </Link>

          <Link
            href="/configuracoes"
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
          >
            Abrir configurações
          </Link>
        </div>
      </section>
    </main>
  );
}
