/**
 * @file DashboardNav.tsx
 * @description Componente de navegação principal do Cloud Dashboard com arquitetura híbrida e responsiva.
 * Integra 4 camadas de navegação: sidebar desktop fixa lateral, barra de topo mobile compacta (header),
 * gaveta deslizante (Slide-over drawer) com fechamento automático em mudança de rota ou tecla Escape,
 * e barra de navegação inferior (Bottom navigation bar) otimizada para toque com uma mão em celulares.
 *
 * @module CloudDashboard/Components/DashboardNav
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";

/**
 * Propriedades esperadas pelo componente de navegação do painel.
 */
interface DashboardNavProps {
  user: {
    id: string;
    email: string;
    role: string;
  };
  credits?: number;
}

/**
 * Renderiza o ecossistema de navegação responsivo do Cloud Dashboard.
 * 
 * Arquitetura de interface:
 * - Telas `>= 768px` (Desktop): Barra lateral fixa com logo, saldo de créditos, links verticais, cartão de usuário e logout.
 * - Telas `< 768px` (Mobile):
 *   - Topbar fixa com indicador de créditos e botão hambúrguer.
 *   - Slide-over drawer com backdrop animado para menu completo.
 *   - Bottom Nav Bar com ícones e rótulos de navegação rápida ao alcance do polegar.
 * 
 * @param {DashboardNavProps} props - Dados do usuário logado e saldo de créditos da carteira.
 * @returns {JSX.Element} Estrutura completa de navegação do painel.
 */
export default function DashboardNav({ user, credits }: DashboardNavProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Fecha o menu móvel ao mudar de rota durante a renderização
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
  }

  // Fecha ao pressionar Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navItems = [
    {
      label: "Visão Geral",
      href: "/dashboard",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      label: "Meus Clientes",
      href: "/dashboard/clients",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: "Revendedores",
      href: "/dashboard/resellers",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      label: "Download",
      href: "/dashboard/download",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      ),
    },
    {
      label: "Minha Conta",
      href: "/dashboard/profile",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* ============================================================== */}
      {/* 1. SIDEBAR DESKTOP (Fixa à esquerda para telas >= 768px)         */}
      {/* ============================================================== */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-[#0c101a] border-r border-gray-800/80 z-30">
        {/* Header do Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-800/80 gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 leading-none">
              Nio-OS Cloud
            </h1>
            <span className="text-[10px] text-gray-400 font-medium tracking-wider uppercase">
              Painel Web
            </span>
          </div>
        </div>

        {/* Badge de Créditos no Desktop */}
        {typeof credits === "number" && (
          <div className="px-4 pt-4 pb-1">
            <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/40 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-400 font-medium">Seus Créditos</p>
                <p className="text-lg font-extrabold text-blue-400">{credits}</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                1 cr = 1 mês
              </span>
            </div>
          </div>
        )}

        {/* Links de Navegação */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl font-medium text-sm transition-all ${
                  active
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold"
                    : "text-gray-300 hover:bg-[#141a29] hover:text-white"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Perfil & Logout */}
        <div className="p-3 border-t border-gray-800/80">
          <Link
            href="/dashboard/profile"
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#141a29] transition-colors mb-2 text-left"
          >
            <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center font-bold text-xs uppercase shrink-0">
              {user.email.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate" title={user.email}>
                {user.email}
              </p>
              <span className="inline-block text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                {user.role}
              </span>
            </div>
          </Link>

          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-semibold text-xs transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Desconectar</span>
            </button>
          </form>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* 2. TOPBAR MOBILE (Fixa no topo para celulares e tablets < 768px)*/}
      {/* ============================================================== */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-[#0c101a]/95 backdrop-blur-md border-b border-gray-800/80">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-400 flex items-center justify-center text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <span className="font-bold text-sm bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
            Nio-OS Cloud
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {typeof credits === "number" && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 font-bold">
              {credits} cr
            </span>
          )}

          {/* Botão Hambúrguer Mobile com tap target de 44px */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#141a29] border border-gray-700/60 text-gray-200 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ============================================================== */}
      {/* 3. SLIDE-OVER DRAWER MOBILE (Menu lateral deslizante)           */}
      {/* ============================================================== */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop escurecido */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Gaveta lateral deslizante */}
          <div className="relative w-4/5 max-w-xs bg-[#0c101a] border-r border-gray-800 flex flex-col h-full z-10 shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Header da gaveta */}
            <div className="h-14 px-4 border-b border-gray-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-emerald-400 flex items-center justify-center text-white">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </div>
                <span className="font-bold text-sm text-white">Menu Nio-OS</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-gray-400 hover:text-white rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Links da Gaveta */}
            <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
              {navItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? "bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30"
                        : "text-gray-300 hover:bg-[#141a29] hover:text-white"
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Rodapé da Gaveta */}
            <div className="p-4 border-t border-gray-800/80">
              <div className="mb-3">
                <p className="text-xs text-gray-400">Logado como:</p>
                <p className="text-sm font-semibold text-white truncate">{user.email}</p>
                <span className="inline-block mt-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  {user.role}
                </span>
              </div>

              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 font-semibold text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Sair da Conta</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. BOTTOM NAVIGATION BAR MOBILE (Barra inferior com polegar)    */}
      {/* ============================================================== */}
      <nav
        aria-label="Navegação rápida móvel"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-[#0c101a]/95 backdrop-blur-lg border-t border-gray-800/80 flex items-center justify-around px-2"
      >
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg transition-all min-w-[60px] ${
                active
                  ? "text-blue-400 font-bold scale-105"
                  : "text-gray-400 hover:text-gray-200 text-xs font-normal"
              }`}
            >
              <div className={active ? "text-blue-400" : "text-gray-400"}>
                {item.icon}
              </div>
              <span className="text-[10px] mt-0.5 truncate max-w-[70px]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
