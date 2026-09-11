/**
 * @file lib/funcionamentoLoja.ts
 * @description Utilitários de cálculo de dias úteis e expediente comercial da assistência.
 * 
 * Utilizado para:
 * - Configuração dos dias e horários de expediente da assistência técnica.
 * - Cálculo do SLA, prazos de entrega e detecção de Ordens de Serviço atrasadas
 *   desconsiderando domingos e feriados ou dias sem expediente.
 */

/**
 * Dias padrão de funcionamento da loja (Segunda a Sábado: 1 a 6).
 */
export const DIAS_FUNCIONAMENTO_PADRAO = [1, 2, 3, 4, 5, 6];

/**
 * Metadados e rótulos para cada dia da semana (0 = Domingo até 6 = Sábado).
 */
export const DIAS_SEMANA_FUNCIONAMENTO = [
  { id: 0, label: "Domingo", curto: "Dom" },
  { id: 1, label: "Segunda-feira", curto: "Seg" },
  { id: 2, label: "Terça-feira", curto: "Ter" },
  { id: 3, label: "Quarta-feira", curto: "Qua" },
  { id: 4, label: "Quinta-feira", curto: "Qui" },
  { id: 5, label: "Sexta-feira", curto: "Sex" },
  { id: 6, label: "Sábado", curto: "Sáb" },
];

/**
 * Normaliza e sanitiza a lista de dias de funcionamento em números inteiros (0 a 6).
 * Elimina duplicidades e ordena os dias de domingo (0) a sábado (6).
 * 
 * @param valor Entrada que pode ser array de números, strings ou string separada por vírgula.
 * @param fallback Dias padrão caso o valor seja vazio ou inválido.
 * @returns Array de inteiros únicos representando os dias de expediente.
 */
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

/**
 * Serializa os dias de funcionamento em string separada por vírgulas para persistência no banco.
 * Exemplo: "1,2,3,4,5,6".
 */
export function serializarDiasFuncionamento(valor: unknown) {
  return normalizarDiasFuncionamento(valor).join(",");
}

/**
 * Valida e formata uma string no formato de hora "HH:mm".
 * Caso o formato seja inválido ou fora do range de 00:00 a 23:59, retorna o fallback.
 * 
 * @param valor String representando a hora (ex: "08:30").
 * @param fallback Valor retornado caso a hora seja inválida.
 * @returns String formatada "HH:mm".
 */
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

/**
 * Converte um horário "HH:mm" em total de minutos decorridos desde a meia-noite (00:00).
 * Facilita comparações de ordem cronológica e intervalos.
 */
export function minutosDaHora(valor: unknown) {
  const hora = normalizarHora(valor, "00:00");
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Verifica se a loja possui expediente comercial na data fornecida.
 * 
 * @param data Objeto Date a ser inspecionado.
 * @param diasFuncionamento Configuração dos dias em que a loja abre.
 * @returns `true` se o dia da semana estiver na lista de dias de atendimento.
 */
export function lojaAbertaNaData(data: Date, diasFuncionamento: unknown) {
  const dias = normalizarDiasFuncionamento(diasFuncionamento);
  return dias.includes(data.getDay());
}

/**
 * Retorna o nome por extenso de um dia da semana (ex: 1 -> "Segunda-feira").
 */
export function nomeDiaSemana(diaSemana: number) {
  return (
    DIAS_SEMANA_FUNCIONAMENTO.find((dia) => dia.id === diaSemana)?.label ||
    `Dia ${diaSemana}`
  );
}

/**
 * Retorna a lista de nomes por extenso dos dias em que a loja está aberta.
 */
export function labelsDiasFuncionamento(diasFuncionamento: unknown) {
  const dias = normalizarDiasFuncionamento(diasFuncionamento);
  return DIAS_SEMANA_FUNCIONAMENTO.filter((dia) => dias.includes(dia.id)).map(
    (dia) => dia.label
  );
}

/**
 * Retorna uma descrição textual amigável com todos os dias de atendimento da loja (ex: "Segunda-feira, Terça-feira...").
 */
export function descricaoDiasFuncionamento(diasFuncionamento: unknown) {
  return labelsDiasFuncionamento(diasFuncionamento).join(", ");
}
