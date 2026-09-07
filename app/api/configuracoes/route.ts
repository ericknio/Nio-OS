import { NextResponse } from "next/server";
import { type CompanySettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import { textoGarantiaPadrao } from "@/lib/configuracoesPadrao";
import {
  normalizarDiasFuncionamento,
  normalizarHora,
  serializarDiasFuncionamento,
} from "@/lib/funcionamentoLoja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function textoOuNulo(valor: unknown) {
  const valorLimpo = texto(valor);
  return valorLimpo || null;
}

function numeroGarantia(valor: unknown, fallback: number) {
  if (valor === undefined || valor === null || valor === "") {
    return fallback;
  }

  const numero = Number(valor);

  if (!Number.isFinite(numero) || numero < 0) {
    return fallback;
  }

  return Math.round(numero);
}

function emailValido(email: string | null) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function moduloProdutosAtivo(valor: unknown, fallback = true) {
  if (valor === undefined || valor === null) return fallback;
  return valor !== false;
}

function respostaConfiguracoes(configuracoes: CompanySettings) {
  return {
    ...configuracoes,

    nomeEmpresa: configuracoes.companyName,
    nomeFantasia: configuracoes.tradeName,

    documento: configuracoes.cnpj,
    endereco: configuracoes.address,
    cep: configuracoes.zipCode,

    telefone: configuracoes.phone,
    site: configuracoes.website,

    cidade: configuracoes.city,
    estado: configuracoes.state,

    rodape: configuracoes.footerText,
    operadorPadrao: configuracoes.defaultOperator || "Sistema",
    productsModuleEnabled: configuracoes.productsModuleEnabled !== false,
    osModuleEnabled: configuracoes.osModuleEnabled !== false,

    businessDays: normalizarDiasFuncionamento(configuracoes.businessDays),
    workingDays: normalizarDiasFuncionamento(configuracoes.businessDays),
    businessOpenTime: normalizarHora(configuracoes.businessOpenTime, "08:00"),
    openingTime: normalizarHora(configuracoes.businessOpenTime, "08:00"),
    businessCloseTime: normalizarHora(configuracoes.businessCloseTime, "18:00"),
    closingTime: normalizarHora(configuracoes.businessCloseTime, "18:00"),
  };
}

async function obterOuCriarConfiguracoes() {
  const existente = await prisma.companySettings.findFirst();

  if (existente) return existente;

  return prisma.companySettings.create({
    data: {
      companyName: "Minha Empresa",
      primaryColor: "#2563EB",
      defaultWarrantyDays: 90,
      warrantyText: textoGarantiaPadrao,
      footerText:
        "Documento gerado automaticamente pelo sistema de Ordem de Serviço.",
      defaultOperator: "Sistema",
      productsModuleEnabled: true,
      osModuleEnabled: true,
      businessDays: "1,2,3,4,5,6",
      businessOpenTime: "08:00",
      businessCloseTime: "18:00",
    },
  });
}

export async function GET() {
  try {
    // Leitura mantida sem bloqueio de permissão porque menu, PDFs e páginas
    // operacionais dependem das configurações públicas da empresa.
    // Alterações continuam protegidas no PUT por configuracoes.editar.
    const configuracoes = await obterOuCriarConfiguracoes();

    return NextResponse.json(respostaConfiguracoes(configuracoes));
  } catch (error) {
    console.error("Erro ao buscar configurações:", error);

    return NextResponse.json(
      { message: "Erro ao buscar configurações." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const acesso = await exigirPermissaoApi("configuracoes.editar");

    if (!acesso.ok) {
      return acesso.response;
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { message: "Dados inválidos para salvar configurações." },
        { status: 400 }
      );
    }

    const existente = await obterOuCriarConfiguracoes();

    const companyName = texto(body.companyName || body.nomeEmpresa);

    if (!companyName) {
      return NextResponse.json(
        { message: "O nome da empresa é obrigatório." },
        { status: 400 }
      );
    }

    const email = textoOuNulo(body.email);

    if (!emailValido(email)) {
      return NextResponse.json(
        { message: "Informe um e-mail válido." },
        { status: 400 }
      );
    }

    const state = texto(body.state || body.estado).toUpperCase();

    if (state && state.length !== 2) {
      return NextResponse.json(
        { message: "Use apenas a sigla do estado. Exemplo: BA." },
        { status: 400 }
      );
    }

    const defaultWarrantyDays = numeroGarantia(
      body.defaultWarrantyDays,
      existente.defaultWarrantyDays || 90
    );

    const warrantyText =
      body.warrantyText !== undefined
        ? texto(body.warrantyText) || textoGarantiaPadrao
        : existente.warrantyText || textoGarantiaPadrao;

    const businessDays = normalizarDiasFuncionamento(
      body.businessDays ?? body.workingDays ?? existente.businessDays
    );

    if (businessDays.length === 0) {
      return NextResponse.json(
        { message: "Selecione pelo menos um dia de funcionamento." },
        { status: 400 }
      );
    }

    const businessOpenTime = normalizarHora(
      body.businessOpenTime ?? body.openingTime,
      existente.businessOpenTime || "08:00"
    );

    const businessCloseTime = normalizarHora(
      body.businessCloseTime ?? body.closingTime,
      existente.businessCloseTime || "18:00"
    );

    const data = {
      companyName,
      tradeName: textoOuNulo(body.tradeName || body.nomeFantasia),

      cnpj: textoOuNulo(body.cnpj || body.documento),

      address: textoOuNulo(body.address || body.endereco),
      phone: textoOuNulo(body.phone || body.telefone),
      whatsapp: textoOuNulo(body.whatsapp),
      email,
      website: textoOuNulo(body.website || body.site),
      instagram: textoOuNulo(body.instagram),
      facebook: textoOuNulo(body.facebook),

      logoUrl:
        body.logoUrl !== undefined
          ? textoOuNulo(body.logoUrl)
          : existente.logoUrl || null,

      bannerUrl:
        body.bannerUrl !== undefined
          ? textoOuNulo(body.bannerUrl)
          : existente.bannerUrl || null,

      primaryColor:
        texto(body.primaryColor) || existente.primaryColor || "#2563EB",

      footerText: textoOuNulo(body.footerText || body.rodape),
      warrantyText,

      defaultWarrantyDays,

      city: textoOuNulo(body.city || body.cidade),
      state: state || null,
      zipCode: textoOuNulo(body.zipCode || body.cep),

      defaultOperator:
        texto(body.defaultOperator || body.operadorPadrao) ||
        existente.defaultOperator ||
        "Sistema",

      productsModuleEnabled: moduloProdutosAtivo(
        body.productsModuleEnabled,
        existente.productsModuleEnabled !== false
      ),

      osModuleEnabled: moduloProdutosAtivo(
        body.osModuleEnabled,
        existente.osModuleEnabled !== false
      ),

      businessDays: serializarDiasFuncionamento(businessDays),
      businessOpenTime,
      businessCloseTime,
    };

    const configuracoes = await prisma.companySettings.update({
      where: {
        id: existente.id,
      },
      data,
    });

    return NextResponse.json(respostaConfiguracoes(configuracoes));
  } catch (error) {
    console.error("Erro ao salvar configurações:", error);

    return NextResponse.json(
      { message: "Erro ao salvar configurações." },
      { status: 500 }
    );
  }
}
