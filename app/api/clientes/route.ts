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