/**
 * @file formatadores.ts
 * @description Funções utilitárias universais para formatação, sanitização e validação
 * de dados no Nio-OS. Utilizadas em telas de Ordens de Serviço, PDV, relatórios e APIs.
 */

/**
 * Formata um valor numérico qualquer para o padrão monetário brasileiro (BRL).
 * Trata valores nulos, indefinidos ou caracteres não numéricos retornando "R$ 0,00".
 *
 * @param valor - Quantia a ser formatada (número, string ou desconhecido)
 * @returns String formatada em Real Brasileiro (ex: "R$ 150,00")
 * @example
 * formatarMoeda(150) // "R$ 150,00"
 * formatarMoeda(null) // "R$ 0,00"
 */
export function formatarMoeda(valor: unknown): string {
  const numero = Number(valor ?? 0);
  const seguro = Number.isFinite(numero) ? numero : 0;

  return seguro.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Apelido curto para a função formatarMoeda.
 */
export const moeda = formatarMoeda;

/**
 * Converte um valor desconhecido para um número financeiro estritamente positivo (>= 0).
 * Impede valores negativos acidentais e trata `NaN` retornando 0.
 *
 * @param valor - Valor de entrada
 * @returns Número finito não negativo
 */
export function numeroFinanceiro(valor: unknown): number {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(numero, 0) : 0;
}

/**
 * Converte com segurança um valor desconhecido para número.
 * Se o valor for inválido, nulo ou `NaN`, retorna 0.
 *
 * @param valor - Valor a ser convertido
 * @returns Número finito garantido
 */
export function numeroSeguro(valor: unknown): number {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Converte um valor para número inteiro não negativo (truncado).
 * Utilizado para contagens de estoque, quantidades de itens e IDs numéricos.
 *
 * @param valor - Valor a ser convertido
 * @returns Número inteiro >= 0
 * @example
 * inteiro(3.8) // 3
 * inteiro(-5) // 0
 */
export function inteiro(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

/**
 * Formata uma data/hora no padrão local brasileiro (dd/mm/aaaa hh:mm:ss).
 *
 * @param data - String ISO, objeto Date ou nulo/indefinido
 * @returns Data e hora formatadas ou "-" se data for inválida
 */
export function formatarDataHora(data?: string | null | Date): string {
  if (!data) return "-";

  const d = typeof data === "string" ? new Date(data) : data;
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("pt-BR");
}

/**
 * Formata apenas a data no padrão local brasileiro (dd/mm/aaaa).
 *
 * @param data - String ISO, objeto Date ou nulo/indefinido
 * @returns Data formatada ou "-" se data for inválida
 */
export function formatarData(data?: string | null | Date): string {
  if (!data) return "-";

  const d = typeof data === "string" ? new Date(data) : data;
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("pt-BR");
}

/**
 * Formata o número sequencial de uma Ordem de Serviço com preenchimento de zeros à esquerda (ex: 001, 042).
 *
 * @param valor - Número da O.S. (numérico ou string)
 * @returns String formatada com no mínimo 3 dígitos (ex: "001") ou "---" se indefinido
 */
export function formatarNumeroOS(valor: unknown): string {
  const numero = Number(valor);

  if (Number.isFinite(numero) && numero > 0) {
    return String(Math.trunc(numero)).padStart(3, "0");
  }

  const texto = String(valor || "").trim();
  return texto || "---";
}

/**
 * Formata o número sequencial de uma Venda do PDV com preenchimento de zeros à esquerda (ex: 0001, 0123).
 *
 * @param valor - Número da venda
 * @returns String formatada com no mínimo 4 dígitos (ex: "0001") ou "---" se indefinido
 */
export function formatarNumeroVenda(valor: unknown): string {
  const numero = Number(valor);

  if (Number.isFinite(numero) && numero > 0) {
    return String(Math.trunc(numero)).padStart(4, "0");
  }

  const texto = String(valor || "").trim();
  return texto || "---";
}

/**
 * Remove qualquer caractere que não seja dígito numérico (0-9).
 * Essencial para sanitizar CPFs, CNPJs, CEPs e números de telefone/WhatsApp antes de salvar no banco.
 *
 * @param valor - String com pontuações ou máscaras
 * @returns String contendo apenas os dígitos
 * @example
 * somenteNumeros("(11) 98765-4321") // "11987654321"
 */
export function somenteNumeros(valor: unknown): string {
  return String(valor || "").replace(/\D/g, "");
}

/**
 * Normaliza uma string convertendo para minúsculas e removendo acentos gráficos.
 * Utilizada para buscas inteligentes e filtros insensíveis a acentos.
 *
 * @param valor - Texto de entrada
 * @returns Texto em minúsculas e sem acentuação
 * @example
 * normalizarTexto("São Paulo - Manutenção") // "sao paulo - manutencao"
 */
export function normalizarTexto(valor: unknown): string {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Valida o formato básico de um endereço de e-mail.
 * Permite string vazia como válida caso o e-mail seja opcional no formulário.
 *
 * @param email - Endereço de e-mail a validar
 * @returns true se válido ou vazio, false se tiver formato inválido
 */
export function emailValido(email: string): boolean {
  if (!email.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Valida o nome de usuário (login) do sistema.
 * Deve conter de 3 a 30 caracteres alfanuméricos, pontos, underscores ou hífens.
 *
 * @param username - Nome de usuário
 * @returns true se compatível com o padrão de login
 */
export function usernameValido(username: string): boolean {
  return /^[a-z0-9._-]{3,30}$/.test(username.trim().toLowerCase());
}

/**
 * Identifica se uma mensagem de retorno de API/Operação representa sucesso
 * para exibir a cor verde no CardMensagem da interface.
 *
 * @param mensagem - Texto de resposta ou status
 * @returns true se indicar sucesso, false para alerta/erro
 */
export function mensagemEhSucesso(mensagem: string): boolean {
  const texto = String(mensagem || "").toLowerCase();
  return (
    texto.includes("sucesso") ||
    texto.includes("criada") ||
    texto.includes("atualizada") ||
    texto.includes("salvo") ||
    texto.includes("salva") ||
    texto.includes("restaurado") ||
    texto.includes("finalizada")
  );
}