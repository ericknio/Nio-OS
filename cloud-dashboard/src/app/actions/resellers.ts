/**
 * @file resellers.ts
 * @description Server Actions para gerenciamento administrativo da rede de revendedores parceiros (Resellers).
 * Implementa controle hierárquico de acesso (Master vs. Revendedor), criação com transferência inicial
 * de créditos obrigatórios, recarga/estorno atômico de saldos com transações ACID no Prisma, redefinição
 * de credenciais, alteração de status operacional (ativação/bloqueio) e expurgo de contas com estorno
 * proporcional ao criador.
 *
 * @module CloudDashboard/Actions/Resellers
 */

"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/**
 * Cria um novo revendedor parceiro no sistema com validação de saldo e transferência atômica de créditos.
 * 
 * Regras de negócio e permissões:
 * - Apenas administradores `MASTER` ou revendedores (`RESELLER`) autenticados podem invocar esta ação.
 * - Quando criado por um `RESELLER`, exige repasse mínimo de 10 créditos e debita o valor do saldo do criador.
 * - Usuários `MASTER` possuem autonomia ilimitada para conceder créditos sem necessidade de débito próprio.
 * - Transação via Prisma garante atomicidade: dedução do criador e instanciação do novo revendedor.
 * 
 * @param {any} prevState - Estado anterior retornado pelo hook de formulário ou Server Action.
 * @param {FormData} formData - Dados submetidos via formulário (login/email, senha e créditos iniciais).
 * @returns {Promise<{ error: string } | void>} Objeto com mensagem de erro ou redirecionamento em caso de sucesso.
 */
export async function createResellerAction(prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || !session.user) {
    return { error: "Não autorizado" };
  }

  const user = session.user;
  const isMaster = user.role === "MASTER";
  const isReseller = user.role === "RESELLER";

  if (!isMaster && !isReseller) {
    return { error: "Não autorizado" };
  }

  const login = String(formData.get("login") || formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const initialCredits = parseInt(formData.get("credits") as string, 10) || 0;

  if (!login || !password) {
    return { error: "Login e senha são obrigatórios." };
  }

  if (login.length < 3) {
    return { error: "O login deve ter pelo menos 3 caracteres." };
  }

  // Validação de créditos
  if (isReseller) {
    if (initialCredits < 10) {
      return { error: "Revendedores devem definir no mínimo 10 créditos para criar um novo revendedor parceiro." };
    }

    const creator = await prisma.adminUser.findUnique({
      where: { id: user.id },
      select: { credits: true },
    });

    if (!creator || creator.credits < initialCredits) {
      return {
        error: `Saldo insuficiente. Você possui ${creator?.credits ?? 0} créditos e precisa transferir no mínimo ${initialCredits}.`,
      };
    }
  } else {
    // Master
    if (initialCredits < 0) {
      return { error: "Os créditos iniciais não podem ser negativos." };
    }
  }

  const existingReseller = await prisma.adminUser.findUnique({ where: { email: login } });
  if (existingReseller) {
    return { error: "Este login já está em uso por outro usuário." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      // Se for revendedor, desconta do saldo dele de forma atômica
      if (isReseller) {
        const updateResult = await tx.adminUser.updateMany({
          where: { id: user.id, credits: { gte: initialCredits } },
          data: { credits: { decrement: initialCredits } },
        });

        if (updateResult.count === 0) {
          throw new Error("Saldo de créditos insuficiente no momento da criação.");
        }
      }

      await tx.adminUser.create({
        data: {
          email: login,
          passwordHash,
          role: "RESELLER",
          status: "ACTIVE",
          credits: initialCredits,
          creatorId: isReseller ? user.id : null,
        },
      });
    });
  } catch (err: unknown) {
    console.error("Erro ao criar revendedor:", err);
    const message = err instanceof Error ? err.message : "Erro ao criar revendedor.";
    return { error: message };
  }

  revalidatePath("/dashboard/resellers");
  revalidatePath("/dashboard");
  redirect("/dashboard/resellers");
}

/**
 * Gerencia a transferência ou recolhimento de créditos entre revendedores ou via master.
 * 
 * Fluxo de execução e atomicidade:
 * - Se invocado por um `RESELLER`:
 *   - `isAdd === true`: Transfere créditos do criador para o sub-revendedor (debita do criador com verificação `gte` e credita no destino).
 *   - `isAdd === false`: Recolhe créditos do sub-revendedor de volta para o criador (debita do sub-revendedor e estorna para o criador).
 * - Se invocado por um `MASTER`:
 *   - `isAdd === true`: Injeta créditos diretamente no revendedor parceiro.
 *   - `isAdd === false`: Remove créditos do revendedor alvo respeitando o saldo mínimo disponível.
 * 
 * @param {string} resellerId - Identificador único (UUID) do revendedor parceiro alvo.
 * @param {number} amount - Quantidade inteira de créditos a serem adicionados ou recolhidos.
 * @param {boolean} isAdd - `true` para transferir/adicionar créditos; `false` para recolher/estornar créditos.
 * @returns {Promise<{ success?: boolean; message?: string; error?: string }>} Resumo da operação e novo saldo consolidado.
 */
export async function manageCreditsAction(resellerId: string, amount: number, isAdd: boolean) {
  const session = await getSession();
  if (!session || !session.user) {
    return { error: "Não autorizado" };
  }

  const user = session.user;
  const isMaster = user.role === "MASTER";
  const isReseller = user.role === "RESELLER";

  if (!isMaster && !isReseller) {
    return { error: "Não autorizado" };
  }

  if (amount <= 0 || !Number.isInteger(amount)) {
    return { error: "Informe uma quantidade válida de créditos (número inteiro maior que zero)." };
  }

  try {
    const targetReseller = await prisma.adminUser.findUnique({ where: { id: resellerId } });
    if (!targetReseller || targetReseller.role !== "RESELLER") {
      return { error: "Revendedor não encontrado." };
    }

    // Se for revendedor, só pode gerenciar quem ele próprio criou
    if (isReseller && targetReseller.creatorId !== user.id) {
      return { error: "Não autorizado. Você só pode gerenciar revendedores criados por você." };
    }

    if (isReseller) {
      // Operação entre revendedor e sub-revendedor:
      await prisma.$transaction(async (tx) => {
        if (isAdd) {
          // Debit from creator, add to sub-reseller
          const debitCreator = await tx.adminUser.updateMany({
            where: { id: user.id, credits: { gte: amount } },
            data: { credits: { decrement: amount } },
          });

          if (debitCreator.count === 0) {
            throw new Error(`Seu saldo é insuficiente para transferir ${amount} crédito(s).`);
          }

          await tx.adminUser.update({
            where: { id: resellerId },
            data: { credits: { increment: amount } },
          });
        } else {
          // Remove from sub-reseller, refund back to creator
          const debitSub = await tx.adminUser.updateMany({
            where: { id: resellerId, credits: { gte: amount } },
            data: { credits: { decrement: amount } },
          });

          if (debitSub.count === 0) {
            throw new Error(`O revendedor parceiro possui apenas ${targetReseller.credits} crédito(s), não é possível remover ${amount}.`);
          }

          await tx.adminUser.update({
            where: { id: user.id },
            data: { credits: { increment: amount } },
          });
        }
      });
    } else {
      // Operação direta do MASTER (criação/ajuste livre de créditos)
      if (!isAdd) {
        const updateResult = await prisma.adminUser.updateMany({
          where: { id: resellerId, credits: { gte: amount } },
          data: { credits: { decrement: amount } },
        });
        if (updateResult.count === 0) {
          return { error: `O revendedor não possui saldo suficiente (${amount} créditos).` };
        }
      } else {
        await prisma.adminUser.update({
          where: { id: resellerId },
          data: { credits: { increment: amount } },
        });
      }
    }

    const updated = await prisma.adminUser.findUnique({ where: { id: resellerId } });
    const novoSaldo = updated ? updated.credits : 0;

    revalidatePath(`/dashboard/resellers/${resellerId}`);
    revalidatePath("/dashboard/resellers");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: isAdd
        ? `${amount} crédito(s) transferido(s) com sucesso! Novo saldo do revendedor: ${novoSaldo}`
        : `${amount} crédito(s) recolhido(s) com sucesso! Novo saldo do revendedor: ${novoSaldo}`,
    };
  } catch (err: unknown) {
    console.error("Erro ao gerenciar créditos:", err);
    const message = err instanceof Error ? err.message : "Erro ao gerenciar créditos.";
    return { error: message };
  }
}

/**
 * Redefine a senha de acesso ao painel de um revendedor parceiro.
 * 
 * Regras de validação e segurança:
 * - Exige sessão ativa com perfil `MASTER` ou autoria direta de criação (`creatorId === user.id`).
 * - Valida tamanho mínimo de 6 caracteres para a nova senha.
 * - Gera o hash criptográfico seguro via Bcrypt (salt cost 10) antes da persistência no banco.
 * 
 * @param {string} resellerId - Identificador único do revendedor que terá sua senha alterada.
 * @param {string} newPassword - Nova senha em texto puro informada pelo operador.
 * @returns {Promise<{ success?: boolean; message?: string; error?: string }>} Confirmação de sucesso ou erro descritivo.
 */
export async function resetResellerPasswordAction(resellerId: string, newPassword: string) {
  const session = await getSession();
  if (!session || !session.user) {
    return { error: "Não autorizado" };
  }

  const user = session.user;
  const isMaster = user.role === "MASTER";

  if (!newPassword || newPassword.length < 6) {
    return { error: "A nova senha deve ter no mínimo 6 caracteres." };
  }

  try {
    const reseller = await prisma.adminUser.findUnique({ where: { id: resellerId } });
    if (!reseller || reseller.role !== "RESELLER") return { error: "Revendedor não encontrado." };

    if (!isMaster && reseller.creatorId !== user.id) {
      return { error: "Não autorizado." };
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.adminUser.update({
      where: { id: resellerId },
      data: { passwordHash },
    });

    revalidatePath(`/dashboard/resellers/${resellerId}`);
    return { success: true, message: "Senha do revendedor atualizada com sucesso!" };
  } catch (err) {
    console.error(err);
    return { error: "Erro ao redefinir a senha do revendedor." };
  }
}

/**
 * Alterna o status operacional de um revendedor parceiro entre ATIVO (`ACTIVE`) e BLOQUEADO (`DISABLED`).
 * 
 * Regras de permissão:
 * - Apenas `MASTER` ou o criador direto do revendedor parceiro possuem autorização para alterar o status.
 * - A invalidação do status impede futuros logins do revendedor no Cloud Dashboard.
 * 
 * @param {string} resellerId - Identificador único do revendedor parceiro.
 * @returns {Promise<{ success?: boolean; message?: string; error?: string }>} Notificação de alteração e novo status.
 */
export async function toggleResellerStatusAction(resellerId: string) {
  const session = await getSession();
  if (!session || !session.user) {
    return { error: "Não autorizado" };
  }

  const user = session.user;
  const isMaster = user.role === "MASTER";

  try {
    const reseller = await prisma.adminUser.findUnique({ where: { id: resellerId } });
    if (!reseller || reseller.role !== "RESELLER") return { error: "Revendedor não encontrado." };

    if (!isMaster && reseller.creatorId !== user.id) {
      return { error: "Não autorizado." };
    }

    const newStatus = reseller.status === "ACTIVE" ? "DISABLED" : "ACTIVE";

    await prisma.adminUser.update({
      where: { id: resellerId },
      data: { status: newStatus },
    });

    revalidatePath(`/dashboard/resellers/${resellerId}`);
    revalidatePath("/dashboard/resellers");
    return {
      success: true,
      message: newStatus === "ACTIVE" ? "Revendedor ativado com sucesso!" : "Revendedor bloqueado com sucesso!",
    };
  } catch (err) {
    console.error(err);
    return { error: "Erro ao alterar status do revendedor." };
  }
}

/**
 * Exclui permanentemente a conta de um revendedor parceiro e todas as suas contas comerciais vinculadas.
 * 
 * Política de estorno e integridade referencial:
 * - Se a exclusão for efetuada por um `RESELLER` e o sub-revendedor possuir créditos residuais,
 *   o saldo é automaticamente reembolsado e devolvido à carteira do revendedor criador.
 * - Remove em cascata todas as `commercialAccount` subordinadas ao revendedor.
 * - Remove o registro de `adminUser` da base de dados via transação ACID.
 * 
 * @param {string} resellerId - Identificador único do revendedor a ser excluído.
 * @returns {Promise<{ success?: boolean; error?: string }>} Confirmação de sucesso ou erro de validação/permissão.
 */
export async function deleteResellerAction(resellerId: string) {
  const session = await getSession();
  if (!session || !session.user) {
    return { error: "Não autorizado" };
  }

  const user = session.user;
  const isMaster = user.role === "MASTER";

  try {
    const reseller = await prisma.adminUser.findUnique({ where: { id: resellerId } });
    if (!reseller || reseller.role !== "RESELLER") return { error: "Revendedor não encontrado." };

    if (!isMaster && reseller.creatorId !== user.id) {
      return { error: "Não autorizado." };
    }

    await prisma.$transaction(async (tx) => {
      // Se for revendedor excluindo seu sub-revendedor, devolve os créditos restantes para o criador
      if (!isMaster && reseller.credits > 0 && reseller.creatorId) {
        await tx.adminUser.update({
          where: { id: reseller.creatorId },
          data: { credits: { increment: reseller.credits } },
        });
      }

      await tx.commercialAccount.deleteMany({
        where: { resellerId: resellerId },
      });

      await tx.adminUser.delete({
        where: { id: resellerId },
      });
    });

    revalidatePath("/dashboard/resellers");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error(err);
    return { error: "Erro ao excluir revendedor." };
  }
}

/**
 * Atualiza o login/e-mail administrativo de um revendedor parceiro.
 * 
 * Validações implementadas:
 * - Exige sessão com perfil `MASTER` ou vínculo de criador direto.
 * - Valida se o novo identificador possui ao menos 3 caracteres e formata para minúsculas.
 * - Checa unicidade no banco de dados para evitar duplicidade de credenciais de login.
 * 
 * @param {string} resellerId - Identificador único do revendedor parceiro.
 * @param {string} newLogin - Novo login/e-mail desejado para autenticação.
 * @returns {Promise<{ success?: boolean; message?: string; error?: string }>} Confirmação de atualização ou mensagem de erro.
 */
export async function updateResellerLoginAction(resellerId: string, newLogin: string) {
  const session = await getSession();
  if (!session || !session.user) {
    return { error: "Não autorizado" };
  }

  const user = session.user;
  const isMaster = user.role === "MASTER";

  const cleanLogin = String(newLogin || "").trim().toLowerCase();
  if (!cleanLogin || cleanLogin.length < 3) {
    return { error: "O login deve ter no mínimo 3 caracteres." };
  }

  try {
    const reseller = await prisma.adminUser.findUnique({ where: { id: resellerId } });
    if (!reseller || reseller.role !== "RESELLER") return { error: "Revendedor não encontrado." };

    if (!isMaster && reseller.creatorId !== user.id) {
      return { error: "Não autorizado." };
    }

    if (cleanLogin !== reseller.email) {
      const existing = await prisma.adminUser.findUnique({ where: { email: cleanLogin } });
      if (existing && existing.id !== resellerId) {
        return { error: "Este login já está em uso por outro usuário." };
      }
    }

    await prisma.adminUser.update({
      where: { id: resellerId },
      data: { email: cleanLogin },
    });

    revalidatePath(`/dashboard/resellers/${resellerId}`);
    revalidatePath("/dashboard/resellers");
    return { success: true, message: "Login do revendedor atualizado com sucesso!" };
  } catch (err) {
    console.error(err);
    return { error: "Erro ao atualizar login do revendedor." };
  }
}
