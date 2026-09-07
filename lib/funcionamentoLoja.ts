export const DIAS_FUNCIONAMENTO_PADRAO = [1, 2, 3, 4, 5, 6];

export const DIAS_SEMANA_FUNCIONAMENTO = [
  { id: 0, label: "Domingo", curto: "Dom" },
  { id: 1, label: "Segunda-feira", curto: "Seg" },
  { id: 2, label: "Terça-feira", curto: "Ter" },
  { id: 3, label: "Quarta-feira", curto: "Qua" },
  { id: 4, label: "Quinta-feira", curto: "Qui" },
  { id: 5, label: "Sexta-feira", curto: "Sex" },
  { id: 6, label: "Sábado", curto: "Sáb" },
];

export function normalizarDiasFuncionamento(
  valor: unknown,
  fallback = DIAS_FUNCIONAMENTO_PADRAO
) {
  const origem = Array.isArray(valor)
    ? valor
    : typeof valor === "string"
      ? valor.split(/[;,]/)
      : [];

  const dias = Array.from(
    new Set(
      origem
        .map((item) => Number(String(item).trim()))
        .filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6)
    )
  ).sort((a, b) => a - b);

  return dias.length > 0 ? dias : [...fallback];
}

export function serializarDiasFuncionamento(valor: unknown) {
  return normalizarDiasFuncionamento(valor).join(",");
}

export function normalizarHora(valor: unknown, fallback: string) {
  const texto = String(valor || "").trim();
  const match = /^(\d{2}):(\d{2})$/.exec(texto);

  if (!match) return fallback;

  const hora = Number(match[1]);
  const minuto = Number(match[2]);

  if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) {
    return fallback;
  }

  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

export function minutosDaHora(valor: unknown) {
  const hora = normalizarHora(valor, "00:00");
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

export function lojaAbertaNaData(data: Date, diasFuncionamento: unknown) {
  const dias = normalizarDiasFuncionamento(diasFuncionamento);
  return dias.includes(data.getDay());
}

export function nomeDiaSemana(diaSemana: number) {
  return (
    DIAS_SEMANA_FUNCIONAMENTO.find((dia) => dia.id === diaSemana)?.label ||
    `Dia ${diaSemana}`
  );
}

export function labelsDiasFuncionamento(diasFuncionamento: unknown) {
  const dias = normalizarDiasFuncionamento(diasFuncionamento);
  return DIAS_SEMANA_FUNCIONAMENTO.filter((dia) => dias.includes(dia.id)).map(
    (dia) => dia.label
  );
}

export function descricaoDiasFuncionamento(diasFuncionamento: unknown) {
  return labelsDiasFuncionamento(diasFuncionamento).join(", ");
}
