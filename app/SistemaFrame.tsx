"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import UsuarioLogadoBox from "./UsuarioLogadoBox";
import { useUsuarioPermissoes } from "./Permissao";
import { ThemeToggle } from "./ThemeToggle";
import ModalPatchNotes from "./components/ModalPatchNotes";

type ConfiguracoesSistema = {
  nomeEmpresa?: string | null;
  companyName?: string | null;
  nomeFantasia?: string | null;
  tradeName?: string | null;
  productsModuleEnabled?: boolean | null;
  osModuleEnabled?: boolean | null;
};

type DashboardData = {
  osAbertas?: number;
  osAtrasadas?: number;
  clientes?: number;
  garantiasVencendo?: number;
};

type MenuExtra = "clientes" | "garantias" | "atrasadas" | "›";

type MenuLeaf = {
  kind: "link";
  label: string;
  href: string;
  permissao: string | string[];
  extra?: MenuExtra;
  modulo?: "produtos" | "os";
};

type MenuGroup = {
  kind: "group";
  key: string;
  label: string;
  children: MenuLeaf[];
  modulo?: "produtos" | "os";
  contador?: "os" | "children";
};

type MenuNode = MenuLeaf | MenuGroup;

type MenuSection = {
  titulo: string;
  items: MenuNode[];
};

const MENU_SECTIONS: MenuSection[] = [
  {
    titulo: "Gestão",
    items: [
      {
        kind: "link",
        label: "Painel inicial",
        href: "/",
        permissao: "dashboard.ver",
      },
      {
        kind: "group",
        key: "ordens",
        label: "Ordens de Serviço",
        contador: "os",
        modulo: "os",
        children: [
          {
            kind: "link",
            label: "Todas as OS",
            href: "/ordens",
            extra: "›",
            permissao: "ordens.ver",
          },
          {
            kind: "link",
            label: "Nova OS",
            href: "/ordens/nova",
            extra: "›",
            permissao: "ordens.criar",
          },
          {
            kind: "link",
            label: "Relatórios OS",
            href: "/relatorios",
            extra: "›",
            permissao: "relatorios.ver",
          },
        ],
      },
      {
        kind: "link",
        label: "Clientes",
        href: "/clientes",
        extra: "clientes",
        permissao: "clientes.ver",
      },
      {
        kind: "group",
        key: "produtos",
        label: "Produtos",
        contador: "children",
        modulo: "produtos",
        children: [
          {
            kind: "link",
            label: "Cadastro de produtos",
            href: "/produtos",
            extra: "›",
            permissao: "produtos.ver",
            modulo: "produtos",
          },
          {
            kind: "link",
            label: "Vendas produtos",
            href: "/produtos/vendas",
            extra: "›",
            permissao: "vendas.ver",
            modulo: "produtos",
          },
          {
            kind: "link",
            label: "Frente de Caixa",
            href: "/produtos/vendas/nova",
            extra: "›",
            permissao: "vendas.registrar",
            modulo: "produtos",
          },
          {
            kind: "link",
            label: "Estoque",
            href: "/produtos/estoque",
            extra: "›",
            permissao: "estoque.ver",
            modulo: "produtos",
          },
          {
            kind: "link",
            label: "Relat. produtos",
            href: "/produtos/relatorios",
            extra: "›",
            permissao: ["relatorios.ver", "relatorios.financeiro"],
            modulo: "produtos",
          },
        ],
      },
      {
        kind: "link",
        label: "Estoque técnico",
        href: "/estoque-tecnico",
        extra: "›",
        permissao: "estoque.ver",
        modulo: "os",
      },
    ],
  },
  {
    titulo: "Financeiro",
    items: [
      {
        kind: "link",
        label: "Financeiro geral",
        href: "/financeiro-geral",
        extra: "›",
        permissao: ["relatorios.ver", "relatorios.financeiro"],
      },
    ],
  },
  {
    titulo: "Controle",
    items: [
      {
        kind: "link",
        label: "Garantias",
        href: "/garantias",
        extra: "garantias",
        permissao: "garantias.ver",
        modulo: "os",
      },
      {
        kind: "link",
        label: "OS atrasadas",
        href: "/ordens/atrasadas",
        extra: "atrasadas",
        permissao: "ordens.ver",
        modulo: "os",
      },
    ],
  },
  {
    titulo: "Sistema",
    items: [
      {
        kind: "link",
        label: "Configurações",
        href: "/configuracoes",
        extra: "›",
        permissao: "configuracoes.editar",
      },
      {
        kind: "link",
        label: "Usuários do sistema",
        href: "/usuarios-sistema",
        extra: "›",
        permissao: "usuarios.gerenciar",
      },
    ],
  },
];

function numeroSeguro(valor: unknown) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

function itemAtivo(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function primeiraLetra(valor: string) {
  return valor.trim().charAt(0).toUpperCase() || "N";
}

function BrandLogo({ nome, tamanho = "md" }: { nome: string; tamanho?: "md" | "sm" }) {
  const [erro, setErro] = useState(false);

  if (tamanho === "sm") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        {!erro ? (
          <img
            src="/uploads/logo.png"
            alt={nome}
            className="h-full w-full object-contain"
            onError={() => setErro(true)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-xs">
            {primeiraLetra(nome)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center group-hover:scale-105 transition-transform duration-200">
      {!erro ? (
        <img
          src="/uploads/logo.png"
          alt={nome}
          className="h-full w-full object-contain max-h-11 max-w-11"
          onError={() => setErro(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-base shadow-sm">
          {primeiraLetra(nome)}
        </span>
      )}
    </div>
  );
}

function lerModuloProdutosCache() {
  if (typeof window === "undefined") return true;

  const valor = window.localStorage.getItem("nio-os-products-module-enabled");
  if (valor === null) return true;

  return valor === "true";
}

function lerModuloOSCache() {
  if (typeof window === "undefined") return true;

  const valor = window.localStorage.getItem("nio-os-os-module-enabled");
  if (valor === null) return true;

  return valor === "true";
}

export default function SistemaFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { carregando: carregandoPermissoes, tem, usuario } = useUsuarioPermissoes();

  const [dados, setDados] = useState<DashboardData | null>(null);
  const [config, setConfig] = useState<ConfiguracoesSistema | null>(null);
  const [productsModuleEnabled, setProductsModuleEnabled] = useState(
    lerModuloProdutosCache
  );
  const [osModuleEnabled, setOsModuleEnabled] = useState(
    lerModuloOSCache
  );
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({
    ordens: pathname.startsWith("/ordens") || pathname.startsWith("/relatorios"),
    produtos: pathname.startsWith("/produtos"),
  });

  const secoesPermitidas = useMemo(() => {
    if (carregandoPermissoes) return [];

    function filtrarItem(item: MenuNode): MenuNode | null {
      if (item.modulo === "produtos" && !productsModuleEnabled) {
        return null;
      }
      if (item.modulo === "os" && !osModuleEnabled) {
        return null;
      }

      if (item.kind === "link") {
        if (item.href === "/relatorios" && usuario?.role === "TECNICO") {
          return item;
        }
        if (item.href === "/produtos/relatorios" && usuario?.role === "ATENDENTE") {
          return item;
        }
        return tem(item.permissao) ? item : null;
      }

      const filhos = item.children.filter((child) => {
        if (child.modulo === "produtos" && !productsModuleEnabled) return false;
        if (child.modulo === "os" && !osModuleEnabled) return false;
        if (child.href === "/relatorios" && usuario?.role === "TECNICO") {
          return true;
        }
        if (child.href === "/produtos/relatorios" && usuario?.role === "ATENDENTE") {
          return true;
        }
        return tem(child.permissao);
      });

      if (filhos.length === 0) return null;

      return {
        ...item,
        children: filhos,
      };
    }

    return MENU_SECTIONS
      .map((secao) => {
        const items = secao.items
          .map(filtrarItem)
          .filter((item): item is MenuNode => item !== null);

        return {
          ...secao,
          items,
        };
      })
      .filter((secao) => secao.items.length > 0);
  }, [carregandoPermissoes, productsModuleEnabled, osModuleEnabled, tem, usuario]);

  const nomeLoja =
    config?.nomeFantasia?.trim() ||
    config?.tradeName?.trim() ||
    config?.nomeEmpresa?.trim() ||
    config?.companyName?.trim() ||
    "Nio-OS";

  function valorExtra(extra?: MenuExtra) {
    if (!extra) return "";
    if (extra === "›") return extra;
    if (!dados) return "";

    if (extra === "clientes") return String(numeroSeguro(dados.clientes));
    if (extra === "garantias") {
      return String(numeroSeguro(dados.garantiasVencendo));
    }
    if (extra === "atrasadas") {
      return String(numeroSeguro(dados.osAtrasadas));
    }

    return "";
  }

  function contadorGrupo(item: MenuGroup) {
    if (item.contador === "os") {
      return dados ? String(numeroSeguro(dados.osAbertas)) : "";
    }

    if (item.contador === "children") {
      return String(item.children.length);
    }

    return "";
  }

  function grupoAtivo(item: MenuGroup) {
    return item.children.some((child) => itemAtivo(pathname, child.href));
  }

  function alternarGrupo(key: string) {
    setGruposAbertos((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function getMenuIcon(label: string, isGroup = false) {
    const l = label.toLowerCase();
    if (l.includes("painel")) {
      return (
        <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
      );
    }
    if (l.includes("ordens") || l.includes("os")) {
      return (
        <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    }
    if (l.includes("clientes")) {
      return (
        <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    }
    if (l.includes("produtos") || l.includes("estoque")) {
      return (
        <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      );
    }
    if (l.includes("caixa") || l.includes("vendas")) {
      return (
        <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="21" r="1" />
          <circle cx="19" cy="21" r="1" />
          <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
        </svg>
      );
    }
    if (l.includes("financeiro")) {
      return (
        <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" x2="12" y1="2" y2="22" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    }
    if (l.includes("garantias")) {
      return (
        <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    }
    if (l.includes("atrasadas")) {
      return (
        <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    }
    if (l.includes("relat")) {
      return (
        <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
      );
    }
    if (l.includes("configura")) {
      return (
        <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    }
    if (l.includes("usu")) {
      return (
        <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="5" />
          <path d="M20 21a8 8 0 0 0-16 0" />
        </svg>
      );
    }
    if (l.includes("nova os")) {
      return (
        <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    }
    return (
      <svg className="w-3.5 h-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2" />
      </svg>
    );
  }

  function renderLink(item: MenuLeaf, nested = false) {
    const ativo = itemAtivo(pathname, item.href);
    const extra = valorExtra(item.extra);

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
          nested
            ? ativo
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-md shadow-blue-500/20"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white"
            : ativo
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-md shadow-blue-500/20"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className={ativo ? "text-white" : "text-slate-400 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"}>
            {getMenuIcon(item.label)}
          </span>
          <span className="truncate">{item.label}</span>
        </span>

        {extra && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-black transition-all ${
              item.extra === "atrasadas"
                ? "bg-red-500/15 text-red-600 dark:text-red-400 ring-1 ring-red-500/30"
                : ativo
                  ? "bg-white/20 text-white"
                  : "bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            }`}
          >
            {extra}
          </span>
        )}
      </Link>
    );
  }

  function renderNode(item: MenuNode, nested = false) {
    if (item.kind === "link") {
      return renderLink(item, nested);
    }

    const aberto = gruposAbertos[item.key] ?? false;
    const ativo = grupoAtivo(item);
    const contador = contadorGrupo(item);

    return (
      <div key={item.key} className="space-y-1">
        <button
          type="button"
          onClick={() => alternarGrupo(item.key)}
          className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
            ativo && !aberto
              ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 ring-1 ring-blue-500/20 font-bold"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <span className={ativo ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"}>
              {getMenuIcon(item.label, true)}
            </span>
            <span className="truncate">{item.label}</span>
          </span>

          <span className="flex items-center gap-2">
            {contador && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-black ${
                  ativo
                    ? "bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300"
                    : "bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                {contador}
              </span>
            )}

            <svg
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                aberto ? "rotate-90 text-blue-600 dark:text-blue-400" : ""
              }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </button>

        {aberto && (
          <div className="ml-3.5 space-y-1 border-l-2 border-slate-200/80 dark:border-slate-800 pl-3 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
            {item.children.map((child) => renderLink(child, true))}
          </div>
        )}
      </div>
    );
  }

  useEffect(() => {
    setGruposAbertos((prev) => ({
      ...prev,
      ordens:
        prev.ordens ||
        pathname.startsWith("/ordens") ||
        pathname.startsWith("/relatorios"),
      produtos: prev.produtos || pathname.startsWith("/produtos"),
    }));
  }, [pathname]);

  useEffect(() => {
    let ativo = true;

    async function carregarConfiguracoes() {
      try {
        const response = await fetch(`/api/configuracoes?t=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });

        const data = await response.json().catch(() => null);

        if (!ativo || !response.ok || !data) return;

        const moduloAtivo = data.productsModuleEnabled !== false;
        const moduloOsAtivo = data.osModuleEnabled !== false;

        setConfig(data);
        setProductsModuleEnabled(moduloAtivo);
        setOsModuleEnabled(moduloOsAtivo);

        window.localStorage.setItem(
          "nio-os-products-module-enabled",
          String(moduloAtivo)
        );
        window.localStorage.setItem(
          "nio-os-os-module-enabled",
          String(moduloOsAtivo)
        );
      } catch {
        if (ativo) {
          setConfig(null);
        }
      }
    }

    async function carregarDashboard() {
      if (carregandoPermissoes || !tem("dashboard.ver")) {
        if (ativo) setDados(null);
        return;
      }

      try {
        const response = await fetch(`/api/dashboard?t=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });

        const data = await response.json().catch(() => null);

        if (ativo) {
          setDados(response.ok ? data : null);
        }
      } catch {
        if (ativo) setDados(null);
      }
    }

    carregarConfiguracoes();
    carregarDashboard();

    return () => {
      ativo = false;
    };
  }, [pathname, carregandoPermissoes, tem]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 lg:flex">
      {/* Sidebar Desktop */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl lg:flex shadow-sm">
        {/* Brand Header */}
        <div className="border-b border-slate-100 dark:border-slate-800/60 p-4">
          <Link href="/" className="flex items-center gap-3 group">
            <BrandLogo nome={nomeLoja} />

            <div className="min-w-0">
              <p className="line-clamp-1 text-base font-extrabold tracking-tight text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {nomeLoja}
              </p>

              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20">
                  NIO-OS
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" title="Sistema Operacional Ativo" />
              </div>
            </div>
          </Link>

          {!carregandoPermissoes && tem("ordens.criar") && (
            <Link
              href="/ordens/nova"
              className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold py-2.5 px-3 shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30 transition-all duration-200 active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Nova Ordem de Serviço</span>
            </Link>
          )}
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {secoesPermitidas.map((secao) => (
            <div key={secao.titulo}>
              <p className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                {secao.titulo}
              </p>

              <div className="space-y-0.5">
                {secao.items.map((item) => renderNode(item))}
              </div>
            </div>
          ))}
        </nav>

        {/* User Card & Logout */}
        <div className="border-t border-slate-100 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/50">
          <UsuarioLogadoBox />
        </div>
      </aside>

      {/* Mobile Top Header */}
      <div className="lg:hidden">
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <BrandLogo nome={nomeLoja} tamanho="sm" />

            <strong className="line-clamp-1 text-sm font-bold text-slate-900 dark:text-white">{nomeLoja}</strong>
          </Link>

          <div className="flex items-center gap-2">
            {!carregandoPermissoes && tem("ordens.criar") && (
              <Link
                href="/ordens/nova"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-500 transition"
              >
                + Nova OS
              </Link>
            )}
            <ThemeToggle />
          </div>
        </div>

        <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <nav className="space-y-4">
            {secoesPermitidas.map((secao) => (
              <div key={secao.titulo}>
                <p className="mb-1.5 px-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">
                  {secao.titulo}
                </p>

                <div className="space-y-1">
                  {secao.items.map((item) => renderNode(item))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="min-w-0 flex-1 lg:ml-64 relative min-h-screen">
        <div className="hidden lg:block absolute top-5 right-6 z-30">
          <div className="glass-panel rounded-xl p-1 shadow-sm">
            <ThemeToggle />
          </div>
        </div>
        {children}
      </main>

      <ModalPatchNotes />
    </div>
  );
}