/**
 * @file permissoesSistema.ts
 * @description Definição da matriz de permissões de acesso (RBAC - Role-Based Access Control)
 * para os usuários do sistema local Nio-OS.
 * 
 * Controla granularmente o que cada funcionário (Administrador, Atendente, Técnico, Financeiro)
 * pode visualizar ou executar nas telas e menus do sistema.
 */

/**
 * Lista exaustiva de todas as permissões atômicas disponíveis no sistema.
 */
export const TODAS_PERMISSOES = [
  "dashboard.ver",

  "clientes.ver",
  "clientes.criar",
  "clientes.editar",
  "clientes.excluir",

  "ordens.ver",
  "ordens.criar",
  "ordens.editar",
  "ordens.alterar_status",
  "ordens.marcar_pronto",
  "ordens.finalizar",
  "ordens.cancelar",
  "ordens.reabrir",
  "ordens.imprimir",
  "ordens.anexos",
  "ordens.observacoes",

  "pagamentos.ver",
  "pagamentos.registrar",

  "produtos.ver",
  "produtos.criar",
  "produtos.editar",
  "produtos.excluir",

  "estoque.ver",
  "estoque.ajustar",

  "vendas.ver",
  "vendas.registrar",
  "vendas.cancelar",

  "relatorios.ver",
  "relatorios.financeiro",
  "garantias.ver",

  "configuracoes.ver",
  "configuracoes.editar",

  "usuarios.gerenciar",
] as const;

/**
 * Tipo literal que representa qualquer permissão válida no sistema.
 */
export type PermissaoSistema = (typeof TODAS_PERMISSOES)[number];

/**
 * Permissões básicas para operações com produtos e frente de caixa.
 */
const PERMISSOES_PRODUTOS_OPERACAO: PermissaoSistema[] = [
  "produtos.ver",
  "estoque.ver",
  "vendas.ver",
  "vendas.registrar",
];

/**
 * Permissões padrão atribuídas a funcionários da recepção/atendimento.
 */
const PERMISSOES_OS_ATENDIMENTO: PermissaoSistema[] = [
  "clientes.ver",
  "clientes.criar",
  "clientes.editar",
  "ordens.ver",
  "ordens.criar",
  "ordens.editar",
  "ordens.imprimir",
  "ordens.anexos",
  "ordens.observacoes",
  "pagamentos.registrar",
  "garantias.ver",
];

/**
 * Permissões padrão atribuídas a técnicos de bancada.
 */
const PERMISSOES_OS_TECNICO: PermissaoSistema[] = [
  "clientes.ver",
  "ordens.ver",
  "ordens.alterar_status",
  "ordens.marcar_pronto",
  "ordens.anexos",
  "ordens.observacoes",
  "ordens.imprimir",
  "garantias.ver",
];

/**
 * Permissões padrão atribuídas ao setor financeiro/gerencial.
 */
const PERMISSOES_FINANCEIRO: PermissaoSistema[] = [
  "clientes.ver",
  "ordens.ver",
  "pagamentos.ver",
  "pagamentos.registrar",
  "vendas.ver",
  "vendas.registrar",
  "vendas.cancelar",
  "relatorios.ver",
  "relatorios.financeiro",
  "garantias.ver",
];

/**
 * Agrupamento visual de permissões com títulos e rótulos para exibição na tela
 * de cadastro e edição de usuários do sistema.
 */
export const GRUPOS_PERMISSOES = [
  {
    titulo: "Painel inicial",
    permissoes: [
      {
        key: "dashboard.ver",
        label: "Ver painel inicial",
      },
    ],
  },
  {
    titulo: "Clientes",
    permissoes: [
      {
        key: "clientes.ver",
        label: "Ver clientes",
      },
      {
        key: "clientes.criar",
        label: "Criar clientes",
      },
      {
        key: "clientes.editar",
        label: "Editar clientes",
      },
      {
        key: "clientes.excluir",
        label: "Excluir clientes",
      },
    ],
  },
  {
    titulo: "Ordens de serviço",
    permissoes: [
      {
        key: "ordens.ver",
        label: "Ver OS",
      },
      {
        key: "ordens.criar",
        label: "Criar OS",
      },
      {
        key: "ordens.editar",
        label: "Editar OS",
      },
      {
        key: "ordens.alterar_status",
        label: "Alterar status",
      },
      {
        key: "ordens.marcar_pronto",
        label: "Marcar como pronto",
      },
      {
        key: "ordens.finalizar",
        label: "Finalizar / entregar OS",
      },
      {
        key: "ordens.cancelar",
        label: "Cancelar OS",
      },
      {
        key: "ordens.reabrir",
        label: "Reabrir OS",
      },
      {
        key: "ordens.imprimir",
        label: "Imprimir OS / garantia",
      },
      {
        key: "ordens.anexos",
        label: "Gerenciar anexos",
      },
      {
        key: "ordens.observacoes",
        label: "Observações internas",
      },
    ],
  },
  {
    titulo: "Produtos e estoque",
    permissoes: [
      {
        key: "produtos.ver",
        label: "Ver produtos",
      },
      {
        key: "produtos.criar",
        label: "Criar produtos",
      },
      {
        key: "produtos.editar",
        label: "Editar produtos",
      },
      {
        key: "produtos.excluir",
        label: "Excluir produtos definitivo",
      },
      {
        key: "estoque.ver",
        label: "Ver estoque",
      },
      {
        key: "estoque.ajustar",
        label: "Ajustar estoque",
      },
    ],
  },
  {
    titulo: "Vendas",
    permissoes: [
      {
        key: "vendas.ver",
        label: "Ver vendas",
      },
      {
        key: "vendas.registrar",
        label: "Registrar vendas",
      },
      {
        key: "vendas.cancelar",
        label: "Cancelar vendas",
      },
    ],
  },
  {
    titulo: "Financeiro",
    permissoes: [
      {
        key: "pagamentos.ver",
        label: "Ver pagamentos / extrato",
      },
      {
        key: "pagamentos.registrar",
        label: "Registrar pagamentos de OS",
      },
      {
        key: "relatorios.financeiro",
        label: "Ver custos, impostos, lucros e margens",
      },
    ],
  },
  {
    titulo: "Relatórios e garantias",
    permissoes: [
      {
        key: "relatorios.ver",
        label: "Ver relatórios simples",
      },
      {
        key: "garantias.ver",
        label: "Ver garantias",
      },
    ],
  },
  {
    titulo: "Administração",
    permissoes: [
      {
        key: "configuracoes.ver",
        label: "Ver configurações",
      },
      {
        key: "configuracoes.editar",
        label: "Editar configurações",
      },
      {
        key: "usuarios.gerenciar",
        label: "Gerenciar usuários",
      },
    ],
  },
] as const;

/**
 * Remove duplicatas de um vetor de permissões.
 *
 * @param permissoes - Lista de permissões possivelmente com duplicatas
 * @returns Lista contendo apenas itens únicos
 */
function unicas(permissoes: PermissaoSistema[]) {
  return Array.from(new Set(permissoes));
}

/**
 * Retorna o conjunto recomendado de permissões com base no cargo do usuário (Role).
 * 
 * - ADMIN: Acesso irrestrito a 100% dos recursos do sistema.
 * - ATENDENTE: Gestão de clientes, abertura de OS, impressão e recebimento de pagamentos.
 * - TECNICO: Visualização de OS, mudança de status para pronto, anexos e observações técnicas.
 * - FINANCEIRO: Fluxo de caixa, relatórios financeiros de margem e cancelamento de vendas.
 *
 * @param role - Perfil do usuário ("ADMIN", "ATENDENTE", "TECNICO", "FINANCEIRO")
 * @returns Lista de permissões atribuídas por padrão
 */
export function permissoesPadraoPorPerfil(role: string) {
  const perfil = String(role || "").toUpperCase();

  if (perfil === "ADMIN") {
    return [...TODAS_PERMISSOES];
  }

  if (perfil === "ATENDENTE") {
    return unicas([
      "dashboard.ver",
      ...PERMISSOES_OS_ATENDIMENTO,
      ...PERMISSOES_PRODUTOS_OPERACAO,
    ]);
  }

  if (perfil === "TECNICO") {
    return unicas([
      "dashboard.ver",
      ...PERMISSOES_OS_TECNICO,
      ...PERMISSOES_PRODUTOS_OPERACAO,
    ]);
  }

  if (perfil === "FINANCEIRO") {
    return unicas([
      "dashboard.ver",
      ...PERMISSOES_FINANCEIRO,
      ...PERMISSOES_PRODUTOS_OPERACAO,
    ]);
  }

  return unicas(["dashboard.ver", ...PERMISSOES_PRODUTOS_OPERACAO]);
}

/**
 * Sanitiza e normaliza uma lista de permissões recebida do banco de dados ou formulário.
 * Garante que administradores sempre tenham acesso total e que permissões inexistentes sejam descartadas.
 *
 * @param valor - Vetor de permissões brutas recebidas
 * @param role - Cargo do usuário
 * @returns Vetor de permissões válidas e únicas
 */
export function normalizarPermissoes(valor: unknown, role: string) {
  const perfil = String(role || "").toUpperCase();

  if (perfil === "ADMIN") {
    return [...TODAS_PERMISSOES];
  }

  const permitidas = new Set<string>(TODAS_PERMISSOES);

  const base = Array.isArray(valor)
    ? valor.map((item) => String(item || "").trim())
    : permissoesPadraoPorPerfil(role);

  return Array.from(new Set(base.filter((item) => permitidas.has(item))));
}
