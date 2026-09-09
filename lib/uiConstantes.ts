/**
 * @file uiConstantes.ts
 * @description Dicionários de termos, badges de status e classes visuais compartilhadas
 * na interface do usuário do Nio-OS (Next.js + TailwindCSS).
 */

/**
 * Mapeamento dos códigos internos de status da Ordem de Serviço para rótulos legíveis em português.
 */
export const nomesStatus: Record<string, string> = {
  RECEBIDO: "Recebido",
  EM_ANALISE: "Em análise",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  AGUARDANDO_PECA: "Aguardando peça",
  EM_REPARO: "Em reparo",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
  SEM_CONSERTO: "Sem conserto",
};

/**
 * Mapeamento das formas de pagamento aceitas pelo sistema para exibição visual.
 */
export const nomesPagamento: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  CARTAO_DEBITO: "Cartão de débito",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO: "Cartão",
  PARCELADO: "Parcelado",
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  ISENTO: "Isento",
};

/**
 * Mapeamento dos cargos/perfis de usuários do sistema.
 */
export const nomesCargo: Record<string, string> = {
  ADMIN: "Administrador",
  ATENDENTE: "Atendente",
  TECNICO: "Técnico",
  FINANCEIRO: "Financeiro",
};

/**
 * Mapeamento da situação cadastral de operadores do sistema.
 */
export const nomesStatusUsuario: Record<string, string> = {
  ATIVO: "Ativo",
  INATIVO: "Inativo",
  BLOQUEADO: "Bloqueado",
};

/**
 * Retorna as classes Tailwind para estilização de badges coloridos de acordo com o status da O.S.
 * Suporta modo claro e modo escuro (Dark Mode).
 *
 * @param status - Código do status da O.S. (ex: "ENTREGUE", "PRONTO", "CANCELADO")
 * @returns Classes CSS do Tailwind (cores de fundo, texto e anel)
 */
export function classeStatus(status?: string | null): string {
  const s = String(status || "").toUpperCase();

  if (s === "ENTREGUE") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30";
  }

  if (s === "PRONTO") {
    return "bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-blue-500/30";
  }

  if (s === "EM_REPARO") {
    return "bg-purple-500/10 text-purple-700 dark:text-purple-300 ring-purple-500/30";
  }

  if (s === "AGUARDANDO_PECA" || s === "AGUARDANDO_APROVACAO") {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30";
  }

  if (s === "EM_ANALISE") {
    return "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30";
  }

  if (s === "CANCELADO" || s === "SEM_CONSERTO") {
    return "bg-red-500/10 text-red-700 dark:text-red-300 ring-red-500/30";
  }

  // RECEBIDO / padrão
  return "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/30";
}

/**
 * Retorna as classes Tailwind para estilização de badges de status de usuários do sistema.
 *
 * @param status - Situação do usuário ("ATIVO", "BLOQUEADO", "INATIVO")
 * @returns Classes CSS do Tailwind
 */
export function classeStatusUsuario(status?: string | null): string {
  const s = String(status || "").toUpperCase();

  if (s === "ATIVO") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30";
  }

  if (s === "BLOQUEADO") {
    return "bg-red-500/10 text-red-700 dark:text-red-300 ring-red-500/30";
  }

  return "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30";
}

/**
 * Estilização padrão e unificada de inputs textuais para formulários do sistema.
 */
export const inputClass =
  "w-full rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-400 dark:disabled:text-slate-500";

/**
 * Estilização padrão de caixas de texto com múltiplas linhas (textarea).
 */
export const textareaClass =
  "w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-400 dark:disabled:text-slate-500";
