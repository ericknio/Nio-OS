export function formatarMoeda(valor: unknown): string {
  const numero = Number(valor ?? 0);
  const seguro = Number.isFinite(numero) ? numero : 0;

  return seguro.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export const moeda = formatarMoeda;

export function numeroFinanceiro(valor: unknown): number {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(numero, 0) : 0;
}

export function numeroSeguro(valor: unknown): number {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

export function inteiro(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

export function formatarDataHora(data?: string | null | Date): string {
  if (!data) return "-";

  const d = typeof data === "string" ? new Date(data) : data;
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("pt-BR");
}

export function formatarData(data?: string | null | Date): string {
  if (!data) return "-";

  const d = typeof data === "string" ? new Date(data) : data;
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("pt-BR");
}

export function formatarNumeroOS(valor: unknown): string {
  const numero = Number(valor);

  if (Number.isFinite(numero) && numero > 0) {
    return String(Math.trunc(numero)).padStart(3, "0");
  }

  const texto = String(valor || "").trim();
  return texto || "---";
}

export function formatarNumeroVenda(valor: unknown): string {
  const numero = Number(valor);

  if (Number.isFinite(numero) && numero > 0) {
    return String(Math.trunc(numero)).padStart(4, "0");
  }

  const texto = String(valor || "").trim();
  return texto || "---";
}

export function somenteNumeros(valor: unknown): string {
  return String(valor || "").replace(/\D/g, "");
}

export function normalizarTexto(valor: unknown): string {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function emailValido(email: string): boolean {
  if (!email.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function usernameValido(username: string): boolean {
  return /^[a-z0-9._-]{3,30}$/.test(username.trim().toLowerCase());
}

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