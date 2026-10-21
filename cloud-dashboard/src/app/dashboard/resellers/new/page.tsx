/**
 * @file page.tsx
 * @description Página de criação de novos revendedores parceiros (`/dashboard/resellers/new`).
 * Consulta o saldo atual de créditos do operador para calcular limites de transferência inicial obrigatória
 * e renderiza o formulário `ResellerForm`.
 *
 * @module CloudDashboard/App/Dashboard/Resellers/New
 */

import ResellerForm from "@/components/ResellerForm";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

/**
 * Renderiza a tela de cadastro de novos revendedores.
 * 
 * @returns {Promise<JSX.Element>} Formulário de criação de parceiro revendedor.
 */
export default async function NewResellerPage() {
  const session = await getSession();
  const user = session?.user;

  if (!user) {
    redirect("/");
  }

  const isMaster = user.role === "MASTER";

  const adminData = await prisma.adminUser.findUnique({
    where: { id: user.id },
    select: { credits: true },
  });

  const availableCredits = adminData?.credits ?? 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/resellers"
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#111] hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white transition flex items-center gap-1.5 text-sm font-semibold"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Novo Revendedor</h1>
      </div>

      <p className="text-xs sm:text-sm text-gray-400">
        {isMaster
          ? "Crie uma conta para um novo parceiro revendedor e defina a quantidade inicial de créditos disponíveis."
          : `Como revendedor, você pode cadastrar parceiros transferindo no mínimo 10 créditos do seu saldo atual. (Saldo disponível: ${availableCredits} créditos)`}
      </p>

      <div className="pt-2">
        <ResellerForm userRole={user.role} availableCredits={availableCredits} />
      </div>
    </div>
  );
}
