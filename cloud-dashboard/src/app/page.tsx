/**
 * @file page.tsx
 * @description Página inicial pública e tela de login principal do Cloud Dashboard.
 * Apresenta a identidade visual da plataforma com efeitos de luz ambiente (glow) em CSS,
 * cabeçalho estilizado em gradiente, formulário de autenticação administrativa (`LoginForm`)
 * e rodapé de conformidade com selo de conexão segura.
 *
 * @module CloudDashboard/App/HomePage
 */

import LoginForm from "@/components/LoginForm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Renderiza a tela de login pública do Cloud Dashboard.
 * Redireciona para o painel se já houver uma sessão ativa.
 * 
 * @returns {Promise<JSX.Element>} Estrutura da página de autenticação.
 */
export default async function Home() {
  const session = await getSession();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-[#090d16] text-white px-4 py-8 sm:px-6 md:px-12 overflow-hidden">
      {/* Luz ambiente de fundo (Glow sutil) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[550px] h-[550px] bg-blue-600/15 rounded-full blur-3xl opacity-70"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 right-1/4 w-[450px] h-[450px] bg-emerald-500/10 rounded-full blur-3xl opacity-60"
      />

      <div className="relative z-10 w-full max-w-md mx-auto flex flex-col items-center text-center">
        {/* Logo & Identidade */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/30 to-emerald-500/20 border border-blue-500/30 shadow-lg shadow-blue-500/10 mb-5">
          <svg
            className="w-8 h-8 text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
            />
          </svg>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-400">
          Nio-OS Cloud
        </h1>
        <p className="text-gray-400 text-sm mt-1.5 font-medium">
          Painel de Licenciamento & Revendas
        </p>

        {/* Card do Formulário */}
        <div className="w-full mt-6 bg-[#0f1422]/90 backdrop-blur-xl border border-gray-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/60">
          <div className="text-left mb-6">
            <h2 className="text-lg font-bold text-gray-100">Acesse sua conta</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Entre com seu usuário administrativo ou revendedor.
            </p>
          </div>

          <LoginForm />
        </div>

        {/* Rodapé de Segurança */}
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-gray-500 font-medium">
          <svg
            className="w-4 h-4 text-emerald-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <span>Conexão Segura Criptografada • Nio-OS</span>
        </div>
      </div>
    </main>
  );
}
