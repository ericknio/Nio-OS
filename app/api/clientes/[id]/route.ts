/**
 * @file app/api/clientes/[id]/route.ts
 * @description Operações pontuais por ID do cliente (Leitura detalhada, Edição e Exclusão).
 * 
 * Implementa mascaramento de dados financeiros sensíveis com base na permissão do usuário
 * e proteção de integridade referencial (impede exclusão de clientes com O.S. vinculadas).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exigirPermissaoApi,
  usuarioTemPermissao,
} from "@/lib/permissaoApi";
import {
  clienteSelect,
  ordemClienteSelect,
  prepararDadosCliente,
  verificarDuplicidadeCliente,
} from "@/lib/server/clientesCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contexto da rota dinâmica do Next.js contendo o ID do cliente.
 */
type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Representação interna de usuário para validação de privilégios.
 */
type UsuarioPermissao = {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  permissions?: string[];
};

/**
 * Verifica se o usuário tem permissão para visualizar o histórico de O.S. do cliente.
 */
function podeVerOrdensDoCliente(usuario: UsuarioPermissao) {
  return usuarioTemPermissao(usuario, "ordens.ver");
}

/**
 * Verifica se o usuário pode visualizar os valores financeiros das O.S. do cliente.
 */
function podeVerFinanceiro(usuario: UsuarioPermissao) {
  return usuarioTemPermissao(usuario, [
    "pagamentos.ver",
    "pagamentos.registrar",
    "relatorios.financeiro",
  ]);
}

/**
 * Endpoint GET /api/clientes/[id]
 * 
 * Retorna os dados completos do cliente e seu histórico recente de Ordens de Serviço.
 * Se o usuário não tiver permissão financeira, omite os valores monetários (`totalAmount = null`).
 *
 * @param _request - Requisição HTTP
 * @param context - Parâmetros da rota contendo o ID do cliente
 * @returns JSON com dados cadastrais e lista de ordens do cliente
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi([
      "clientes.ver",
      "ordens.criar",
      "ordens.editar",
      "ordens.ver",
    ]);

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await context.params;

    const cliente = await prisma.customer.findUnique({
      where: {
        id,
      },
      select: clienteSelect,
    });

    if (!cliente) {
      return NextResponse.json(
        { message: "Cliente não encontrado." },
        { status: 404 }
      );
    }

    const usuarioPodeVerOrdens = podeVerOrdensDoCliente(acesso.usuario);
    const usuarioPodeVerFinanceiro = podeVerFinanceiro(acesso.usuario);

    const orders = usuarioPodeVerOrdens
      ? await prisma.serviceOrder.findMany({
          where: {
            customerId: id,
          },
          orderBy: {
            openedAt: "desc",
          },
          select: ordemClienteSelect,
        })
      : [];

    return NextResponse.json({
      ...cliente,
      orders: orders.map((ordem) => ({
        ...ordem,
        totalAmount: usuarioPodeVerFinanceiro ? ordem.totalAmount : null,
      })),
    });
  } catch (error) {
    console.error("Erro ao buscar cliente:", error);

    return NextResponse.json(
      { message: "Erro ao buscar cliente." },
      { status: 500 }
    );
  }
}

/**
 * Endpoint PUT /api/clientes/[id]
 * 
 * Atualiza os dados cadastrais do cliente existente.
 * Valida duplicidade de CPF, WhatsApp e e-mail desconsiderando o próprio registro em edição.
 *
 * @param request - Requisição HTTP com os novos dados em JSON
 * @param context - Parâmetros da rota contendo o ID do cliente
 * @returns Objeto do cliente atualizado
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("clientes.editar");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await context.params;

    const clienteExistente = await prisma.customer.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!clienteExistente) {
      return NextResponse.json(
        { message: "Cliente não encontrado." },
        { status: 404 }
      );
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
      ignorarClienteId: id,
    });

    if (erroDuplicidade) {
      return NextResponse.json({ message: erroDuplicidade }, { status: 400 });
    }

    const cliente = await prisma.customer.update({
      where: {
        id,
      },
      data: dados,
      select: clienteSelect,
    });

    return NextResponse.json(cliente);
  } catch (error) {
    console.error("Erro ao editar cliente:", error);

    return NextResponse.json(
      { message: "Erro ao editar cliente." },
      { status: 500 }
    );
  }
}

/**
 * Endpoint DELETE /api/clientes/[id]
 * 
 * Remove o cadastro de um cliente do sistema.
 * REGRA DE SEGURANÇA: Bloqueia a exclusão caso o cliente possua qualquer Ordem de Serviço
 * cadastrada no histórico, preservando a integridade fiscal e os relatórios da assistência.
 *
 * @param _request - Requisição HTTP
 * @param context - Parâmetros da rota com o ID a ser removido
 * @returns Mensagem de sucesso (HTTP 200) ou bloqueio referencial (HTTP 400)
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("clientes.excluir");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await context.params;

    const cliente = await prisma.customer.findUnique({
      where: {
        id,
      },
      include: {
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    if (!cliente) {
      return NextResponse.json(
        { message: "Cliente não encontrado." },
        { status: 404 }
      );
    }

    const totalOrdens = cliente._count.orders;

    if (totalOrdens > 0) {
      return NextResponse.json(
        {
          message: `Este cliente possui ${totalOrdens} OS vinculada(s). Por segurança, ele não pode ser excluído.`,
        },
        { status: 400 }
      );
    }

    await prisma.customer.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      message: "Cliente excluído com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao excluir cliente:", error);

    return NextResponse.json(
      { message: "Erro ao excluir cliente." },
      { status: 500 }
    );
  }
}