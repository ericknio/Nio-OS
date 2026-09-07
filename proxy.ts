// proxy.ts
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "nio_os_session";
const DEV_AUTH_SECRET = "nio-os-dev-secret-change-this";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

const ROTAS_PUBLICAS = ["/login", "/primeiro-acesso", "/sair"];

const APIS_PUBLICAS = [
  "/api/auth/setup",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
];

const METODOS_MUTAVEIS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function rotaEhPublica(pathname: string) {
  return ROTAS_PUBLICAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  );
}

function apiEhPublica(pathname: string) {
  return APIS_PUBLICAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  );
}

function authSecret() {
  const secret = String(process.env.AUTH_SECRET || "").trim();

  if (secret.length >= 32) return secret;

  if (process.env.NODE_ENV !== "production") {
    return DEV_AUTH_SECRET;
  }

  return "";
}

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

function decodificarBase64Url(valor: string) {
  const base64 = valor.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);

  return atob(base64 + padding);
}

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

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/uploads/anexos/:path*"],
};
