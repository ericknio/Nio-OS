"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";

type Cliente = {
  id: string;
  name: string;
  cpf?: string | null;
  whatsapp?: string | null;
  secondaryPhone?: string | null;
  email?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  createdAt?: string | null;
};

type FiltroRapido = "todos" | "whatsapp" | "email" | "semContato";

import CardMensagem from "@/app/components/CardMensagem";
import { formatarData, normalizarTexto } from "@/lib/formatadores";
import { inputClass } from "@/lib/uiConstantes";

function textoSeguro(valor?: string | number | null) {
  const texto = String(valor ?? "").trim();
  return texto || "-";
}

function montarEndereco(cliente: Cliente) {
  const ruaNumero = [cliente.address, cliente.number].filter(Boolean).join(", ");
  const complemento = cliente.complement ? ` - ${cliente.complement}` : "";
  const bairroCidade = [cliente.district, cliente.city, cliente.state]
    .filter(Boolean)
    .join(" - ");

  return [ruaNumero + complemento, bairroCidade]
    .filter((item) => item.trim())
    .join(" | ") || "-";
}

function temContato(cliente: Cliente) {
  return Boolean(cliente.whatsapp || cliente.secondaryPhone || cliente.email);
}

function CardIndicador({
  titulo,
  valor,
  detalhe,
  ativo = false,
  onClick,
  destaque = "slate",
}: {
  titulo: string;
  valor: number;
  detalhe?: string;
  ativo?: boolean;
  onClick?: () => void;
  destaque?: "slate" | "blue" | "green" | "red";
}) {
  const cor =
    destaque === "green"
      ? "text-green-700 dark:text-green-400"
      : destaque === "blue"
        ? "text-blue-700 dark:text-blue-400"
        : destaque === "red"
          ? "text-red-700 dark:text-red-400"
          : "text-slate-950 dark:text-slate-100";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl bg-white dark:bg-slate-900 p-5 text-left shadow-sm ring-1 transition hover:bg-blue-50 ${
        ativo ? "ring-2 ring-blue-500" : "ring-slate-200 dark:ring-slate-800"
      }`}
    >
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{titulo}</p>

      <strong className={`mt-2 block text-4xl ${cor}`}>{valor}</strong>

      {detalhe && (
        <p className="mt-2 text-xs font-bold text-slate-400">{detalhe}</p>
      )}
    </button>
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

export default function ClientesPage() {
  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeVerClientes = !carregandoPermissoes && tem("clientes.ver");
  const podeVerDashboard = !carregandoPermissoes && tem("dashboard.ver");
  const podeCriarCliente = !carregandoPermissoes && tem("clientes.criar");
  const podeEditarCliente = !carregandoPermissoes && tem("clientes.editar");
  const podeExcluirCliente = !carregandoPermissoes && tem("clientes.excluir");

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>("todos");
  const [carregando, setCarregando] = useState(true);
  const [excluindoId, setExcluindoId] = useState("");
  const [mensagem, setMensagem] = useState("");

  const indicadores = useMemo(() => {
    return {
      total: clientes.length,
      comWhatsapp: clientes.filter((cliente) => cliente.whatsapp).length,
      comEmail: clientes.filter((cliente) => cliente.email).length,
      semContato: clientes.filter((cliente) => !temContato(cliente)).length,
    };
  }, [clientes]);

  const clientesFiltrados = useMemo(() => {
    const termo = normalizarTexto(busca);

    return clientes.filter((cliente) => {
      if (filtroRapido === "whatsapp" && !cliente.whatsapp) return false;
      if (filtroRapido === "email" && !cliente.email) return false;
      if (filtroRapido === "semContato" && temContato(cliente)) return false;

      if (!termo) return true;

      const alvo = [
        cliente.name,
        cliente.cpf,
        cliente.whatsapp,
        cliente.secondaryPhone,
        cliente.email,
        cliente.address,
        cliente.number,
        cliente.complement,
        cliente.district,
        cliente.city,
        cliente.state,
      ]
        .map(normalizarTexto)
        .join(" ");

      return alvo.includes(termo);
    });
  }, [clientes, busca, filtroRapido]);

  async function carregarClientes() {
    if (!podeVerClientes) {
      setClientes([]);
      setCarregando(false);
      return;
    }

    try {
      setCarregando(true);
      setMensagem("");

      const response = await fetch("/api/clientes", {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar clientes.");
        setClientes([]);
        return;
      }

      setClientes(Array.isArray(data) ? data : []);
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao carregar clientes."
      );
      setClientes([]);
    } finally {
      setCarregando(false);
    }
  }

  async function excluirCliente(cliente: Cliente) {
    const confirmou = window.confirm(
      `Tem certeza que deseja excluir o cliente "${cliente.name}"? Essa ação não pode ser desfeita.`
    );

    if (!confirmou) return;

    try {
      setMensagem("");
      setExcluindoId(cliente.id);

      const response = await fetch(`/api/clientes/${cliente.id}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao excluir cliente.");
        return;
      }

      setMensagem("Cliente excluído com sucesso.");
      await carregarClientes();
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao excluir cliente."
      );
    } finally {
      setExcluindoId("");
    }
  }

  function limparFiltros() {
    setBusca("");
    setFiltroRapido("todos");
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (podeVerClientes) {
      carregarClientes();
      return;
    }

    setClientes([]);
    setCarregando(false);
  }, [carregandoPermissoes, podeVerClientes]);

  if (carregandoPermissoes || carregando) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Verificando acesso aos clientes...
        </section>
      </main>
    );
  }

  if (!podeVerClientes) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-red-200">
          <p className="text-sm font-bold text-red-700 dark:text-red-400">
            Você não tem permissão para acessar clientes.
          </p>

          {podeVerDashboard && (
            <Link
              href="/"
              className="mt-4 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
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
              <p className="text-sm font-bold text-blue-600">
                Clientes & atendimento
              </p>

              <h1 className="text-3xl font-black tracking-tight">Clientes</h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Consulte clientes, encontre contatos rapidamente e acesse o
                histórico de atendimento.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {podeVerDashboard && (
                <Link
                  href="/"
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                >
                  Início
                </Link>
              )}

              {podeCriarCliente && (
                <Link
                  href="/clientes/novo"
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                >
                  + Novo Cliente
                </Link>
              )}
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section className="grid gap-4 md:grid-cols-4">
          <CardIndicador
            titulo="Total de clientes"
            valor={indicadores.total}
            detalhe="Todos os cadastros"
            ativo={filtroRapido === "todos"}
            onClick={() => setFiltroRapido("todos")}
          />

          <CardIndicador
            titulo="Com WhatsApp"
            valor={indicadores.comWhatsapp}
            detalhe="Contato rápido"
            destaque="green"
            ativo={filtroRapido === "whatsapp"}
            onClick={() => setFiltroRapido("whatsapp")}
          />

          <CardIndicador
            titulo="Com e-mail"
            valor={indicadores.comEmail}
            detalhe="Cadastro com e-mail"
            destaque="blue"
            ativo={filtroRapido === "email"}
            onClick={() => setFiltroRapido("email")}
          />

          <CardIndicador
            titulo="Sem contato"
            valor={indicadores.semContato}
            detalhe="Atenção no cadastro"
            destaque="red"
            ativo={filtroRapido === "semContato"}
            onClick={() => setFiltroRapido("semContato")}
          />
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black">Busca de clientes</h2>

              <p className="text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Pesquise por nome, CPF, WhatsApp, telefone, e-mail, endereço,
                bairro ou cidade.
              </p>
            </div>

            <button
              type="button"
              onClick={carregarClientes}
              disabled={carregando}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {carregando ? "Atualizando..." : "Atualizar"}
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <input
              value={busca}
              disabled={carregando}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Exemplo: Kito, 719..., CPF, e-mail, bairro ou cidade..."
              className={inputClass}
            />

            <button
              type="button"
              onClick={limparFiltros}
              disabled={carregando}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Limpar
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black">Lista de clientes</h2>

              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {clientesFiltrados.length} cliente(s) encontrado(s).
              </p>
            </div>

            {podeCriarCliente && (
              <Link
                href="/clientes/novo"
                className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
              >
                Novo cliente
              </Link>
            )}
          </div>

          {carregando ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
              Carregando clientes...
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center">
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                Nenhum cliente encontrado.
              </p>

              {podeCriarCliente && (
                <Link
                  href="/clientes/novo"
                  className="mt-4 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
                >
                  Cadastrar cliente
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {clientesFiltrados.map((cliente) => {
                const semContatoCliente = !temContato(cliente);

                return (
                  <article
                    key={cliente.id}
                    className={`rounded-2xl border p-4 transition hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 ${
                      semContatoCliente
                        ? "border-red-200 bg-red-50/40"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    }`}
                  >
                    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr_1.2fr_130px_auto] xl:items-center">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Cliente
                        </p>

                        <Link
                          href={`/clientes/${cliente.id}`}
                          className="mt-1 block text-lg font-black text-blue-700 dark:text-blue-400 hover:underline"
                        >
                          {cliente.name}
                        </Link>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          CPF: {textoSeguro(cliente.cpf)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Contato
                        </p>

                        <p
                          className={`mt-1 text-sm font-black ${
                            semContatoCliente ? "text-red-700 dark:text-red-400" : "text-slate-900 dark:text-white"
                          }`}
                        >
                          WhatsApp: {textoSeguro(cliente.whatsapp)}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          Tel: {textoSeguro(cliente.secondaryPhone)}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          E-mail: {textoSeguro(cliente.email)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Endereço
                        </p>

                        <p className="mt-1 text-sm font-bold leading-6 text-slate-700 dark:text-slate-200">
                          {montarEndereco(cliente)}
                        </p>
                      </div>

                      <CampoResumo titulo="Cadastro">
                        {formatarData(cliente.createdAt)}
                      </CampoResumo>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Link
                          href={`/clientes/${cliente.id}`}
                          className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white hover:bg-blue-700"
                        >
                          Abrir
                        </Link>

                        {podeEditarCliente && (
                          <Link
                            href={`/clientes/${cliente.id}`}
                            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
                          >
                            Editar
                          </Link>
                        )}

                        {podeExcluirCliente && (
                          <button
                            type="button"
                            onClick={() => excluirCliente(cliente)}
                            disabled={excluindoId === cliente.id}
                            className="rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {excluindoId === cliente.id
                              ? "Excluindo..."
                              : "Excluir"}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}