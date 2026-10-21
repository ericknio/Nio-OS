/**
 * @file page.tsx
 * @description Tela de Download da Versão Release do Nio-OS Desktop (`/dashboard/download`).
 * Disponibiliza aos parceiros revendedores o instalador oficial estável (.exe) para implantação
 * nos clientes finais, integrando metadados dinâmicos do GitHub Releases, instruções passo a passo
 * de ativação de licença, requisitos mínimos do sistema, notas de versão e links rápidos de compartilhamento.
 *
 * @module CloudDashboard/App/Dashboard/Download
 */

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import CopyDownloadLinkButton from "./CopyDownloadLinkButton";

export const revalidate = 300; // Revalida o cache a cada 5 minutos

/** Estrutura dos metadados da Release oficial */
interface ReleaseDetails {
  version: string;
  name: string;
  publishedAt: string;
  fileName: string;
  fileSize: string;
  downloadUrl: string;
  githubUrl: string;
  notes: string[];
}

/** Fallback robusto caso a API pública do GitHub esteja indisponível */
const DEFAULT_RELEASE: ReleaseDetails = {
  version: "0.1.4",
  name: "Nio-OS v0.1.4 — Central de Atualizações e Fechamento de Caixa Aprimorado",
  publishedAt: "06/09/2026",
  fileName: "Nio-OS.Setup.0.1.4.exe",
  fileSize: "243 MB",
  downloadUrl:
    "https://github.com/ericknio/nio-os-releases/releases/download/v0.1.4/Nio-OS.Setup.0.1.4.exe",
  githubUrl: "https://github.com/ericknio/nio-os-releases/releases/latest",
  notes: [
    "Central de Atualizações integrada para verificação e download automático de novos patches.",
    "Fechamento de caixa diário inteligente com partilha contábil e estornos automáticos.",
    "Sincronização em nuvem e renovação contínua de licenças com assinatura digital Ed25519.",
    "Cancelamento seguro de O.S. com devolução física imediata de peças ao estoque de bancada.",
    "Sistema de backup automatizado e restauração rápida de dados locais SQLite.",
  ],
};

/**
 * Consulta a última versão estável disponível no GitHub Releases.
 * 
 * @returns {Promise<ReleaseDetails>} Metadados consolidados da release oficial.
 */
async function fetchLatestRelease(): Promise<ReleaseDetails> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      "https://api.github.com/repos/ericknio/nio-os-releases/releases/latest",
      {
        headers: {
          "User-Agent": "Nio-OS-Cloud-Dashboard",
          Accept: "application/vnd.github.v3+json",
        },
        signal: controller.signal,
        next: { revalidate: 300 },
      }
    );

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const assetExe = Array.isArray(data.assets)
        ? data.assets.find(
            (a: { name?: string; browser_download_url?: string; size?: number }) =>
              String(a?.name || "").toLowerCase().endsWith(".exe")
          )
        : null;

      if (data.tag_name && assetExe) {
        const rawVersion = String(data.tag_name).replace(/^v/i, "");
        const formattedDate = data.published_at
          ? new Date(data.published_at).toLocaleDateString("pt-BR")
          : DEFAULT_RELEASE.publishedAt;

        const sizeFormatted = assetExe.size
          ? `${Math.round(assetExe.size / (1024 * 1024))} MB`
          : DEFAULT_RELEASE.fileSize;

        // Extrai linhas úteis da descrição
        const bodyLines = String(data.body || "")
          .split("\n")
          .map((l) => l.replace(/^[-*]\s+/, "").trim())
          .filter((l) => l.length > 5 && !l.startsWith("#"));

        return {
          version: rawVersion,
          name: data.name || `Nio-OS v${rawVersion}`,
          publishedAt: formattedDate,
          fileName: assetExe.name || `Nio-OS.Setup.${rawVersion}.exe`,
          fileSize: sizeFormatted,
          downloadUrl: assetExe.browser_download_url || DEFAULT_RELEASE.downloadUrl,
          githubUrl: data.html_url || DEFAULT_RELEASE.githubUrl,
          notes: bodyLines.length > 0 ? bodyLines.slice(0, 6) : DEFAULT_RELEASE.notes,
        };
      }
    }
  } catch (err) {
    console.warn("Aviso ao carregar release do GitHub, usando dados locais de fallback:", err);
  }

  return DEFAULT_RELEASE;
}

/**
 * Renderiza a tela de downloads de instaladores para revendedores.
 * 
 * @returns {Promise<JSX.Element>} Página interativa com links de download e documentação técnica.
 */
export default async function DownloadPage() {
  const session = await getSession();
  if (!session || !session.user) {
    redirect("/");
  }

  const release = await fetchLatestRelease();

  return (
    <div className="space-y-8">
      {/* 1. Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <span>Download da Versão Release</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              v{release.version}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Instalador oficial do software desktop Nio-OS para implantação em computadores de clientes.
          </p>
        </div>

        <Link
          href="/dashboard/clients/new"
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 border border-blue-500/30 rounded-xl text-xs sm:text-sm font-semibold transition shrink-0"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Cadastrar Novo Cliente
        </Link>
      </div>

      {/* 2. Hero Card Principal de Download */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0c101a] via-[#101728] to-[#0c1322] border border-blue-500/30 p-6 sm:p-8 shadow-2xl shadow-blue-950/30">
        {/* Glow de fundo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 bg-blue-500/15 rounded-full blur-3xl opacity-70"
        />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Versão Oficial Estável
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-800/80 text-gray-300 border border-gray-700/80">
                Windows 10 / 11 (64-bit)
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">
                Atualizado em {release.publishedAt}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight">
              {release.name}
            </h2>

            <p className="text-sm text-gray-300 leading-relaxed">
              Pacote de instalação completo com motor SQLite nativo, isolamento de banco de dados por
              assistência e suporte à validação online/offline de licenças com criptografia Ed25519.
            </p>

            {/* Badges de Especificações do Arquivo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="p-2.5 rounded-xl bg-gray-900/70 border border-gray-800">
                <p className="text-[11px] text-gray-500 font-medium">Nome do Pacote</p>
                <p className="text-xs font-mono font-bold text-gray-200 truncate" title={release.fileName}>
                  {release.fileName}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-gray-900/70 border border-gray-800">
                <p className="text-[11px] text-gray-500 font-medium">Tamanho Aprox.</p>
                <p className="text-xs font-bold text-emerald-400">{release.fileSize}</p>
              </div>

              <div className="p-2.5 rounded-xl bg-gray-900/70 border border-gray-800">
                <p className="text-[11px] text-gray-500 font-medium">Arquitetura</p>
                <p className="text-xs font-bold text-blue-400">x64 (Windows)</p>
              </div>

              <div className="p-2.5 rounded-xl bg-gray-900/70 border border-gray-800">
                <p className="text-[11px] text-gray-500 font-medium">Instalação</p>
                <p className="text-xs font-bold text-purple-400">Automatizada (.exe)</p>
              </div>
            </div>
          </div>

          {/* Grupo de Ações de Download */}
          <div className="flex flex-col gap-3 min-w-[280px] sm:min-w-[320px]">
            <a
              href="/api/v1/download/release"
              download={release.fileName}
              className="min-h-[56px] px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-base flex items-center justify-center gap-3 shadow-xl shadow-emerald-950/50 hover:shadow-emerald-900/60 transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 text-center"
            >
              <svg className="w-6 h-6 shrink-0 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <div className="text-left">
                <div className="leading-tight">Baixar Nio-OS Setup</div>
                <div className="text-[11px] font-normal text-emerald-100 opacity-90">
                  Executável Windows ({release.fileSize})
                </div>
              </div>
            </a>

            <CopyDownloadLinkButton
              url="/api/v1/download/release"
              label="Copiar Link Direto para WhatsApp"
            />

            <div className="text-center text-xs text-gray-400/90 py-1 flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Canal Oficial de Distribuição Segura • Link Mascarado</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Guia de Implantação Rápida para o Revendedor */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-white">
            Como implantar o sistema no cliente? (4 Passos Rápidos)
          </h3>
          <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
            Processo ágil para ativar uma nova assistência técnica em menos de 3 minutos.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-[#0c101a] border border-gray-800 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center font-black text-sm">
                1
              </div>
              <h4 className="font-bold text-white text-base">Baixar o Instalador</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                Baixe o arquivo executável (<code className="text-blue-300">.exe</code>) diretamente no computador do cliente ou transporte pelo pendrive.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-blue-400">Instalação leve e silenciosa</span>
          </div>

          <div className="p-5 rounded-2xl bg-[#0c101a] border border-gray-800 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center font-black text-sm">
                2
              </div>
              <h4 className="font-bold text-white text-base">Criar Conta no Painel</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                Acesse a aba <strong>Meus Clientes</strong>, defina o nome da loja, login e senha. Escolha entre licença mensal (consome créditos) ou teste grátis.
              </p>
            </div>
            <Link href="/dashboard/clients/new" className="text-[11px] font-semibold text-purple-400 hover:underline">
              Ir para Novo Cliente →
            </Link>
          </div>

          <div className="p-5 rounded-2xl bg-[#0c101a] border border-gray-800 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-black text-sm">
                3
              </div>
              <h4 className="font-bold text-white text-base">Conectar e Ativar</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                No Nio-OS instalado, digite o login e a senha gerados. O sistema fará a ativação imediata e a vinculação segura com o hardware da máquina.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-emerald-400">Licença assinada na hora</span>
          </div>

          <div className="p-5 rounded-2xl bg-[#0c101a] border border-gray-800 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center font-black text-sm">
                4
              </div>
              <h4 className="font-bold text-white text-base">Suporte e Renovação</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                O cliente utiliza o sistema em bancada com autonomia. Quando a licença estiver próxima do vencimento, você adiciona créditos pela sua conta.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-amber-400">Receita recorrente garantida</span>
          </div>
        </div>
      </div>

      {/* 4. O Que Há de Novo & Requisitos do Sistema */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Notas da Release */}
        <div className="p-6 rounded-2xl bg-[#0c101a] border border-gray-800 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Destaques da Versão v{release.version}</span>
            </h3>
            <span className="text-xs font-mono text-gray-500">Changelog Oficial</span>
          </div>

          <ul className="space-y-2.5">
            {release.notes.map((note, index) => (
              <li key={index} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-300">
                <span className="text-emerald-400 font-bold mt-0.5">•</span>
                <span className="leading-snug">{note}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Requisitos Mínimos Recomendados */}
        <div className="p-6 rounded-2xl bg-[#0c101a] border border-gray-800 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              <span>Requisitos Mínimos Recomendados</span>
            </h3>
            <span className="text-xs font-mono text-gray-500">Hardware & SO</span>
          </div>

          <div className="space-y-3 text-xs sm:text-sm">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-900/60 border border-gray-800">
              <span className="text-gray-400 font-medium">Sistema Operacional:</span>
              <span className="font-semibold text-white">Windows 10 (1909+) ou Windows 11</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-900/60 border border-gray-800">
              <span className="text-gray-400 font-medium">Memória RAM:</span>
              <span className="font-semibold text-white">4 GB (8 GB recomendado)</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-900/60 border border-gray-800">
              <span className="text-gray-400 font-medium">Armazenamento:</span>
              <span className="font-semibold text-white">1 GB livre em disco (SSD recomendado)</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-900/60 border border-gray-800">
              <span className="text-gray-400 font-medium">Rede / Conexão:</span>
              <span className="font-semibold text-white">Acesso à internet para ativação inicial</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. FAQ de Dúvidas Frequentes do Revendedor */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0c101a] to-[#12192c] border border-gray-800 space-y-4">
        <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Dúvidas Frequentes sobre Implantação e Licenças</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm text-gray-300">
          <div className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800/80 space-y-1">
            <p className="font-bold text-white">O cliente precisa de internet o tempo todo?</p>
            <p className="text-gray-400 leading-relaxed">
              Não. O Nio-OS possui banco SQLite local de alta performance e validação criptográfica offline. A internet é necessária apenas na primeira ativação e para sincronizações periódicas.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800/80 space-y-1">
            <p className="font-bold text-white">Como o cliente recebe atualizações futuras?</p>
            <p className="text-gray-400 leading-relaxed">
              O sistema possui a Central de Atualizações integrada. Quando uma nova versão for publicada no repositório, o próprio sistema notifica o operador e instala o patch com segurança.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800/80 space-y-1">
            <p className="font-bold text-white">Posso instalar o mesmo instalador em vários clientes?</p>
            <p className="text-gray-400 leading-relaxed">
              Sim! O executável de instalação é universal. O que diferencia cada cliente são as credenciais exclusivas (login e senha) cadastradas por você na aba Meus Clientes.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800/80 space-y-1">
            <p className="font-bold text-white">O que acontece se a licença do cliente vencer?</p>
            <p className="text-gray-400 leading-relaxed">
              O acesso às funções da assistência fica bloqueado até a renovação. Para reativar, basta entrar no painel, selecionar o cliente e adicionar os meses de licença desejados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
