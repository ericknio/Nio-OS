"use client";

/**
 * @file app/trocar-senha/page.tsx
 * @description Página de Alteração Segura de Senha de Acesso.
 * 
 * Funcionalidades principais:
 * - Formulário para troca de senha do usuário atualmente autenticado.
 * - Indicador visual em tempo real de força de senha (comprimento, maiúsculas, números, caracteres especiais).
 * - Alternância de visibilidade (mostrar/ocultar senha).
 * - Envio da requisição para o endpoint `/api/auth/trocar-senha`.
 * 
 * Regras de Segurança:
 * - Exige digitação da senha atual antes de aceitar uma nova.
 * - Impede o reuso da senha atual como nova senha.
 * - Exige confirmação idêntica e comprimento mínimo de 6 caracteres.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";

import CardMensagem from "@/app/components/CardMensagem";
import { inputClass } from "@/lib/uiConstantes";

type FormState = {
  senhaAtual: string;
  novaSenha: string;
  confirmarSenha: string;
};

type CampoSenhaKey = keyof FormState;

const FORM_INICIAL: FormState = {
  senhaAtual: "",
  novaSenha: "",
  confirmarSenha: "",
};

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

function CampoSenha({
  label,
  value,
  visible,
  disabled,
  autoComplete,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  visible: boolean;
  disabled: boolean;
  autoComplete: string;
  onChange: (valor: string) => void;
  onToggle: () => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label} *
      </label>

      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          disabled={disabled}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />

        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-xs font-black text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {visible ? "🙈" : "👁️"}
        </button>
      </div>
    </div>
  );
}

/**
 * Componente da página de alteração de senha de usuário.
 * Oferece interface interativa com medidor de complexidade de senha e feedbacks claros de validação.
 */
export default function TrocarSenhaPage() {
  const router = useRouter();
  const {
    carregando: carregandoPermissoes,
    tem,
    usuario,
  } = useUsuarioPermissoes();

  const podeVerDashboard = !carregandoPermissoes && tem("dashboard.ver");

  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [visivel, setVisivel] = useState<Record<CampoSenhaKey, boolean>>({
    senhaAtual: false,
    novaSenha: false,
    confirmarSenha: false,
  });

  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const forca = useMemo(() => forcaSenha(form.novaSenha), [form.novaSenha]);

  const senhasConferem =
    form.confirmarSenha.length > 0 && form.novaSenha === form.confirmarSenha;

  function atualizarCampo(campo: CampoSenhaKey, valor: string) {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));

    setMensagem("");
  }

  function alternarVisibilidade(campo: CampoSenhaKey) {
    setVisivel((atual) => ({
      ...atual,
      [campo]: !atual[campo],
    }));
  }

  function validarFormulario() {
    if (!form.senhaAtual || !form.novaSenha || !form.confirmarSenha) {
      return "Preencha todos os campos.";
    }

    if (form.novaSenha.length < 6) {
      return "A nova senha precisa ter pelo menos 6 caracteres.";
    }

    if (form.senhaAtual === form.novaSenha) {
      return "A nova senha precisa ser diferente da senha atual.";
    }

    if (form.novaSenha !== form.confirmarSenha) {
      return "A confirmação da senha não confere.";
    }

    return "";
  }

  async function trocarSenha(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    const erro = validarFormulario();

    if (erro) {
      setMensagem(erro);
      return;
    }

    try {
      setSalvando(true);

      const response = await fetch("/api/auth/trocar-senha", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao trocar senha.");
        return;
      }

      setMensagem(data?.message || "Senha alterada com sucesso.");
      setForm(FORM_INICIAL);
      setVisivel({
        senhaAtual: false,
        novaSenha: false,
        confirmarSenha: false,
      });
    } catch {
      setMensagem("Erro ao trocar senha.");
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (!usuario) {
      router.replace("/login?next=/trocar-senha");
    }
  }, [carregandoPermissoes, router, usuario]);

  if (carregandoPermissoes || !usuario) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-5xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Verificando sessão...
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">Segurança</p>

              <h1 className="text-3xl font-black tracking-tight">
                Trocar senha
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Atualize sua senha de acesso local ao sistema. Use uma senha
                diferente da atual.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/minha-conta"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Minha conta
              </Link>

              {podeVerDashboard && (
                <Link
                  href="/"
                  className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
                >
                  Painel inicial
                </Link>
              )}
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
          <form
            onSubmit={trocarSenha}
            className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
          >
            <div className="mb-6">
              <p className="text-sm font-bold text-blue-600">
                Alteração de senha
              </p>

              <h2 className="text-2xl font-black tracking-tight">
                Nova senha
              </h2>

              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Informe sua senha atual e cadastre uma nova senha com no mínimo
                6 caracteres.
              </p>
            </div>

            <div className="space-y-4">
              <CampoSenha
                label="Senha atual"
                value={form.senhaAtual}
                visible={visivel.senhaAtual}
                disabled={salvando}
                autoComplete="current-password"
                onChange={(valor) => atualizarCampo("senhaAtual", valor)}
                onToggle={() => alternarVisibilidade("senhaAtual")}
              />

              <CampoSenha
                label="Nova senha"
                value={form.novaSenha}
                visible={visivel.novaSenha}
                disabled={salvando}
                autoComplete="new-password"
                onChange={(valor) => atualizarCampo("novaSenha", valor)}
                onToggle={() => alternarVisibilidade("novaSenha")}
              />

              {form.novaSenha && (
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

              <CampoSenha
                label="Confirmar nova senha"
                value={form.confirmarSenha}
                visible={visivel.confirmarSenha}
                disabled={salvando}
                autoComplete="new-password"
                onChange={(valor) => atualizarCampo("confirmarSenha", valor)}
                onToggle={() => alternarVisibilidade("confirmarSenha")}
              />

              {form.confirmarSenha && (
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
                {salvando ? "Alterando..." : "Alterar senha"}
              </button>
            </div>
          </form>

          <aside className="space-y-5">
            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <p className="text-sm font-bold text-blue-600">Recomendações</p>

              <h2 className="mt-1 text-2xl font-black tracking-tight">
                Boa prática de senha
              </h2>

              <div className="mt-5 space-y-3 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-400">
                <p>1. Use no mínimo 6 caracteres.</p>
                <p>2. Evite usar a mesma senha antiga.</p>
                <p>3. Misture letras, números e símbolos quando possível.</p>
                <p>4. Não compartilhe sua senha com outros funcionários.</p>
              </div>
            </section>

            <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-lg shadow-slate-950/10">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-slate-300">
                Acesso local
              </p>

              <p className="mt-4 text-sm font-semibold leading-6 text-slate-300">
                Esta senha é usada apenas para acessar o sistema neste ambiente.
                O administrador ainda pode redefinir sua senha pela tela de
                usuários do sistema.
              </p>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}