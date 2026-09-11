/**
 * @file proxy.ts
 * @description Proxy/Middleware de segurança, controle de autenticação e proteção contra CSRF no Nio-OS.
 *
 * Pilares de Segurança:
 * 1. Sessão Criptografada: Valida tokens de sessão assinados com HMAC-SHA256 via Web Crypto API nativa (`crypto.subtle`).
 * 2. Proteção CSRF / Cross-Site Request Forgery:
 *    - Inspeciona os cabeçalhos `Origin`, `Host` e `Sec-Fetch-Site` em métodos mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`).
 *    - Bloqueia requisições originadas fora do mesmo host com status 403 Forbidden.
 * 3. Headers HTTP Defensivos:
 *    - `X-Content-Type-Options: nosniff` (impede MIME sniffing).
 *    - `X-Frame-Options: DENY` e CSP `frame-ancestors 'none'` (mitiga clickjacking).
 *    - `Referrer-Policy: no-referrer` (previne vazamento de URLs e tokens).
 * 4. Isolamento de Anexos:
 *    - Bloqueia acesso direto à rota `/uploads/anexos` para forçar o consumo via endpoint seguro com RBAC (`/api/uploads/anexos/[arquivo]`).
 * 5. Roteamento Inteligente:
 *    - Redireciona acessos não autenticados para `/login?next=...` ou retorna JSON 401 para chamadas à API.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Nome do cookie HTTP que armazena o token de sessão assinado.
 */
const COOKIE_NAME = "nio_os_session";

/**
 * Segredo padrão utilizado estritamente em ambiente de desenvolvimento local caso `AUTH_SECRET` não esteja definido.
 */
const DEV_AUTH_SECRET = "nio-os-dev-secret-change-this";

/**
 * Tempo máximo de vida da sessão do operador (30 dias em milissegundos).
 */
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * Páginas visuais do sistema com acesso liberado a usuários não autenticados.
 */
const ROTAS_PUBLICAS = ["/login", "/primeiro-acesso", "/sair"];

/**
 * Endpoints da API com acesso público para procedimentos de autenticação e bootstrapping do sistema.
 */
const APIS_PUBLICAS = [
  "/api/auth/setup",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
];

/**
 * Métodos HTTP de mutação de estado sujeitos a validação estrita de origem (CSRF).
 */
const METODOS_MUTAVEIS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Verifica se o caminho requisitado corresponde a uma rota pública de interface.
 *
 * @param pathname - Caminho da URL
 * @returns True se a rota for pública
 */
function rotaEhPublica(pathname: string) {
  return ROTAS_PUBLICAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  );
}

/**
 * Verifica se o endpoint de API requisitado é público.
 *
 * @param pathname - Caminho da API
 * @returns True se o endpoint for público
 */
function apiEhPublica(pathname: string) {
  return APIS_PUBLICAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  );
}

/**
 * Recupera a chave secreta para assinatura HMAC a partir da variável `AUTH_SECRET`.
 *
 * @returns String da chave secreta ou string vazia se ausente em produção
 */
function authSecret() {
  const secret = String(process.env.AUTH_SECRET || "").trim();

  if (secret.length >= 32) return secret;

  if (process.env.NODE_ENV !== "production") {
    return DEV_AUTH_SECRET;
  }

  return "";
}

/**
 * Converte um ArrayBuffer binário em string Base64URL segura para URLs e cookies.
 *
 * @param buffer - Buffer com dados binários da assinatura
 * @returns String codificada em Base64URL
 */
function base64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let texto = "";

  for (let i = 0; i < bytes.length; i++) {
    texto += String.fromCharCode(bytes[i]);
  }

  return btoa(texto)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Decodifica uma string no formato Base64URL para texto ASCII original.
 *
 * @param valor - String Base64URL
 * @returns Texto decodificado
 */
function decodificarBase64Url(valor: string) {
  const base64 = valor.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);

  return atob(base64 + padding);
}

/**
 * Gera a assinatura criptográfica HMAC-SHA256 para um dado texto utilizando a Web Crypto API.
 *
 * @param valor - Conteúdo a ser assinado (payload do token)
 * @returns Assinatura codificada em Base64URL
 */
async function assinar(valor: string) {
  const secret = authSecret();

  if (!secret) return "";

  const encoder = new TextEncoder();

  const chave = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const assinatura = await crypto.subtle.sign(
    "HMAC",
    chave,
    encoder.encode(valor)
  );

  return base64Url(assinatura);
}

/**
 * Valida a autenticidade e validade temporal de um token de sessão.
 *
 * @param token - Token no formato `payload.assinatura`
 * @returns True se o token for válido e não expirado; false caso contrário
 */
async function tokenValido(token?: string) {
  if (!token) return false;

  const [payloadBase64, assinatura] = token.split(".");

  if (!payloadBase64 || !assinatura) return false;

  const assinaturaEsperada = await assinar(payloadBase64);

  if (!assinaturaEsperada || assinatura !== assinaturaEsperada) {
    return false;
  }

  try {
    const payload = JSON.parse(decodificarBase64Url(payloadBase64));

    if (!payload?.userId) return false;

    const criadoEm = Number(payload.iat);

    if (!Number.isFinite(criadoEm)) return false;

    const agora = Date.now();

    if (criadoEm > agora + 1000 * 60 * 5) return false;
    if (agora - criadoEm > SESSION_MAX_AGE_MS) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Injeta cabeçalhos HTTP defensivos (CSP, X-Frame-Options, anti-sniffing) na resposta NextResponse.
 *
 * @param response - Resposta do Next.js
 * @param semCache - Se deve incluir diretiva `Cache-Control: no-store`
 * @returns A resposta modificada com os headers de segurança
 */
function aplicarHeadersSeguranca(
  response: NextResponse,
  semCache = false
) {
  if (semCache) {
    response.headers.set("Cache-Control", "no-store");
  }

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'"
  );

  return response;
}

/**
 * Detecta se uma requisição HTTP de alteração de dados provém de uma origem externa não autorizada (Cross-Site).
 *
 * @param request - Requisição NextRequest recebida
 * @returns True se a requisição for mutável e de origem cruzada suspeita
 */
function requisicaoMutavelCrossSite(request: NextRequest) {
  if (
    !request.nextUrl.pathname.startsWith("/api") ||
    !METODOS_MUTAVEIS.has(request.method.toUpperCase())
  ) {
    return false;
  }

  const origin = request.headers.get("origin");

  if (origin) {
    try {
      const originUrl = new URL(origin);
      const requestHost = request.headers.get("host")?.trim().toLowerCase();

      if (!requestHost || originUrl.host.toLowerCase() !== requestHost) {
        return true;
      }
    } catch {
      return true;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");

  return Boolean(
    fetchSite &&
      fetchSite !== "same-origin" &&
      fetchSite !== "none"
  );
}

/**
 * Função de middleware proxy que intercepta requisições HTTP para validar sessões, CSRF e cabeçalhos defensivos.
 *
 * @param request - Requisição NextRequest recebida
 * @returns NextResponse com o resultado do processamento ou redirecionamento para login
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/local/health") {
    return aplicarHeadersSeguranca(NextResponse.next(), true);
  }

  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return aplicarHeadersSeguranca(NextResponse.next());
  }

  if (requisicaoMutavelCrossSite(request)) {
    return aplicarHeadersSeguranca(
      NextResponse.json(
        { message: "Origem da requisição não autorizada." },
        { status: 403 }
      ),
      true
    );
  }

  if (pathname.startsWith("/uploads/anexos")) {
    return aplicarHeadersSeguranca(
      new NextResponse("Arquivo protegido.", { status: 404 }),
      true
    );
  }

  if (pathname.startsWith("/uploads")) {
    return aplicarHeadersSeguranca(NextResponse.next());
  }

  if (rotaEhPublica(pathname)) {
    return aplicarHeadersSeguranca(NextResponse.next(), true);
  }

  if (pathname.startsWith("/api") && apiEhPublica(pathname)) {
    return aplicarHeadersSeguranca(NextResponse.next(), true);
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const autenticado = await tokenValido(token);

  if (autenticado) {
    return aplicarHeadersSeguranca(NextResponse.next(), true);
  }

  if (pathname.startsWith("/api")) {
    return aplicarHeadersSeguranca(
      NextResponse.json(
        { message: "Sessão expirada ou usuário não autenticado." },
        { status: 401 }
      ),
      true
    );
  }

  const urlLogin = request.nextUrl.clone();
  urlLogin.pathname = "/login";
  urlLogin.searchParams.set("next", pathname);

  return aplicarHeadersSeguranca(
    NextResponse.redirect(urlLogin),
    true
  );
}

/**
 * Configuração de rotas interceptadas pelo middleware (matcher do Next.js).
 * Intercepta todas as rotas que não contenham extensão de arquivo estático, além da pasta protegida `/uploads/anexos/:path*`.
 */
export const config = {
  matcher: ["/((?!.*\\..*).*)", "/uploads/anexos/:path*"],
};

