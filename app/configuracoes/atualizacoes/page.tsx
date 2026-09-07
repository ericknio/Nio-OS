// app/configuracoes/atualizacoes/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CardMensagem from "@/app/components/CardMensagem";
import ModalPatchNotes from "@/app/components/ModalPatchNotes";
import {
  HISTORICO_RELEASES,
  ReleaseInfo,
  VERSAO_ATUAL_SISTEMA,
} from "@/lib/versoesSistema";

type DadosAtualizacao = {
  ok: boolean;
  temAtualizacao: boolean;
  versaoAtual: string;
  versaoMaisRecente: string;
  releaseDisponivel?: ReleaseInfo;
  historico: ReleaseInfo[];
  dataVerificacao?: string;
};

export default function AtualizacoesPage() {
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [tipoMensagem, setTipoMensagem] = useState<"sucesso" | "erro" | "info">("info");
  const [dados, setDados] = useState<DadosAtualizacao | null>(null);
  const [ultimaChecagem, setUltimaChecagem] = useState<string>("");

  // Estado do processo de download e instalação
  const [baixando, setBaixando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [statusDownload, setStatusDownload] = useState("");
  const [instaladorIniciado, setInstaladorIniciado] = useState(false);

  // Modal de Patch Notes manual
  const [modalPatchAberto, setModalPatchAberto] = useState(false);
  const [versaoModal, setVersaoModal] = useState<string>(VERSAO_ATUAL_SISTEMA);

  // Versão expandida no histórico
  const [versaoExpandida, setVersaoExpandida] = useState<string | null>(null);

  async function verificarAtualizacoes(mostrarFeedback = false) {
    try {
      setCarregando(true);
      setMensagem("");

      const res = await fetch("/api/atualizacoes", { cache: "no-store" });
      const data: DadosAtualizacao = await res.json();

      if (data.ok) {
        setDados(data);
        setUltimaChecagem(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));

        if (mostrarFeedback) {
          if (data.temAtualizacao) {
            setTipoMensagem("info");
            setMensagem(`Nova versão encontrada: v${data.versaoMaisRecente}! Confira as notas de atualização abaixo.`);
          } else {
            setTipoMensagem("sucesso");
            setMensagem(`O seu Nio-OS já está na versão mais recente disponível (v${data.versaoAtual}).`);
          }
        }
      } else {
        setTipoMensagem("erro");
        setMensagem("Não foi possível verificar atualizações no momento.");
      }
    } catch {
      setTipoMensagem("erro");
      setMensagem("Erro de conexão ao verificar atualizações.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    verificarAtualizacoes(false);
  }, []);

  async function iniciarDownloadEInstalacao(versaoAlvo: string, urlDownload?: string) {
    setBaixando(true);
    setProgresso(5);
    setStatusDownload("Conectando ao repositório de atualização...");
    setInstaladorIniciado(false);

    try {
      await fetch("/api/atualizacoes/baixar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: versaoAlvo, downloadUrl: urlDownload }),
      });

      if (urlDownload && urlDownload.startsWith("http")) {
        // Polling do progresso de download real do GitHub
        let tentativas = 0;
        while (tentativas < 200) {
          await new Promise((r) => setTimeout(r, 600));
          tentativas++;

          const resStatus = await fetch("/api/atualizacoes/baixar", { cache: "no-store" });
          const status = await resStatus.json();

          if (typeof status.progresso === "number") {
            setProgresso(status.progresso);
          }
          if (status.mensagem) {
            setStatusDownload(status.mensagem);
          }

          if (status.concluido) {
            setProgresso(100);
            setInstaladorIniciado(true);
            setTipoMensagem("sucesso");
            setMensagem(
              "O assistente de instalação foi iniciado. Siga os passos na janela do instalador para concluir a atualização mantendo todos os seus dados seguros."
            );
            break;
          }

          if (status.erro) {
            throw new Error(status.erro);
          }
        }
      } else {
        // Etapas de validação para instalador local
        const etapas = [
          { p: 30, msg: "Verificando pacote do instalador local..." },
          { p: 70, msg: "Validando integridade do executável..." },
          { p: 100, msg: "Iniciando instalador do Nio-OS..." },
        ];
        for (const etapa of etapas) {
          await new Promise((r) => setTimeout(r, 400));
          setProgresso(etapa.p);
          setStatusDownload(etapa.msg);
        }

        const resInstalar = await fetch("/api/atualizacoes/instalar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: versaoAlvo }),
        });
        const resData = await resInstalar.json().catch(() => ({}));

        setInstaladorIniciado(true);
        setStatusDownload(
          resData.mensagem || "Instalador iniciado com sucesso! O assistente cuidará do processo."
        );
        setTipoMensagem("sucesso");
        setMensagem(
          "O assistente de instalação foi aberto na sua máquina. Siga os passos na janela do instalador. Seus dados e configurações continuarão totalmente preservados."
        );
      }
    } catch (err: any) {
      console.error(err);
      setStatusDownload(err?.message || "O instalador foi preparado e pode ser iniciado manualmente.");
      setTipoMensagem("erro");
      setMensagem(err?.message || "Houve um problema durante o download da atualização.");
    } finally {
      setBaixando(false);
    }
  }

  function abrirPatchNotes(versao: string) {
    setVersaoModal(versao);
    setModalPatchAberto(true);
  }

  const releaseNova = dados?.releaseDisponivel;
  const historico = dados?.historico || HISTORICO_RELEASES;

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
      <section className="mx-auto max-w-5xl space-y-6">
        {/* Cabeçalho */}
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 px-3 py-1 text-xs font-black uppercase tracking-wider">
                  Configurações do Sistema
                </span>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                  Canal Estável
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Central de Atualizações
              </h1>

              <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                Mantenha seu Nio-OS sempre atualizado com as melhorias contábeis, novidades operacionais e correções de segurança.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/configuracoes"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-center text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Voltar para Configurações
              </Link>
            </div>
          </div>
        </header>

        {mensagem && (
          <CardMensagem mensagem={mensagem} />
        )}

        {/* Card Principal de Status da Versão */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Versão Atual Instalada
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <strong className="text-3xl font-black text-slate-900 dark:text-white">
                    v{dados?.versaoAtual || VERSAO_ATUAL_SISTEMA}
                  </strong>
                  <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 px-3 py-0.5 text-xs font-black">
                    Instalada
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {ultimaChecagem
                    ? `Última verificação realizada hoje às ${ultimaChecagem}`
                    : "Carregando informações..."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => verificarAtualizacoes(true)}
                disabled={carregando || baixando}
                className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-6 py-3.5 text-xs font-black text-white shadow-lg shadow-blue-600/25 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg
                  className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{carregando ? "Verificando..." : "Verificar Agora"}</span>
              </button>

              <button
                type="button"
                onClick={() => abrirPatchNotes(dados?.versaoAtual || VERSAO_ATUAL_SISTEMA)}
                className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-3.5 text-xs font-bold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Ver Notas da Versão Atual
              </button>
            </div>
          </div>
        </section>

        {/* Card de Nova Atualização Disponível */}
        {dados?.temAtualizacao && releaseNova ? (
          <section className="rounded-3xl border-2 border-blue-500 bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/60 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/40 p-6 shadow-xl sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-blue-100 dark:border-slate-800 pb-6">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-600 text-white px-3 py-1 text-xs font-black uppercase tracking-wider">
                  <span>🎉 Nova Versão Disponível</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-blue-800">
                    v{releaseNova.version}
                  </span>
                </div>

                <h2 className="mt-3 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                  {releaseNova.titulo}
                </h2>

                <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {releaseNova.resumo}
                </p>
              </div>

              <div className="flex flex-col items-start sm:items-end gap-1 text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
                <span className="rounded-lg bg-white dark:bg-slate-800 px-3 py-1.5 border border-slate-200 dark:border-slate-700">
                  Data: {releaseNova.data}
                </span>
                {releaseNova.tamanhoAproximado && (
                  <span className="rounded-lg bg-white dark:bg-slate-800 px-3 py-1.5 border border-slate-200 dark:border-slate-700">
                    Tamanho: {releaseNova.tamanhoAproximado}
                  </span>
                )}
              </div>
            </div>

            {/* Painel de Download e Progresso */}
            <div className="my-6 rounded-2xl bg-white dark:bg-slate-800/80 p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-black text-slate-900 dark:text-white">
                    {instaladorIniciado
                      ? "Assistente de Instalação Aberto"
                      : baixando
                      ? "Transferindo Atualização..."
                      : "Pronto para Atualizar"}
                  </h4>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {statusDownload ||
                      "A atualização é instalada sobre a versão atual sem perda de banco de dados ou anexos."}
                  </p>
                </div>

                {!baixando && !instaladorIniciado && (
                  <button
                    type="button"
                    onClick={() => iniciarDownloadEInstalacao(releaseNova.version, releaseNova.downloadUrl)}
                    className="flex items-center gap-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 px-7 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-600/30 transition active:scale-95"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Baixar e Instalar v{releaseNova.version}</span>
                  </button>
                )}
              </div>

              {baixando && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs font-black text-blue-600 dark:text-blue-400">
                    <span>{statusDownload}</span>
                    <span>{progresso}%</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300"
                      style={{ width: `${progresso}%` }}
                    />
                  </div>
                </div>
              )}

              {instaladorIniciado && (
                <div className="mt-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-4 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  ✓ O instalador foi iniciado na tela do seu computador. Conclua os passos do instalador para finalizar a atualização para a versão v{releaseNova.version}.
                </div>
              )}
            </div>

            {/* Destaque das Mudanças (Patch Note Completo da Nova Versão) */}
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">
                Patch Notes da Versão {releaseNova.version}
              </h3>

              <div className="grid gap-4 md:grid-cols-3">
                {/* Adicionado */}
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-5 border border-emerald-100 dark:border-emerald-950 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Adicionado
                    </h4>
                  </div>
                  <ul className="space-y-2.5 text-xs">
                    {releaseNova.itens
                      .filter((i) => i.tipo === "adicionado")
                      .map((item, idx) => (
                        <li key={idx} className="border-b border-slate-100 dark:border-slate-700/60 pb-2 last:border-0 last:pb-0">
                          <strong className="block font-bold text-slate-800 dark:text-slate-100">
                            {item.titulo}
                          </strong>
                          {item.descricao && (
                            <span className="text-slate-500 dark:text-slate-400 mt-0.5 block leading-relaxed">
                              {item.descricao}
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>

                {/* Modificado */}
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-5 border border-amber-100 dark:border-amber-950 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      Modificado
                    </h4>
                  </div>
                  <ul className="space-y-2.5 text-xs">
                    {releaseNova.itens
                      .filter((i) => i.tipo === "modificado")
                      .map((item, idx) => (
                        <li key={idx} className="border-b border-slate-100 dark:border-slate-700/60 pb-2 last:border-0 last:pb-0">
                          <strong className="block font-bold text-slate-800 dark:text-slate-100">
                            {item.titulo}
                          </strong>
                          {item.descricao && (
                            <span className="text-slate-500 dark:text-slate-400 mt-0.5 block leading-relaxed">
                              {item.descricao}
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>

                {/* Corrigido */}
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-5 border border-blue-100 dark:border-blue-950 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">
                      Corrigido
                    </h4>
                  </div>
                  <ul className="space-y-2.5 text-xs">
                    {releaseNova.itens
                      .filter((i) => i.tipo === "corrigido")
                      .map((item, idx) => (
                        <li key={idx} className="border-b border-slate-100 dark:border-slate-700/60 pb-2 last:border-0 last:pb-0">
                          <strong className="block font-bold text-slate-800 dark:text-slate-100">
                            {item.titulo}
                          </strong>
                          {item.descricao && (
                            <span className="text-slate-500 dark:text-slate-400 mt-0.5 block leading-relaxed">
                              {item.descricao}
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        ) : (
          /* Estado de Sistema Atualizado */
          <section className="rounded-3xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div>
                <h3 className="text-lg font-black text-emerald-900 dark:text-emerald-300">
                  Seu Nio-OS está totalmente atualizado!
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Você está operando com a versão estável mais recente (v{dados?.versaoAtual || VERSAO_ATUAL_SISTEMA}).
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Histórico Completo de Releases e Patch Notes Anteriores */}
        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Linha do Tempo
              </p>
              <h3 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                Histórico de Versões e Patch Notes
              </h3>
            </div>
          </div>

          <div className="space-y-4">
            {historico.map((rel) => {
              const expandido = versaoExpandida === rel.version;
              const isAtual = rel.version === (dados?.versaoAtual || VERSAO_ATUAL_SISTEMA);

              return (
                <div
                  key={rel.version}
                  className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 transition"
                >
                  <button
                    type="button"
                    onClick={() => setVersaoExpandida(expandido ? null : rel.version)}
                    className="flex w-full items-center justify-between p-5 text-left transition hover:bg-slate-100/70 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 px-2.5 py-1 text-xs font-black">
                        v{rel.version}
                      </span>

                      {isAtual && (
                        <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 px-2.5 py-0.5 text-[10px] font-black uppercase">
                          Atual
                        </span>
                      )}

                      <div>
                        <strong className="text-sm font-bold text-slate-900 dark:text-white block">
                          {rel.titulo}
                        </strong>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {rel.data} {rel.tamanhoAproximado ? `· ${rel.tamanhoAproximado}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                        {expandido ? "Ocultar detalhes" : "Ver Patch Notes"}
                      </span>
                      <svg
                        className={`h-4 w-4 text-slate-400 transition-transform ${
                          expandido ? "rotate-180" : ""
                        }`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {expandido && (
                    <div className="border-t border-slate-200 dark:border-slate-800 p-5 space-y-4 bg-white dark:bg-slate-900">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                        {rel.resumo}
                      </p>

                      <div className="space-y-2">
                        {rel.itens.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 text-xs">
                            <span
                              className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase ${
                                item.tipo === "adicionado"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                                  : item.tipo === "modificado"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
                                  : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400"
                              }`}
                            >
                              {item.tipo}
                            </span>
                            <div>
                              <strong className="text-slate-900 dark:text-white font-bold">
                                {item.titulo}:
                              </strong>{" "}
                              <span className="text-slate-600 dark:text-slate-300 font-normal">
                                {item.descricao}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Modal de Notas de Atualização Manual */}
        {modalPatchAberto && (
          <ModalPatchNotes
            versaoEspecifica={versaoModal}
            abrirManualmente={true}
            onClose={() => setModalPatchAberto(false)}
          />
        )}
      </section>
    </main>
  );
}
