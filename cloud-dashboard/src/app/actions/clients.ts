/**
 * @file clients.ts
 * @description Server Actions para gerenciamento de clientes comerciais (`CommercialAccount`) e licenças (`Entitlement`).
 *
 * Regras de Negócio e Segurança:
 * 1. Isolamento por Perfil (Multi-Tenancy):
 *    - Usuários com perfil `RESELLER` só podem visualizar, alterar ou estender licenças de seus próprios clientes vinculados.
 *    - Usuários com perfil `MASTER` têm privilégios globais irrestritos.
 * 2. Gestão de Créditos de Revenda:
 *    - A criação de licenças e adição de meses desconta créditos da conta do revendedor de forma atômica e condicional (`gte`).
 *    - Licenças do tipo Trial (1 dia) não consomem créditos.
 * 3. Hashing de Senhas: As senhas dos clientes comerciais são cifradas com `bcryptjs` antes de persistidas.
 */

"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/**
 * Server Action para cadastrar um novo cliente comercial e emitir sua licença inicial.
 *
 * @param prevState - Estado anterior retornado pelo form action
 * @param formData - Dados do formulário contendo name, login, password, isTrial e months
 * @returns Objeto com mensagem de erro ou redireciona para a lista de clientes
 */
export async function createClientAction(prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Não autorizado" };

  const name = String(formData.get("name") || "").trim();
  const login = String(formData.get("login") || formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const isTrial = formData.get("isTrial") === "true";
  const months = isTrial ? 0 : (parseInt(formData.get("months") as string, 10) || 1);

  if (!name || !login || !password) {
    return { error: "Todos os campos são obrigatórios" };
  }

  if (login.length < 3) {
    return { error: "O login deve ter pelo menos 3 caracteres." };
  }

  if (!isTrial && months <= 0) {
    return { error: "A quantidade de meses deve ser maior que zero." };
  }

  // Verifica os créditos do revendedor/master
  const user = await prisma.adminUser.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "Usuário não encontrado" };

  if (!isTrial && user.credits < months) {
    return { error: `Você não tem créditos suficientes. Créditos atuais: ${user.credits}` };
  }

  const existingClient = await prisma.commercialAccount.findUnique({ where: { email: login } });
  if (existingClient) {
    return { error: "Este login já está em uso." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Calcula a validade
  const expiresAt = new Date();
  if (isTrial) {
    expiresAt.setDate(expiresAt.getDate() + 1); // 1 dia de trial
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + months);
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Só desconta crédito se não for trial
      if (!isTrial) {
        const updateResult = await tx.adminUser.updateMany({
          where: { 
            id: user.id,
            credits: { gte: months }
          },
          data: { credits: { decrement: months } }
        });

        if (updateResult.count === 0) {
          throw new Error("INSUFFICIENT_CREDITS");
        }
      }

      await tx.commercialAccount.create({
        data: {
          name,
          email: login,
          passwordHash,
          resellerId: user.id,
          status: "ACTIVE",
          entitlement: {
            create: {
              source: isTrial ? "TRIAL" : "MANUAL",
              status: "ACTIVE",
              plan: isTrial ? "TRIAL" : "STANDARD",
              features: {},
              startsAt: new Date(),
              expiresAt
            }
          }
        }
      });
    });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "";
    if (message === "INSUFFICIENT_CREDITS") {
      return { error: "Erro de concorrência ou créditos insuficientes no momento da transação." };
    }
    return { error: "Erro ao criar cliente" };
  }

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard");
  redirect("/dashboard/clients");
}

/**
 * Server Action para exclusão definitiva de um cliente comercial e suas licenças associadas.
 * Revendedores só podem excluir clientes pertencentes à sua própria carteira.
 *
 * @param clientId - Identificador UUID da conta comercial a ser excluída
 * @returns Objeto com status de sucesso ou mensagem de erro
 */
export async function deleteClientAction(clientId: string) {
  const session = await getSession();
  if (!session) return { error: "Não autorizado" };

  try {
    const client = await prisma.commercialAccount.findUnique({ where: { id: clientId } });
    if (!client) return { error: "Cliente não encontrado" };

    if (session.user.role === "RESELLER" && client.resellerId !== session.user.id) {
      return { error: "Acesso negado." };
    }

    await prisma.commercialAccount.delete({
      where: { id: clientId }
    });

    revalidatePath("/dashboard/clients");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error(err);
    return { error: "Erro ao excluir cliente" };
  }
}

/**
 * Server Action para alteração da data de expiração da licença do cliente.
 *
 * Ações Suportadas:
 * - `ADD_MONTHS`: Adiciona meses à validade atual, descontando créditos da conta do revendedor.
 * - `REMOVE_MONTHS`: Reduz meses da validade (exclusivo para perfil `MASTER`).
 * - `SET_DATE`: Define uma data absoluta no calendário (exclusivo para perfil `MASTER`).
 *
 * @param clientId - Identificador da conta comercial
 * @param payload - Objeto com a ação (`ADD_MONTHS`, `REMOVE_MONTHS` ou `SET_DATE`) e o valor correspondente
 * @returns Objeto com a nova data calculada ou mensagem de erro
 */
export async function updateClientLicenseAction(
  clientId: string,
  payload: { action: "ADD_MONTHS" | "REMOVE_MONTHS" | "SET_DATE", value: string | number }
) {
  const session = await getSession();
  if (!session) return { error: "Não autorizado" };
  const user = session.user;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.commercialAccount.findUnique({
        where: { id: clientId },
        include: { entitlement: true }
      });
      if (!client) throw new Error("CLIENT_NOT_FOUND");
      if (user.role === "RESELLER" && client.resellerId !== user.id) throw new Error("ACCESS_DENIED");
      
      const entitlement = client.entitlement;
      if (!entitlement) throw new Error("ENTITLEMENT_NOT_FOUND");

      const currentExpiresAt = new Date(entitlement.expiresAt);
      let newExpiresAt = new Date(currentExpiresAt);
      let monthsToCharge = 0;

      if (payload.action === "ADD_MONTHS") {
        const months = Number(payload.value);
        if (months <= 0 || !Number.isInteger(months)) throw new Error("INVALID_VALUE");
        newExpiresAt.setMonth(newExpiresAt.getMonth() + months);
        monthsToCharge = months;
      } else if (payload.action === "REMOVE_MONTHS") {
        if (user.role !== "MASTER") {
          throw new Error("ACCESS_DENIED");
        }
        const months = Number(payload.value);
        if (months <= 0 || !Number.isInteger(months)) throw new Error("INVALID_VALUE");
        newExpiresAt.setMonth(newExpiresAt.getMonth() - months);
      } else if (payload.action === "SET_DATE") {
        if (user.role !== "MASTER") {
          throw new Error("ACCESS_DENIED");
        }
        const newDate = new Date(payload.value as string);
        if (isNaN(newDate.getTime())) throw new Error("INVALID_DATE");
        newExpiresAt = newDate;
      }

      // Descontar créditos do revendedor (se aplicável e se for ADD)
      if (monthsToCharge > 0 && user.role === "RESELLER") {
        const updateResult = await tx.adminUser.updateMany({
          where: { 
            id: user.id,
            credits: { gte: monthsToCharge }
          },
          data: { credits: { decrement: monthsToCharge } }
        });

        if (updateResult.count === 0) {
          throw new Error("INSUFFICIENT_CREDITS");
        }
      }

      await tx.entitlement.update({
        where: { id: entitlement.id },
        data: { expiresAt: newExpiresAt }
      });

      return { success: true, newDate: newExpiresAt };
    });

    revalidatePath(`/dashboard/clients/${clientId}`);
    revalidatePath("/dashboard/clients");
    revalidatePath("/dashboard");
    return result;
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "";
    if (message === "INSUFFICIENT_CREDITS") return { error: "Você não tem créditos suficientes." };
    if (message === "CLIENT_NOT_FOUND") return { error: "Cliente não encontrado." };
    if (message === "ACCESS_DENIED") return { error: "Acesso negado." };
    if (message === "ENTITLEMENT_NOT_FOUND") return { error: "Licença não encontrada." };
    if (message === "INVALID_VALUE") return { error: "Valor inválido." };
    if (message === "INVALID_DATE") return { error: "Data inválida." };
    return { error: "Erro ao atualizar licença" };
  }
}

/**
 * Server Action para redefinição administrativa da senha de acesso de um cliente comercial.
 *
 * @param clientId - Identificador UUID da conta comercial
 * @param newPassword - Nova senha em texto claro (mínimo 6 caracteres)
 * @returns Objeto com mensagem de sucesso ou erro
 */
export async function resetClientPasswordAction(clientId: string, newPassword: string) {
  const session = await getSession();
  if (!session) return { error: "Não autorizado" };

  if (!newPassword || newPassword.length < 6) {
    return { error: "A nova senha deve ter no mínimo 6 caracteres." };
  }

  try {
    const client = await prisma.commercialAccount.findFirst({
      where: {
        id: clientId,
        ...(session.user.role === "RESELLER" ? { resellerId: session.user.id } : {}),
      },
    });

    if (!client) return { error: "Cliente não encontrado ou sem permissão." };

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.commercialAccount.update({
      where: { id: clientId },
      data: { passwordHash },
    });

    return { success: true, message: "Senha do cliente atualizada com sucesso!" };
  } catch (err) {
    console.error(err);
    return { error: "Erro ao redefinir a senha do cliente" };
  }
}

/**
 * Server Action para atualização do login ou e-mail de acesso de um cliente comercial.
 * Valida a unicidade da nova credencial no banco de dados antes da alteração.
 *
 * @param clientId - Identificador UUID da conta comercial
 * @param newLogin - Novo e-mail ou nome de usuário desejado
 * @returns Objeto com confirmação de sucesso ou mensagem de erro
 */
export async function updateClientLoginAction(clientId: string, newLogin: string) {
  const session = await getSession();
  if (!session) return { error: "Não autorizado" };

  const cleanLogin = String(newLogin || "").trim().toLowerCase();
  if (!cleanLogin || cleanLogin.length < 3) {
    return { error: "O login deve ter no mínimo 3 caracteres." };
  }

  try {
    const client = await prisma.commercialAccount.findFirst({
      where: {
        id: clientId,
        ...(session.user.role === "RESELLER" ? { resellerId: session.user.id } : {}),
      },
    });

    if (!client) return { error: "Cliente não encontrado ou sem permissão." };

    if (cleanLogin !== client.email) {
      const existing = await prisma.commercialAccount.findUnique({
        where: { email: cleanLogin },
      });
      if (existing && existing.id !== clientId) {
        return { error: "Este login já está em uso por outro cliente." };
      }
    }

    await prisma.commercialAccount.update({
      where: { id: clientId },
      data: { email: cleanLogin },
    });

    revalidatePath(`/dashboard/clients/${clientId}`);
    revalidatePath("/dashboard/clients");

    return { success: true, message: "Login do cliente atualizado com sucesso!" };
  } catch (err) {
    console.error(err);
    return { error: "Erro ao atualizar o login do cliente." };
  }
}
