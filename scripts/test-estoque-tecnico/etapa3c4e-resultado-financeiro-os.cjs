#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
let assertions = 0;

function read(relative) {
  const file = path.join(root, ...relative.split("/"));
  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo não encontrado: ${relative}`);
  }
  return fs.readFileSync(file, "utf8");
}

function ok(value, message) {
  assertions += 1;
  if (!value) throw new Error(`Falhou: ${message}`);
}

function has(text, needle, message) {
  ok(text.includes(needle), message);
}

const api = read("app/api/relatorios/route.ts");
const page = read("app/relatorios/page.tsx");
const pdf = read("app/api/relatorios/pdf/route.ts");
const schema = read("prisma/schema.prisma");

has(schema, "technicalParts       ServiceOrderPart[]", "ServiceOrder mantém relação com peças técnicas");
has(schema, "unitCostSnapshot   Decimal", "snapshot unitário de custo existe");
has(schema, "totalCostSnapshot  Decimal", "snapshot total de custo existe");
has(schema, "state ServiceOrderPartState", "estado da peça da OS existe");
has(schema, "RESERVED", "estado RESERVED existe");
has(schema, "CONSUMED", "estado CONSUMED existe");
has(schema, "RELEASED", "estado RELEASED existe");
has(schema, "REVERSED", "estado REVERSED existe");

has(api, "technicalParts: {", "API carrega peças técnicas vinculadas");
has(api, "totalCostSnapshot: true", "API lê custo pelo snapshot histórico");
has(api, 'item.state === "RESERVED" || item.state === "CONSUMED"', "custo considera apenas itens ativos");
has(api, 'ordem.status === "CANCELADO"', "cancelamento é tratado explicitamente");
has(api, "const financeiroPorOrdem = new Map", "resultado financeiro é calculado por OS");
has(api, "const faturamentoBruto = valorPecas + maoDeObra", "bruto soma peças e mão de obra");
has(api, "const receitaLiquida = cancelada ? 0 : numero(ordem.totalAmount)", "líquido usa total final da OS");
has(api, "custoPecas", "API calcula custo das peças");
ok(
  api.includes("lucroBruto: custoRastreado ? receitaLiquida - custoPecas : null") ||
    (
      api.includes("const lucroBruto = custoRastreado") &&
      api.includes("? moeda(receitaLiquida - custoPecas)") &&
      api.includes(": null;")
    ),
  "lucro não é inventado sem custo rastreado"
);
has(api, "valorPecas <= 0 || pecasAtivas.length > 0", "OS antiga com peça manual é detectada");
has(api, "ordensSemCustoRastreado", "API contabiliza OS sem custo histórico");
has(api, "lucroBrutoParcial", "API mantém lucro parcial conhecido");
has(api, "financeiroSensivelLiberado ? custoPecas : null", "custo agregado exige permissão financeira");
has(api, "financeiroSensivelLiberado ? lucroBruto : null", "lucro agregado exige permissão financeira");
has(api, "technicalPartsCost: financeiro?.custoPecas || 0", "custo por OS é preparado");
has(api, "grossProfit: financeiro?.lucroBruto ?? null", "lucro por OS é preparado");
has(api, "costTracked: financeiro?.custoRastreado ?? true", "cobertura de custo por OS é informada");
has(api, "...(financeiroSensivelLiberado", "dados sensíveis por OS são condicionais");
ok(!api.includes("currentCostPrice: true"), "relatório não usa custo atual do cadastro");
ok(!api.includes("technicalPart.currentCostPrice"), "relatório não recalcula histórico pelo custo atual");

has(page, 'titulo="Faturamento bruto"', "tela mostra faturamento bruto separado");
has(page, 'titulo="Descontos"', "tela mostra descontos separados");
has(page, 'titulo="Receita líquida"', "tela mostra receita líquida separada");
has(page, 'titulo="Custo das peças"', "tela mostra custo das peças");
has(page, 'titulo="Lucro bruto"', "tela mostra lucro bruto");
has(page, 'tem("relatorios.financeiro")', "tela verifica permissão financeira");
has(page, "dados?.financeiroSensivelLiberado === true", "tela respeita autorização retornada pelo servidor");
has(page, 'ordem.costTracked === false', "tela sinaliza custo não rastreado");
has(page, '"Não rastreado"', "tela não exibe custo zero falso");
has(page, '"Não calculado"', "tela não inventa lucro para OS sem custo histórico");
has(page, "ordem.technicalPartsCost", "tela recebe custo por OS");
has(page, "ordem.grossProfit", "tela recebe lucro por OS");
has(page, "ordem.grossAmount", "tela recebe bruto por OS");
has(page, "ordem.netAmount", "tela recebe líquido por OS");

has(pdf, "financeiroSensivelLiberado", "PDF respeita sinal financeiro");
has(pdf, 'cardResumo("Faturamento bruto"', "PDF mostra faturamento bruto");
has(pdf, 'cardResumo("Custo das peças"', "PDF mostra custo das peças");
has(pdf, 'cardResumo("Lucro bruto"', "PDF mostra lucro bruto");
has(pdf, '"OS sem custo rastreado"', "PDF informa cobertura histórica");
has(pdf, '"N/I"', "PDF sinaliza valor não informado/rastreado");
has(pdf, 'label: "Bruto"', "PDF tem coluna Bruto");
has(pdf, 'label: "Custo"', "PDF tem coluna Custo");
has(pdf, 'label: "Lucro"', "PDF tem coluna Lucro");
has(pdf, "ordem?.technicalPartsCost", "PDF usa custo por OS vindo da API");
has(pdf, "ordem?.grossProfit", "PDF usa lucro por OS vindo da API");
ok(!pdf.includes("currentCostPrice"), "PDF não consulta custo atual");

console.log(JSON.stringify({
  ok: true,
  stage: "3C.4E",
  assertions,
  databaseChanged: false,
  schemaChanged: false,
  financialSensitivePermission: "relatorios.financeiro"
}));
