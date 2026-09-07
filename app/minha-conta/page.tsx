"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import {
  atualizarCacheUsuarioPermissoes,
  limparCacheUsuarioPermissoes,
  useUsuarioPermissoes,
} from "@/app/Permissao";

type Usuario = {
  id: string;
  name: string;
  username: string;
  email?: string | null;
  role: string;
  status: string;
  lastLoginAt?: string | null;
  createdAt?: string | null;
};

type FormConta = {
  name: string;
  username: string;
  email: string;
};

type FormSenha = {
  senhaAtual: string;
  novaSenha: string;
  confirmarSenha: string;
};

type DadosLicenca = {
  ativa?: boolean;
  vencimento?: string | null;
  cliente?: string | null;
  plano?: string | null;
  licenseId?: string | null;
};

type AuthMeResponse = {
  autenticado?: boolean;
  usuario?: Usuario;
  licenca?: DadosLicenca | null;
  message?: string;
};

type MinhaContaResponse = {
  message?: string;
  usuario?: Usuario;
};

import CardMensagem from "@/app/components/CardMensagem";
import {
  formatarData,
  formatarDataHora,
  emailValido,
  usernameValido,
} from "@/lib/formatadores";
import {
  nomesCargo,
  nomesStatusUsuario as nomesStatus,
  classeStatusUsuario as classeStatus,
  inputClass,
} from "@/lib/uiConstantes";

function inicialNome(nome?: string | null) {
  const limpo = String(nome || "").trim();
  return limpo ? limpo.charAt(0).toUpperCase() : "U";
}

function CampoTexto({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
  required = false,
  help,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "password";
  disabled?: boolean;
  required?: boolean;
  help?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label}
        {required ? " *" : ""}
      </label>

      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />

      {help && (
        <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{help}</p>
      )}
    </div>
  );
}

function LinhaInfo({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100 dark:ring-slate-800">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {titulo}
      </p>

      <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{children}</div>
    </div>
  );
}

export default function MinhaContaPage() {
  const router = useRouter();
  const {
    carregando: carregandoPermissoes,
    tem,
    usuario: usuarioPermissoes,
  } = useUsuarioPermissoes();

  const podeVerDashboard = !carregandoPermissoes && tem("dashboard.ver");

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [licenca, setLicenca] = useState<DadosLicenca | null>(null);

  const [formConta, setFormConta] = useState<FormConta>({
    name: "",
    username: "",
    email: "",
  });

  const [formSenha, setFormSenha] = useState<FormSenha>({
    senhaAtual: "",
    novaSenha: "",
    confirmarSenha: "",
  });

  const [carregando, setCarregando] = useState(true);
  const [salvandoConta, setSalvandoConta] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const bloqueandoConta = carregando || salvandoConta;
  const bloqueandoSenha = carregando || salvandoSenha;

  function atualizarConta(campo: keyof FormConta, valor: string) {
    setFormConta((atual) => ({
      ...atual,
      [campo]:
        campo === "username"
          ? valor.trim().toLowerCase()
          : campo === "email"
            ? valor.trim().toLowerCase()
            : valor,
    }));

    setMensagem("");
  }

  function atualizarSenha(campo: keyof FormSenha, valor: string) {
    setFormSenha((atual) => ({
      ...atual,
      [campo]: valor,
    }));

    setMensagem("");
  }

  function preencherUsuario(usuarioRecebido: Usuario) {
    setUsuario(usuarioRecebido);
    setFormConta({
      name: usuarioRecebido.name || "",
      username: usuarioRecebido.username || "",
      email: usuarioRecebido.email || "",
    });
  }

  async function carregarUsuario() {
    try {
      setCarregando(true);
      setMensagem("");

      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "same-origin",
      });

      const data = (await response.json().catch(() => null)) as
        | AuthMeResponse
        | null;

      if (!response.ok || !data?.autenticado || !data?.usuario) {
        setMensagem(data?.message || "Usuário não autenticado.");
        setUsuario(null);
        router.replace("/login?next=/minha-conta");
        return;
      }

      preencherUsuario(data.usuario);
      if (data.licenca) {
        setLicenca(data.licenca);
      }
    } catch {
      setMensagem("Erro ao carregar usuário.");
      setUsuario(null);
    } finally {
      setCarregando(false);
    }
  }

  async function salvarConta(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    if (!formConta.name.trim()) {
      setMensagem("Informe seu nome.");
      return;
    }

    if (!usernameValido(formConta.username)) {
      setMensagem(
        "O login deve ter 3 a 30 caracteres e usar apenas letras, números, ponto, traço ou underline."
      );
      return;
    }

    if (formConta.email && formConta.email.trim() && !emailValido(formConta.email)) {
      setMensagem("Informe um e-mail válido.");
      return;
    }

    try {
      setSalvandoConta(true);

      const response = await fetch("/api/auth/minha-conta", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formConta.name.trim(),
          username: formConta.username.trim().toLowerCase(),
          email: formConta.email.trim().toLowerCase(),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | MinhaContaResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao atualizar conta.");
        return;
      }

      if (data?.usuario) {
        preencherUsuario(data.usuario);
        await atualizarCacheUsuarioPermissoes();
      }

      setMensagem(data?.message || "Conta atualizada com sucesso.");
    } catch {
      setMensagem("Erro ao atualizar conta.");
    } finally {
      setSalvandoConta(false);
    }
  }

  async function trocarSenha(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    if (
      !formSenha.senhaAtual ||
      !formSenha.novaSenha ||
      !formSenha.confirmarSenha
    ) {
      setMensagem("Preencha todos os campos de senha.");
      return;
    }

    if (formSenha.novaSenha.length < 6) {
      setMensagem("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (formSenha.novaSenha !== formSenha.confirmarSenha) {
      setMensagem("A confirmação da senha não confere.");
      return;
    }

    try {
      setSalvandoSenha(true);

      const response = await fetch("/api/auth/trocar-senha", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formSenha),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao trocar senha.");
        return;
      }

      setFormSenha({
        senhaAtual: "",
        novaSenha: "",
        confirmarSenha: "",
      });

      setMensagem(data?.message || "Senha alterada com sucesso.");
    } catch {
      setMensagem("Erro ao trocar senha.");
    } finally {
      setSalvandoSenha(false);
    }
  }

  async function sair() {
    try {
      setSaindo(true);

      limparCacheUsuarioPermissoes();

      await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
      });

      router.replace("/login");
      router.refresh();
    } catch {
      router.replace("/login");
      router.refresh();
    } finally {
      setSaindo(false);
    }
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (!usuarioPermissoes) {
      router.replace("/login?next=/minha-conta");
      return;
    }

    carregarUsuario();
  }, [carregandoPermissoes, router, usuarioPermissoes]);

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
      <section className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-xl font-black text-white">
                {inicialNome(usuario?.name)}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-bold text-blue-600">Minha conta</p>

                <h1 className="truncate text-3xl font-black tracking-tight">
                  {usuario?.name || "Usuário"}
                </h1>

                <p className="mt-1 truncate text-sm font-semibold text-slate-500 dark:text-slate-400">
                  @{usuario?.username || "-"}
                  {usuario?.email ? ` · ${usuario.email}` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {podeVerDashboard && (
                <Link
                  href="/"
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                >
                  Painel
                </Link>
              )}

              <button
                type="button"
                onClick={carregarUsuario}
                disabled={carregando}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>

              <button
                type="button"
                onClick={sair}
                disabled={saindo}
                className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saindo ? "Saindo..." : "Sair"}
              </button>
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        {carregando ? (
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            Carregando dados da conta...
          </section>
        ) : !usuario ? (
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              Não foi possível carregar sua conta.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <LinhaInfo titulo="Perfil">
                {usuario.role ? nomesCargo[usuario.role] || usuario.role : "-"}
              </LinhaInfo>

              <LinhaInfo titulo="Status">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${classeStatus(
                    usuario.status
                  )}`}
                >
                  {nomesStatus[usuario.status] || usuario.status || "-"}
                </span>
              </LinhaInfo>

              <LinhaInfo titulo="Último login">
                {formatarDataHora(usuario.lastLoginAt)}
              </LinhaInfo>

              <LinhaInfo titulo="Vencimento de Licença">
                {licenca?.vencimento ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {formatarData(licenca.vencimento)}
                    {licenca.plano ? ` (${licenca.plano})` : ""}
                  </span>
                ) : (
                  <span className="text-rose-600 dark:text-rose-400 font-bold">
                    Sem licença ativa
                  </span>
                )}
              </LinhaInfo>
            </section>

            <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
              <form
                onSubmit={salvarConta}
                className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
              >
                <div className="mb-5">
                  <p className="text-sm font-bold text-blue-600">Dados</p>

                  <h2 className="text-2xl font-black tracking-tight">
                    Editar perfil
                  </h2>

                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                    Atualize nome, login e e-mail usados no sistema.
                  </p>
                </div>

                <div className="space-y-4">
                  <CampoTexto
                    label="Nome"
                    required
                    value={formConta.name}
                    disabled={bloqueandoConta}
                    onChange={(valor) => atualizarConta("name", valor)}
                    placeholder="Seu nome"
                  />

                  <CampoTexto
                    label="Login"
                    required
                    value={formConta.username}
                    disabled={bloqueandoConta}
                    onChange={(valor) => atualizarConta("username", valor)}
                    placeholder="ex: ericknio"
                    help="Use letras, números, ponto, traço ou underline. Este login será usado para entrar no sistema."
                  />

                  <CampoTexto
                    label="E-mail"
                    type="email"
                    value={formConta.email}
                    disabled={bloqueandoConta}
                    onChange={(valor) => atualizarConta("email", valor)}
                    placeholder="usuario@email.com"
                  />

                  <button
                    type="submit"
                    disabled={salvandoConta}
                    className="w-full rounded-xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {salvandoConta ? "Salvando..." : "Salvar perfil"}
                  </button>
                </div>
              </form>

              <form
                onSubmit={trocarSenha}
                className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
              >
                <div className="mb-5">
                  <p className="text-sm font-bold text-blue-600">Segurança</p>

                  <h2 className="text-2xl font-black tracking-tight">
                    Trocar senha
                  </h2>

                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                    Altere sua senha de acesso local.
                  </p>
                </div>

                <div className="space-y-4">
                  <CampoTexto
                    label="Senha atual"
                    type="password"
                    value={formSenha.senhaAtual}
                    disabled={bloqueandoSenha}
                    onChange={(valor) => atualizarSenha("senhaAtual", valor)}
                    placeholder="Digite sua senha atual"
                    required
                  />

                  <CampoTexto
                    label="Nova senha"
                    type="password"
                    value={formSenha.novaSenha}
                    disabled={bloqueandoSenha}
                    onChange={(valor) => atualizarSenha("novaSenha", valor)}
                    placeholder="Mínimo 6 caracteres"
                    required
                  />

                  <CampoTexto
                    label="Confirmar nova senha"
                    type="password"
                    value={formSenha.confirmarSenha}
                    disabled={bloqueandoSenha}
                    onChange={(valor) =>
                      atualizarSenha("confirmarSenha", valor)
                    }
                    placeholder="Repita a nova senha"
                    required
                  />

                  <button
                    type="submit"
                    disabled={salvandoSenha}
                    className="w-full rounded-xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-lg shadow-slate-950/10 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {salvandoSenha ? "Alterando..." : "Alterar senha"}
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <LinhaInfo titulo="Criado em">
                {formatarDataHora(usuario.createdAt)}
              </LinhaInfo>
            </section>
          </>
        )}
      </section>
    </main>
  );
}