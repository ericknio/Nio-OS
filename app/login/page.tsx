"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  atualizarCacheUsuarioPermissoes,
  limparCacheUsuarioPermissoes,
} from "@/app/Permissao";
import CardMensagem from "@/app/components/CardMensagem";

type MeResponse = {
  autenticado?: boolean;
  usuario?: unknown;
  message?: string;
};

type SetupResponse = {
  precisaCriarAdmin?: boolean;
  message?: string;
};

type LoginResponse = {
  autenticado?: boolean;
  message?: string;
};

type FormState = {
  username: string;
  password: string;
};

const FORM_INICIAL: FormState = {
  username: "",
  password: "",
};

const ROTAS_BLOQUEADAS_APOS_LOGIN = [
  "/login",
  "/primeiro-acesso",
  "/sair",
];

const inputClass =
  "w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-800 disabled:text-slate-500 dark:text-slate-400";

function destinoAposLogin() {
  if (typeof window === "undefined") return "/";

  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");

  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";

  const rotaBloqueada = ROTAS_BLOQUEADAS_APOS_LOGIN.some(
    (rota) => next === rota || next.startsWith(`${rota}/`)
  );

  return rotaBloqueada ? "/" : next;
}

function normalizarLogin(valor: string) {
  return valor
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "");
}



export default function LoginPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [verificando, setVerificando] = useState(true);
  const [entrando, setEntrando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mensagem, setMensagem] = useState("");

  function atualizarCampo(campo: keyof FormState, valor: string) {
    setForm((atual) => ({
      ...atual,
      [campo]: campo === "username" ? normalizarLogin(valor) : valor,
    }));

    setMensagem("");
  }

  async function verificarPrimeiroAcesso() {
    try {
      setVerificando(true);
      setMensagem("");

      const response = await fetch("/api/auth/setup", {
        cache: "no-store",
        credentials: "include",
      });

      const data = (await response.json().catch(() => null)) as
        | SetupResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao verificar sistema.");
        return;
      }

      if (data?.precisaCriarAdmin) {
        router.replace("/primeiro-acesso");
        return;
      }

      const meResponse = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "include",
      });

      const meData = (await meResponse.json().catch(() => null)) as
        | MeResponse
        | null;

      if (meResponse.ok && meData?.autenticado) {
        await atualizarCacheUsuarioPermissoes();
        router.replace(destinoAposLogin());
        router.refresh();
      }
    } catch {
      setMensagem("Erro ao verificar acesso.");
    } finally {
      setVerificando(false);
    }
  }

  function validarFormulario() {
    if (!form.username.trim() || !form.password.trim()) {
      return "Informe usuário e senha.";
    }

    if (form.username.trim().length < 3) {
      return "O usuário precisa ter pelo menos 3 caracteres.";
    }

    return "";
  }

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    const erro = validarFormulario();

    if (erro) {
      setMensagem(erro);
      return;
    }

    try {
      setEntrando(true);

      limparCacheUsuarioPermissoes();

      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | LoginResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao fazer login.");
        return;
      }

      const meResponse = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "include",
      });

      const meData = (await meResponse.json().catch(() => null)) as
        | MeResponse
        | null;

      if (!meResponse.ok || !meData?.autenticado) {
        setMensagem(
          "Login validado, mas a sessão não foi gravada no navegador. Verifique se COOKIE_SECURE=false no .env e reinicie o sistema."
        );
        return;
      }

      setMensagem(data?.message || "Login realizado com sucesso.");
      await atualizarCacheUsuarioPermissoes();

      router.replace(destinoAposLogin());
      router.refresh();
    } catch {
      setMensagem("Erro ao fazer login.");
    } finally {
      setEntrando(false);
    }
  }

  useEffect(() => {
    verificarPrimeiroAcesso();
  }, []);

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 lg:p-8 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Decorative ambient background glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-500/10 dark:bg-blue-600/15 rounded-full blur-[120px]" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/15 rounded-full blur-[120px]" />
      </div>

      <section className="relative z-10 grid w-full max-w-4xl overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-xl ring-1 ring-slate-200/80 dark:ring-slate-800 lg:grid-cols-[1fr_1.1fr]">
        {/* Left Hero Sidebar */}
        <aside className="hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-10 text-white lg:flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex h-14 w-14 items-center justify-center">
              <img
                src="/uploads/logo.png"
                alt="Logo"
                className="h-full w-full object-contain"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                  const fallback = event.currentTarget.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
              <span className="hidden h-full w-full items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xl font-black text-white shadow-lg">
                N
              </span>
            </div>

            <div className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-400 ring-1 ring-blue-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
              Nio-OS Desktop & LAN
            </div>

            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white leading-snug">
              Gestão de Ordens de Serviço & Balcão
            </h1>

            <p className="mt-3 text-xs font-medium leading-relaxed text-slate-400 max-w-sm">
              Acesse a plataforma de ordens de serviço, cadastro de clientes, PDV rápido e relatórios de fluxo financeiro.
            </p>
          </div>

          <div className="relative z-10 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-bold text-white">Ambiente Seguro</p>
                <p className="text-[11px] text-slate-400">Dados criptografados localmente no banco de dados.</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Form Card */}
        <section className="p-8 lg:p-10 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Entrar no sistema
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Informe seu usuário e sua senha para continuar.
            </p>
          </div>

          <CardMensagem mensagem={mensagem} />

          {verificando ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-6 text-center text-xs font-medium text-slate-400">
              Verificando credenciais de acesso...
            </div>
          ) : (
            <form onSubmit={entrar} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Usuário / Login
                </label>
                <input
                  value={form.username}
                  disabled={entrando}
                  onChange={(event) =>
                    atualizarCampo("username", event.target.value)
                  }
                  placeholder="Digite seu usuário de acesso"
                  autoComplete="username"
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/60 px-4 py-3 text-xs font-medium outline-none transition focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={mostrarSenha ? "text" : "password"}
                    value={form.password}
                    disabled={entrando}
                    onChange={(event) =>
                      atualizarCampo("password", event.target.value)
                    }
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/60 px-4 py-3 pr-11 text-xs font-medium outline-none transition focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((atual) => !atual)}
                    disabled={entrando}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                  >
                    {mostrarSenha ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" y2="22" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={entrando}
                className="w-full mt-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-4 py-3 text-xs font-bold text-white shadow-md shadow-blue-500/25 transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {entrando ? "Entrando..." : "Acessar Sistema"}
              </button>
            </form>
          )}
        </section>
      </section>
    </main>
  );
}