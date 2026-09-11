/**
 * @file configuracoesSistema.ts
 * @description Centraliza o acesso, normalização e resolução das configurações da empresa/sistema.
 * Fornece fallback seguro com valores padrão, busca direta no banco de dados SQLite (via Prisma)
 * e formatação de cabeçalhos/rodapés de documentos impressos (recibos e termos).
 */

import { prisma } from "@/lib/prisma";

/**
 * Estrutura tipada de configurações da empresa no Nio-OS.
 */
export type ConfiguracoesSistema = {
  nomeEmpresa: string;
  telefone: string;
  whatsapp: string;
  email: string;
  documento: string;
  endereco: string;
  cidade: string;
  estado: string;
  rodape: string;
  logoUrl: string;
  warrantyText: string;
  operadorPadrao: string;
  productsModuleEnabled: boolean;
};

const warrantyTextPadrao = `A garantia cobre exclusivamente o serviço realizado e as peças substituídas descritas neste termo.

A garantia não cobre mau uso, queda, oxidação, contato com líquido, violação por terceiros, danos físicos, uso de carregadores ou acessórios inadequados, instalação de aplicativos maliciosos, formatação feita por terceiros ou qualquer defeito diferente do reparo realizado.

Para acionar a garantia, o cliente deverá apresentar este termo juntamente com a Ordem de Serviço correspondente.`;

/**
 * Configurações padrão de fábrica do Nio-OS utilizadas caso nenhuma configuração
 * tenha sido persistida ainda no banco de dados.
 */
const configPadrao: ConfiguracoesSistema = {
  nomeEmpresa: "Nio-OS",
  telefone: "",
  whatsapp: "",
  email: "",
  documento: "",
  endereco: "",
  cidade: "",
  estado: "",
  rodape: "Obrigado pela preferência.",
  logoUrl: "/uploads/logo.png",
  operadorPadrao: "Sistema",
  productsModuleEnabled: true,
  warrantyText: warrantyTextPadrao,
};

/**
 * Converte qualquer valor recebido para string limpa, removendo espaços excedentes nas pontas.
 * @param valor - Dado a ser sanitizado
 * @returns String formatada ou vazia
 */
function texto(valor: unknown) {
  return String(valor || "").trim();
}

/**
 * Mapeia e normaliza registros do banco de dados para a estrutura tipada ConfiguracoesSistema,
 * lidando com múltiplos aliases legados (ex: companyName/nomeFantasia/tradeName).
 * @param data - Registro bruto obtido do banco ou API
 * @returns Objeto ConfiguracoesSistema normalizado
 */
function montarConfig(data: Record<string, any> | null | undefined) {
  if (!data) return configPadrao;

  return {
    warrantyText: texto(data.warrantyText) || configPadrao.warrantyText,

    nomeEmpresa:
      texto(data.nomeEmpresa) ||
      texto(data.companyName) ||
      texto(data.nomeFantasia) ||
      texto(data.tradeName) ||
      configPadrao.nomeEmpresa,

    telefone: texto(data.telefone) || texto(data.phone),
    whatsapp: texto(data.whatsapp),
    email: texto(data.email),

    documento: texto(data.documento) || texto(data.cnpj),

    endereco: texto(data.endereco) || texto(data.address),
    cidade: texto(data.cidade) || texto(data.city),
    estado: texto(data.estado) || texto(data.state),

    rodape: texto(data.rodape) || texto(data.footerText) || configPadrao.rodape,

    logoUrl: texto(data.logoUrl) || configPadrao.logoUrl,

    operadorPadrao:
      texto(data.operadorPadrao) ||
      texto(data.defaultOperator) ||
      configPadrao.operadorPadrao,

    productsModuleEnabled: data.productsModuleEnabled !== false,
  };
}

/**
 * Consulta a tabela CompanySettings diretamente no banco SQLite via Prisma.
 * @returns Configurações normalizadas ou null em caso de falha de conexão
 */
async function buscarConfiguracoesDireto() {
  try {
    const configuracoes = await prisma.companySettings.findFirst();
    return montarConfig(configuracoes as any);
  } catch (error) {
    console.error("Erro ao buscar configurações direto no banco:", error);
    return null;
  }
}

/**
 * Recupera as configurações operacionais da empresa. Tenta primeiramente a leitura direta
 * via Prisma; caso falhe e seja fornecida uma URL base, tenta fallback via endpoint HTTP interno.
 * @param baseUrl - URL base opcional para fallback via fetch HTTP
 * @returns Objeto com as configurações ativas da empresa
 */
export async function buscarConfiguracoesSistema(baseUrl?: string) {
  const direto = await buscarConfiguracoesDireto();

  if (direto) {
    return direto;
  }

  if (!baseUrl) {
    return configPadrao;
  }

  try {
    const response = await fetch(`${baseUrl}/api/configuracoes`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return configPadrao;
    }

    const data = await response.json();
    return montarConfig(data);
  } catch (error) {
    console.error("Erro ao buscar configurações do sistema:", error);
    return configPadrao;
  }
}

/**
 * Formata o endereço completo da empresa (endereço, cidade, estado) concatenado por hífen.
 * @param config - Configurações ativas da empresa
 * @returns String formatada para cabeçalhos de impressão
 */
export function montarEnderecoEmpresa(config: ConfiguracoesSistema) {
  return [config.endereco, config.cidade, config.estado]
    .filter(Boolean)
    .join(" - ");
}

/**
 * Formata os canais de contato da empresa (WhatsApp, Telefone, E-mail) concatenados por pipe.
 * @param config - Configurações ativas da empresa
 * @returns String formatada para rodapés e cabeçalhos de documentos
 */
export function montarContatoEmpresa(config: ConfiguracoesSistema) {
  const contatos = [];

  if (config.whatsapp) contatos.push(`WhatsApp: ${config.whatsapp}`);
  if (config.telefone) contatos.push(`Telefone: ${config.telefone}`);
  if (config.email) contatos.push(`E-mail: ${config.email}`);

  return contatos.join(" | ");
}
