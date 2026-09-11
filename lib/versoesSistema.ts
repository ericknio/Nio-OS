/**
 * @file versoesSistema.ts
 * @description Gerenciador de versões, histórico de releases e Patch Notes do Nio-OS Desktop.
 * Controla o versionamento semântico (SemVer), changelogs detalhados, verificação de novas atualizações
 * e dados para exibição do modal pós-instalação no frontend.
 */

/**
 * Categorias de mudanças em um Patch Note de versão.
 */
export type TipoItemPatch = "adicionado" | "modificado" | "corrigido";

/**
 * Representa um item pontual de novidade ou correção em um release.
 */
export type ItemPatchNote = {
  tipo: TipoItemPatch;
  titulo: string;
  descricao?: string;
};

/**
 * Metadados completos de uma versão publicada do software.
 */
export type ReleaseInfo = {
  version: string;
  titulo: string;
  data: string;
  tamanhoAproximado?: string;
  obrigatoria?: boolean;
  downloadUrl?: string;
  resumo: string;
  itens: ItemPatchNote[];
};

/**
 * Versão atual em execução do software Nio-OS Desktop.
 */
export const VERSAO_ATUAL_SISTEMA = "0.1.4";

/**
 * Histórico decrescente de releases publicados com seus respectivos changelogs.
 */
export const HISTORICO_RELEASES: ReleaseInfo[] = [
  {
    version: "0.1.4",
    titulo: "Central de Atualizações e Fechamento de Caixa Aprimorado",
    data: "06/09/2026",
    tamanhoAproximado: "243 MB",
    downloadUrl: "/release/Nio-OS%20Setup%200.1.4.exe",
    resumo:
      "Novo módulo de atualizações automáticas com Patch Notes detalhado, estorno contábil ao cancelar OS no caixa do dia e proteção total dos lucros por técnico.",
    itens: [
      {
        tipo: "adicionado",
        titulo: "Central de Atualizações em Configurações",
        descricao:
          "Novo botão e aba dedicada para verificar novas versões, baixar o instalador e visualizar os Patch Notes com as mudanças de cada versão.",
      },
      {
        tipo: "adicionado",
        titulo: "Modal de Patch Notes Pós-Instalação",
        descricao:
          "Assim que o sistema é atualizado para uma nova versão, um painel comemorativo exibe automaticamente todas as novidades e melhorias adicionadas.",
      },
      {
        tipo: "adicionado",
        titulo: "Estorno Contábil Automático no Cancelamento de OS",
        descricao:
          "Ao cancelar uma Ordem de Serviço com valores pagos pelo cliente, o sistema gera automaticamente uma movimentação negativa de devolução no caixa do dia.",
      },
      {
        tipo: "adicionado",
        titulo: "Alerta Financeiro na Tela de Cancelamento",
        descricao:
          "Novo aviso visual em destaque informando ao operador o valor exato que será devolvido ao cliente e abatido da receita diária no caixa.",
      },
      {
        tipo: "modificado",
        titulo: "Fechamento Diário de Caixa Preciso",
        descricao:
          "O valor devolvido ao cliente diminui do caixa do dia em que a desistência ocorreu, permitindo que a conferência de gaveta bata 100% com a saída física.",
      },
      {
        tipo: "modificado",
        titulo: "Blindagem de Relatórios de Lucro e Comissões",
        descricao:
          "Atendentes e técnicos não visualizam mais os custos de peças ou lucros da loja. Técnicos agora visualizam estritamente suas próprias comissões.",
      },
      {
        tipo: "modificado",
        titulo: "Receita Líquida Real no Dashboard e Financeiro Geral",
        descricao:
          "Os relatórios e gráficos abatem automaticamente estornos de OS, exibindo o saldo líquido real do período e o detalhamento de recebimentos vs devoluções.",
      },
      {
        tipo: "corrigido",
        titulo: "Bate de Caixa em Ordens Canceladas",
        descricao:
          "Correção da divergência contábil onde ordens canceladas continuavam inflando a receita total do mês sem considerar o reembolso ao cliente.",
      },
      {
        tipo: "corrigido",
        titulo: "Reconciliação Retroativa no Banco de Dados",
        descricao:
          "Mecanismo automático que audita e reconcilia o banco de dados SQLite local na inicialização do aplicativo desktop, corrigindo ordens anteriores.",
      },
    ],
  },
  {
    version: "0.1.3",
    titulo: "Gestão de Comissões e Ajuste de Relatórios",
    data: "05/09/2026",
    tamanhoAproximado: "243 MB",
    resumo:
      "Comissão própria para atendentes e técnicos, visualização protegida de lucros e separação de permissões financeiras.",
    itens: [
      {
        tipo: "adicionado",
        titulo: "Aba de Lucro por Técnico com Acesso Próprio",
        descricao:
          "Permite que o técnico consulte exclusivamente suas comissões de mão de obra sem ter acesso aos dados financeiros gerais da loja.",
      },
      {
        tipo: "adicionado",
        titulo: "Comissão do Atendente em Vendas e OS",
        descricao:
          "Cálculo automatizado das comissões de produtos e atendimentos nos relatórios operacionais.",
      },
      {
        tipo: "modificado",
        titulo: "Filtros de Permissão nos Relatórios",
        descricao:
          "Usuários sem permissão financeira são direcionados automaticamente para a aba de sua própria comissão.",
      },
      {
        tipo: "corrigido",
        titulo: "Cálculo de Peças no Lucro Operacional",
        descricao:
          "Ajuste na separação entre custo de peças de reposição e margem de serviço na comissão técnica.",
      },
    ],
  },
  {
    version: "0.1.2",
    titulo: "Backup Automático e Estabilidade",
    data: "22/08/2026",
    tamanhoAproximado: "242 MB",
    resumo:
      "Rotina automática de backup na inicialização e aprimoramentos de segurança de dados locais.",
    itens: [
      {
        tipo: "adicionado",
        titulo: "Backup Automático ao Iniciar",
        descricao:
          "O sistema gera uma cópia segura do banco SQLite na pasta de backups sempre que o aplicativo é iniciado.",
      },
      {
        tipo: "modificado",
        titulo: "Melhorias de Performance no SQLite",
        descricao:
          "Otimização das consultas de listagem de ordens de serviço e clientes.",
      },
      {
        tipo: "corrigido",
        titulo: "Validação de Campos em Configurações",
        descricao:
          "Correção no salvamento de horário de funcionamento e termos de garantia.",
      },
    ],
  },
  {
    version: "0.1.1",
    titulo: "Lançamento do Nio-OS Desktop V11",
    data: "16/08/2026",
    tamanhoAproximado: "242 MB",
    resumo:
      "Versão inicial da arquitetura V11 com banco SQLite local isolado e suporte a rede local.",
    itens: [
      {
        tipo: "adicionado",
        titulo: "Arquitetura Desktop Offline First",
        descricao:
          "Operação 100% local com dados salvos em AppData sem dependência de internet para o funcionamento básico.",
      },
      {
        tipo: "adicionado",
        titulo: "Emissão de Recibos e Etiquetas Térmicas",
        descricao:
          "Geração de comprovantes de entrada e saída de OS com suporte a QR Code para acompanhamento pelo cliente.",
      },
    ],
  },
];

/**
 * Compara duas versões em formato semver (ex: "0.1.4" vs "0.1.3").
 * Retorna:
 *  1 se v1 > v2
 * -1 se v1 < v2
 *  0 se v1 === v2
 */
export function compararVersoes(v1: string, v2: string): number {
  const partes1 = v1.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const partes2 = v2.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);

  const maxLen = Math.max(partes1.length, partes2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = partes1[i] || 0;
    const num2 = partes2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}

/**
 * Retorna a versão corrente do sistema Nio-OS.
 * @returns String contendo a versão semântica (ex: "0.1.4")
 */
export function obterVersaoAtual(): string {
  return VERSAO_ATUAL_SISTEMA;
}

/**
 * Retorna os dados do release mais recente registrado no changelog.
 * @returns Objeto ReleaseInfo com notas e link de download
 */
export function obterReleaseMaisRecente(): ReleaseInfo {
  return HISTORICO_RELEASES[0];
}

/**
 * Busca os dados e Patch Notes de uma versão específica.
 * @param versao - Versão a ser consultada (com ou sem prefixo 'v')
 * @returns Objeto ReleaseInfo ou undefined se não encontrada
 */
export function obterPatchNote(versao: string): ReleaseInfo | undefined {
  const versaoLimpa = versao.replace(/^v/i, "").trim();
  return HISTORICO_RELEASES.find((r) => r.version === versaoLimpa);
}

/**
 * Compara a versão atual em execução com a mais recente publicada para identificar se há updates disponíveis.
 * @param versaoAtual - Versão de referência (padrão: VERSAO_ATUAL_SISTEMA)
 * @returns Objeto com flags, versão atual, versão mais recente e os dados do release se disponível
 */
export function verificarSeHaAtualizacao(versaoAtual = VERSAO_ATUAL_SISTEMA): {
  temAtualizacao: boolean;
  versaoAtual: string;
  versaoMaisRecente: string;
  releaseDisponivel?: ReleaseInfo;
} {
  const maisRecente = obterReleaseMaisRecente();
  const temAtualizacao = compararVersoes(maisRecente.version, versaoAtual) > 0;

  return {
    temAtualizacao,
    versaoAtual,
    versaoMaisRecente: maisRecente.version,
    releaseDisponivel: temAtualizacao ? maisRecente : undefined,
  };
}
