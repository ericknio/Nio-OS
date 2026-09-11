/**
 * @file lib/moduloProdutos.ts
 * @description Controle de ativação e bloqueio de rotas do Módulo de Produtos, Estoque e PDV.
 * 
 * Permite que a empresa desative o módulo de produtos nas configurações (`CompanySettings.productsModuleEnabled`),
 * ocultando o catálogo, estoque de balcão e vendas diretas, mantendo o sistema focado apenas em Ordens de Serviço.
 * As rotas de API correspondentes utilizam `exigirModuloProdutosAtivoApi()` para barrar requisições com 403 caso desativado.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Mensagem padrão retornada quando uma requisição tenta acessar recursos de produtos com o módulo desativado.
 */
export const MENSAGEM_MODULO_PRODUTOS_DESATIVADO =
  "Módulo de produtos, estoque e vendas está desativado nas configurações.";

/**
 * Consulta se o módulo de produtos está habilitado nas configurações da empresa.
 * Se a configuração não existir ou ocorrer erro transitório de banco, retorna `true` por padrão resiliente.
 * 
 * @returns Booleano indicando se o módulo de produtos está ativo.
 */
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

/**
 * Retorna uma resposta HTTP 403 Forbidden padronizada com mensagem informativa de módulo desativado.
 */
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

/**
 * Guarda de execução para endpoints de API.
 * Se o módulo de produtos estiver desativado, retorna imediatamente um `NextResponse` de erro 403.
 * Se estiver ativo, retorna `null`, permitindo que o handler da rota continue sua execução normal.
 * 
 * @example
 * const bloqueio = await exigirModuloProdutosAtivoApi();
 * if (bloqueio) return bloqueio;
 */
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
