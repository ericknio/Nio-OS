"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { atualizarCacheUsuarioPermissoes } from "@/app/Permissao";
import CardMensagem from "@/app/components/CardMensagem";
import { emailValido, usernameValido } from "@/lib/formatadores";
import { inputClass } from "@/lib/uiConstantes";

type SetupStatus = {
  precisaCriarAdmin?: boolean;
  message?: string;
};

type MeResponse = {
  autenticado?: boolean;
  usuario?: unknown;
  message?: string;
};

type FormState = {
  name: string;
  username: string;
  password: string;
  confirmPassword: string;
};

const FORM_INICIAL: FormState = {
  name: "",
  username: "",
  password: "",
  confirmPassword: "",
};

function normalizarLogin(valor: string) {
  return valor
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "");
}

function loginValido(valor: string) {
  return /^[a-z0-9._-]{3,30}$/.test(valor.trim().toLowerCase());
}

function forcaSenha(senha: string) {
  let pontos = 0;

  if (senha.length >= 6) pontos += 1;
  if (senha.length >= 10) pontos += 1;
  if (/[A-Z]/.test(senha)) pontos += 1;
  if (/[0-9]/.test(senha)) pontos += 1;
  if (/[^A-Za-z0-9]/.test(senha)) pontos += 1;

  if (pontos <= 1) {
    return {
      texto: "Fraca",
      classe: "bg-red-500",
      largura: "25%",
      textoClasse: "text-red-700 dark:text-red-400",
    };
  }

  if (pontos <= 3) {
    return {
      texto: "Média",
      classe: "bg-orange-500",
      largura: "60%",
      textoClasse: "text-orange-700 dark:text-orange-400",
    };
  }

  return {
    texto: "Forte",
    classe: "bg-green-500",
    largura: "100%",
    textoClasse: "text-green-700 dark:text-green-400",
  };
}



export default function PrimeiroAcessoPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [verificando, setVerificando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [precisaCriarAdmin, setPrecisaCriarAdmin] = useState(false);
  const [mostrarSenhas, setMostrarSenhas] = useState(false);

  const forca = useMemo(() => forcaSenha(form.password), [form.password]);

  const senhasConferem =
    form.confirmPassword.length > 0 && form.password === form.confirmPassword;

  function atualizarCampo(campo: keyof FormState, valor: string) {
    setForm((atual) => ({
      ...atual,
      [campo]: campo === "username" ? normalizarLogin(valor) : valor,
    }));

    setMensagem("");
  }

  async function verificarSetup() {
    try {
      setVerificando(true);
      setMensagem("");

      const response = await fetch("/api/auth/setup", {
        cache: "no-store",
        credentials: "same-origin",
      });

      const data = (await response.json().catch(() => null)) as
        | SetupStatus
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao verificar primeiro acesso.");
        return;
      }

      const precisaCriar = Boolean(data?.precisaCriarAdmin);

      setPrecisaCriarAdmin(precisaCriar);

      if (!precisaCriar) {
        const meResponse = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
        });

        const meData = (await meResponse.json().catch(() => null)) as
          | MeResponse
          | null;

        if (meResponse.ok && meData?.autenticado) {
          await atualizarCacheUsuarioPermissoes();
          router.replace("/");
          router.refresh();
        }
      }
    } catch {
      setMensagem("Erro ao verificar primeiro acesso.");
    } finally {
      setVerificando(false);
    }
  }

  function validarFormulario() {
    if (!form.name.trim()) {
      return "Informe o nome do administrador.";
    }

    if (!form.username.trim() || form.username.trim().length < 3) {
      return "O login do administrador deve ter pelo menos 3 caracteres.";
    }

    if (!loginValido(form.username)) {
      return "O login deve ter de 3 a 30 caracteres e conter apenas letras, números, ponto, traço ou underline.";
    }

    if (!form.password || form.password.length < 6) {
      return "A senha precisa ter pelo menos 6 caracteres.";
    }

    if (form.password !== form.confirmPassword) {
      return "As senhas não conferem.";
    }

    return "";
  }

  async function criarAdministrador(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    const erro = validarFormulario();

    if (erro) {
      setMensagem(erro);
      return;
    }

    try {
      setSalvando(true);

      const response = await fetch("/api/auth/setup", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          username: form.username.trim().toLowerCase(),
          password: form.password,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | SetupStatus
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao criar administrador.");
        return;
      }

      setMensagem(data?.message || "Administrador criado com sucesso.");
      await atualizarCacheUsuarioPermissoes();

      router.replace("/");
      router.refresh();
    } catch {
      setMensagem("Erro ao criar administrador.");
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    verificarSetup();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100">
      <section className="w-full max-w-3xl rounded-[2rem] bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 lg:p-8">
        <div className="mb-6 text-center">
          <p className="text-sm font-bold text-blue-600">Nio-OS</p>

          <h1 className="mt-1 text-3xl font-black tracking-tight">
            Primeiro acesso
          </h1>

          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
            Crie o administrador principal. Esse usuário terá acesso completo ao
            sistema e poderá cadastrar os demais funcionários.
          </p>
        </div>

        <CardMensagem mensagem={mensagem} />

        {verificando ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
            Verificando configuração inicial...
          </div>
        ) : !precisaCriarAdmin ? (
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-6 text-center ring-1 ring-slate-100">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              O administrador principal já foi criado.
            </p>

            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
            >
              Ir para login
            </button>
          </div>
        ) : (
          <form onSubmit={criarAdministrador} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                  Nome do administrador *
                </label>

                <input
                  value={form.name}
                  disabled={salvando}
                  onChange={(event) =>
                    atualizarCampo("name", event.target.value)
                  }
                  placeholder="Exemplo: Kito Bitencourt"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                  Login do Administrador *
                </label>

                <input
                  type="text"
                  value={form.username}
                  disabled={salvando}
                  onChange={(event) =>
                    atualizarCampo("username", event.target.value)
                  }
                  placeholder="Ex: admin ou ericknio"
                  autoComplete="username"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                  Senha *
                </label>

                <div className="relative">
                  <input
                    type={mostrarSenhas ? "text" : "password"}
                    value={form.password}
                    disabled={salvando}
                    onChange={(event) =>
                      atualizarCampo("password", event.target.value)
                    }
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                    className={`${inputClass} pr-12`}
                  />

                  <button
                    type="button"
                    onClick={() => setMostrarSenhas((atual) => !atual)}
                    disabled={salvando}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-xs font-black text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {mostrarSenhas ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                  Confirmar senha *
                </label>

                <input
                  type={mostrarSenhas ? "text" : "password"}
                  value={form.confirmPassword}
                  disabled={salvando}
                  onChange={(event) =>
                    atualizarCampo("confirmPassword", event.target.value)
                  }
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            </div>

            {form.password && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
                <div className="mb-2 flex items-center justify-between text-xs font-black">
                  <span className="text-slate-500 dark:text-slate-400">Força da senha</span>
                  <span className={forca.textoClasse}>{forca.texto}</span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${forca.classe}`}
                    style={{
                      width: forca.largura,
                    }}
                  />
                </div>
              </div>
            )}

            {form.confirmPassword && (
              <div
                className={`rounded-2xl p-3 text-sm font-bold ring-1 ${
                  senhasConferem
                    ? "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30"
                    : "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30"
                }`}
              >
                {senhasConferem
                  ? "As senhas conferem."
                  : "As senhas ainda não conferem."}
              </div>
            )}

            <button
              type="submit"
              disabled={salvando}
              className="w-full rounded-xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? "Criando administrador..." : "Criar administrador"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}