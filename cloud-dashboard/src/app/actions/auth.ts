/**
 * @file auth.ts
 * @description Server Actions para autenticação de administradores e revendedores no Cloud Dashboard.
 *
 * Mecanismos de Proteção:
 * 1. Rate Limiting: Chave composta por IP do cliente e login (`login:${clientIp}:${login}`) com teto de 5 tentativas por minuto.
 * 2. Comparação Segura: Criptografia com algoritmo bcrypt para verificar hash de senha sem vazamento de timing.
 * 3. Validação de Status: Bloqueia contas inativas ou suspensas.
 * 4. Sessão & Redirecionamento: Cria cookie HTTP-only seguro e redireciona para `/dashboard`.
 */

"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createSession, logout } from "@/lib/auth";
import { checkRateLimit, resetRateLimit } from "@/lib/rateLimit";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

/**
 * Server Action acionada pelo formulário de login administrativo.
 *
 * @param prevState - Estado anterior da action retornado pelo hook `useActionState`
 * @param formData - Dados do formulário contendo login/email e password
 * @returns Objeto com mensagem de erro em caso de falha ou redireciona em caso de sucesso
 */
export async function loginAction(prevState: unknown, formData: FormData) {
  const login = String(formData.get("login") || formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();

  if (!login || !password) {
    return { error: "Login e senha são obrigatórios" };
  }

  // Identificador por IP e login para rate limiting
  const reqHeaders = await headers();
  const clientIp = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";
  const rateLimitKey = `login:${clientIp}:${login}`;

  const rateCheck = checkRateLimit(rateLimitKey, 5, 60 * 1000);
  if (!rateCheck.allowed) {
    return {
      error: `Muitas tentativas incorretas. Aguarde ${rateCheck.retryAfterSeconds} segundos antes de tentar novamente.`,
    };
  }

  const user = await prisma.adminUser.findUnique({
    where: { email: login },
  });

  if (!user || user.status !== "ACTIVE") {
    return { error: "Usuário ou senha inválidos." };
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return { error: "Usuário ou senha inválidos." };
  }

  // Sucesso: reseta tentativas de rate limit e atualiza data do último login
  resetRateLimit(rateLimitKey);

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await createSession({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  redirect("/dashboard");
}

/**
 * Server Action para encerrar a sessão administrativa e redirecionar para a tela inicial.
 */
export async function logoutAction() {
  await logout();
  redirect("/");
}

