import { prisma } from "@/lib/prisma";

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

function texto(valor: unknown) {
  return String(valor || "").trim();
}

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

async function buscarConfiguracoesDireto() {
  try {
    const configuracoes = await prisma.companySettings.findFirst();
    return montarConfig(configuracoes as any);
  } catch (error) {
    console.error("Erro ao buscar configurações direto no banco:", error);
    return null;
  }
}

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

export function montarEnderecoEmpresa(config: ConfiguracoesSistema) {
  return [config.endereco, config.cidade, config.estado]
    .filter(Boolean)
    .join(" - ");
}

export function montarContatoEmpresa(config: ConfiguracoesSistema) {
  const contatos = [];

  if (config.whatsapp) contatos.push(`WhatsApp: ${config.whatsapp}`);
  if (config.telefone) contatos.push(`Telefone: ${config.telefone}`);
  if (config.email) contatos.push(`E-mail: ${config.email}`);

  return contatos.join(" | ");
}
