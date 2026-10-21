/**
 * @file auth.ts
 * @description Módulo de autenticação JWT e gerenciamento de sessões via cookies HTTP no Cloud Dashboard.
 *
 * Mecanismos Criptográficos e de Segurança:
 * 1. Assinatura HS256: Utiliza a biblioteca `jose` para gerar e verificar tokens JWT assinados com chave simétrica.
 * 2. Validação Rigorosa em Produção: Exige que a variável `JWT_SECRET` tenha ao menos 32 caracteres em produção,
 *    abortando a inicialização caso insegura.
 * 3. Cookies HTTP-Only Seguros: Armazena o token de sessão no cookie `session` com flags `httpOnly: true`,
 *    `secure: true` (em produção) e `sameSite: "lax"` contra roubo via XSS.
 * 4. Expiração de Sessão: Sessões válidas por 24 horas a partir da emissão.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Estrutura do usuário contido no token de sessão.
 */
export interface SessionUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Estrutura completa do payload da sessão decodificada.
 */
export interface SessionPayload {
  user: SessionUser;
  expires: Date | string;
  [key: string]: unknown;
}

/**
 * Cache em memória da chave binária HMAC para evitar re-codificação de string a cada requisição.
 */
let cachedKey: Uint8Array | null = null;

/**
 * Obtém ou inicializa a chave criptográfica simétrica em bytes para operações JWT HS256.
 *
 * @throws Error se a variável JWT_SECRET tiver menos de 32 caracteres em ambiente de produção
 * @returns Buffer Uint8Array da chave secreta
 */
export function getJwtSecretKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  const secret = process.env.JWT_SECRET?.trim();
  if (secret && secret.length >= 32) {
    cachedKey = new TextEncoder().encode(secret);
    return cachedKey;
  }

  // Permite fallback com aviso em desenvolvimento
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters in production.");
  }

  cachedKey = new TextEncoder().encode(secret || "nio-os-local-dev-jwt-secret-key-32-chars-strong");
  return cachedKey;
}

/**
 * Criptografa e assina um payload arbitrário em um token JWT com algoritmo HS256 e expiração de 24h.
 *
 * @param payload - Dados a serem encapsulados no token (ex: dados do usuário e expiração)
 * @returns Promise resolvendo para a string JWT assinada
 */
export async function encrypt(payload: Record<string, unknown> | { user: SessionUser; expires: Date }) {
  const key = getJwtSecretKey();
  return await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);
}

/**
 * Valida a assinatura criptográfica e decodifica o payload de um token JWT.
 *
 * @param input - String do token JWT recebido
 * @returns Promise resolvendo para o payload decodificado
 */
export async function decrypt<T = SessionPayload>(input: string): Promise<T> {
  const key = getJwtSecretKey();
  const { payload } = await jwtVerify(input, key, {
    algorithms: ["HS256"],
  });
  return payload as unknown as T;
}

/**
 * Cria a sessão do usuário autenticado gerando o token JWT e gravando-o no cookie HTTP seguro.
 *
 * @param user - Objeto com id, e-mail e papel do usuário logado
 */
export async function createSession(user: SessionUser) {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const session = await encrypt({ user, expires });

  const cookieStore = await cookies();
  cookieStore.set("session", session, {
    path: "/",
    expires,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

/**
 * Encerra a sessão do usuário ativo invalidando e expirando o cookie `session`.
 */
export async function logout() {
  const cookieStore = await cookies();
  cookieStore.set("session", "", {
    path: "/",
    expires: new Date(0),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

/**
 * Recupera e valida a sessão do usuário a partir dos cookies da requisição atual.
 *
 * @returns Objeto com o payload da sessão decodificada ou null caso inexistente ou inválida
 */
export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("session")?.value;
    if (!session) return null;
    return await decrypt<SessionPayload>(session);
  } catch {
    return null;
  }
}
