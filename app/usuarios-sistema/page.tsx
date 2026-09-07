"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";
import {
  GRUPOS_PERMISSOES,
  permissoesPadraoPorPerfil,
} from "@/lib/permissoesSistema";

type UsuarioSistema = {
  id: string;
  name: string;
  username: string;
  email?: string | null;
  role: string;
  status: string;
  profitShareEnabled?: boolean;
  profitSharePercent?: number | string | null;
  pdvProfitShareEnabled?: boolean;
  pdvProfitSharePercent?: number | string | null;
  permissions?: string[];
  lastLoginAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type FormUsuario = {
  name: string;
  username: string;
  email: string;
  password: string;
  role: string;
  status: string;
  profitShareEnabled: boolean;
  profitSharePercent: string;
  pdvProfitShareEnabled: boolean;
  pdvProfitSharePercent: string;
  permissions: string[];
};

type FiltrosUsuario = {
  busca: string;
  role: string;
  status: string;
};

const FORM_INICIAL: FormUsuario = {
  name: "",
  username: "",
  email: "",
  password: "",
  role: "ATENDENTE",
  status: "ATIVO",
  profitShareEnabled: false,
  profitSharePercent: "0",
  pdvProfitShareEnabled: false,
  pdvProfitSharePercent: "0",
  permissions: permissoesPadraoPorPerfil("ATENDENTE"),
};

const FILTROS_INICIAIS: FiltrosUsuario = {
  busca: "",
  role: "TODOS",
  status: "TODOS",
};

const CARGOS = [
  { value: "ADMIN", label: "Administrador" },
  { value: "ATENDENTE", label: "Atendente" },
  { value: "TECNICO", label: "Técnico" },
  { value: "FINANCEIRO", label: "Financeiro" },
];

const STATUS_USUARIO = [
  { value: "ATIVO", label: "Ativo" },
  { value: "INATIVO", label: "Inativo" },
  { value: "BLOQUEADO", label: "Bloqueado" },
];

import CardMensagem from "@/app/components/CardMensagem";
import { formatarDataHora, emailValido } from "@/lib/formatadores";
import {
  nomesCargo,
  nomesStatusUsuario as nomesStatus,
  classeStatusUsuario as classeStatus,
  inputClass,
} from "@/lib/uiConstantes";

function normalizarLogin(valor: string) {
  return valor
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "");
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

function CampoSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
  help,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  help?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label}
      </label>

      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>

      {help && (
        <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{help}</p>
      )}
    </div>
  );
}

function CardResumo({
  titulo,
  valor,
  detalhe,
  destaque = "slate",
}: {
  titulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  destaque?: "green" | "red" | "blue" | "slate";
}) {
  const cor =
    destaque === "green"
      ? "text-green-700 dark:text-green-400"
      : destaque === "red"
        ? "text-red-700 dark:text-red-400"
        : destaque === "blue"
          ? "text-blue-700 dark:text-blue-400"
          : "text-slate-950 dark:text-slate-100";

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{titulo}</p>

      <strong className={`mt-2 block text-4xl ${cor}`}>{valor}</strong>

      {detalhe && (
        <div className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
          {detalhe}
        </div>
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
    <div className="rounded-xl bg-white dark:bg-slate-900 p-3 ring-1 ring-slate-100">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
        {titulo}
      </p>

      <div className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-300">{children}</div>
    </div>
  );
}

export default function UsuariosSistemaPage() {
  const { carregando: carregandoPermissoes, tem, usuario } =
    useUsuarioPermissoes();

  const podeVerDashboard = !carregandoPermissoes && tem("dashboard.ver");

  // Gestão de usuários é área crítica: a tela só abre para ADMIN.
  const podeGerenciarUsuarios =
    !carregandoPermissoes && usuario?.role === "ADMIN";

  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [usuarioSelecionado, setUsuarioSelecionado] =
    useState<UsuarioSistema | null>(null);

  const [form, setForm] = useState<FormUsuario>(FORM_INICIAL);
  const [filtros, setFiltros] = useState<FiltrosUsuario>(FILTROS_INICIAIS);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState("");
  const [reaplicandoPermissoes, setReaplicandoPermissoes] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const resumo = useMemo(() => {
    return {
      total: usuarios.length,
      ativos: usuarios.filter((usuario) => usuario.status === "ATIVO").length,
      admins: usuarios.filter((usuario) => usuario.role === "ADMIN").length,
      bloqueados: usuarios.filter((usuario) => usuario.status === "BLOQUEADO")
        .length,
    };
  }, [usuarios]);

  const editando = Boolean(usuarioSelecionado);
  const bloqueandoForm = carregando || salvando;

  function atualizarFiltro(campo: keyof FiltrosUsuario, valor: string) {
    setFiltros((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  function atualizarForm(
    campo: Exclude<
      keyof FormUsuario,
      "profitShareEnabled" | "pdvProfitShareEnabled"
    >,
    valor: string
  ) {
    setMensagem("");

    if (campo === "role") {
      setForm((atual) => ({
        ...atual,
        role: valor,
        profitShareEnabled:
          valor === "TECNICO" ? atual.profitShareEnabled : false,
        profitSharePercent:
          valor === "TECNICO" ? atual.profitSharePercent : "0",
        pdvProfitShareEnabled:
          valor === "ATENDENTE" ? atual.pdvProfitShareEnabled : false,
        pdvProfitSharePercent:
          valor === "ATENDENTE" ? atual.pdvProfitSharePercent : "0",
        permissions: permissoesPadraoPorPerfil(valor),
      }));

      return;
    }

    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  function limparForm() {
    setUsuarioSelecionado(null);
    setForm(FORM_INICIAL);
    setMensagem("");
  }

  function limparFiltros() {
    setFiltros(FILTROS_INICIAIS);
    carregarUsuarios(FILTROS_INICIAIS);
  }

  function editarUsuario(usuario: UsuarioSistema) {
    setUsuarioSelecionado(usuario);
    setMensagem("");

    setForm({
      name: usuario.name || "",
      username: usuario.username || "",
      email: usuario.email || "",
      password: "",
      role: usuario.role || "ATENDENTE",
      status: usuario.status || "ATIVO",
      profitShareEnabled:
        usuario.role === "TECNICO" && usuario.profitShareEnabled === true,
      profitSharePercent:
        usuario.role === "TECNICO"
          ? String(Number(usuario.profitSharePercent || 0))
          : "0",
      pdvProfitShareEnabled:
        usuario.role === "ATENDENTE" && usuario.pdvProfitShareEnabled === true,
      pdvProfitSharePercent:
        usuario.role === "ATENDENTE"
          ? String(Number(usuario.pdvProfitSharePercent || 0))
          : "0",
      permissions:
        Array.isArray(usuario.permissions) && usuario.permissions.length > 0
          ? usuario.permissions
          : permissoesPadraoPorPerfil(usuario.role),
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function aplicarModeloPerfil() {
    setForm((atual) => ({
      ...atual,
      permissions: permissoesPadraoPorPerfil(atual.role),
    }));
  }

  function marcarTodasPermissoes() {
    const todas = GRUPOS_PERMISSOES.flatMap((grupo) =>
      grupo.permissoes.map((permissao) => permissao.key)
    );

    setForm((atual) => ({
      ...atual,
      permissions: Array.from(new Set(todas)),
    }));
  }

  function limparPermissoes() {
    setForm((atual) => ({
      ...atual,
      permissions: [],
    }));
  }

  function alternarPermissao(key: string) {
    setForm((atual) => {
      const existe = atual.permissions.includes(key);

      return {
        ...atual,
        permissions: existe
          ? atual.permissions.filter((item) => item !== key)
          : [...atual.permissions, key],
      };
    });
  }

  function grupoCompleto(keys: readonly string[]) {
    return keys.every((key) => form.permissions.includes(key));
  }

  function alternarGrupo(keys: readonly string[]) {
    const todasMarcadas = grupoCompleto(keys);

    setForm((atual) => {
      if (todasMarcadas) {
        return {
          ...atual,
          permissions: atual.permissions.filter((key) => !keys.includes(key)),
        };
      }

      return {
        ...atual,
        permissions: Array.from(new Set([...atual.permissions, ...keys])),
      };
    });
  }

  async function carregarUsuarios(filtrosBusca = filtros) {
    if (!podeGerenciarUsuarios) {
      setUsuarios([]);
      setCarregando(false);
      setMensagem("Apenas administradores podem gerenciar usuários.");
      return;
    }

    try {
      setCarregando(true);
      setMensagem("");

      const params = new URLSearchParams();

      if (filtrosBusca.busca.trim()) {
        params.set("busca", filtrosBusca.busca.trim());
      }

      params.set("role", filtrosBusca.role);
      params.set("status", filtrosBusca.status);

      const response = await fetch(
        `/api/usuarios-sistema?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar usuários.");
        setUsuarios([]);
        return;
      }

      setUsuarios(Array.isArray(data?.usuarios) ? data.usuarios : []);
    } catch {
      setMensagem("Erro ao carregar usuários.");
      setUsuarios([]);
    } finally {
      setCarregando(false);
    }
  }

  function validarFormulario() {
    if (!form.name.trim()) {
      return "Informe o nome do usuário.";
    }

    if (!editando && form.username.trim().length < 3) {
      return "O login precisa ter pelo menos 3 caracteres.";
    }

    if (!editando && form.password.trim().length < 6) {
      return "A senha precisa ter pelo menos 6 caracteres.";
    }

    if (editando && form.password.trim() && form.password.trim().length < 6) {
      return "A nova senha precisa ter pelo menos 6 caracteres.";
    }

    if (form.email && form.email.trim() && !emailValido(form.email)) {
      return "Informe um e-mail válido.";
    }

    if (form.role === "TECNICO" && form.profitShareEnabled) {
      const percentual = Number(form.profitSharePercent);
      if (!Number.isFinite(percentual) || percentual <= 0 || percentual > 100) {
        return "Informe um percentual de participação no lucro maior que 0 e até 100.";
      }
    }

    if (form.role === "ATENDENTE" && form.pdvProfitShareEnabled) {
      const percentual = Number(form.pdvProfitSharePercent);
      if (!Number.isFinite(percentual) || percentual <= 0 || percentual > 100) {
        return "Informe um percentual de participação no lucro do PDV maior que 0 e até 100.";
      }
    }

    if (form.role !== "ADMIN" && form.permissions.length === 0) {
      return "Marque pelo menos uma permissão para o usuário.";
    }

    return "";
  }

  async function salvarUsuario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    const erro = validarFormulario();

    if (erro) {
      setMensagem(erro);
      return;
    }

    try {
      setSalvando(true);

      const url = usuarioSelecionado
        ? `/api/usuarios-sistema/${usuarioSelecionado.id}`
        : "/api/usuarios-sistema";

      const method = usuarioSelecionado ? "PATCH" : "POST";

      const body = usuarioSelecionado
        ? {
            name: form.name.trim(),
            email: form.email.trim().toLowerCase(),
            password: form.password,
            role: form.role,
            status: form.status,
            profitShareEnabled:
              form.role === "TECNICO" && form.profitShareEnabled,
            profitSharePercent:
              form.role === "TECNICO" && form.profitShareEnabled
                ? Number(form.profitSharePercent)
                : 0,
            pdvProfitShareEnabled:
              form.role === "ATENDENTE" && form.pdvProfitShareEnabled,
            pdvProfitSharePercent:
              form.role === "ATENDENTE" && form.pdvProfitShareEnabled
                ? Number(form.pdvProfitSharePercent)
                : 0,
            permissions: form.permissions,
          }
        : {
            ...form,
            name: form.name.trim(),
            username: normalizarLogin(form.username),
            email: form.email.trim().toLowerCase(),
            profitShareEnabled:
              form.role === "TECNICO" && form.profitShareEnabled,
            profitSharePercent:
              form.role === "TECNICO" && form.profitShareEnabled
                ? Number(form.profitSharePercent)
                : 0,
            pdvProfitShareEnabled:
              form.role === "ATENDENTE" && form.pdvProfitShareEnabled,
            pdvProfitSharePercent:
              form.role === "ATENDENTE" && form.pdvProfitShareEnabled
                ? Number(form.pdvProfitSharePercent)
                : 0,
          };

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao salvar usuário.");
        return;
      }

      setMensagem(data?.message || "Usuário salvo com sucesso.");
      limparForm();
      await carregarUsuarios();
    } catch {
      setMensagem("Erro ao salvar usuário.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirUsuario(usuario: UsuarioSistema) {
    
  const confirmou = window.confirm(
    `Tem certeza que deseja excluir o usuário "${usuario.name}"? Essa ação não pode ser desfeita.`
  );

  if (!confirmou) return;

  try {
    setMensagem("");
    setExcluindoId(usuario.id);

    const response = await fetch(`/api/usuarios-sistema/${usuario.id}`, {
      method: "DELETE",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setMensagem(data?.message || "Erro ao excluir usuário.");
      return;
    }

    if (usuarioSelecionado?.id === usuario.id) {
      limparForm();
    }

    setMensagem(data?.message || "Usuário excluído com sucesso.");
    await carregarUsuarios();
  } catch {
    setMensagem("Erro ao excluir usuário.");
  } finally {
    setExcluindoId("");
  }
}

  async function reaplicarPermissoesPadrao() {
    const confirmou = window.confirm(
      "Deseja reaplicar as permissões padrão em todos os usuários? As permissões personalizadas serão substituídas pelo modelo da função de cada usuário."
    );

    if (!confirmou) return;

    try {
      setMensagem("");
      setReaplicandoPermissoes(true);

      const response = await fetch(
        "/api/usuarios-sistema/reaplicar-permissoes",
        {
          method: "POST",
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao reaplicar permissões padrão.");
        return;
      }

      limparForm();
      setMensagem(data?.message || "Permissões padrão reaplicadas com sucesso.");
      await carregarUsuarios();
    } catch {
      setMensagem("Erro ao reaplicar permissões padrão.");
    } finally {
      setReaplicandoPermissoes(false);
    }
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (!podeGerenciarUsuarios) {
      setUsuarios([]);
      setCarregando(false);
      return;
    }

    carregarUsuarios();
  }, [carregandoPermissoes, podeGerenciarUsuarios]);

  if (carregandoPermissoes) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Verificando permissões...
        </section>
      </main>
    );
  }

  if (!podeGerenciarUsuarios) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-red-200">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              Apenas administradores podem acessar Usuários do Sistema.
            </p>

            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              A página foi bloqueada antes de carregar a lista de usuários.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
          >
            Voltar para o painel
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">
                Controle de acesso
              </p>

              <h1 className="text-3xl font-black tracking-tight">
                Usuários do sistema
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Cadastre operadores, defina perfis e controle permissões de
                acesso ao sistema.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {podeVerDashboard && (
                <Link
                  href="/"
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                >
                  Painel inicial
                </Link>
              )}

              <button
                type="button"
                onClick={reaplicarPermissoesPadrao}
                disabled={carregando || salvando || reaplicandoPermissoes}
                className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-black text-blue-700 dark:text-blue-400 shadow-sm hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reaplicandoPermissoes
                  ? "Reaplicando..."
                  : "Reaplicar permissões"}
              </button>
              
              <button
                type="button"
                onClick={() => carregarUsuarios()}
                disabled={carregando}
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section className="grid gap-4 md:grid-cols-4">
          <CardResumo
            titulo="Total de usuários"
            valor={resumo.total}
            detalhe="Cadastros encontrados"
          />

          <CardResumo
            titulo="Ativos"
            valor={resumo.ativos}
            detalhe="Podem acessar"
            destaque="green"
          />

          <CardResumo
            titulo="Administradores"
            valor={resumo.admins}
            detalhe="Acesso completo"
            destaque="blue"
          />

          <CardResumo
            titulo="Bloqueados"
            valor={resumo.bloqueados}
            detalhe="Sem acesso"
            destaque="red"
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <form
            onSubmit={salvarUsuario}
            className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
          >
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-blue-600">
                  {editando ? "Edição" : "Cadastro"}
                </p>

                <h2 className="text-2xl font-black tracking-tight">
                  {editando
                    ? `Editar @${usuarioSelecionado?.username}`
                    : "Novo usuário"}
                </h2>

                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                  {editando
                    ? "Altere dados, perfil, status, senha ou permissões."
                    : "Crie um operador para acessar o sistema."}
                </p>
              </div>

              {editando && (
                <button
                  type="button"
                  onClick={limparForm}
                  disabled={salvando}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Novo
                </button>
              )}
            </div>

            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <CampoTexto
                  label="Nome"
                  required
                  value={form.name}
                  disabled={bloqueandoForm}
                  onChange={(valor) => atualizarForm("name", valor)}
                  placeholder="Nome completo"
                />

                <CampoTexto
                  label="Login"
                  required={!editando}
                  value={form.username}
                  disabled={editando || bloqueandoForm}
                  onChange={(valor) =>
                    atualizarForm("username", normalizarLogin(valor))
                  }
                  placeholder="exemplo: erick"
                  help={
                    editando
                      ? "O login não pode ser alterado depois de criado."
                      : "Use letras, números, ponto, traço ou underline."
                  }
                />

                <CampoTexto
                  label={editando ? "Nova senha" : "Senha"}
                  type="password"
                  required={!editando}
                  value={form.password}
                  disabled={bloqueandoForm}
                  onChange={(valor) => atualizarForm("password", valor)}
                  placeholder={
                    editando
                      ? "Vazio = manter senha atual"
                      : "Mínimo 6 caracteres"
                  }
                />

                <CampoSelect
                  label="Função principal"
                  value={form.role}
                  disabled={bloqueandoForm}
                  onChange={(valor) => atualizarForm("role", valor)}
                  options={CARGOS}
                  help="Ao trocar a função, o sistema aplica permissões sugeridas."
                />

                <CampoSelect
                  label="Status"
                  value={form.status}
                  disabled={bloqueandoForm}
                  onChange={(valor) => atualizarForm("status", valor)}
                  options={STATUS_USUARIO}
                />
              </div>

              {form.role === "TECNICO" && (
                <section className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-500/30">
                  <div className="flex items-start gap-3">
                    <input
                      id="profitShareEnabled"
                      type="checkbox"
                      checked={form.profitShareEnabled}
                      disabled={bloqueandoForm}
                      onChange={(event) => {
                        setMensagem("");
                        setForm((atual) => ({
                          ...atual,
                          profitShareEnabled: event.target.checked,
                          profitSharePercent: event.target.checked
                            ? atual.profitSharePercent
                            : "0",
                        }));
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-700"
                    />

                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="profitShareEnabled"
                        className="cursor-pointer text-sm font-black text-blue-900"
                      >
                        Participa do lucro das OS
                      </label>
                      <p className="mt-1 text-xs font-semibold leading-5 text-blue-700 dark:text-blue-400">
                        Quando a OS for marcada como Pronto, o percentual vigente
                        será congelado na própria OS para preservar o histórico.
                      </p>
                    </div>
                  </div>

                  {form.profitShareEnabled && (
                    <div className="mt-4 max-w-xs">
                      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                        Percentual do técnico *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0.01"
                          max="100"
                          step="0.01"
                          value={form.profitSharePercent}
                          disabled={bloqueandoForm}
                          onChange={(event) =>
                            atualizarForm(
                              "profitSharePercent",
                              event.target.value
                            )
                          }
                          className={`${inputClass} pr-10`}
                        />
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-500 dark:text-slate-400">
                          %
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Permitido: maior que 0% e até 100%.
                      </p>
                    </div>
                  )}
                </section>
              )}

              {form.role === "ATENDENTE" && (
                <section className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:ring-amber-500/30">
                  <div className="flex items-start gap-3">
                    <input
                      id="pdvProfitShareEnabled"
                      type="checkbox"
                      checked={form.pdvProfitShareEnabled}
                      disabled={bloqueandoForm}
                      onChange={(event) => {
                        setMensagem("");
                        setForm((atual) => ({
                          ...atual,
                          pdvProfitShareEnabled: event.target.checked,
                          pdvProfitSharePercent: event.target.checked
                            ? atual.pdvProfitSharePercent
                            : "0",
                        }));
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-700"
                    />

                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="pdvProfitShareEnabled"
                        className="cursor-pointer text-sm font-black text-amber-900 dark:text-amber-300"
                      >
                        Participa do lucro das vendas do PDV
                      </label>
                      <p className="mt-1 text-xs font-semibold leading-5 text-amber-700 dark:text-amber-400">
                        Calculado exclusivamente sobre o lucro líquido das vendas realizadas no PDV (Preço de venda − Custo do produto − Impostos). Não funciona nem se aplica ao estoque de peças nem em Ordens de Serviço (OS).
                      </p>
                    </div>
                  </div>

                  {form.pdvProfitShareEnabled && (
                    <div className="mt-4 max-w-xs">
                      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                        Percentual do atendente (%) *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0.01"
                          max="100"
                          step="0.01"
                          value={form.pdvProfitSharePercent}
                          disabled={bloqueandoForm}
                          onChange={(event) =>
                            atualizarForm(
                              "pdvProfitSharePercent",
                              event.target.value
                            )
                          }
                          className={`${inputClass} pr-10`}
                        />
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-500 dark:text-slate-400">
                          %
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Permitido: maior que 0% e até 100%.
                      </p>
                    </div>
                  )}
                </section>
              )}

              <section className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">
                      Permissões do usuário
                    </p>

                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {form.role === "ADMIN"
                        ? "Administrador recebe acesso completo."
                        : `${form.permissions.length} permissão(ões) marcada(s).`}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={aplicarModeloPerfil}
                      disabled={bloqueandoForm}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-[11px] font-black text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Modelo da função
                    </button>

                    <button
                      type="button"
                      onClick={marcarTodasPermissoes}
                      disabled={bloqueandoForm}
                      className="rounded-lg bg-slate-950 px-3 py-2 text-[11px] font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Marcar tudo
                    </button>

                    <button
                      type="button"
                      onClick={limparPermissoes}
                      disabled={bloqueandoForm || form.role === "ADMIN"}
                      className="rounded-lg bg-red-600 px-3 py-2 text-[11px] font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="max-h-[560px] space-y-3 overflow-auto pr-1">
                  {GRUPOS_PERMISSOES.map((grupo) => {
                    const keys = grupo.permissoes.map(
                      (permissao) => permissao.key
                    );

                    const todasMarcadas = grupoCompleto(keys);

                    return (
                      <div
                        key={grupo.titulo}
                        className="rounded-2xl bg-white dark:bg-slate-900 p-4 ring-1 ring-slate-100"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3 className="text-sm font-black text-slate-900 dark:text-white">
                            {grupo.titulo}
                          </h3>

                          <button
                            type="button"
                            onClick={() => alternarGrupo(keys)}
                            disabled={bloqueandoForm || form.role === "ADMIN"}
                            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 text-[11px] font-black text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {todasMarcadas ? "Desmarcar grupo" : "Marcar grupo"}
                          </button>
                        </div>

                        <div className="grid gap-2 md:grid-cols-2">
                          {grupo.permissoes.map((permissao) => (
                            <label
                              key={permissao.key}
                              className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
                            >
                              <input
                                type="checkbox"
                                checked={form.permissions.includes(
                                  permissao.key
                                )}
                                disabled={bloqueandoForm || form.role === "ADMIN"}
                                onChange={() =>
                                  alternarPermissao(permissao.key)
                                }
                                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
                              />

                              <span>{permissao.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <button
                type="submit"
                disabled={salvando}
                className="w-full rounded-xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {salvando
                  ? "Salvando..."
                  : editando
                    ? "Salvar usuário"
                    : "Criar usuário"}
              </button>
            </div>
          </form>

          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-5">
              <p className="text-sm font-bold text-blue-600">Consulta</p>

              <h2 className="text-2xl font-black tracking-tight">
                Lista de usuários
              </h2>

              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Busque por nome, login, e-mail, perfil ou status.
              </p>
            </div>

            <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_0.55fr_0.55fr_auto_auto]">
              <input
                value={filtros.busca}
                disabled={carregando}
                onChange={(event) => atualizarFiltro("busca", event.target.value)}
                placeholder="Nome, login ou e-mail"
                className={inputClass}
              />

              <select
                value={filtros.role}
                disabled={carregando}
                onChange={(event) => atualizarFiltro("role", event.target.value)}
                className={inputClass}
              >
                <option value="TODOS">Todos perfis</option>
                {CARGOS.map((cargo) => (
                  <option key={cargo.value} value={cargo.value}>
                    {cargo.label}
                  </option>
                ))}
              </select>

              <select
                value={filtros.status}
                disabled={carregando}
                onChange={(event) =>
                  atualizarFiltro("status", event.target.value)
                }
                className={inputClass}
              >
                <option value="TODOS">Todos status</option>
                {STATUS_USUARIO.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => carregarUsuarios()}
                disabled={carregando}
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {carregando ? "Buscando..." : "Buscar"}
              </button>

              <button
                type="button"
                onClick={limparFiltros}
                disabled={carregando}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Limpar
              </button>
            </div>

            {carregando ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                Carregando usuários...
              </div>
            ) : usuarios.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                Nenhum usuário encontrado.
              </div>
            ) : (
              <div className="space-y-3">
                {usuarios.map((usuario) => (
                  <article
                    key={usuario.id}
                    className={`rounded-2xl p-4 ring-1 ${
                      usuarioSelecionado?.id === usuario.id
                        ? "bg-blue-50 ring-blue-200"
                        : "bg-slate-50 dark:bg-slate-800/50 ring-slate-100"
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-black">
                            {usuario.name}
                          </h3>

                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-black ring-1 ${classeStatus(
                              usuario.status
                            )}`}
                          >
                            {nomesStatus[usuario.status] || usuario.status}
                          </span>

                          {usuario.role === "ADMIN" && (
                            <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-black text-white">
                              Admin
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          @{usuario.username} |{" "}
                          {nomesCargo[usuario.role] || usuario.role}
                        </p>

                        {usuario.email ? (
                          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {usuario.email}
                          </p>
                        ) : null}

                        <p className="mt-2 text-xs font-black text-blue-600">
                          {usuario.permissions?.length || 0} permissão(ões)
                        </p>

                        {usuario.role === "TECNICO" && (
                          <p className="mt-1 text-xs font-black text-emerald-700">
                            Participação no lucro:{" "}
                            {usuario.profitShareEnabled
                              ? `${Number(usuario.profitSharePercent || 0).toLocaleString(
                                  "pt-BR",
                                  { maximumFractionDigits: 2 }
                                )}%`
                              : "desativada"}
                          </p>
                        )}

                        {usuario.role === "ATENDENTE" && (
                          <p className="mt-1 text-xs font-black text-amber-600 dark:text-amber-400">
                            Comissão PDV (lucro):{" "}
                            {usuario.pdvProfitShareEnabled
                              ? `${Number(usuario.pdvProfitSharePercent || 0).toLocaleString(
                                  "pt-BR",
                                  { maximumFractionDigits: 2 }
                                )}%`
                              : "desativada"}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 md:justify-end">
  <button
    type="button"
    onClick={() => editarUsuario(usuario)}
    disabled={salvando || Boolean(excluindoId)}
    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
  >
    Editar
  </button>

  <button
    type="button"
    onClick={() => excluirUsuario(usuario)}
    disabled={salvando || excluindoId === usuario.id}
    className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
  >
    {excluindoId === usuario.id ? "Excluindo..." : "Excluir"}
  </button>
</div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <LinhaInfo titulo="Último login">
                        {formatarDataHora(usuario.lastLoginAt)}
                      </LinhaInfo>

                      <LinhaInfo titulo="Criado em">
                        {formatarDataHora(usuario.createdAt)}
                      </LinhaInfo>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}