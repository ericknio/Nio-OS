/**
 * @file app/ordens/[id]/editar/page.tsx
 * @description Tela de Edição e Retificação de Ordem de Serviço (Frontend).
 * 
 * Funcionalidades:
 * - Edição dos dados do cliente vinculado e detalhes do equipamento (marca, modelo, serial, IMEI, senha, acessórios).
 * - Atualização do laudo técnico e defeito relatado.
 * - Ajuste de valores: mão de obra, custos e desconto com recálculo do total da O.S.
 * - Atribuição de técnico responsável e recálculo da porcentagem de comissão.
 * - Validações: impede alteração caso a ordem já tenha sido entregue ou cancelada.
 */

"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUsuarioPermissoes } from "@/app/Permissao";
import CardMensagem from "@/app/components/CardMensagem";
import {
  formatarMoeda,
  formatarNumeroOS,
  numeroFinanceiro,
  normalizarTexto,
} from "@/lib/formatadores";
import { nomesStatus, inputClass, textareaClass } from "@/lib/uiConstantes";

type Cliente = {
  id: string;
  name: string;
  cpf: string | null;
  whatsapp: string | null;
};

type Tecnico = {
  id: string;
  name: string;
  profitShareEnabled?: boolean;
  profitSharePercent?: number;
};

type Ordem = {
  id: string;
  osNumber: number;
  customerId: string;
  equipmentType: string;
  equipmentOther: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  imei: string | null;
  devicePassword: string | null;
  deliveredAccessories: string | null;
  reportedDefect: string;
  technicalNotes: string | null;
  requiredParts: string | null;
  partsCost: number | string | null;
  laborCost: number | string | null;
  discount: number | string | null;
  paymentMethod: string | null;
  status: string;
  expectedDeliveryDate: string | null;
  technicianResponsible?: string | null;
  technicianUserId?: string | null;
  technicianProfitPercentSnapshot?: number | null;
  finalization?: unknown | null;
  customer?: {
    name: string;
    cpf: string | null;
    whatsapp: string | null;
  };
};

type FormState = {
  customerId: string;
  equipmentType: string;
  equipmentOther: string;
  brand: string;
  model: string;
  serialNumber: string;
  imei: string;
  devicePassword: string;
  deliveredAccessories: string;
  reportedDefect: string;
  technicalNotes: string;
  requiredParts: string;
  partsCost: string;
  laborCost: string;
  discount: string;
  paymentMethod: string;
  status: string;
  expectedDeliveryDate: string;
  technicianUserId: string;
};

const FORM_INICIAL: FormState = {
  customerId: "",
  equipmentType: "CELULAR",
  equipmentOther: "",
  brand: "",
  model: "",
  serialNumber: "",
  imei: "",
  devicePassword: "",
  deliveredAccessories: "",
  reportedDefect: "",
  technicalNotes: "",
  requiredParts: "",
  partsCost: "",
  laborCost: "",
  discount: "",
  paymentMethod: "AGUARDANDO_PAGAMENTO",
  status: "RECEBIDO",
  expectedDeliveryDate: "",
  technicianUserId: "",
};

const EQUIPAMENTOS = [
  ["NOTEBOOK", "Notebook"],
  ["COMPUTADOR", "Computador"],
  ["CELULAR", "Celular"],
  ["TABLET", "Tablet"],
  ["VIDEOGAME", "Videogame"],
  ["IMPRESSORA", "Impressora"],
  ["TV", "TV"],
  ["OUTRO", "Outro"],
] as const;

const STATUS_EDITAVEIS = [
  ["RECEBIDO", "Recebido"],
  ["EM_ANALISE", "Em análise"],
  ["AGUARDANDO_PECA", "Aguardando peça"],
  ["EM_REPARO", "Em reparo"],
] as const;

const FORMAS_PAGAMENTO = [
  ["AGUARDANDO_PAGAMENTO", "Aguardando pagamento"],
  ["DINHEIRO", "Dinheiro"],
  ["PIX", "Pix"],
  ["CARTAO", "Cartão"],
  ["PARCELADO", "Parcelado"],
] as const;

const nomesEquipamento = Object.fromEntries(EQUIPAMENTOS);
function textoSeguro(valor?: string | number | null) {
  const texto = String(valor ?? "").trim();
  return texto || "-";
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
  type = "text",
  required = false,
  disabled = false,
  help,
  step,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  type?: "text" | "date" | "number";
  required?: boolean;
  disabled?: boolean;
  help?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label}
        {required ? " *" : ""}
      </label>

      <input
        type={type}
        step={step}
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
  required = false,
  minHeight = "min-h-24",
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  required?: boolean;
  minHeight?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label}
        {required ? " *" : ""}
      </label>

      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${textareaClass} ${minHeight}`}
      />
    </div>
  );
}

function CampoSelect({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  children: ReactNode;
  disabled?: boolean;
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
        {children}
      </select>
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
 * Componente principal da Tela de Edição de Ordem de Serviço.
 * 
 * Gerencia o formulário reativo de edição com preenchimento prévio dos dados,
 * cálculo de comissões técnicas e submissão via PUT/PATCH para a API.
 */
export default function EditarOrdemPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeEditarOrdem = !carregandoPermissoes && tem("ordens.editar");

  const podeVerValoresOperacionais = !carregandoPermissoes;
  const podeEditarValoresOperacionais =
    !carregandoPermissoes && podeEditarOrdem;

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [buscaCliente, setBuscaCliente] = useState("");

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const total = useMemo(() => {
    return Math.max(
      numeroFinanceiro(form.partsCost) +
        numeroFinanceiro(form.laborCost) -
        numeroFinanceiro(form.discount),
      0
    );
  }, [form.partsCost, form.laborCost, form.discount]);

  const clienteSelecionado = useMemo(
    () => clientes.find((cliente) => cliente.id === form.customerId) || null,
    [clientes, form.customerId]
  );

  const clientesFiltrados = useMemo(() => {
    const busca = normalizarTexto(buscaCliente);

    if (!busca) return clientes.slice(0, 8);

    return clientes
      .filter((cliente) =>
        normalizarTexto(
          `${cliente.name} ${cliente.whatsapp || ""} ${cliente.cpf || ""}`
        ).includes(busca)
      )
      .slice(0, 10);
  }, [clientes, buscaCliente]);

  const equipamentoResumo =
    form.equipmentType === "OUTRO"
      ? form.equipmentOther || "Outro"
      : nomesEquipamento[form.equipmentType] || form.equipmentType;

  const osBloqueada =
    ordem?.status === "ENTREGUE" ||
    ordem?.status === "CANCELADO" ||
    Boolean(ordem?.finalization);

  const statusProtegido = ["PRONTO", "ENTREGUE", "CANCELADO"].includes(
    form.status
  );

  function atualizarCampo(campo: keyof FormState, valor: string) {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  function montarPayload() {
    const base = {
      customerId: form.customerId,
      equipmentType: form.equipmentType,
      equipmentOther: form.equipmentOther,
      brand: form.brand,
      model: form.model,
      serialNumber: form.serialNumber,
      imei: form.imei,
      devicePassword: form.devicePassword,
      deliveredAccessories: form.deliveredAccessories,
      reportedDefect: form.reportedDefect,
      technicalNotes: form.technicalNotes,
      requiredParts: form.requiredParts,
      status: form.status,
      expectedDeliveryDate: form.expectedDeliveryDate,
      technicianUserId: form.technicianUserId ? form.technicianUserId : "",
    };

    if (!podeEditarValoresOperacionais) return base;

    return {
      ...base,
      partsCost: numeroFinanceiro(form.partsCost),
      laborCost: numeroFinanceiro(form.laborCost),
      discount: numeroFinanceiro(form.discount),
      totalAmount: total,
      paymentMethod: form.paymentMethod,
    };
  }

  async function carregarDados() {
    try {
      setCarregando(true);
      setMensagem("");

      const [respostaClientes, respostaOrdem, respostaTecnicos] =
        await Promise.all([
          fetch("/api/clientes", {
            cache: "no-store",
          }),
          fetch(`/api/ordens/${id}`, {
            cache: "no-store",
          }),
          fetch("/api/ordens/tecnicos", {
            cache: "no-store",
          }),
        ]);

      const dadosClientes = await respostaClientes.json().catch(() => null);
      const dadosOrdem = await respostaOrdem.json().catch(() => null);
      const dadosTecnicos = await respostaTecnicos.json().catch(() => []);

      if (!respostaClientes.ok) {
        setMensagem(dadosClientes?.message || "Erro ao carregar clientes.");
        return;
      }

      if (!respostaOrdem.ok) {
        setMensagem(dadosOrdem?.message || "Erro ao carregar ordem.");
        return;
      }

      if (respostaTecnicos.ok && Array.isArray(dadosTecnicos)) {
        setTecnicos(dadosTecnicos);
      }

      const listaClientes = Array.isArray(dadosClientes) ? dadosClientes : [];
      const clienteAtual =
        listaClientes.find(
          (cliente: Cliente) => cliente.id === dadosOrdem.customerId
        ) || dadosOrdem.customer;

      setClientes(listaClientes);
      setOrdem(dadosOrdem);

      setBuscaCliente(
        clienteAtual?.name
          ? `${clienteAtual.name}${
              clienteAtual.whatsapp ? ` - ${clienteAtual.whatsapp}` : ""
            }`
          : ""
      );

      setForm({
        customerId: dadosOrdem.customerId || "",
        equipmentType: dadosOrdem.equipmentType || "CELULAR",
        equipmentOther: dadosOrdem.equipmentOther || "",
        brand: dadosOrdem.brand || "",
        model: dadosOrdem.model || "",
        serialNumber: dadosOrdem.serialNumber || "",
        imei: dadosOrdem.imei || "",
        devicePassword: dadosOrdem.devicePassword || "",
        deliveredAccessories: dadosOrdem.deliveredAccessories || "",
        reportedDefect: dadosOrdem.reportedDefect || "",
        technicalNotes: dadosOrdem.technicalNotes || "",
        requiredParts: dadosOrdem.requiredParts || "",
        partsCost: String(dadosOrdem.partsCost ?? "0"),
        laborCost: String(dadosOrdem.laborCost ?? "0"),
        discount: String(dadosOrdem.discount ?? "0"),
        paymentMethod: dadosOrdem.paymentMethod || "AGUARDANDO_PAGAMENTO",
        status: dadosOrdem.status || "RECEBIDO",
        expectedDeliveryDate: dadosOrdem.expectedDeliveryDate
          ? dadosOrdem.expectedDeliveryDate.slice(0, 10)
          : "",
        technicianUserId: dadosOrdem.technicianUserId || "",
      });
    } catch (error) {
      setMensagem(
        error instanceof Error
          ? error.message
          : "Erro ao carregar dados da ordem."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function salvarAlteracoes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    if (!podeEditarOrdem) {
      setMensagem("Você não tem permissão para editar ordens de serviço.");
      return;
    }

    if (osBloqueada) {
      setMensagem("Esta OS não pode ser editada porque já foi entregue ou cancelada.");
      return;
    }

    if (!form.customerId) {
      setMensagem("Selecione um cliente.");
      return;
    }

    if (form.equipmentType === "OUTRO" && !form.equipmentOther.trim()) {
      setMensagem("Informe qual é o equipamento.");
      return;
    }

    if (!form.reportedDefect.trim()) {
      setMensagem("Informe o defeito relatado pelo cliente.");
      return;
    }

    try {
      setSalvando(true);

      const resposta = await fetch(`/api/ordens/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(montarPayload()),
      });

      const dados = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setMensagem(dados?.message || "Erro ao salvar alterações.");
        return;
      }

      setMensagem("Ordem atualizada com sucesso.");

      setTimeout(() => {
        router.push(`/ordens/${id}`);
      }, 600);
    } catch (error) {
      setMensagem(
        error instanceof Error
          ? error.message
          : "Erro ao salvar alterações da OS."
      );
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (!podeEditarOrdem) {
      setCarregando(false);
      return;
    }

    carregarDados();
  }, [carregandoPermissoes, podeEditarOrdem, id]);

  if (carregandoPermissoes || carregando) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
        <section className="mx-auto max-w-7xl">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            Carregando ordem...
          </div>
        </section>
      </main>
    );
  }


  if (!podeEditarOrdem) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
        <section className="mx-auto max-w-5xl space-y-5">
          <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-red-200">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">Acesso negado</p>

            <h1 className="mt-1 text-3xl font-black tracking-tight">
              Edição de OS bloqueada
            </h1>

            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Você não tem permissão para editar ordens de serviço.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/ordens/${id}`}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
              >
                Abrir detalhes
              </Link>

              <Link
                href="/ordens"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Voltar para ordens
              </Link>
            </div>
          </header>
        </section>
      </main>
    );
  }

  if (!ordem) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
        <section className="mx-auto max-w-7xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              {mensagem || "Ordem não encontrada."}
            </p>
          </div>

          <Link
            href="/ordens"
            className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
          >
            Voltar para ordens
          </Link>
        </section>
      </main>
    );
  }

  const numeroOS = formatarNumeroOS(ordem.osNumber);

  if (osBloqueada) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
        <section className="mx-auto max-w-5xl space-y-5">
          <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <p className="text-sm font-bold text-blue-600">Edição bloqueada</p>

            <h1 className="mt-1 text-3xl font-black tracking-tight">
              OS Nº {numeroOS}
            </h1>

            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Esta ordem está{" "}
              <strong>{nomesStatus[ordem.status] || ordem.status}</strong>. Para
              alterar dados, primeiro reabra a OS pela tela de detalhes.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/ordens/${id}`}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
              >
                Abrir detalhes
              </Link>

              <Link
                href="/ordens"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Voltar para ordens
              </Link>
            </div>
          </header>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">Edição de OS</p>

              <h1 className="mt-1 text-3xl font-black tracking-tight">
                Editar OS Nº {numeroOS}
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Edite dados do cliente, equipamento e diagnóstico. Status PRONTO,
                ENTREGA e CANCELAMENTO continuam nos fluxos próprios.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/ordens/${id}`}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-center text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Voltar
              </Link>

              <Link
                href="/ordens"
                className="rounded-xl bg-slate-950 px-5 py-3 text-center text-sm font-black text-white shadow-sm hover:bg-slate-800"
              >
                Ver Ordens
              </Link>
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <form
            onSubmit={salvarAlteracoes}
            className="space-y-6 rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
          >
            <Bloco
              etapa="1"
              titulo="Cliente"
              descricao="Pesquise por nome, WhatsApp ou CPF para trocar o cliente vinculado à OS."
            >
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Buscar cliente *
              </label>

              <input
                value={buscaCliente}
                onChange={(event) => {
                  setBuscaCliente(event.target.value);
                  atualizarCampo("customerId", "");
                }}
                placeholder="Digite nome, WhatsApp ou CPF"
                className={inputClass}
              />

              <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-2">
                {clientesFiltrados.length === 0 ? (
                  <div className="rounded-xl bg-white dark:bg-slate-900 p-4 text-sm font-bold text-slate-500 dark:text-slate-400">
                    Nenhum cliente encontrado.
                  </div>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {clientesFiltrados.map((cliente) => {
                      const selecionado = form.customerId === cliente.id;

                      return (
                        <button
                          key={cliente.id}
                          type="button"
                          onClick={() => {
                            atualizarCampo("customerId", cliente.id);
                            setBuscaCliente(
                              `${cliente.name}${
                                cliente.whatsapp ? ` - ${cliente.whatsapp}` : ""
                              }`
                            );
                          }}
                          className={`w-full rounded-xl px-4 py-4 text-left text-sm font-bold transition ${
                            selecionado
                              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                              : "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-300 hover:bg-blue-50"
                          }`}
                        >
                          <div className="text-base">{cliente.name}</div>

                          <div
                            className={`mt-1 text-xs ${
                              selecionado ? "text-blue-100" : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {cliente.whatsapp || "Sem WhatsApp"}
                            {cliente.cpf ? ` • CPF: ${cliente.cpf}` : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {clienteSelecionado && (
                <div className="mt-3 rounded-xl bg-green-50 p-4 text-sm font-black text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:bg-green-900/20 dark:ring-green-500/30">
                  Cliente selecionado: {clienteSelecionado.name}
                  {clienteSelecionado.whatsapp
                    ? ` - ${clienteSelecionado.whatsapp}`
                    : ""}
                </div>
              )}
            </Bloco>

            <Bloco
              etapa="2"
              titulo="Equipamento"
              descricao="Atualize identificação, senha interna, IMEI, série e previsão de entrega."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <CampoSelect
                  label="Equipamento"
                  value={form.equipmentType}
                  onChange={(valor) => atualizarCampo("equipmentType", valor)}
                >
                  {EQUIPAMENTOS.map(([valor, label]) => (
                    <option key={valor} value={valor}>
                      {label}
                    </option>
                  ))}
                </CampoSelect>

                {form.equipmentType === "OUTRO" && (
                  <CampoTexto
                    label="Qual equipamento?"
                    required
                    value={form.equipmentOther}
                    onChange={(valor) => atualizarCampo("equipmentOther", valor)}
                    placeholder="Exemplo: caixa de som, DVR, projetor..."
                  />
                )}

                <CampoTexto
                  label="Marca"
                  value={form.brand}
                  onChange={(valor) => atualizarCampo("brand", valor)}
                  placeholder="Samsung, Apple, Dell..."
                />

                <CampoTexto
                  label="Modelo"
                  value={form.model}
                  onChange={(valor) => atualizarCampo("model", valor)}
                  placeholder="Modelo do equipamento"
                />

                <CampoTexto
                  label="Número de série"
                  value={form.serialNumber}
                  onChange={(valor) => atualizarCampo("serialNumber", valor)}
                  placeholder="Número de série"
                />

                <CampoTexto
                  label="IMEI"
                  value={form.imei}
                  onChange={(valor) => atualizarCampo("imei", valor)}
                  placeholder="IMEI para celulares"
                />

                <CampoTexto
                  label="Senha do aparelho"
                  value={form.devicePassword}
                  onChange={(valor) => atualizarCampo("devicePassword", valor)}
                  placeholder="Senha, padrão, PIN ou observação"
                  help="Informação interna. Na impressão aparece mascarada como *****."
                />

                <CampoTexto
                  type="date"
                  label="Data prevista para entrega"
                  value={form.expectedDeliveryDate}
                  onChange={(valor) =>
                    atualizarCampo("expectedDeliveryDate", valor)
                  }
                />
              </div>
            </Bloco>

            <Bloco
              etapa="3"
              titulo="Descrição da OS"
              descricao="Atualize o defeito informado, acessórios, observações e peças necessárias."
            >
              <div className="grid gap-4">
                <CampoTextarea
                  label="Defeito informado pelo cliente"
                  required
                  value={form.reportedDefect}
                  onChange={(valor) => atualizarCampo("reportedDefect", valor)}
                  placeholder="Exemplo: não liga, tela quebrada, molhou..."
                  minHeight="min-h-32"
                />

                <CampoTextarea
                  label="Acessórios entregues"
                  value={form.deliveredAccessories}
                  onChange={(valor) =>
                    atualizarCampo("deliveredAccessories", valor)
                  }
                  placeholder="Carregador, fonte, mouse, bolsa..."
                />

                <CampoTextarea
                  label="Observações gerais"
                  value={form.technicalNotes}
                  onChange={(valor) => atualizarCampo("technicalNotes", valor)}
                  placeholder="Anotações internas do atendimento ou do técnico"
                  minHeight="min-h-28"
                />

                <CampoTextarea
                  label="Peças necessárias"
                  value={form.requiredParts}
                  onChange={(valor) => atualizarCampo("requiredParts", valor)}
                  placeholder="Tela, bateria, conector..."
                />
              </div>
            </Bloco>

            {podeVerValoresOperacionais && (
              <Bloco
                etapa="4"
                titulo="Valores"
                descricao={
                  podeEditarValoresOperacionais
                    ? "Editar orçamento não registra pagamento. Pagamento fica em Pagamentos ou na finalização."
                    : "Seu usuário pode visualizar valores, mas não pode alterar."
                }
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <CampoTexto
                    type="number"
                    step="0.01"
                    label="Valor das peças"
                    value={form.partsCost}
                    disabled={!podeEditarValoresOperacionais}
                    onChange={(valor) => atualizarCampo("partsCost", valor)}
                  />

                  <CampoTexto
                    type="number"
                    step="0.01"
                    label="Valor da mão de obra"
                    value={form.laborCost}
                    disabled={!podeEditarValoresOperacionais}
                    onChange={(valor) => atualizarCampo("laborCost", valor)}
                  />

                  <CampoTexto
                    type="number"
                    step="0.01"
                    label="Desconto"
                    value={form.discount}
                    disabled={!podeEditarValoresOperacionais}
                    onChange={(valor) => atualizarCampo("discount", valor)}
                  />

                  <div>
                    <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                      Valor total
                    </label>

                    <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-green-50 px-4 py-3 text-lg font-black text-green-700 dark:text-green-400">
                      {formatarMoeda(total)}
                    </div>
                  </div>

                  <CampoSelect
                    label="Forma de pagamento prevista"
                    value={form.paymentMethod}
                    disabled={!podeEditarValoresOperacionais}
                    onChange={(valor) => atualizarCampo("paymentMethod", valor)}
                  >
                    {FORMAS_PAGAMENTO.map(([valor, label]) => (
                      <option key={valor} value={valor}>
                        {label}
                      </option>
                    ))}
                  </CampoSelect>
                </div>
              </Bloco>
            )}

            <Bloco
              etapa={podeVerValoresOperacionais ? "5" : "4"}
              titulo="Status e Técnico"
              descricao="Acompanhe o andamento da ordem e atribua o técnico responsável pelo serviço."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <CampoSelect
                    label="Status atual"
                    value={form.status}
                    disabled={statusProtegido}
                    onChange={(valor) => atualizarCampo("status", valor)}
                  >
                    {statusProtegido && (
                      <option value={form.status}>
                        {nomesStatus[form.status] || form.status}
                      </option>
                    )}

                    {STATUS_EDITAVEIS.map(([valor, label]) => (
                      <option key={valor} value={valor}>
                        {label}
                      </option>
                    ))}
                  </CampoSelect>

                  {statusProtegido && (
                    <p className="mt-2 rounded-xl bg-yellow-50 p-3 text-sm font-bold text-yellow-700 dark:text-yellow-400 ring-1 ring-yellow-200 dark:bg-yellow-900/20 dark:ring-yellow-500/30">
                      Este status não pode ser alterado pela edição comum.
                    </p>
                  )}
                </div>

                <div>
                  <CampoSelect
                    label="Técnico responsável"
                    value={form.technicianUserId}
                    disabled={osBloqueada}
                    onChange={(valor) => atualizarCampo("technicianUserId", valor)}
                  >
                    <option value="">Nenhum técnico selecionado</option>
                    {tecnicos.map((tecnico) => (
                      <option key={tecnico.id} value={tecnico.id}>
                        {tecnico.name}
                        {tecnico.profitShareEnabled &&
                        Number(tecnico.profitSharePercent || 0) > 0
                          ? ` (${tecnico.profitSharePercent}% comissão)`
                          : ""}
                      </option>
                    ))}
                  </CampoSelect>
                  <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    O técnico recebe comissão calculada sobre a mão de obra/lucro deste serviço nos relatórios.
                  </p>
                </div>
              </div>
            </Bloco>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 md:flex-row">
              <button
                type="submit"
                disabled={salvando}
                className="rounded-xl bg-blue-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Salvar alterações"}
              </button>

              <Link
                href={`/ordens/${id}`}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 text-center text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Cancelar
              </Link>
            </div>
          </form>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <p className="text-sm font-bold text-blue-600">Resumo rápido</p>

              <h2 className="mt-1 text-2xl font-black tracking-tight">
                Prévia da OS
              </h2>

              <div className="mt-5 space-y-3">
                <CampoResumo titulo="Cliente">
                  {clienteSelecionado?.name ||
                    ordem.customer?.name ||
                    "Não selecionado"}
                </CampoResumo>

                <CampoResumo titulo="Equipamento">
                  {equipamentoResumo}
                </CampoResumo>

                <CampoResumo titulo="Marca / Modelo">
                  {[form.brand, form.model].filter(Boolean).join(" ") || "-"}
                </CampoResumo>

                <CampoResumo titulo="Status">
                  {nomesStatus[form.status] || form.status}
                </CampoResumo>

                <CampoResumo titulo="Técnico responsável">
                  {textoSeguro(
                    ordem.technicianResponsible || "Ainda não informado"
                  )}
                </CampoResumo>

                {podeVerValoresOperacionais && (
                  <CampoResumo titulo="Total previsto">
                    <span className="text-lg text-green-700 dark:text-green-400">
                      {formatarMoeda(total)}
                    </span>
                  </CampoResumo>
                )}
              </div>
            </section>

            <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-lg shadow-slate-950/10">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-blue-200">
                Regras protegidas
              </p>

              <div className="mt-5 space-y-4 text-sm font-semibold leading-6 text-slate-300">
                <p>1. Status PRONTO exige técnico no status rápido.</p>
                <p>2. Status ENTREGUE exige finalização da OS.</p>
                <p>3. Cancelamento exige tela própria com motivo.</p>
                <p>4. Edição de orçamento não registra pagamento.</p>
                {!podeVerValoresOperacionais && (
                  <p>5. Seu usuário não tem acesso aos valores financeiros.</p>
                )}
              </div>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}
