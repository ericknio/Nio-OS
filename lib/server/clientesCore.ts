import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DadosClienteNormalizados = {
  name: string;
  cpf: string | null;
  birthDate: Date | null;
  whatsapp: string | null;
  secondaryPhone: string | null;
  email: string | null;
  zipCode: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
};

export const clienteSelect = {
  id: true,
  name: true,
  cpf: true,
  birthDate: true,
  whatsapp: true,
  secondaryPhone: true,
  email: true,
  zipCode: true,
  address: true,
  number: true,
  complement: true,
  district: true,
  city: true,
  state: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.CustomerSelect;

export const ordemClienteSelect = {
  id: true,
  osNumber: true,
  equipmentType: true,
  equipmentOther: true,
  brand: true,
  model: true,
  status: true,
  totalAmount: true,
  openedAt: true,
} satisfies Prisma.ServiceOrderSelect;

function limparTexto(valor: unknown) {
  const texto = String(valor || "").trim();
  return texto || null;
}

export function somenteNumeros(valor: unknown) {
  const numeros = String(valor || "").replace(/\D/g, "");
  return numeros || null;
}

function limparEmail(valor: unknown) {
  const email = String(valor || "").trim().toLowerCase();
  return email || null;
}

function normalizarEstado(valor: unknown) {
  const estado = String(valor || "").trim().toUpperCase();
  return estado || null;
}

function emailValido(email: string | null) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function converterData(valor: unknown) {
  const texto = String(valor || "").trim();

  if (!texto) {
    return {
      data: null,
      erro: "",
    };
  }

  const data =
    texto.length === 10 ? new Date(`${texto}T00:00:00`) : new Date(texto);

  if (Number.isNaN(data.getTime())) {
    return {
      data: null,
      erro: "Informe uma data de nascimento válida.",
    };
  }

  return {
    data,
    erro: "",
  };
}

export function prepararDadosCliente(body: unknown):
  | {
      ok: true;
      data: DadosClienteNormalizados;
    }
  | {
      ok: false;
      message: string;
      status: number;
    } {
  const entrada =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const nascimento = converterData(entrada.birthDate);

  if (nascimento.erro) {
    return {
      ok: false,
      message: nascimento.erro,
      status: 400,
    };
  }

  const data: DadosClienteNormalizados = {
    name: String(entrada.name || "").trim(),
    cpf: somenteNumeros(entrada.cpf),
    birthDate: nascimento.data,
    whatsapp: somenteNumeros(entrada.whatsapp),
    secondaryPhone: somenteNumeros(entrada.secondaryPhone),
    email: limparEmail(entrada.email),
    zipCode: somenteNumeros(entrada.zipCode),
    address: limparTexto(entrada.address),
    number: limparTexto(entrada.number),
    complement: limparTexto(entrada.complement),
    district: limparTexto(entrada.district),
    city: limparTexto(entrada.city),
    state: normalizarEstado(entrada.state),
    notes: limparTexto(entrada.notes),
  };

  if (!data.name) {
    return {
      ok: false,
      message: "O nome do cliente é obrigatório.",
      status: 400,
    };
  }

  if (!emailValido(data.email)) {
    return {
      ok: false,
      message: "Informe um e-mail válido.",
      status: 400,
    };
  }

  if (data.state && data.state.length !== 2) {
    return {
      ok: false,
      message: "Use apenas a sigla do estado. Exemplo: BA.",
      status: 400,
    };
  }

  return {
    ok: true,
    data,
  };
}

export async function verificarDuplicidadeCliente({
  cpf,
  whatsapp,
  email,
  ignorarClienteId,
}: {
  cpf?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  ignorarClienteId?: string;
}) {
  const OR: Prisma.CustomerWhereInput[] = [];

  if (cpf) OR.push({ cpf });
  if (whatsapp) OR.push({ whatsapp });
  if (email) OR.push({ email });

  if (OR.length === 0) return null;

  const duplicado = await prisma.customer.findFirst({
    where: {
      ...(ignorarClienteId ? { id: { not: ignorarClienteId } } : {}),
      OR,
    },
    select: {
      id: true,
      name: true,
      cpf: true,
      whatsapp: true,
      email: true,
    },
  });

  if (!duplicado) return null;

  const prefixo = ignorarClienteId ? "outro cliente" : "cliente";

  if (cpf && duplicado.cpf === cpf) {
    return `Já existe ${prefixo} cadastrado com este CPF: ${duplicado.name}.`;
  }

  if (whatsapp && duplicado.whatsapp === whatsapp) {
    return `Já existe ${prefixo} cadastrado com este WhatsApp: ${duplicado.name}.`;
  }

  if (email && duplicado.email === email) {
    return `Já existe ${prefixo} cadastrado com este e-mail: ${duplicado.name}.`;
  }

  return `Já existe ${prefixo} cadastrado com esses dados.`;
}