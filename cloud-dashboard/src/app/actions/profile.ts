/**
 * @file profile.ts
 * @description Server Actions para gerenciamento de perfil e credenciais de segurança do usuário administrador (`AdminUser`).
 *
 * Regras de Acesso e Negócio:
 * 1. Restrição de Papel: Apenas usuários com perfil `MASTER` têm permissão para alterar diretamente seu login e senha.
 *    Revendedores (`RESELLER`) devem ter suas senhas gerenciadas pelo administrador supervisor.
 * 2. Validação Criptográfica: Exige verificação da senha atual com `bcrypt.compare` antes de permitir qualquer modificação.
 * 3. Renovação de Sessão: Ao alterar o login, o cookie de sessão é automaticamente reemitido com as novas credenciais.
 */

"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getSession, createSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * Server Action para troca de senha do usuário master logado.
 *
 * @param prevState - Estado anterior do formulário retornado por useActionState
 * @param formData - Dados contendo currentPassword, newPassword e confirmPassword
 * @returns Objeto com mensagem de sucesso ou erro
 */
export async function changePasswordAction(prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || !session.user?.id) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  if (session.user.role !== "MASTER") {
    return {
      error: "Revendedores não têm permissão para alterar a senha diretamente. Solicite ao seu revendedor supervisor.",
    };
  }

  const currentPassword = String(formData.get("currentPassword") || "").trim();
  const newPassword = String(formData.get("newPassword") || "").trim();
  const confirmPassword = String(formData.get("confirmPassword") || "").trim();

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Todos os campos de senha são obrigatórios." };
  }

  if (newPassword.length < 6) {
    return { error: "A nova senha deve ter no mínimo 6 caracteres." };
  }

  if (newPassword !== confirmPassword) {
    return { error: "A nova senha e a confirmação não coincidem." };
  }

  const user = await prisma.adminUser.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return { error: "Usuário não encontrado." };
  }

  const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    return { error: "Senha atual incorreta." };
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  revalidatePath("/dashboard/profile");
  return { success: true, message: "Senha alterada com sucesso!" };
}

/**
 * Server Action para atualização do endereço de login/e-mail do usuário master.
 * Exige validação prévia da senha atual e checagem de duplicidade no banco.
 *
 * @param prevState - Estado anterior do formulário
 * @param formData - Dados contendo newEmail e currentPasswordForEmail
 * @returns Objeto com mensagem de sucesso ou erro
 */
export async function updateEmailAction(prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session || !session.user?.id) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  if (session.user.role !== "MASTER") {
    return {
      error: "Revendedores não têm permissão para alterar o login diretamente. Solicite ao seu revendedor supervisor.",
    };
  }

  const newEmail = String(formData.get("newEmail") || "").trim().toLowerCase();
  const currentPassword = String(formData.get("currentPasswordForEmail") || "").trim();

  if (!newEmail || newEmail.length < 3) {
    return { error: "O novo login deve ter pelo menos 3 caracteres." };
  }

  if (!currentPassword) {
    return { error: "Informe sua senha atual para confirmar a alteração." };
  }

  const user = await prisma.adminUser.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return { error: "Usuário não encontrado." };
  }

  const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    return { error: "Senha incorreta. Não foi possível alterar o login." };
  }

  if (newEmail !== user.email) {
    const existing = await prisma.adminUser.findUnique({
      where: { email: newEmail },
    });
    if (existing) {
      return { error: "Este login já está sendo utilizado por outra conta." };
    }
  }

  const updatedUser = await prisma.adminUser.update({
    where: { id: user.id },
    data: { email: newEmail },
  });

  await createSession({
    id: updatedUser.id,
    email: updatedUser.email,
    role: updatedUser.role,
  });

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  return { success: true, message: "Login atualizado com sucesso!" };
}

