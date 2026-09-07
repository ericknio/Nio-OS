import { prisma } from "@/lib/prisma";

type RegistrarHistoricoParams = {
  ordemId: string;
  acao: string;
  descricao?: string;
};

export async function registrarHistoricoOrdem({
  ordemId,
  acao,
  descricao,
}: RegistrarHistoricoParams) {
  try {
    await prisma.historicoOrdem.create({
      data: {
        ordemId,
        acao,
        descricao,
      },
    });
  } catch (error) {
    console.error("Erro ao registrar histórico da OS:", error);
  }
}