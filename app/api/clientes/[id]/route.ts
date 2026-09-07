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

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UsuarioPermissao = {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  permissions?: string[];
};

function podeVerOrdensDoCliente(usuario: UsuarioPermissao) {
  return usuarioTemPermissao(usuario, "ordens.ver");
}

function podeVerFinanceiro(usuario: UsuarioPermissao) {
  return usuarioTemPermissao(usuario, [
    "pagamentos.ver",
    "pagamentos.registrar",
    "relatorios.financeiro",
  ]);
}

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