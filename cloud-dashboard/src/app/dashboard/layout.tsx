/**
 * @file layout.tsx
 * @description Layout protegido da área administrativa (Dashboard Layout).
 * Executa verificação de sessão de usuário no servidor via `getSession`, redirecionando visitantes
 * não autenticados para a tela inicial. Recupera o saldo atual de créditos do administrador/revendedor
 * e estrutura o layout unificado com a barra de navegação (`DashboardNav`) e o cabeçalho superior.
 *
 * @module CloudDashboard/App/Dashboard/Layout
 */

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import DashboardNav from "@/components/DashboardNav";

/**
 * Layout mestre para todas as rotas protegidas sob o caminho `/dashboard`.
 * 
 * @param {Object} props - Propriedades do componente.
 * @param {React.ReactNode} props.children - Conteúdo da página filha renderizada.
 * @returns {Promise<JSX.Element>} Estrutura visual com barra de navegação e área de conteúdo.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const { user } = session;

  const adminData = await prisma.adminUser.findUnique({
    where: { id: user.id },
    select: { credits: true },
  });

  return (
    <div className="min-h-screen bg-[#090d16] text-white flex flex-col">
      {/* Navegação responsiva unificada (Sidebar Desktop + Topbar/Drawer/BottomBar Mobile) */}
      <DashboardNav user={user} credits={adminData?.credits} />

      {/* Conteúdo Principal com compensação da Sidebar no desktop e da BottomBar no mobile */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        {/* Header Desktop */}
        <header className="hidden md:flex h-16 border-b border-gray-800/80 items-center justify-between px-8 bg-[#0c101a]/60 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-300">
              Painel Administrativo Cloud
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Sessão Ativa
            </span>
          </div>
        </header>

        {/* Área de Visualização com padding seguro no mobile */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 pb-24 md:pb-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
