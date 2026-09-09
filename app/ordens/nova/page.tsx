/**
 * @file app/ordens/nova/page.tsx
 * @description Tela de Abertura de Nova Ordem de Serviço (Frontend).
 * 
 * Funcionalidades:
 * - Seleção de cliente cadastrado ou modal de criação rápida de cliente.
 * - Dados do aparelho: Tipo de equipamento, marca, modelo, número de série, IMEI, senha e acessórios entregues.
 * - Registro do defeito relatado pelo cliente e notas técnicas preliminares.
 * - Seleção de peças técnicas com reserva imediata no estoque (`PecasNovaOS`).
 * - Cálculo automático do valor total: (Peças + Mão de obra - Desconto).
 * - Seleção do técnico responsável e pré-visualização de comissão.
 * - Envio dos dados via POST para `/api/ordens`.
 */

"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUsuarioPermissoes } from "@/app/Permissao";
import PecasNovaOS, { type PecaNovaOSSelecionada } from "./PecasNovaOS";

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

const STATUS_INICIAIS = [
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

import CardMensagem from "@/app/components/CardMensagem";
import {
  moeda,
  numeroFinanceiro,
  normalizarTexto,
} from "@/lib/formatadores";
import { inputClass, textareaClass } from "@/lib/uiConstantes";

const nomesEquipamento = Object.fromEntries(EQUIPAMENTOS);
const nomesStatus = Object.fromEntries(STATUS_INICIAIS);

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
    <section className="border-t border-slate-100 dark:border-slate-800/80 pt-6 first:border-t-0 first:pt-0">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-extrabold text-white shadow-sm shadow-blue-500/25">
          {etapa}
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{titulo}</h3>
          {descricao && (
            <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
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

      {help && <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{help}</p>}
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
 * Componente da Tela de Abertura de Nova Ordem de Serviço.
 * 
 * Gerencia os dados do formulário de entrada, validação de campos obrigatórios,
 * seleção e alocação de peças técnicas, e envio para a API de criação.
 */
export default function NovaOrdemPage() {
  const router = useRouter();
  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeVerValoresOperacionais = !carregandoPermissoes;
  const podeEditarValoresOperacionais = !carregandoPermissoes;

  const podeCriarCliente = !carregandoPermissoes && tem("clientes.criar");

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [carregandoClientes, setCarregandoClientes] = useState(true);
  const [pecasTecnicas, setPecasTecnicas] = useState<PecaNovaOSSelecionada[]>([]);

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

  const totalPecasTecnicas = useMemo(
    () =>
      pecasTecnicas.reduce(
        (soma, item) => soma + item.defaultSalePrice * item.quantity,
        0,
      ),
    [pecasTecnicas],
  );

  const total = useMemo(() => {
    return Math.max(
      totalPecasTecnicas +
        numeroFinanceiro(form.laborCost) -
        numeroFinanceiro(form.discount),
      0
    );
  }, [totalPecasTecnicas, form.laborCost, form.discount]);

  const equipamentoResumo =
    form.equipmentType === "OUTRO"
      ? form.equipmentOther || "Outro"
      : nomesEquipamento[form.equipmentType] || form.equipmentType;

  function atualizarCampo(campo: keyof FormState, valor: string) {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }
  function extrairMarcaEModelo(peca: PecaNovaOSSelecionada) {
    let marca = peca.brand?.trim() || "";
    let modelo = peca.compatibleModel?.trim() || "";
    const nome = peca.name.trim();

    if (!marca && nome) {
      const nomeLower = nome.toLowerCase();
      if (nomeLower.includes("iphone") || nomeLower.includes("ipad") || nomeLower.includes("apple")) {
        marca = "Apple";
      } else if (nomeLower.includes("samsung") || nomeLower.includes("galaxy")) {
        marca = "Samsung";
      } else if (nomeLower.includes("motorola") || nomeLower.includes("moto ")) {
        marca = "Motorola";
      } else if (nomeLower.includes("xiaomi") || nomeLower.includes("redmi") || nomeLower.includes("poco")) {
        marca = "Xiaomi";
      } else if (nomeLower.includes("realme")) {
        marca = "Realme";
      } else if (nomeLower.includes("lg")) {
        marca = "LG";
      } else if (nomeLower.includes("asus") || nomeLower.includes("zenfone")) {
        marca = "Asus";
      } else if (nomeLower.includes("huawei")) {
        marca = "Huawei";
      } else if (nomeLower.includes("dell")) {
        marca = "Dell";
      } else if (nomeLower.includes("lenovo")) {
        marca = "Lenovo";
      } else if (nomeLower.includes("acer")) {
        marca = "Acer";
      } else if (nomeLower.includes("hp")) {
        marca = "HP";
      } else if (nomeLower.includes("positivo")) {
        marca = "Positivo";
      } else if (nomeLower.includes("multilaser")) {
        marca = "Multilaser";
      }
    }

    if (!modelo && nome) {
      const limpo = nome
        .replace(/^(tela\s+frontal|tela\s+display|tela|display|frontal|touch\s+screen|touch|conector\s+de\s+carga|conector\s+carga|conector|bateria|tampa\s+traseira|carcaça|alto\s+falante|auricular|câmera\s+traseira|câmera\s+frontal|câmera|flex\s+power|flex\s+volume|flex|vidro)\s+(com\s+aro\s+|sem\s+aro\s+|original\s+|incell\s+|oled\s+)?/i, "")
        .trim();

      if (limpo && limpo.length > 2) {
        modelo = limpo;
      }
    }

    return { marca, modelo };
  }

  function aplicarDadosDaPeca(peca: PecaNovaOSSelecionada) {
    const { marca, modelo } = extrairMarcaEModelo(peca);

    setForm((atual) => {
      let pecasNecessarias = atual.requiredParts?.trim() || "";
      if (peca.name) {
        if (!pecasNecessarias) {
          pecasNecessarias = peca.name;
        } else if (
          !pecasNecessarias.toLowerCase().includes(peca.name.toLowerCase())
        ) {
          pecasNecessarias = `${pecasNecessarias}, ${peca.name}`;
        }
      }

      return {
        ...atual,
        brand: marca || atual.brand,
        model: modelo || atual.model,
        requiredParts: pecasNecessarias,
      };
    });
  }


  function limparFormulario() {
    setForm(FORM_INICIAL);
    setPecasTecnicas([]);
    setMensagem("");
    setBuscaCliente("");
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
      technicianUserId: form.technicianUserId ? form.technicianUserId : null,
    };

    if (!podeEditarValoresOperacionais) return base;

    return {
      ...base,
      partsCost: 0,
      technicalParts: pecasTecnicas.map((item) => ({
        technicalPartId: item.id,
        technicalPartVersion: item.version,
        quantity: item.quantity,
      })),
      laborCost: numeroFinanceiro(form.laborCost),
      discount: numeroFinanceiro(form.discount),
      totalAmount: total,
      paymentMethod: form.paymentMethod,
    };
  }

  async function carregarClientes() {
    try {
      setCarregandoClientes(true);
      setMensagem("");

      const resposta = await fetch("/api/clientes", {
        cache: "no-store",
      });

      const dados = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setMensagem(dados?.message || "Erro ao carregar clientes.");
        return;
      }

      setClientes(Array.isArray(dados) ? dados : []);
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao carregar clientes."
      );
    } finally {
      setCarregandoClientes(false);
    }
  }

  async function carregarTecnicos() {
    try {
      const resposta = await fetch("/api/ordens/tecnicos", {
        cache: "no-store",
      });
      const dados = await resposta.json().catch(() => []);
      if (resposta.ok && Array.isArray(dados)) {
        setTecnicos(dados);
      }
    } catch {
      // silencioso
    }
  }

  async function salvarOrdem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    if (!form.customerId) {
      setMensagem("Selecione um cliente para continuar.");
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

      const resposta = await fetch("/api/ordens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(montarPayload()),
      });

      const dados = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        if (dados?.orderCreated && dados?.id) {
          const numeroParcial = String(dados?.osNumber || "").padStart(3, "0");
          setMensagem(
            `${dados?.message || "A OS foi criada, mas as peças precisam ser revisadas."} OS Nº ${numeroParcial}.`,
          );
          window.setTimeout(() => {
            router.push(`/ordens/${dados.id}`);
          }, 900);
          return;
        }

        setMensagem(dados?.message || "Erro ao criar ordem de serviço.");
        return;
      }

      const numeroOS = String(dados?.osNumber || "").padStart(3, "0");

      setMensagem(`OS Nº ${numeroOS} criada com sucesso.`);

      setTimeout(() => {
        router.push(`/ordens/${dados.id}`);
      }, 500);
    } catch (error) {
      setMensagem(
        error instanceof Error
          ? error.message
          : "Erro ao criar ordem de serviço."
      );
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    carregarClientes();
    carregarTecnicos();
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">Atendimento</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">
                Nova Ordem de Serviço
              </h1>
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Cadastre cliente, equipamento e defeito informado. O técnico e a
                entrega serão registrados depois, no fluxo da própria OS.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {podeCriarCliente && (
                <Link
                  href="/clientes/novo"
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                >
                  + Novo Cliente
                </Link>
              )}

              <Link
                href="/ordens"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Ver Ordens
              </Link>
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <form
            onSubmit={salvarOrdem}
            className="space-y-6 rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
          >
            <Bloco
              etapa="1"
              titulo="Cliente"
              descricao="Busque pelo nome, WhatsApp ou CPF. Para pessoas com pouco costume de computador, este é o primeiro passo obrigatório."
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
                {carregandoClientes ? (
                  <div className="rounded-xl bg-white dark:bg-slate-900 p-4 text-sm font-bold text-slate-500 dark:text-slate-400">
                    Carregando clientes...
                  </div>
                ) : clientesFiltrados.length === 0 ? (
                  <div className="rounded-xl bg-white dark:bg-slate-900 p-4 text-sm font-bold text-slate-500 dark:text-slate-400">
                    Nenhum cliente encontrado.
                    {podeCriarCliente && (
                      <Link
                        href="/clientes/novo"
                        className="ml-1 font-black text-blue-600 hover:underline"
                      >
                        Criar novo cliente
                      </Link>
                    )}
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
              descricao="Busque a peça no estoque técnico para auto-preencher marca e modelo, ou informe os dados do aparelho manualmente."
            >
              {podeVerValoresOperacionais && (
                <div className="mb-6">
                  <PecasNovaOS
                    itens={pecasTecnicas}
                    onChange={setPecasTecnicas}
                    onSelecionarPeca={aplicarDadosDaPeca}
                    disabled={!podeEditarValoresOperacionais || salvando}
                  />
                </div>
              )}

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
              descricao="Descreva o que o cliente informou. Este é o campo mais importante para evitar dúvidas depois."
            >
              <div className="grid gap-4">
                <CampoTextarea
                  label="Acessórios entregues"
                  value={form.deliveredAccessories}
                  onChange={(valor) =>
                    atualizarCampo("deliveredAccessories", valor)
                  }
                  placeholder="Carregador, fonte, mouse, bolsa..."
                />

                <CampoTextarea
                  label="Defeito informado pelo cliente"
                  required
                  value={form.reportedDefect}
                  onChange={(valor) => atualizarCampo("reportedDefect", valor)}
                  placeholder="Exemplo: não liga, tela quebrada, molhou..."
                  minHeight="min-h-32"
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
                titulo="Valores / Orçamento"
                descricao={
                  podeEditarValoresOperacionais
                    ? "Resumo financeiro da OS: peças aplicadas, mão de obra, desconto e forma de pagamento."
                    : "Seu usuário pode visualizar valores, mas não pode alterar."
                }
              >
                {pecasTecnicas.length > 0 && (
                  <div className="mb-5 rounded-2xl border border-blue-200/70 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                    <p className="text-xs font-black uppercase tracking-wide text-blue-800 dark:text-blue-300 mb-2">
                      Peças selecionadas ({pecasTecnicas.length}):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {pecasTecnicas.map((item) => (
                        <span
                          key={item.id}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <span>
                            {item.quantity}x {item.name}
                          </span>
                          <span className="font-black text-emerald-600 dark:text-emerald-400">
                            ({moeda(item.defaultSalePrice * item.quantity)})
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                      Valor das peças
                    </label>
                    <div className="rounded-xl border border-blue-500/20 dark:border-blue-500/30 bg-blue-50/80 dark:bg-blue-950/40 px-4 py-3 text-lg font-black text-blue-700 dark:text-blue-300">
                      {moeda(totalPecasTecnicas)}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Calculado automaticamente pelas peças selecionadas no bloco de Equipamento.
                    </p>
                  </div>

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
                    <div className="rounded-xl border border-emerald-500/20 dark:border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/40 px-4 py-3 text-lg font-black text-emerald-700 dark:text-emerald-300">
                      {moeda(total)}
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
              titulo="Status inicial e Atribuição"
              descricao="Defina o status inicial e, opcionalmente, atribua o técnico responsável que receberá a comissão pelo serviço."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <CampoSelect
                  label="Status inicial"
                  value={form.status}
                  onChange={(valor) => atualizarCampo("status", valor)}
                >
                  {STATUS_INICIAIS.map(([valor, label]) => (
                    <option key={valor} value={valor}>
                      {label}
                    </option>
                  ))}
                </CampoSelect>

                <div>
                  <CampoSelect
                    label="Técnico responsável (Opcional)"
                    value={form.technicianUserId}
                    onChange={(valor) => atualizarCampo("technicianUserId", valor)}
                  >
                    <option value="">Nenhum técnico atribuído</option>
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
                    O técnico receberá comissão com base no percentual cadastrado. Pode ser alterado depois.
                  </p>
                </div>
              </div>
            </Bloco>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 dark:border-slate-800/80 pt-6">
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
                <span>{salvando ? "Salvando OS..." : "Salvar Ordem de Serviço"}</span>
              </button>

              <button
                type="button"
                onClick={limparFormulario}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 px-5 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              >
                Limpar
              </button>

              <Link
                href="/ordens"
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 px-5 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              >
                Cancelar
              </Link>
            </div>
          </form>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-2xl bg-white dark:bg-slate-900/90 p-6 shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-800">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">Resumo da Ordem</h3>
              </div>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Prévia da OS
              </h2>

              <div className="mt-5 space-y-3">
                <CampoResumo titulo="Cliente">
                  {clienteSelecionado?.name || "Não selecionado"}
                </CampoResumo>

                <CampoResumo titulo="Equipamento">
                  {equipamentoResumo}
                </CampoResumo>

                <CampoResumo titulo="Marca / Modelo">
                  {[form.brand, form.model].filter(Boolean).join(" ") || "-"}
                </CampoResumo>

                <CampoResumo titulo="Status inicial">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 ring-slate-300 dark:ring-slate-700">
                    {nomesStatus[form.status] || form.status}
                  </span>
                </CampoResumo>

                {podeVerValoresOperacionais && (
                  <>
                    <CampoResumo titulo="Peças técnicas">
                      {pecasTecnicas.length > 0
                        ? `${pecasTecnicas.length} item(ns) • ${moeda(totalPecasTecnicas)}`
                        : "Nenhuma selecionada"}
                    </CampoResumo>

                    <CampoResumo titulo="Total previsto">
                      <strong className="text-xl font-black text-emerald-600 dark:text-emerald-400 block">{moeda(total)}</strong>
                    </CampoResumo>
                  </>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-white shadow-md ring-1 ring-white/10">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-blue-400">
                Guia de Fluxo
              </p>

              <div className="mt-4 space-y-3 text-xs font-medium leading-relaxed text-slate-300">
                <p>1. Cadastre a OS como recebida ou em análise.</p>
                <p>2. Quando o serviço ficar pronto, registre o técnico.</p>
                <p>3. Ao entregar, finalize e registre quem entregou.</p>
                <p>4. A finalização quita o pagamento automaticamente.</p>

                {!podeVerValoresOperacionais && (
                  <p className="rounded-xl bg-white/10 p-3 text-xs font-medium text-slate-300">
                    Seu usuário não tem acesso aos valores financeiros.
                  </p>
                )}
              </div>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}
