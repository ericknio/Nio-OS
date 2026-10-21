/**
 * @file page.tsx
 * @description Página de listagem e controle da rede de parceiros revendedores (`/dashboard/resellers`).
 * Recupera os revendedores via Prisma com contagem agregada de clientes e sub-revendedores (`_count`).
 * Administradores `MASTER` visualizam todos os revendedores, enquanto usuários `RESELLER` visualizam apenas os sub-parceiros criados por eles.
 *
 * @module CloudDashboard/App/Dashboard/Resellers/Page
 */

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import ResellersList from "@/components/ResellersList";

/**
 * Renderiza a listagem de parceiros revendedores com contadores e botão de novo cadastro.
 * 
 * @returns {Promise<JSX.Element>} Página de revendedores com listagem filtrável.
 */
export default async function ResellersPage() {
  const session = await getSession();
  const user = session?.user;

  if (!user) {
    redirect("/");
  }

  const isMaster = user.role === "MASTER";

  const resellers = await prisma.adminUser.findMany({
    where: {
      role: "RESELLER",
      ...(isMaster ? {} : { creatorId: user.id }),
    },
    include: {
      _count: {
        select: {
          clients: true,
          subResellers: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {isMaster ? "Todos os Revendedores" : "Meus Revendedores"}
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
            {isMaster
              ? "Gerencie todos os parceiros revendedores autorizados e seus créditos."
              : "Gerencie os revendedores parceiros criados por você e transfira créditos."}
          </p>
        </div>
        <Link
          href="/dashboard/resellers/new"
          className="inline-flex items-center justify-center min-h-[48px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-900/30 transition-all shrink-0"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Novo Revendedor
        </Link>
      </div>

      <ResellersList resellers={resellers} />
    </div>
  );
}
