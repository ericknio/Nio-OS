/**
 * @file page.tsx
 * @description Página de visualização de perfil e segurança do operador autenticado.
 * Exibe as informações detalhadas da conta (login, tipo de permissão, saldo de créditos, status
 * e data de cadastro) e apresenta instruções contextuais sobre a política de segurança de credenciais
 * para contas Master e contas de Revendedores subordinados.
 *
 * @module CloudDashboard/App/Dashboard/Profile
 */

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

/**
 * Renderiza a página de perfil da conta com informações cadastrais e regras de segurança.
 * 
 * @returns {Promise<JSX.Element>} Interface de dados do usuário autenticado.
 */
export default async function ProfilePage() {
  const session = await getSession();
  if (!session || !session.user?.id) {
    redirect("/");
  }

  const user = await prisma.adminUser.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    redirect("/");
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Minha Conta</h1>
        <p className="text-gray-400 mt-1">
          Gerencie seus dados de acesso e altere sua senha de segurança.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Card de Informações da Conta */}
        <div className="bg-[#111] p-6 rounded-xl border border-gray-800 shadow-xl space-y-4">
          <h3 className="text-lg font-bold text-white border-b border-gray-800 pb-3">
            Dados do Usuário
          </h3>

          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Login de Acesso
            </span>
            <p className="text-base font-medium text-gray-200 mt-0.5">{user.email}</p>
          </div>

          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Tipo de Permissão
            </span>
            <div className="mt-1">
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  user.role === "MASTER"
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                }`}
              >
                {user.role}
              </span>
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Saldo de Créditos
            </span>
            <p className="text-xl font-extrabold text-blue-400 mt-0.5">
              {user.credits.toLocaleString("pt-BR")}{" "}
              <span className="text-xs font-normal text-gray-400">
                (1 crédito = 1 mês de licença)
              </span>
            </p>
          </div>

          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Status da Conta
            </span>
            <p className="text-sm font-medium text-emerald-400 mt-0.5">
              ● {user.status === "ACTIVE" ? "Ativo" : "Inativo"}
            </p>
          </div>

          <div className="pt-2 border-t border-gray-800/80">
            <span className="text-xs text-gray-500">
              Conta criada em: {new Date(user.createdAt).toLocaleDateString("pt-BR")}
            </span>
          </div>
        </div>

        {/* Gerenciamento de Credenciais */}
        {user.role === "MASTER" ? (
          <div className="bg-[#111] p-6 rounded-xl border border-purple-500/20 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 text-lg">
                🔒
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Conta Master Protegida</h3>
                <p className="text-xs text-purple-400 font-medium">Administração Direta do Sistema</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              As credenciais desta conta Administrador Master não são alteradas pelo painel web. Qualquer modificação de login ou senha é realizada diretamente no ambiente seguro do servidor.
            </p>
            <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg text-xs text-gray-300 space-y-1">
              <p>✓ Nível de Acesso Total (Superadmin / Master)</p>
              <p>✓ Proteção contra alterações acidentais via painel</p>
            </div>
          </div>
        ) : (
          <div className="bg-[#111] p-6 rounded-xl border border-blue-500/20 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 text-lg">
                🛡️
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Conta de Revendedor Gerenciada</h3>
                <p className="text-xs text-blue-400 font-medium">Controle Centralizado de Acesso</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              O seu login e a sua senha de acesso são gerenciados pelo revendedor supervisor ou administrador que cadastrou sua conta.
            </p>
            <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl text-xs text-gray-300 space-y-2">
              <p className="flex items-start gap-2">
                <span className="text-blue-400 font-bold mt-0.5">•</span>
                <span>Caso necessite alterar seu login ou redefinir sua senha, solicite diretamente ao seu revendedor supervisor.</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold mt-0.5">•</span>
                <span>Você tem controle total para alterar o login e a senha dos <strong>revendedores parceiros que você cadastrou</strong> acessando a aba <strong>Revendedores</strong>.</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
