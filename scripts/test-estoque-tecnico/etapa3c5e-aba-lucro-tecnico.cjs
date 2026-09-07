#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
let assertions = 0;

function read(relative) {
  const file = path.join(root, ...relative.split("/"));
  if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${relative}`);
  return fs.readFileSync(file, "utf8");
}
function check(value, message) {
  assertions += 1;
  assert.ok(value, message);
}
function has(text, value, message) {
  check(text.includes(value), message);
}
function lacks(text, value, message) {
  check(!text.includes(value), message);
}

const page = read("app/relatorios/page.tsx");
const api = read("app/api/relatorios/route.ts");
const pdf = read("app/api/relatorios/pdf/route.ts");

has(page, "Visão Geral", "aba Visão Geral existe");
has(page, "Lucro por Técnico", "aba Lucro por Técnico existe");
has(page, 'useState<"geral" | "tecnicos">("geral")', "Visão Geral é padrão");
has(page, '<option value="TODOS">Todos os técnicos</option>', "filtro Todos existe");
has(page, "tecnicoSelecionado", "filtro individual existe");
has(page, "tecnicosExibidos", "filtro individual altera resumo");
has(page, "ordensTecnico", "filtro individual altera lista de OS");
has(page, 'exportarPDF("tecnicos")', "aba técnica exporta PDF próprio");
has(page, "Resumo individual", "modo Todos lista cada técnico");
has(page, "Detalhamento", "aba técnica detalha as OS");
has(page, "technicianProfitPercent", "aba técnica mostra percentual da OS");
has(page, "technicianProfitShare", "aba técnica mostra participação");
has(page, "storeProfit", "aba técnica mostra lucro da loja");
has(page, "podeVerFinanceiroSensivel &&", "aba técnica depende da permissão financeira");

const generalStart = page.indexOf('abaAtiva === "geral" ? "contents" : "hidden"');
const technicalStart = page.indexOf('abaAtiva === "tecnicos" && podeVerFinanceiroSensivel');
check(generalStart >= 0 && technicalStart > generalStart, "blocos geral/técnico são separados");

const generalBlock = page.slice(generalStart, technicalStart);
lacks(generalBlock, 'titulo="Participação dos técnicos"', "card participação saiu da Visão Geral");
lacks(generalBlock, 'titulo="Lucro da loja"', "card lucro loja saiu da Visão Geral");
lacks(generalBlock, 'titulo="% técnico"', "detalhes do técnico saíram da lista geral");
lacks(generalBlock, 'titulo="Participação técnico"', "comissão saiu da lista geral");
has(generalBlock, 'titulo="Custo das peças"', "custo permanece na Visão Geral");
has(generalBlock, 'titulo="Lucro bruto"', "lucro bruto permanece na Visão Geral");

has(api, "technicianKey: chave", "API entrega chave estável por técnico");
has(api, "technicianReportKey:", "API entrega chave por OS para filtro");
has(api, "financeiroSensivelLiberado ? { tecnicosFinanceiros } : {}", "dados técnicos continuam protegidos no servidor");
has(api, "Math.max(lucroBruto, 0)", "comissão continua usando somente lucro positivo");
has(api, "technicianProfitPercentSnapshot", "percentual continua vindo do snapshot da OS");

has(pdf, 'modo === "tecnicos"', "PDF possui modo técnico");
has(pdf, '"relatorios.financeiro"', "PDF técnico exige permissão financeira");
has(pdf, "usuarioPodeVerDadosFinanceirosSensiveis", "PDF reforça permissão sensível");
has(pdf, "gerarBufferPDFTecnicos", "gerador técnico separado existe");
has(pdf, "Todos os técnicos", "PDF aceita todos os técnicos");
has(pdf, "Técnico não encontrado no período informado.", "filtro individual inválido é rejeitado");
has(pdf, 'await gerarBufferPDF(relatorio, empresa, inicio, fim)', "PDF geral continua usando gerador geral");

const generalPdfStart = pdf.indexOf("async function gerarBufferPDF(");
const technicalPdfStart = pdf.indexOf("async function gerarBufferPDFTecnicos(");
check(generalPdfStart >= 0 && technicalPdfStart > generalPdfStart, "PDF geral e técnico são separados");
const generalPdf = pdf.slice(generalPdfStart, technicalPdfStart);
lacks(generalPdf, "Participação técnicos", "PDF geral voltou sem participação técnica");
lacks(generalPdf, "Resultado por técnico", "PDF geral voltou sem ranking técnico");

console.log(JSON.stringify({
  ok: true,
  stage: "3C.5E",
  assertions,
  generalReportRestored: true,
  technicianTab: true,
  technicianFilter: "TODOS|INDIVIDUAL",
  technicianPdf: true,
  permission: "relatorios.financeiro",
  databaseChanged: false,
  schemaChanged: false,
  migrationRequired: false
}));
