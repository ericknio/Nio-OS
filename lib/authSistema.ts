/**
 * @file lib/authSistema.ts
 * @description Módulo central de criptografia, hash de senhas e gerenciamento de sessões do Nio-OS.
 * 
 * Funcionalidades de Segurança:
 * - Hashing de senhas seguro utilizando PBKDF2 com salt aleatório (100.000 iterações de SHA-512).
 * - Verificação de senhas e assinaturas em tempo constante (`timingSafeEqual`) contra ataques de temporização (timing attacks).
 * - Emissão de tokens de sessão compactos e assinados com HMAC-SHA256 (`COOKIE_NAME = "nio_os_session"`).
 * - Gestão de cookies HTTP-only seguros para terminais locais e suporte futuro a HTTPS.
 * - Resolução do usuário logado diretamente pelo banco de dados com suas respectivas permissões.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
import { SystemUserRole, SystemUserStatus } from "@prisma/client";
import { TODAS_PERMISSOES } from "@/lib/permissoesSistema";
import { prisma } from "@/lib/prisma";
import { raizDadosRuntime } from "@/lib/runtimeStorage";

/**
 * Nome do cookie HTTP-only que armazena o token assinado da sessão.
 */
export const COOKIE_NAME = "nio_os_session";

const DEV_SESSION_SECRET = "nio-os-dev-secret-change-this";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

function variavelBooleana(valor: string | undefined, fallback: boolean) {
  const texto = String(valor || "").trim().toLowerCase();

  if (!texto) return fallback;

  return ["1", "true", "sim", "s", "yes", "y"].includes(texto);
}

function cookieSeguro() {
  // Em instalação local/LAN o Next roda em production, mas o acesso é por HTTP/IP.
  // COOKIE_SECURE=true fica reservado para implantação futura com HTTPS.
  return variavelBooleana(process.env.COOKIE_SECURE, false);
}


function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

let cachedSessionSecret: string | null = null;

function sessionSecret() {
  if (cachedSessionSecret) return cachedSessionSecret;

  const envSecret = String(process.env.AUTH_SECRET || "").trim();
  const isDefaultHardcoded =
    envSecret === "nio-os-auth-local-2026-trocar-na-versao-final" ||
    envSecret === "nio-os-dev-secret-change-this";

  if (envSecret.length >= 32 && !isDefaultHardcoded) {
    cachedSessionSecret = envSecret;
    return cachedSessionSecret;
  }

  try {
    const secretFile = path.join(raizDadosRuntime(), "auth-session.key");
    if (fs.existsSync(secretFile)) {
      const saved = fs.readFileSync(secretFile, "utf8").trim();
      if (saved.length >= 32) {
        cachedSessionSecret = saved;
        return cachedSessionSecret;
      }
    }
    const generated = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, generated, "utf8");
    cachedSessionSecret = generated;
    return cachedSessionSecret;
  } catch {
    cachedSessionSecret = crypto.randomBytes(32).toString("hex");
    return cachedSessionSecret;
  }
}

function assinar(valor: string) {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(valor)
    .digest("base64url");
}

function compararTextoSeguro(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) return false;

  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Cria um hash criptográfico seguro para a senha informada utilizando PBKDF2 com salt aleatório de 16 bytes.
 * 
 * @param senha Senha em texto puro a ser criptografada.
 * @returns String formatada no padrão "salt:hashHex" para persistência no banco.
 */
export function criarHashSenha(senha: string) {
  const senhaLimpa = String(senha || "");
  const salt = crypto.randomBytes(16).toString("hex");

  const hash = crypto
    .pbkdf2Sync(senhaLimpa, salt, 100000, 64, "sha512")
    .toString("hex");

  return `${salt}:${hash}`;
}

/**
 * Valida se uma senha informada corresponde ao hash gravado no banco de dados.
 * A comparação é feita em tempo constante (`timingSafeEqual`) para proteção contra timing attacks.
 * 
 * @param senha Senha em texto puro fornecida na tentativa de login.
 * @param passwordHash Hash "salt:hashHex" armazenado no cadastro do usuário.
 * @returns `true` se a senha conferir, `false` caso contrário.
 */
export function verificarSenha(senha: string, passwordHash: string) {
  const [salt, hashOriginal] = String(passwordHash || "").split(":");

  if (!salt || !hashOriginal) return false;

  const hashTeste = crypto
    .pbkdf2Sync(String(senha || ""), salt, 100000, 64, "sha512")
    .toString("hex");

  const bufferOriginal = Buffer.from(hashOriginal, "hex");
  const bufferTeste = Buffer.from(hashTeste, "hex");

  if (bufferOriginal.length !== bufferTeste.length) return false;

  return crypto.timingSafeEqual(bufferOriginal, bufferTeste);
}

/**
 * Gera um token de sessão assinado contendo o ID do usuário e timestamp de emissão.
 * 
 * @param userId ID do usuário autenticado.
 * @returns Token no formato "payloadBase64.assinaturaHmac".
 */
export function criarTokenSessao(userId: string) {
  const payload = {
    userId,
    iat: Date.now(),
  };

  const payloadBase64 = base64Url(JSON.stringify(payload));
  const assinatura = assinar(payloadBase64);

  return `${payloadBase64}.${assinatura}`;
}

/**
 * Decodifica e valida a assinatura criptográfica de um token de sessão.
 * Checa expiração e tolerância de clock skew (+5 min).
 * 
 * @param token String do token recebido via cookie.
 * @returns Objeto com `userId` se válido, ou `null` se inválido/expirado.
 */
export function lerTokenSessao(token?: string | null) {
  if (!token) return null;

  const [payloadBase64, assinatura] = token.split(".");

  if (!payloadBase64 || !assinatura) return null;

  const assinaturaEsperada = assinar(payloadBase64);

  if (!compararTextoSeguro(assinatura, assinaturaEsperada)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadBase64, "base64url").toString("utf8")
    );

    if (!payload?.userId) return null;

    const criadoEm = Number(payload.iat);

    if (!Number.isFinite(criadoEm)) return null;

    const agora = Date.now();

    if (criadoEm > agora + 1000 * 60 * 5) return null;
    if (agora - criadoEm > SESSION_MAX_AGE_MS) return null;

    return {
      userId: String(payload.userId),
    };
  } catch {
    return null;
  }
}

/**
 * Grava o cookie de sessão autenticada com flags de segurança (HttpOnly, SameSite=Lax).
 * 
 * @param userId ID do usuário autenticado no banco.
 */
export async function definirSessaoUsuario(userId: string) {
  const token = criarTokenSessao(userId);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSeguro(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Remove o cookie de sessão do navegador expirando sua validade (`maxAge: 0`).
 */
export async function limparSessaoUsuario() {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSeguro(),
    path: "/",
    maxAge: 0,
  });
}

/**
 * Identifica e carrega os dados do usuário autenticado a partir do cookie HTTP da requisição atual.
 * Verifica no banco se o usuário permanece ativo e carrega sua lista de permissões granulares.
 * 
 * @returns Dados do usuário ativo com suas permissões, ou `null` se não autenticado/inativo.
 */
export async function obterUsuarioLogado() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  const sessao = lerTokenSessao(token);

  if (!sessao) return null;

  const usuario = await prisma.systemUser.findUnique({
    where: {
      id: sessao.userId,
    },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      permissions: {
        select: {
          key: true,
        },
      },
    },
  });

  if (!usuario || usuario.status !== SystemUserStatus.ATIVO) {
    return null;
  }

  const { permissions, ...dadosUsuario } = usuario;

  const permissoes =
    dadosUsuario.role === SystemUserRole.ADMIN && permissions.length === 0
      ? [...TODAS_PERMISSOES]
      : permissions.map((item) => item.key);

  return {
    ...dadosUsuario,
    permissions: permissoes,
  };
}
