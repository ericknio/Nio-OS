import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const MENSAGEM_MODULO_PRODUTOS_DESATIVADO =
  "Módulo de produtos, estoque e vendas está desativado nas configurações.";

export async function moduloProdutosEstaAtivo() {
  try {
    const configuracoes = await prisma.companySettings.findFirst({
      select: {
        productsModuleEnabled: true,
      },
    });

    return configuracoes?.productsModuleEnabled !== false;
  } catch (error) {
    console.error("Erro ao verificar módulo de produtos:", error);

    // Falha de leitura da configuração não deve derrubar o sistema local.
    // Em caso de erro de banco/conexão, mantemos o módulo liberado para evitar bloqueio indevido.
    return true;
  }
}

export async function moduloProdutosAtivo() {
  return moduloProdutosEstaAtivo();
}

export async function verificarModuloProdutosAtivo() {
  return moduloProdutosEstaAtivo();
}

export async function isModuloProdutosAtivo() {
  return moduloProdutosEstaAtivo();
}

export function respostaModuloProdutosDesativado() {
  return NextResponse.json(
    {
      message: MENSAGEM_MODULO_PRODUTOS_DESATIVADO,
      productsModuleEnabled: false,
    },
    {
      status: 403,
    }
  );
}

export async function exigirModuloProdutosAtivoApi() {
  const ativo = await moduloProdutosEstaAtivo();

  if (!ativo) {
    return respostaModuloProdutosDesativado();
  }

  return null;
}

export async function exigirModuloProdutosAtivo() {
  return exigirModuloProdutosAtivoApi();
}

export async function bloquearModuloProdutosDesativado() {
  return exigirModuloProdutosAtivoApi();
}
