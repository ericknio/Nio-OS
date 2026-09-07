"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUsuarioPermissoes } from "@/app/Permissao";

type FormState = {
  name: string;
  cpf: string;
  whatsapp: string;
  secondaryPhone: string;
  email: string;
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

const FORM_INICIAL: FormState = {
  name: "",
  cpf: "",
  whatsapp: "",
  secondaryPhone: "",
  email: "",
  address: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
};

import CardMensagem from "@/app/components/CardMensagem";
import { somenteNumeros } from "@/lib/formatadores";
import { inputClass } from "@/lib/uiConstantes";

function textoSeguro(valor?: string | number | null) {
  const texto = String(valor ?? "").trim();
  return texto || "-";
}

function montarEndereco(form: FormState) {
  const ruaNumero = [form.address, form.number].filter(Boolean).join(", ");
  const complemento = form.complement ? ` - ${form.complement}` : "";
  const bairroCidade = [form.district, form.city, form.state]
    .filter(Boolean)
    .join(" - ");

  return [ruaNumero + complemento, bairroCidade]
    .filter((item) => item.trim())
    .join(" | ") || "-";
}

function Bloco({
  etapa,
  titulo,
  descricao,
  children,
}: {
  etapa: string;
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-slate-100 pt-6 first:border-t-0 first:pt-0">
      <div className="mb-5 flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white">
          {etapa}
        </div>

        <div>
          <p className="text-sm font-bold text-blue-600">{titulo}</p>

          {descricao && (
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              {descricao}
            </p>
          )}
        </div>
      </div>

      {children}
    </section>
  );
}

function CampoTexto({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = "text",
  help,
  autoComplete,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "email";
  help?: string;
  autoComplete?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label}
        {required ? " *" : ""}
      </label>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={inputClass}
      />

      {help && (
        <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{help}</p>
      )}
    </div>
  );
}

function CampoResumo({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {titulo}
      </p>

      <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{children}</div>
    </div>
  );
}

export default function NovoClientePage() {
  const router = useRouter();
  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeCriarCliente = !carregandoPermissoes && tem("clientes.criar");

  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const contatoPrincipal = useMemo(() => {
    return form.whatsapp || form.secondaryPhone || form.email || "Sem contato";
  }, [form.whatsapp, form.secondaryPhone, form.email]);

  function atualizarCampo(campo: keyof FormState, valor: string) {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));

    setMensagem("");
  }

  function montarPayload() {
    return {
      name: form.name.trim(),
      cpf: somenteNumeros(form.cpf),
      whatsapp: somenteNumeros(form.whatsapp),
      secondaryPhone: somenteNumeros(form.secondaryPhone),
      email: form.email.trim().toLowerCase(),
      address: form.address.trim(),
      number: form.number.trim(),
      complement: form.complement.trim(),
      district: form.district.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
    };
  }

  async function salvarCliente(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    if (carregandoPermissoes || !podeCriarCliente) {
      setMensagem("Você não tem permissão para cadastrar clientes.");
      return;
    }

    if (!form.name.trim()) {
      setMensagem("Informe o nome do cliente.");
      return;
    }

    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      setMensagem("Informe um e-mail válido.");
      return;
    }

    if (form.state.trim() && form.state.trim().length > 2) {
      setMensagem("Use apenas a sigla do estado. Exemplo: BA.");
      return;
    }

    try {
      setSalvando(true);

      const response = await fetch("/api/clientes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(montarPayload()),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao cadastrar cliente.");
        return;
      }

      router.push(data?.id ? `/clientes/${data.id}` : "/clientes");
      router.refresh();
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao cadastrar cliente."
      );
    } finally {
      setSalvando(false);
    }
  }

  if (carregandoPermissoes) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Verificando permissões...
        </section>
      </main>
    );
  }

  if (!podeCriarCliente) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
            Você não tem permissão para cadastrar clientes.
          </div>

          <Link
            href="/"
            className="inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
          >
            Painel inicial
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
                Clientes & atendimento
              </p>

              <h1 className="text-3xl font-black tracking-tight">
                Novo cliente
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Cadastre os dados do cliente para usar nas ordens de serviço.
                Nome é obrigatório; contatos e endereço ajudam no atendimento.
              </p>
            </div>

            <Link
              href="/clientes"
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
            >
              Voltar
            </Link>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <form
            onSubmit={salvarCliente}
            className="space-y-6 rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
          >
            <Bloco
              etapa="1"
              titulo="Identificação"
              descricao="Informe o nome completo e, se tiver, CPF do cliente."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <CampoTexto
                  label="Nome"
                  required
                  value={form.name}
                  onChange={(valor) => atualizarCampo("name", valor)}
                  placeholder="Nome completo"
                  autoComplete="name"
                />

                <CampoTexto
                  label="CPF"
                  value={form.cpf}
                  onChange={(valor) => atualizarCampo("cpf", somenteNumeros(valor))}
                  placeholder="Somente números"
                  help="O sistema salva apenas números para evitar duplicidade."
                />
              </div>
            </Bloco>

            <Bloco
              etapa="2"
              titulo="Contato"
              descricao="Preencha pelo menos um contato sempre que possível."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <CampoTexto
                  label="WhatsApp"
                  value={form.whatsapp}
                  onChange={(valor) =>
                    atualizarCampo("whatsapp", somenteNumeros(valor))
                  }
                  placeholder="Exemplo: 71999999999"
                  autoComplete="tel"
                />

                <CampoTexto
                  label="Telefone secundário"
                  value={form.secondaryPhone}
                  onChange={(valor) =>
                    atualizarCampo("secondaryPhone", somenteNumeros(valor))
                  }
                  placeholder="Telefone secundário"
                  autoComplete="tel"
                />

                <CampoTexto
                  label="E-mail"
                  type="email"
                  value={form.email}
                  onChange={(valor) =>
                    atualizarCampo("email", valor.trim().toLowerCase())
                  }
                  placeholder="email@exemplo.com"
                  autoComplete="email"
                  className="md:col-span-2"
                />
              </div>
            </Bloco>

            <Bloco
              etapa="3"
              titulo="Endereço"
              descricao="Esses campos são opcionais, mas ajudam no histórico do cliente."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <CampoTexto
                  label="Endereço"
                  value={form.address}
                  onChange={(valor) => atualizarCampo("address", valor)}
                  placeholder="Rua / Avenida"
                  autoComplete="street-address"
                />

                <CampoTexto
                  label="Número"
                  value={form.number}
                  onChange={(valor) => atualizarCampo("number", valor)}
                  placeholder="Número"
                />

                <CampoTexto
                  label="Complemento"
                  value={form.complement}
                  onChange={(valor) => atualizarCampo("complement", valor)}
                  placeholder="Casa, apto, loja..."
                />

                <CampoTexto
                  label="Bairro"
                  value={form.district}
                  onChange={(valor) => atualizarCampo("district", valor)}
                  placeholder="Bairro"
                />

                <CampoTexto
                  label="Cidade"
                  value={form.city}
                  onChange={(valor) => atualizarCampo("city", valor)}
                  placeholder="Cidade"
                  autoComplete="address-level2"
                />

                <CampoTexto
                  label="Estado"
                  value={form.state}
                  onChange={(valor) =>
                    atualizarCampo("state", valor.toUpperCase().slice(0, 2))
                  }
                  placeholder="BA"
                  autoComplete="address-level1"
                  help="Use a sigla. Exemplo: BA, SP, RJ."
                />
              </div>
            </Bloco>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 md:flex-row md:justify-end">
              <Link
                href="/clientes"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 text-center text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Cancelar
              </Link>

              <button
                type="submit"
                disabled={salvando}
                className="rounded-xl bg-blue-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Salvar cliente"}
              </button>
            </div>
          </form>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <p className="text-sm font-bold text-blue-600">Resumo rápido</p>

              <h2 className="mt-1 text-2xl font-black tracking-tight">
                Prévia do cadastro
              </h2>

              <div className="mt-5 space-y-3">
                <CampoResumo titulo="Cliente">
                  {textoSeguro(form.name || "Nome ainda não informado")}
                </CampoResumo>

                <CampoResumo titulo="CPF">{textoSeguro(form.cpf)}</CampoResumo>

                <CampoResumo titulo="Contato principal">
                  {textoSeguro(contatoPrincipal)}
                </CampoResumo>

                <CampoResumo titulo="Endereço">
                  {montarEndereco(form)}
                </CampoResumo>
              </div>
            </section>

            <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-lg shadow-slate-950/10">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-blue-200">
                Regras
              </p>

              <div className="mt-5 space-y-4 text-sm font-semibold leading-6 text-slate-300">
                <p>1. Nome é obrigatório.</p>
                <p>2. CPF, WhatsApp e e-mail ajudam a evitar duplicidade.</p>
                <p>3. Telefones são salvos apenas com números.</p>
                <p>4. Estado deve usar sigla com 2 letras.</p>
              </div>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}