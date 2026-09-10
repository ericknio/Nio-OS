/**
 * @file app/configuracoes/page.tsx
 * @description Painel de Configurações Gerais da Empresa, Loja e Sistema (Frontend).
 * 
 * Funcionalidades:
 * - Cadastro dos dados institucionais da assistência técnica (Razão Social, Nome Fantasia, CNPJ, Contatos, Endereço).
 * - Definição de horários de funcionamento e dias úteis da loja física.
 * - Parametrização padrão de Ordens de Serviço: prazo legal de garantia e texto padrão do termo de responsabilidade.
 * - Ativação/Desativação de módulos do sistema (Módulo Comercial de Produtos).
 * - Gestão de logotipo da empresa (`LogoUpload`) e rotinas de backup e restauração (`BackupRestoreCard`).
 */

"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";
import { textoGarantiaPadrao } from "@/lib/configuracoesPadrao";
import {
  DIAS_FUNCIONAMENTO_PADRAO,
  DIAS_SEMANA_FUNCIONAMENTO,
  minutosDaHora,
  normalizarDiasFuncionamento,
  normalizarHora,
} from "@/lib/funcionamentoLoja";
import LogoUpload from "./LogoUpload";
import BackupRestoreCard from "./BackupRestoreCard";
import CardMensagem from "@/app/components/CardMensagem";
import { somenteNumeros, emailValido } from "@/lib/formatadores";
import { VERSAO_ATUAL_SISTEMA } from "@/lib/versoesSistema";
import ModalPatchNotes from "@/app/components/ModalPatchNotes";

type Configuracoes = {
  nomeEmpresa?: string | null;
  companyName?: string | null;
  nomeFantasia?: string | null;
  tradeName?: string | null;

  telefone?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  site?: string | null;
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;

  documento?: string | null;
  cnpj?: string | null;

  endereco?: string | null;
  address?: string | null;
  cep?: string | null;
  zipCode?: string | null;
  cidade?: string | null;
  city?: string | null;
  estado?: string | null;
  state?: string | null;

  rodape?: string | null;
  footerText?: string | null;
  operadorPadrao?: string | null;
  defaultOperator?: string | null;

  defaultWarrantyDays?: number | string | null;
  warrantyText?: string | null;
  productsModuleEnabled?: boolean | null;
  businessDays?: number[] | string | null;
  workingDays?: number[] | string | null;
  businessOpenTime?: string | null;
  openingTime?: string | null;
  businessCloseTime?: string | null;
  closingTime?: string | null;
  osModuleEnabled?: boolean | null;
};

type ConfiguracoesResponse = Configuracoes & {
  message?: string;
};

type FormState = {
  nomeEmpresa: string;
  nomeFantasia: string;
  documento: string;

  telefone: string;
  whatsapp: string;
  email: string;
  site: string;
  instagram: string;

  endereco: string;
  cep: string;
  cidade: string;
  estado: string;

  operadorPadrao: string;
  defaultWarrantyDays: string;
  warrantyText: string;
  rodape: string;
  productsModuleEnabled: boolean;
  businessDays: number[];
  businessOpenTime: string;
  businessCloseTime: string;
  osModuleEnabled: boolean;
};

type CampoTextoState = Exclude<
  keyof FormState,
  "productsModuleEnabled" | "osModuleEnabled" | "businessDays"
>;

const FORM_INICIAL: FormState = {
  nomeEmpresa: "",
  nomeFantasia: "",
  documento: "",

  telefone: "",
  whatsapp: "",
  email: "",
  site: "",
  instagram: "",

  endereco: "",
  cep: "",
  cidade: "",
  estado: "",

  operadorPadrao: "Sistema",
  defaultWarrantyDays: "90",
  warrantyText: textoGarantiaPadrao,
  rodape: "",
  productsModuleEnabled: true,
  businessDays: DIAS_FUNCIONAMENTO_PADRAO,
  businessOpenTime: "08:00",
  businessCloseTime: "18:00",
  osModuleEnabled: true,
};

const inputClass =
  "w-full rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-400 dark:disabled:text-slate-500";

const textareaClass =
  "w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-400 dark:disabled:text-slate-500";

function textoSeguro(valor?: string | number | null) {
  const texto = String(valor ?? "").trim();
  return texto || "-";
}

function Bloco({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-slate-100 dark:border-slate-800/80 pt-6 first:border-t-0 first:pt-0">
      <div className="mb-5">
        <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400">{titulo}</h3>

        {descricao && (
          <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
            {descricao}
          </p>
        )}
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
  disabled,
  required = false,
  type = "text",
  help,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  type?: "text" | "email" | "number" | "time";
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

function CampoTextarea({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label}
      </label>

      <textarea
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={textareaClass}
      />
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

/**
 * Componente principal da Tela de Configurações Gerais.
 * 
 * Gerencia a busca e persistência das configurações da loja e do sistema,
 * cartões de pré-visualização e submissão via PUT `/api/configuracoes`.
 */
export default function ConfiguracoesPage() {
  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeVerDashboard = !carregandoPermissoes && tem("dashboard.ver");
  const podeEditarConfiguracoes =
    !carregandoPermissoes && tem("configuracoes.editar");

  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [modalPatchNotesAberto, setModalPatchNotesAberto] = useState(false);

  const bloquearCampos =
    carregando || salvando || carregandoPermissoes || !podeEditarConfiguracoes;

  function atualizarCampo(campo: CampoTextoState, valor: string) {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));

    setMensagem("");
  }

  function atualizarModuloProdutos(valor: boolean) {
    setForm((atual) => ({
      ...atual,
      productsModuleEnabled: valor,
    }));

    setMensagem("");
  }

  function atualizarModuloOS(valor: boolean) {
    setForm((atual) => ({
      ...atual,
      osModuleEnabled: valor,
    }));

    setMensagem("");
  }

  function atualizarDiaFuncionamento(dia: number, marcado: boolean) {
    setForm((atual) => {
      const dias = marcado
        ? Array.from(new Set([...atual.businessDays, dia])).sort(
            (a, b) => a - b
          )
        : atual.businessDays.filter((item) => item !== dia);

      return {
        ...atual,
        businessDays: dias,
      };
    });

    setMensagem("");
  }

  function preencherFormulario(data: Configuracoes) {
    setForm({
      nomeEmpresa: data.nomeEmpresa || data.companyName || "",
      nomeFantasia: data.nomeFantasia || data.tradeName || "",
      documento: data.documento || data.cnpj || "",

      telefone: data.telefone || data.phone || "",
      whatsapp: data.whatsapp || "",
      email: data.email || "",
      site: data.site || data.website || "",
      instagram: data.instagram || "",

      endereco: data.endereco || data.address || "",
      cep: data.cep || data.zipCode || "",
      cidade: data.cidade || data.city || "",
      estado: data.estado || data.state || "",

      operadorPadrao: data.operadorPadrao || data.defaultOperator || "Sistema",
      defaultWarrantyDays: String(data.defaultWarrantyDays || 90),
      warrantyText: data.warrantyText || textoGarantiaPadrao,
      rodape: data.rodape || data.footerText || "",
      productsModuleEnabled: data.productsModuleEnabled !== false,
      businessDays: normalizarDiasFuncionamento(
        data.businessDays ?? data.workingDays
      ),
      businessOpenTime: normalizarHora(
        data.businessOpenTime ?? data.openingTime,
        "08:00"
      ),
      businessCloseTime: normalizarHora(
        data.businessCloseTime ?? data.closingTime,
        "18:00"
      ),
      osModuleEnabled: data.osModuleEnabled !== false,
    });
  }

  function montarPayload() {
    return {
      nomeEmpresa: form.nomeEmpresa.trim(),
      companyName: form.nomeEmpresa.trim(),

      nomeFantasia: form.nomeFantasia.trim(),
      tradeName: form.nomeFantasia.trim(),

      documento: form.documento.trim(),
      cnpj: form.documento.trim(),

      telefone: form.telefone.trim(),
      phone: form.telefone.trim(),
      whatsapp: form.whatsapp.trim(),
      email: form.email.trim().toLowerCase(),
      website: form.site.trim(),
      instagram: form.instagram.trim(),

      endereco: form.endereco.trim(),
      address: form.endereco.trim(),
      zipCode: somenteNumeros(form.cep),
      city: form.cidade.trim(),
      cidade: form.cidade.trim(),
      state: form.estado.trim().toUpperCase(),
      estado: form.estado.trim().toUpperCase(),

      footerText: form.rodape.trim(),
      rodape: form.rodape.trim(),

      defaultOperator: form.operadorPadrao.trim(),
      operadorPadrao: form.operadorPadrao.trim(),

      defaultWarrantyDays: Number(form.defaultWarrantyDays || 90),
      warrantyText: form.warrantyText.trim() || textoGarantiaPadrao,
      productsModuleEnabled: form.productsModuleEnabled,
      businessDays: form.businessDays,
      workingDays: form.businessDays,
      businessOpenTime: form.businessOpenTime,
      openingTime: form.businessOpenTime,
      businessCloseTime: form.businessCloseTime,
      closingTime: form.businessCloseTime,
      osModuleEnabled: form.osModuleEnabled,
    };
  }

  async function carregarConfiguracoes() {
    if (!podeEditarConfiguracoes) {
      setCarregando(false);
      return;
    }

    try {
      setCarregando(true);
      setMensagem("");

      const response = await fetch("/api/configuracoes", {
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | ConfiguracoesResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar configurações.");
        return;
      }

      if (data) {
        preencherFormulario(data);
      }
    } catch {
      setMensagem("Não foi possível carregar as configurações atuais.");
    } finally {
      setCarregando(false);
    }
  }

  async function salvarConfiguracoes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    if (!podeEditarConfiguracoes) {
      setMensagem("Você não tem permissão para editar configurações.");
      return;
    }

    if (!form.nomeEmpresa.trim()) {
      setMensagem("Informe o nome da empresa.");
      return;
    }

    if (!emailValido(form.email)) {
      setMensagem("Informe um e-mail válido.");
      return;
    }

    if (form.estado.trim() && form.estado.trim().length !== 2) {
      setMensagem("Use apenas a sigla do estado. Exemplo: BA.");
      return;
    }

    if (Number(form.defaultWarrantyDays) < 0) {
      setMensagem("A garantia padrão não pode ser negativa.");
      return;
    }

    if (form.businessDays.length === 0) {
      setMensagem("Selecione pelo menos um dia de funcionamento da loja.");
      return;
    }

    if (
      minutosDaHora(form.businessOpenTime) >=
      minutosDaHora(form.businessCloseTime)
    ) {
      setMensagem("O horário de abertura precisa ser menor que o fechamento.");
      return;
    }

    try {
      setSalvando(true);

      const response = await fetch("/api/configuracoes", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(montarPayload()),
      });

      const data = (await response.json().catch(() => null)) as
        | ConfiguracoesResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao salvar configurações.");
        return;
      }

      if (data) {
        preencherFormulario(data);

        window.localStorage.setItem(
          "nio-os-products-module-enabled",
          String(data.productsModuleEnabled !== false)
        );

        window.localStorage.setItem(
          "nio-os-os-module-enabled",
          String(data.osModuleEnabled !== false)
        );

        setTimeout(() => {
          window.location.reload();
        }, 300);
      }

      setMensagem("Configurações salvas com sucesso.");
    } catch {
      setMensagem("Erro ao salvar configurações.");
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (!podeEditarConfiguracoes) {
      setCarregando(false);
      return;
    }

    carregarConfiguracoes();
  }, [carregandoPermissoes, podeEditarConfiguracoes]);

  if (carregandoPermissoes) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Verificando permissões de configuração...
        </section>
      </main>
    );
  }

  if (!podeEditarConfiguracoes) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-red-200">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">Acesso negado</p>

            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-slate-100">
              Configurações bloqueadas
            </h1>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Seu usuário não possui permissão para acessar as configurações do
              sistema. Essa área altera dados da empresa, logo, garantia,
              backup e módulos.
            </p>
          </div>

          {podeVerDashboard && (
            <Link
              href="/"
              className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
            >
              Voltar ao painel inicial
            </Link>
          )}
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
              <p className="text-sm font-bold text-blue-600">Sistema local</p>

              <h1 className="text-3xl font-black tracking-tight">
                Configurações
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Ajuste dados da empresa, logo, garantia padrão, rodapé dos PDFs
                e backups do sistema.
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
                onClick={carregarConfiguracoes}
                disabled={carregando}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        {!podeEditarConfiguracoes && !carregandoPermissoes && (
          <section className="rounded-3xl bg-yellow-50 p-5 text-sm font-bold text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-900/20 dark:ring-yellow-500/30">
            Você está em modo visualização. Seu usuário não possui permissão para
            alterar as configurações.
          </section>
        )}

        <LogoUpload podeEditar={podeEditarConfiguracoes} />

        <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <form
            onSubmit={salvarConfiguracoes}
            className="space-y-6 rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
          >
            {carregando ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 text-sm font-bold text-slate-500 dark:text-slate-400">
                Carregando configurações...
              </div>
            ) : (
              <>
                <Bloco
                  titulo="Dados principais"
                  descricao="Essas informações aparecem no sistema e nos documentos impressos."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <CampoTexto
                      label="Nome da empresa"
                      required
                      value={form.nomeEmpresa}
                      disabled={bloquearCampos}
                      onChange={(valor) => atualizarCampo("nomeEmpresa", valor)}
                      placeholder="Exemplo: FB Tecnologia"
                    />

                    <CampoTexto
                      label="Nome fantasia"
                      value={form.nomeFantasia}
                      disabled={bloquearCampos}
                      onChange={(valor) => atualizarCampo("nomeFantasia", valor)}
                      placeholder="Nome curto ou marca"
                    />

                    <CampoTexto
                      label="CPF/CNPJ"
                      value={form.documento}
                      disabled={bloquearCampos}
                      onChange={(valor) => atualizarCampo("documento", valor)}
                      placeholder="Documento da empresa"
                    />

                    <CampoTexto
                      label="Operador padrão"
                      value={form.operadorPadrao}
                      disabled={bloquearCampos}
                      onChange={(valor) =>
                        atualizarCampo("operadorPadrao", valor)
                      }
                      placeholder="Sistema"
                      help="Usado no histórico quando uma ação não informa operador."
                    />
                  </div>
                </Bloco>

                <Bloco
                  titulo="Contato"
                  descricao="Dados usados nos PDFs, recibos e identificação da empresa."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <CampoTexto
                      label="Telefone"
                      value={form.telefone}
                      disabled={bloquearCampos}
                      onChange={(valor) => atualizarCampo("telefone", valor)}
                      placeholder="Telefone fixo ou secundário"
                    />

                    <CampoTexto
                      label="WhatsApp"
                      value={form.whatsapp}
                      disabled={bloquearCampos}
                      onChange={(valor) => atualizarCampo("whatsapp", valor)}
                      placeholder="WhatsApp da empresa"
                    />

                    <CampoTexto
                      label="E-mail"
                      type="email"
                      value={form.email}
                      disabled={bloquearCampos}
                      onChange={(valor) =>
                        atualizarCampo("email", valor.trim().toLowerCase())
                      }
                      placeholder="email@empresa.com"
                    />

                    <CampoTexto
                      label="Site"
                      value={form.site}
                      disabled={bloquearCampos}
                      onChange={(valor) => atualizarCampo("site", valor)}
                      placeholder="https://..."
                    />

                    <CampoTexto
                      label="Instagram"
                      value={form.instagram}
                      disabled={bloquearCampos}
                      onChange={(valor) => atualizarCampo("instagram", valor)}
                      placeholder="@empresa"
                    />
                  </div>
                </Bloco>

                <Bloco
                  titulo="Endereço"
                  descricao="Endereço usado nos documentos e identificação da loja."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <CampoTexto
                      label="Endereço"
                      value={form.endereco}
                      disabled={bloquearCampos}
                      onChange={(valor) => atualizarCampo("endereco", valor)}
                      placeholder="Rua, número, bairro..."
                    />

                    <CampoTexto
                      label="CEP"
                      value={form.cep}
                      disabled={bloquearCampos}
                      onChange={(valor) =>
                        atualizarCampo("cep", somenteNumeros(valor))
                      }
                      placeholder="Somente números"
                    />

                    <CampoTexto
                      label="Cidade"
                      value={form.cidade}
                      disabled={bloquearCampos}
                      onChange={(valor) => atualizarCampo("cidade", valor)}
                      placeholder="Cidade"
                    />

                    <CampoTexto
                      label="Estado"
                      value={form.estado}
                      disabled={bloquearCampos}
                      onChange={(valor) =>
                        atualizarCampo("estado", valor.toUpperCase().slice(0, 2))
                      }
                      placeholder="BA"
                      help="Use a sigla com 2 letras."
                    />
                  </div>
                </Bloco>

                <Bloco
                  titulo="Funcionamento da loja"
                  descricao="Esses dias entram nos relatórios. Dias fechados não são considerados como dia fraco."
                >
                  <div className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {DIAS_SEMANA_FUNCIONAMENTO.map((dia) => {
                        const ativo = form.businessDays.includes(dia.id);

                        return (
                          <label
                            key={dia.id}
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 ring-1 transition ${
                              ativo
                                ? "border-blue-500/40 bg-blue-50/80 dark:bg-blue-950/40 dark:border-blue-500/40 ring-blue-500/20"
                                : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 ring-slate-100 dark:ring-slate-800"
                            }`}
                          >
                            <span className={`text-xs font-bold ${ativo ? "text-blue-700 dark:text-blue-200" : "text-slate-700 dark:text-slate-300"}`}>
                              {dia.label}
                            </span>

                            <input
                              type="checkbox"
                              checked={ativo}
                              disabled={bloquearCampos}
                              onChange={(event) =>
                                atualizarDiaFuncionamento(
                                  dia.id,
                                  event.target.checked
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </label>
                        );
                      })}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <CampoTexto
                        label="Horário de abertura"
                        type="time"
                        value={form.businessOpenTime}
                        disabled={bloquearCampos}
                        onChange={(valor) => atualizarCampo("businessOpenTime", valor)}
                        placeholder="08:00"
                        help="Use o formato HH:mm. Exemplo: 08:00."
                      />

                      <CampoTexto
                        label="Horário de fechamento"
                        type="time"
                        value={form.businessCloseTime}
                        disabled={bloquearCampos}
                        onChange={(valor) => atualizarCampo("businessCloseTime", valor)}
                        placeholder="18:00"
                        help="Use o formato HH:mm. Exemplo: 18:00."
                      />
                    </div>
                  </div>
                </Bloco>

                <Bloco
                  titulo="Módulos do sistema"
                  descricao="Ative somente os módulos que a assistência realmente usa. Desativar produtos deixa o sistema focado em OS."
                >
                  <label
                    className={`flex cursor-pointer flex-col gap-4 rounded-2xl border p-5 ring-1 transition md:flex-row md:items-center md:justify-between ${
                      form.productsModuleEnabled
                        ? "border-blue-500/40 bg-blue-50/80 dark:bg-blue-950/30 dark:border-blue-500/40 ring-blue-500/20"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 ring-slate-100 dark:ring-slate-800"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        Produtos, estoque e vendas
                      </p>

                      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
                        Quando desligado, o menu, painel inicial, relatórios e
                        atalhos de produtos ficam ocultos para todos os usuários.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-xs font-bold ${
                          form.productsModuleEnabled
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {form.productsModuleEnabled ? "Ativado" : "Desativado"}
                      </span>

                      <input
                        type="checkbox"
                        checked={form.productsModuleEnabled}
                        disabled={bloquearCampos}
                        onChange={(event) =>
                          atualizarModuloProdutos(event.target.checked)
                        }
                        className="h-5 w-5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  </label>

                  <label
                    className={`flex cursor-pointer flex-col gap-4 rounded-2xl border p-5 ring-1 transition md:flex-row md:items-center md:justify-between mt-4 ${
                      form.osModuleEnabled
                        ? "border-blue-500/40 bg-blue-50/80 dark:bg-blue-950/30 dark:border-blue-500/40 ring-blue-500/20"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 ring-slate-100 dark:ring-slate-800"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        Ordens de Serviço (OS) e Estoque Técnico
                      </p>

                      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
                        Quando desligado, o painel muda para modo PDV. O menu, relatórios e atalhos de OS ficam ocultos.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-xs font-bold ${
                          form.osModuleEnabled
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {form.osModuleEnabled ? "Ativado" : "Desativado"}
                      </span>

                      <input
                        type="checkbox"
                        checked={form.osModuleEnabled}
                        disabled={bloquearCampos}
                        onChange={(event) =>
                          atualizarModuloOS(event.target.checked)
                        }
                        className="h-5 w-5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  </label>
                </Bloco>

                <Bloco
                  titulo="Garantia e documentos"
                  descricao="Texto padrão usado nos termos impressos após finalização da OS."
                >
                  <div className="grid gap-4">
                    <CampoTexto
                      label="Garantia padrão em dias"
                      type="number"
                      value={form.defaultWarrantyDays}
                      disabled={bloquearCampos}
                      onChange={(valor) =>
                        atualizarCampo("defaultWarrantyDays", valor)
                      }
                      placeholder="90"
                    />

                    <CampoTextarea
                      label="Texto padrão da garantia"
                      value={form.warrantyText}
                      disabled={bloquearCampos}
                      onChange={(valor) => atualizarCampo("warrantyText", valor)}
                      placeholder="Texto do termo de garantia."
                      rows={9}
                    />

                    <CampoTextarea
                      label="Texto de rodapé"
                      value={form.rodape}
                      disabled={bloquearCampos}
                      onChange={(valor) => atualizarCampo("rodape", valor)}
                      placeholder="Exemplo: Obrigado pela preferência."
                      rows={4}
                    />
                  </div>
                </Bloco>

                {podeEditarConfiguracoes && (
                  <div className="flex justify-end border-t border-slate-100 dark:border-slate-800/80 pt-6">
                    <button
                      type="submit"
                      disabled={salvando}
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-6 py-3 text-xs font-bold text-white shadow-md shadow-blue-500/25 transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                      <span>{salvando ? "Salvando..." : "Salvar configurações"}</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </form>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <p className="text-sm font-bold text-blue-600">Resumo</p>

              <h2 className="mt-1 text-2xl font-black tracking-tight">
                Prévia do sistema
              </h2>

              <div className="mt-5 space-y-3">
                <CampoResumo titulo="Empresa">
                  {textoSeguro(form.nomeEmpresa || "Nome não informado")}
                </CampoResumo>

                <CampoResumo titulo="Nome fantasia">
                  {textoSeguro(form.nomeFantasia)}
                </CampoResumo>

                <CampoResumo titulo="Contato principal">
                  {textoSeguro(form.whatsapp || form.telefone || form.email)}
                </CampoResumo>

                <CampoResumo titulo="Operador padrão">
                  {textoSeguro(form.operadorPadrao)}
                </CampoResumo>

                <CampoResumo titulo="Garantia padrão">
                  {textoSeguro(form.defaultWarrantyDays)} dia(s)
                </CampoResumo>

                <CampoResumo titulo="Produtos / estoque">
                  {form.productsModuleEnabled ? "Ativado" : "Desativado"}
                </CampoResumo>

                <CampoResumo titulo="Ordens de Serviço">
                  {form.osModuleEnabled ? "Ativado" : "Desativado"}
                </CampoResumo>

                <CampoResumo titulo="Funcionamento">
                  {form.businessDays.length} dia(s) | {form.businessOpenTime} às {form.businessCloseTime}
                </CampoResumo>
              </div>
            </section>

            {/* Card de Atualizações */}
            <section className="rounded-3xl border border-blue-200 dark:border-blue-900/50 bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/30 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Atualização do Sistema
                  </p>
                  <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">
                    Nio-OS Desktop
                  </h3>
                </div>
                <span className="rounded-full bg-blue-100 dark:bg-blue-900/60 px-3 py-1 text-xs font-black text-blue-700 dark:text-blue-300">
                  v{VERSAO_ATUAL_SISTEMA}
                </span>
              </div>

              <p className="mt-3 text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                Verifique se há novas versões com melhorias, novidades e correções disponíveis para instalação.
              </p>

              <div className="mt-4 flex flex-col gap-2.5">
                <Link
                  href="/configuracoes/atualizacoes"
                  className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 text-xs font-black text-white shadow-md shadow-blue-500/20 transition hover:from-blue-500 hover:to-indigo-500 active:scale-95"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Verificar Atualizações</span>
                </Link>

                <button
                  type="button"
                  onClick={() => setModalPatchNotesAberto(true)}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <svg className="h-3.5 w-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Ver Notas desta Versão (Patch Note)</span>
                </button>
              </div>
            </section>

            <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-lg shadow-slate-950/10 border border-slate-800">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">
                  Informações do Sistema
                </p>
                <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-xs font-bold text-blue-400">
                  v{VERSAO_ATUAL_SISTEMA}
                </span>
              </div>

              <div className="mt-5 space-y-3.5 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <span className="text-slate-400">Aplicativo</span>
                  <span className="font-bold text-slate-200">Nio-OS Desktop</span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <span className="text-slate-400">Ambiente</span>
                  <span className="font-bold text-slate-200">Local / Offline First</span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <span className="text-slate-400">Banco de Dados</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block"></span>
                    SQLite Local Seguro
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <span className="text-slate-400">Backup Diário</span>
                  <span className="font-bold text-slate-200">Ativo ao Iniciar</span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <span className="text-slate-400">Privacidade</span>
                  <span className="font-bold text-purple-400">Conforme LGPD</span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-400">Licença e Ativação</span>
                  <span className="font-bold text-blue-400">Nio Cloud Sync</span>
                </div>
              </div>
            </section>
          </aside>
        </section>

        {podeEditarConfiguracoes ? (
          <BackupRestoreCard />
        ) : (
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            Backup e restauração disponíveis apenas para usuários com permissão
            de editar configurações.
          </section>
        )}

        {modalPatchNotesAberto && (
          <ModalPatchNotes
            abrirManualmente={true}
            onClose={() => setModalPatchNotesAberto(false)}
          />
        )}
      </section>
    </main>
  );
}