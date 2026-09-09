/**
 * @file app/clientes/[id]/page.tsx
 * @description Tela de Detalhes, Histórico de O.S. e Edição do Cliente (Frontend).
 * 
 * Funcionalidades:
 * - Painel 360° do cliente: dados cadastrais, endereço e observações internas de atendimento.
 * - Indicadores analíticos do cliente (total de ordens, em aberto, finalizadas e canceladas).
 * - Histórico completo de Ordens de Serviço contratadas pelo cliente ao longo do tempo.
 * - Edição de dados cadastrais com validação e salvamento via PUT `/api/clientes/${id}`.
 * - Ação de exclusão segura com tratamento de dependências de O.S. vinculadas.
 */

"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUsuarioPermissoes } from "@/app/Permissao";
import CardMensagem from "@/app/components/CardMensagem";
import {
  formatarNumeroOS,
  formatarMoeda,
  formatarData,
  somenteNumeros,
} from "@/lib/formatadores";
import {
  nomesStatus,
  classeStatus,
  inputClass,
  textareaClass,
} from "@/lib/uiConstantes";

type OrdemCliente = {
  id: string;
  osNumber?: number | string | null;
  equipmentType?: string | null;
  equipmentOther?: string | null;
  brand?: string | null;
  model?: string | null;
  status?: string | null;
  totalAmount?: number | string | null;
  openedAt?: string | null;
};

type Cliente = {
  id: string;
  name: string;
  cpf?: string | null;
  birthDate?: string | null;
  whatsapp?: string | null;
  secondaryPhone?: string | null;
  email?: string | null;
  zipCode?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  orders?: OrdemCliente[];
};

type FormState = {
  name: string;
  cpf: string;
  birthDate: string;
  whatsapp: string;
  secondaryPhone: string;
  email: string;
  zipCode: string;
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  notes: string;
};

const nomesEquipamento: Record<string, string> = {
  NOTEBOOK: "Notebook",
  COMPUTADOR: "Computador",
  CELULAR: "Celular",
  TABLET: "Tablet",
  VIDEOGAME: "Videogame",
  IMPRESSORA: "Impressora",
  TV: "TV",
  OUTRO: "Outro",
};

function textoSeguro(valor?: string | number | null) {
  const texto = String(valor ?? "").trim();
  return texto || "-";
}

function formatarDataInput(data?: string | null) {
  if (!data) return "";

  const d = new Date(data);

  if (Number.isNaN(d.getTime())) return "";

  return d.toISOString().slice(0, 10);
}

function montarWhatsApp(numero?: string | null) {
  let limpo = somenteNumeros(numero);

  if (!limpo) return "";

  limpo = limpo.replace(/^0+/, "");

  if (limpo.startsWith("55")) return limpo;

  if (limpo.length === 10 || limpo.length === 11) {
    return `55${limpo}`;
  }

  return limpo;
}

function nomeEquipamento(ordem: OrdemCliente) {
  if (ordem.equipmentType === "OUTRO" && ordem.equipmentOther) {
    return ordem.equipmentOther;
  }

  return nomesEquipamento[ordem.equipmentType || ""] || ordem.equipmentType || "-";
}

function montarEndereco(cliente: Cliente | FormState) {
  const ruaNumero = [cliente.address, cliente.number].filter(Boolean).join(", ");
  const complemento = cliente.complement ? ` - ${cliente.complement}` : "";
  const bairroCidade = [cliente.district, cliente.city, cliente.state]
    .filter(Boolean)
    .join(" - ");

  return [ruaNumero + complemento, bairroCidade]
    .filter((item) => item.trim())
    .join(" | ") || "-";
}


function CampoTexto({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  type?: "text" | "date" | "email";
  required?: boolean;
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
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}

function CampoArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        className={textareaClass}
      />
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
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {titulo}
      </p>

      <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{children}</div>
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

function CardIndicador({
  titulo,
  valor,
  destaque = "slate",
}: {
  titulo: string;
  valor: number;
  destaque?: "blue" | "green" | "red" | "slate";
}) {
  const cor =
    destaque === "blue"
      ? "text-blue-700 dark:text-blue-400"
      : destaque === "green"
        ? "text-green-700 dark:text-green-400"
        : destaque === "red"
          ? "text-red-700 dark:text-red-400"
          : "text-slate-950 dark:text-slate-100";

  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{titulo}</p>
      <strong className={`mt-1 block text-3xl ${cor}`}>{valor}</strong>
    </div>
  );
}

/**
 * Componente principal da Tela de Detalhes e Edição do Cliente.
 * 
 * Gerencia a consulta do perfil do cliente, cálculo das métricas de histórico de O.S.,
 * formulário de alteração de cadastro e ações de exclusão segura.
 */
export default function ClienteDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeVerCliente = !carregandoPermissoes && tem("clientes.ver");
  const podeEditarCliente = !carregandoPermissoes && tem("clientes.editar");
  const podeExcluirCliente = !carregandoPermissoes && tem("clientes.excluir");
  const podeCriarOrdem = !carregandoPermissoes && tem("ordens.criar");
  const podeVerOrdens = !carregandoPermissoes && tem("ordens.ver");

  const podeVerFinanceiro =
    !carregandoPermissoes &&
    tem(["pagamentos.ver", "pagamentos.registrar", "relatorios.financeiro"]);

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    cpf: "",
    birthDate: "",
    whatsapp: "",
    secondaryPhone: "",
    email: "",
    zipCode: "",
    address: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    notes: "",
  });

  const [editando, setEditando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const ordensCliente = cliente?.orders || [];

  const resumoOrdens = useMemo(() => {
    return {
      total: ordensCliente.length,
      abertas: ordensCliente.filter(
        (ordem) => !["ENTREGUE", "CANCELADO"].includes(String(ordem.status || ""))
      ).length,
      prontas: ordensCliente.filter((ordem) => ordem.status === "PRONTO").length,
      entregues: ordensCliente.filter((ordem) => ordem.status === "ENTREGUE")
        .length,
    };
  }, [ordensCliente]);

  const whatsappLink = cliente?.whatsapp
    ? `https://wa.me/${montarWhatsApp(cliente.whatsapp)}`
    : "";

  const clienteTemOrdens = resumoOrdens.total > 0;

  function atualizarCampo(campo: keyof FormState, valor: string) {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));

    setMensagem("");
  }

  function preencherFormulario(data: Cliente) {
    setForm({
      name: data.name || "",
      cpf: somenteNumeros(data.cpf),
      birthDate: formatarDataInput(data.birthDate),
      whatsapp: somenteNumeros(data.whatsapp),
      secondaryPhone: somenteNumeros(data.secondaryPhone),
      email: data.email || "",
      zipCode: somenteNumeros(data.zipCode),
      address: data.address || "",
      number: data.number || "",
      complement: data.complement || "",
      district: data.district || "",
      city: data.city || "",
      state: data.state || "",
      notes: data.notes || "",
    });
  }

  function montarPayload() {
    return {
      name: form.name.trim(),
      cpf: somenteNumeros(form.cpf),
      birthDate: form.birthDate,
      whatsapp: somenteNumeros(form.whatsapp),
      secondaryPhone: somenteNumeros(form.secondaryPhone),
      email: form.email.trim().toLowerCase(),
      zipCode: somenteNumeros(form.zipCode),
      address: form.address.trim(),
      number: form.number.trim(),
      complement: form.complement.trim(),
      district: form.district.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      notes: form.notes.trim(),
    };
  }

  async function carregarCliente() {
    try {
      setCarregando(true);
      setMensagem("");

      const response = await fetch(`/api/clientes/${id}`, {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar cliente.");
        setCliente(null);
        return;
      }

      setCliente(data);
      preencherFormulario(data);
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao carregar cliente."
      );
      setCliente(null);
    } finally {
      setCarregando(false);
    }
  }

  async function salvarCliente(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    if (!podeEditarCliente) {
      setMensagem("Você não tem permissão para editar clientes.");
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

      const response = await fetch(`/api/clientes/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(montarPayload()),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao atualizar cliente.");
        return;
      }

      const clienteAtualizado: Cliente = {
        ...data,
        orders: cliente?.orders || [],
      };

      setCliente(clienteAtualizado);
      preencherFormulario(clienteAtualizado);
      setEditando(false);
      setMensagem("Cliente atualizado com sucesso.");
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao atualizar cliente."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function excluirCliente() {
    setMensagem("");

    if (!podeExcluirCliente) {
      setMensagem("Você não tem permissão para excluir clientes.");
      return;
    }

    if (clienteTemOrdens) {
      setMensagem(
        `Este cliente possui ${resumoOrdens.total} OS vinculada(s). Por segurança, ele não pode ser excluído.`
      );
      return;
    }

    const confirmou = window.confirm(
      "Tem certeza que deseja excluir este cliente? Essa ação não pode ser desfeita."
    );

    if (!confirmou) return;

    try {
      setExcluindo(true);

      const response = await fetch(`/api/clientes/${id}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao excluir cliente.");
        return;
      }

      router.push("/clientes");
      router.refresh();
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao excluir cliente."
      );
    } finally {
      setExcluindo(false);
    }
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (!podeVerCliente) {
      setCliente(null);
      setCarregando(false);
      return;
    }

    carregarCliente();
  }, [carregandoPermissoes, podeVerCliente, id]);

  useEffect(() => {
    if (!podeEditarCliente && editando) {
      setEditando(false);
    }
  }, [podeEditarCliente, editando]);

  if (carregandoPermissoes || carregando) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-6xl">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            {carregandoPermissoes
              ? "Verificando permissões..."
              : "Carregando cliente..."}
          </div>
        </section>
      </main>
    );
  }

  if (!podeVerCliente) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-6xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
            Você não tem permissão para acessar clientes.
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

  if (!cliente) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-6xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              {mensagem || "Cliente não encontrado."}
            </p>
          </div>

          <Link
            href="/clientes"
            className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
          >
            Voltar para clientes
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">
                Cliente cadastrado
              </p>

              <h1 className="text-3xl font-black tracking-tight">
                {cliente.name}
              </h1>

              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Cadastro em {formatarData(cliente.createdAt)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/clientes"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Voltar
              </Link>

              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-green-600 px-5 py-3 text-sm font-black text-white hover:bg-green-700"
                >
                  WhatsApp
                </a>
              )}

              {podeCriarOrdem && (
                <Link
                  href="/ordens/nova"
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                >
                  + Nova OS
                </Link>
              )}

              {podeEditarCliente && (
                <button
                  type="button"
                  onClick={() => {
                    if (editando) preencherFormulario(cliente);
                    setEditando((valor) => !valor);
                    setMensagem("");
                  }}
                  className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white hover:bg-orange-600"
                >
                  {editando ? "Cancelar edição" : "Editar"}
                </button>
              )}

              {podeExcluirCliente &&
                (clienteTemOrdens ? (
                  <span className="rounded-xl bg-slate-100 dark:bg-slate-800 px-5 py-3 text-sm font-black text-slate-500 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-800">
                    Cliente com OS
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={excluirCliente}
                    disabled={excluindo}
                    className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {excluindo ? "Excluindo..." : "Excluir"}
                  </button>
                ))}
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        {!editando ? (
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-6">
              <p className="text-sm font-bold text-blue-600">Dados</p>

              <h2 className="text-2xl font-black tracking-tight">
                Informações do cliente
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <LinhaInfo titulo="Nome">{cliente.name}</LinhaInfo>
              <LinhaInfo titulo="CPF">{textoSeguro(cliente.cpf)}</LinhaInfo>

              <LinhaInfo titulo="Nascimento">
                {formatarData(cliente.birthDate)}
              </LinhaInfo>

              <LinhaInfo titulo="WhatsApp">
                {textoSeguro(cliente.whatsapp)}
              </LinhaInfo>

              <LinhaInfo titulo="Telefone">
                {textoSeguro(cliente.secondaryPhone)}
              </LinhaInfo>

              <LinhaInfo titulo="E-mail">{textoSeguro(cliente.email)}</LinhaInfo>
              <LinhaInfo titulo="CEP">{textoSeguro(cliente.zipCode)}</LinhaInfo>
              <LinhaInfo titulo="Bairro">{textoSeguro(cliente.district)}</LinhaInfo>
              <LinhaInfo titulo="Cidade">{textoSeguro(cliente.city)}</LinhaInfo>
              <LinhaInfo titulo="Estado">{textoSeguro(cliente.state)}</LinhaInfo>

              <div className="md:col-span-2">
                <LinhaInfo titulo="Endereço completo">
                  {montarEndereco(cliente)}
                </LinhaInfo>
              </div>

              <div className="md:col-span-2">
                <LinhaInfo titulo="Observações">
                  {textoSeguro(cliente.notes)}
                </LinhaInfo>
              </div>
            </div>
          </section>
        ) : (
          <form
            onSubmit={salvarCliente}
            className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
          >
            <div className="mb-6">
              <p className="text-sm font-bold text-blue-600">Edição</p>

              <h2 className="text-2xl font-black tracking-tight">
                Editar cliente
              </h2>

              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                CPF, WhatsApp, telefone e CEP são salvos apenas com números.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <CampoTexto
                label="Nome"
                required
                value={form.name}
                onChange={(valor) => atualizarCampo("name", valor)}
                placeholder="Nome completo"
              />

              <CampoTexto
                label="CPF"
                value={form.cpf}
                onChange={(valor) => atualizarCampo("cpf", somenteNumeros(valor))}
                placeholder="CPF"
              />

              <CampoTexto
                label="Nascimento"
                type="date"
                value={form.birthDate}
                onChange={(valor) => atualizarCampo("birthDate", valor)}
              />

              <CampoTexto
                label="WhatsApp"
                value={form.whatsapp}
                onChange={(valor) =>
                  atualizarCampo("whatsapp", somenteNumeros(valor))
                }
                placeholder="71999999999"
              />

              <CampoTexto
                label="Telefone"
                value={form.secondaryPhone}
                onChange={(valor) =>
                  atualizarCampo("secondaryPhone", somenteNumeros(valor))
                }
                placeholder="Telefone secundário"
              />

              <CampoTexto
                label="E-mail"
                type="email"
                value={form.email}
                onChange={(valor) =>
                  atualizarCampo("email", valor.trim().toLowerCase())
                }
                placeholder="email@exemplo.com"
              />

              <CampoTexto
                label="CEP"
                value={form.zipCode}
                onChange={(valor) => atualizarCampo("zipCode", somenteNumeros(valor))}
                placeholder="CEP"
              />

              <CampoTexto
                label="Endereço"
                value={form.address}
                onChange={(valor) => atualizarCampo("address", valor)}
                placeholder="Rua / Avenida"
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
              />

              <CampoTexto
                label="Estado"
                value={form.state}
                onChange={(valor) =>
                  atualizarCampo("state", valor.toUpperCase().slice(0, 2))
                }
                placeholder="BA"
              />

              <div className="md:col-span-2">
                <CampoArea
                  label="Observações"
                  value={form.notes}
                  onChange={(valor) => atualizarCampo("notes", valor)}
                  placeholder="Observações internas sobre o cliente..."
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 md:flex-row md:justify-end">
              <button
                type="button"
                onClick={() => {
                  preencherFormulario(cliente);
                  setEditando(false);
                  setMensagem("");
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={salvando}
                className="rounded-xl bg-blue-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>
        )}

        {podeVerOrdens && (
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-blue-600">
                  Histórico operacional
                </p>

                <h2 className="text-2xl font-black tracking-tight">
                  Ordens do cliente
                </h2>

                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                  {resumoOrdens.total} ordem(ns) vinculada(s) a este cliente.
                </p>
              </div>

              {podeCriarOrdem && (
                <Link
                  href="/ordens/nova"
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                >
                  + Nova OS
                </Link>
              )}
            </div>

            <div className="mb-5 grid gap-4 md:grid-cols-4">
              <CardIndicador titulo="Total de OS" valor={resumoOrdens.total} />
              <CardIndicador
                titulo="Abertas"
                valor={resumoOrdens.abertas}
                destaque="blue"
              />
              <CardIndicador
                titulo="Prontas"
                valor={resumoOrdens.prontas}
                destaque="blue"
              />
              <CardIndicador
                titulo="Entregues"
                valor={resumoOrdens.entregues}
                destaque="green"
              />
            </div>

            {ordensCliente.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 text-center">
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                  Nenhuma ordem cadastrada para este cliente ainda.
                </p>

                {podeCriarOrdem && (
                  <Link
                    href="/ordens/nova"
                    className="mt-4 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
                  >
                    Criar primeira OS
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {ordensCliente.map((ordem) => {
                  const numeroOS = formatarNumeroOS(ordem.osNumber);
                  const equipamento = nomeEquipamento(ordem);
                  const marcaModelo =
                    [ordem.brand, ordem.model].filter(Boolean).join(" ") || "-";

                  return (
                    <article
                      key={ordem.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                    >
                      <div className="grid gap-4 lg:grid-cols-[120px_1fr_180px_130px_auto] lg:items-center">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            OS
                          </p>

                          <Link
                            href={`/ordens/${ordem.id}`}
                            className="mt-1 block text-xl font-black text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            Nº {numeroOS}
                          </Link>
                        </div>

                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Equipamento
                          </p>

                          <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                            {equipamento}
                          </p>

                          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                            {marcaModelo}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Status
                          </p>

                          <span
                            className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${classeStatus(
                              ordem.status
                            )}`}
                          >
                            {nomesStatus[ordem.status || ""] ||
                              ordem.status ||
                              "-"}
                          </span>
                        </div>

                        {podeVerFinanceiro ? (
                          <CampoResumo titulo="Total">
                            {formatarMoeda(ordem.totalAmount)}
                          </CampoResumo>
                        ) : (
                          <CampoResumo titulo="Entrada">
                            {formatarData(ordem.openedAt)}
                          </CampoResumo>
                        )}

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Link
                            href={`/ordens/${ordem.id}`}
                            className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white hover:bg-blue-700"
                          >
                            Abrir OS
                          </Link>
                        </div>
                      </div>

                      {podeVerFinanceiro && (
                        <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                          Entrada: {formatarData(ordem.openedAt)}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}