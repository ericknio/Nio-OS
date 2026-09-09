/**
 * @file app/api/clientes/route.ts
 * @description Rota de API para listagem com busca e cadastro de novos clientes no Nio-OS.
 * 
 * Suporta busca textual em múltiplos campos (nome, documento, telefone, WhatsApp, e-mail)
 * e validação estrita anti-duplicidade antes de persistir no banco de dados SQLite.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import {
  clienteSelect,
  prepararDadosCliente,
  verificarDuplicidadeCliente,
} from "@/lib/server/clientesCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint GET /api/clientes
 * 
 * Lista os clientes cadastrados com paginação/limite e filtro de busca opcional.
 * Exige que o usuário logado possua permissão de visualização de clientes ou edição de O.S.
 *
 * @param request - Requisição HTTP com parâmetros de busca opcionais (?busca=...&limite=...)
 * @returns Lista de clientes sanitizados em JSON
 */
export async function GET(request: Request) {
  try {
    const acesso = await exigirPermissaoApi([
      "clientes.ver",
      "ordens.criar",
      "ordens.editar",
    ]);

    if (!acesso.ok) {
      return acesso.response;
    }

    const { searchParams } = new URL(request.url);
    const busca = searchParams.get("busca")?.trim() || "";
    const limiteParam = Number(searchParams.get("limite") || 300);
    const take = Number.isSafeInteger(limiteParam) && limiteParam > 0 ? Math.min(limiteParam, 500) : 300;

    const where = busca
      ? {
          OR: [
            { name: { contains: busca } },
            { document: { contains: busca } },
            { phone: { contains: busca } },
            { whatsapp: { contains: busca } },
            { email: { contains: busca } },
          ],
        }
      : undefined;

    const clientes = await prisma.customer.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      take,
      select: clienteSelect,
    });

    return NextResponse.json(clientes);
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);

    return NextResponse.json(
      { message: "Erro ao buscar clientes." },
      { status: 500 }
    );
  }
}

/**
 * Endpoint POST /api/clientes
 * 
 * Cadastra um novo cliente no sistema.
 * Realiza sanitização de dados, formatação de telefone/documento e checagem anti-duplicidade.
 *
 * @param request - Requisição HTTP contendo o payload JSON com os dados do cliente
 * @returns Objeto do cliente criado (HTTP 201) ou mensagem de erro de validação (HTTP 400/500)
 */
export async function POST(request: Request) {
  try {
    const acesso = await exigirPermissaoApi("clientes.criar");

    if (!acesso.ok) {
      return acesso.response;
    }

    const body = await request.json().catch(() => null);
    const preparado = prepararDadosCliente(body);

    if (!preparado.ok) {
      return NextResponse.json(
        { message: preparado.message },
        { status: preparado.status }
      );
    }

    const dados = preparado.data;

    const erroDuplicidade = await verificarDuplicidadeCliente({
      cpf: dados.cpf,
      whatsapp: dados.whatsapp,
      email: dados.email,
    });

    if (erroDuplicidade) {
      return NextResponse.json({ message: erroDuplicidade }, { status: 400 });
    }

    const cliente = await prisma.customer.create({
      data: dados,
      select: clienteSelect,
    });

    return NextResponse.json(cliente, { status: 201 });
  } catch (error) {
    console.error("Erro ao cadastrar cliente:", error);

    return NextResponse.json(
      { message: "Erro ao cadastrar cliente." },
      { status: 500 }
    );
  }
}