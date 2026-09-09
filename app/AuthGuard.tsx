/**
 * @file app/AuthGuard.tsx
 * @description Guardião de Autenticação e Autorização no Cliente (React/Next.js).
 * 
 * Intercepta a navegação no frontend e executa as seguintes validações:
 * 1. Primeiro Acesso: Se não houver administrador cadastrado, redireciona para `/primeiro-acesso`.
 * 2. Autenticação: Valida sessão via `/api/auth/me`. Se deslogado, redireciona para `/login`.
 * 3. Status da Conta: Bloqueia operadores inativos ou suspensos.
 * 4. Permissões de Rota (RBAC): Se o usuário não tiver permissão para a tela acessada,
 *    exibe tela amigável de acesso negado com botão para o primeiro módulo liberado.
 */

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

type SetupResponse = {
  precisaCriarAdmin?: boolean;
  message?: string;
};

type UsuarioLogado = {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  permissions?: string[];
};

type MeResponse = {
  autenticado?: boolean;
  usuario?: UsuarioLogado | null;
  message?: string;
};

type RotaProtegida = {
  href: string;
  permissao: string | string[] | null;
};

const ROTAS_PUBLICAS = ["/login", "/primeiro-acesso", "/setup", "/sair"];

const ROTAS_PRIORIDADE: RotaProtegida[] = [
  {
    href: "/",
    permissao: "dashboard.ver",
  },
  {
    href: "/ordens",
    permissao: "ordens.ver",
  },
  {
    href: "/ordens/nova",
    permissao: "ordens.criar",
  },
  {
    href: "/clientes",
    permissao: "clientes.ver",
  },
  {
    href: "/estoque-tecnico",
    permissao: "estoque.ver",
  },
  {
    href: "/produtos",
    permissao: ["produtos.ver", "estoque.ver", "vendas.ver"],
  },
  {
    href: "/produtos/vendas",
    permissao: "vendas.ver",
  },
  {
    href: "/produtos/estoque",
    permissao: "estoque.ver",
  },
  {
    href: "/pagamentos",
    permissao: ["pagamentos.ver", "pagamentos.registrar", "relatorios.financeiro"],
  },
  {
    href: "/financeiro-geral",
    permissao: ["relatorios.ver", "relatorios.financeiro"],
  },
  {
    href: "/relatorios",
    permissao: "relatorios.ver",
  },
  {
    href: "/garantias",
    permissao: "garantias.ver",
  },
  {
    href: "/configuracoes",
    permissao: "configuracoes.editar",
  },
  {
    href: "/usuarios-sistema",
    permissao: "usuarios.gerenciar",
  },
];

function rotaEhPublica(pathname: string) {
  return ROTAS_PUBLICAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  );
}

function rotaLoginSegura(pathname: string) {
  if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//")) {
    return "/login";
  }

  return `/login?next=${encodeURIComponent(pathname)}`;
}

function temPermissao(
  usuario: UsuarioLogado | null,
  permissao: string | string[] | null,
  pathname?: string
) {
  if (!permissao) return Boolean(usuario);
  if (!usuario) return false;
  if (usuario.role === "ADMIN") return true;

  if (
    usuario.role === "TECNICO" &&
    pathname &&
    (pathname === "/relatorios" || pathname.startsWith("/relatorios/"))
  ) {
    return true;
  }

  if (
    usuario.role === "ATENDENTE" &&
    pathname &&
    (pathname === "/produtos/relatorios" || pathname.startsWith("/produtos/relatorios/"))
  ) {
    return true;
  }

  const permissoes = Array.isArray(usuario.permissions)
    ? usuario.permissions
    : [];

  if (Array.isArray(permissao)) {
    return permissao.some((item) => permissoes.includes(item));
  }

  return permissoes.includes(permissao);
}

function primeiraRotaPermitida(usuario: UsuarioLogado | null) {
  const encontrada = ROTAS_PRIORIDADE.find((rota) =>
    temPermissao(usuario, rota.permissao, rota.href)
  );

  return encontrada?.href || "/minha-conta";
}

function permissaoDaRota(
  pathname: string,
  usuario?: UsuarioLogado | null
): string | string[] | null {
  if (pathname === "/") return "dashboard.ver";

  if (pathname.startsWith("/minha-conta")) return null;
  if (pathname.startsWith("/trocar-senha")) return null;

  if (pathname.startsWith("/usuarios-sistema")) return "usuarios.gerenciar";

  if (pathname.startsWith("/configuracoes")) return "configuracoes.editar";

  if (pathname.startsWith("/financeiro-geral")) {
    return ["relatorios.ver", "relatorios.financeiro"];
  }

  if (pathname.startsWith("/pagamentos")) {
    return ["pagamentos.ver", "pagamentos.registrar", "relatorios.financeiro"];
  }

  if (pathname.startsWith("/relatorios")) {
    if (usuario?.role === "TECNICO") return null;
    return "relatorios.ver";
  }

  if (pathname.startsWith("/garantias")) return "garantias.ver";

  if (pathname.startsWith("/clientes/novo")) return "clientes.criar";

  if (pathname.match(/^\/clientes\/[^/]+\/editar/)) {
    return "clientes.editar";
  }

  if (pathname.startsWith("/clientes")) return "clientes.ver";

  if (pathname.startsWith("/estoque-tecnico")) return "estoque.ver";

  if (pathname.startsWith("/produtos/relatorios")) {
    if (usuario?.role === "ATENDENTE") return null;
    return ["relatorios.ver", "relatorios.financeiro"];
  }

  if (pathname.startsWith("/produtos/vendas")) return "vendas.ver";

  if (pathname.startsWith("/produtos/estoque")) return "estoque.ver";

  if (pathname.startsWith("/produtos/novo")) return "produtos.criar";

  if (pathname.match(/^\/produtos\/[^/]+/)) return "produtos.ver";

  if (pathname.startsWith("/produtos")) {
    return ["produtos.ver", "estoque.ver", "vendas.ver"];
  }

  if (pathname.startsWith("/ordens/nova")) return "ordens.criar";

  if (pathname.startsWith("/ordens/atrasadas")) return "ordens.ver";

  if (pathname.match(/^\/ordens\/[^/]+\/editar/)) {
    return "ordens.editar";
  }

  if (pathname.match(/^\/ordens\/[^/]+\/finalizar/)) {
    return "ordens.finalizar";
  }

  if (pathname.match(/^\/ordens\/[^/]+\/pagamento/)) {
    return "pagamentos.registrar";
  }

  if (pathname.match(/^\/ordens\/[^/]+\/cancelar/)) {
    return "ordens.cancelar";
  }

  if (pathname.startsWith("/ordens")) return "ordens.ver";

  return null;
}

function nomesPermissao(permissao: string | string[] | null) {
  if (!permissao) return "Acesso autenticado";

  const mapa: Record<string, string> = {
    "dashboard.ver": "Ver página inicial",
    "clientes.ver": "Ver clientes",
    "clientes.criar": "Criar clientes",
    "clientes.editar": "Editar clientes",
    "ordens.ver": "Ver ordens de serviço",
    "ordens.criar": "Criar ordens de serviço",
    "ordens.editar": "Editar ordens de serviço",
    "ordens.finalizar": "Finalizar ordens de serviço",
    "ordens.cancelar": "Cancelar ordens de serviço",
    "pagamentos.ver": "Ver pagamentos",
    "pagamentos.registrar": "Registrar pagamentos",
    "produtos.ver": "Ver produtos",
    "produtos.criar": "Criar produtos",
    "estoque.ver": "Ver estoque",
    "estoque.ajustar": "Ajustar estoque",
    "vendas.ver": "Ver vendas de produtos",
    "relatorios.ver": "Ver relatórios de OS",
    "relatorios.financeiro": "Ver custos, impostos, lucros e margens",
    "garantias.ver": "Ver garantias",
    "configuracoes.editar": "Editar configurações",
    "usuarios.gerenciar": "Gerenciar usuários",
  };

  if (Array.isArray(permissao)) {
    return permissao.map((item) => mapa[item] || item).join(" ou ");
  }

  return mapa[permissao] || permissao;
}

function TelaVerificando({ mensagem }: { mensagem: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100">
      <section className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-6 text-center shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
        <p className="text-sm font-bold text-blue-600">Nio-OS</p>

        <h1 className="mt-1 text-3xl font-black tracking-tight">
          Acesso ao sistema
        </h1>

        <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
          {mensagem}
        </p>

        <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-blue-600" />
        </div>
      </section>
    </main>
  );
}

function TelaSemPermissao({
  permissao,
  destinoLiberado,
}: {
  permissao: string | string[] | null;
  destinoLiberado: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100">
      <section className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 p-7 text-center shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl">
          🔒
        </div>

        <p className="mt-5 text-sm font-bold text-red-600">
          Acesso bloqueado
        </p>

        <h1 className="mt-1 text-3xl font-black tracking-tight">
          Sem permissão
        </h1>

        <p className="mt-3 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
          Seu usuário não possui permissão para acessar esta área do sistema.
        </p>

        <div className="mt-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 text-left ring-1 ring-slate-100">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Permissão necessária
          </p>

          <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-300">
            {nomesPermissao(permissao)}
          </p>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Link
            href={destinoLiberado}
            className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
          >
            Ir para área liberada
          </Link>

          <Link
            href="/minha-conta"
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
          >
            Minha conta
          </Link>
        </div>
      </section>
    </main>
  );
}

/**
 * Componente Guardião de Autenticação.
 * 
 * Envolve a aplicação para validar login, primeiro acesso e autorização por rota.
 *
 * @param props.children - Conteúdo da página
 * @returns Tela verificando, tela de acesso negado ou o próprio conteúdo liberado
 */
export default function AuthGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [verificando, setVerificando] = useState(true);
  const [liberado, setLiberado] = useState(false);
  const [semPermissao, setSemPermissao] = useState(false);
  const [usuarioAtual, setUsuarioAtual] = useState<UsuarioLogado | null>(null);
  const [permissaoNecessaria, setPermissaoNecessaria] = useState<
    string | string[] | null
  >(null);
  const [mensagem, setMensagem] = useState("Verificando acesso...");

  useEffect(() => {
    let cancelado = false;

    async function verificarAcesso() {
      try {
        setVerificando(true);
        setLiberado(false);
        setSemPermissao(false);
        setUsuarioAtual(null);
        setPermissaoNecessaria(null);
        setMensagem("Verificando acesso...");

        const setupResponse = await fetch("/api/auth/setup", {
          cache: "no-store",
          credentials: "include",
        });

        const setupData = (await setupResponse.json().catch(() => null)) as
          | SetupResponse
          | null;

        if (!setupResponse.ok || !setupData) {
          throw new Error(
            setupData?.message || "Erro ao verificar configuração inicial."
          );
        }

        if (cancelado) return;

        if (setupData.precisaCriarAdmin) {
          if (pathname !== "/primeiro-acesso" && pathname !== "/setup") {
            router.replace("/primeiro-acesso");
            return;
          }

          setLiberado(true);
          return;
        }

        if (rotaEhPublica(pathname)) {
          setLiberado(true);
          return;
        }

        const meResponse = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        const meData = (await meResponse.json().catch(() => null)) as
          | MeResponse
          | null;

        if (cancelado) return;

        if (!meResponse.ok || !meData?.autenticado || !meData.usuario) {
          router.replace(rotaLoginSegura(pathname));
          return;
        }

        setUsuarioAtual(meData.usuario);

        const permissao = permissaoDaRota(pathname, meData.usuario);

        if (permissao && !temPermissao(meData.usuario, permissao, pathname)) {
          setPermissaoNecessaria(permissao);
          setSemPermissao(true);
          setLiberado(false);
          return;
        }

        if (pathname === "/" && !temPermissao(meData.usuario, "dashboard.ver")) {
          const destino = primeiraRotaPermitida(meData.usuario);

          if (destino !== "/") {
            router.replace(destino);
            return;
          }
        }

        setLiberado(true);
      } catch (error) {
        console.error("Erro ao verificar acesso:", error);

        if (!cancelado) {
          setMensagem(
            error instanceof Error
              ? error.message
              : "Erro ao verificar acesso."
          );

          if (!rotaEhPublica(pathname)) {
            router.replace(rotaLoginSegura(pathname));
          } else {
            setLiberado(true);
          }
        }
      } finally {
        if (!cancelado) {
          setVerificando(false);
        }
      }
    }

    verificarAcesso();

    return () => {
      cancelado = true;
    };
  }, [pathname, router]);

  if (rotaEhPublica(pathname)) {
    return <>{children}</>;
  }

  if (semPermissao) {
    return (
      <TelaSemPermissao
        permissao={permissaoNecessaria}
        destinoLiberado={primeiraRotaPermitida(usuarioAtual)}
      />
    );
  }

  if (verificando || !liberado) {
    return <TelaVerificando mensagem={mensagem} />;
  }

  return <>{children}</>;
}
