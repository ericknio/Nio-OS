const fs = require("fs");
const path = require("path");
const assert = require("assert");

console.log("===============================================================================");
console.log("TEST: PARTICIPAÇÃO NO LUCRO DE ATENDENTE NO PDV (SEM AFETAR OS / PEÇAS)");
console.log("===============================================================================");

let totalAssertions = 0;
function test(name, fn) {
  try {
    fn();
    totalAssertions++;
    console.log(`  [OK] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Core Logic validation
const coreFile = path.resolve(__dirname, "../lib/server/usuariosSistemaCore.ts");
const coreContent = fs.readFileSync(coreFile, "utf-8");

test("Core: participacaoLucroPdvParaSalvar exists and validates role ATENDENTE", () => {
  assert(coreContent.includes("function participacaoLucroPdvParaSalvar("), "Must export or define participacaoLucroPdvParaSalvar");
  assert(coreContent.includes('role !== SystemUserRole.ATENDENTE'), "Must strictly check role !== ATENDENTE");
  assert(coreContent.includes("pdvProfitSharePercent: true"), "selectUsuarioSistema must include pdvProfitSharePercent");
  assert(coreContent.includes("pdvProfitShareEnabled: true"), "selectUsuarioSistema must include pdvProfitShareEnabled");
});

test("Core: Technician profit share untouched and strictly checks TECNICO", () => {
  assert(coreContent.includes("function participacaoLucroParaSalvar("), "Must keep participacaoLucroParaSalvar");
  assert(coreContent.includes('role !== SystemUserRole.TECNICO'), "Must strictly check role !== TECNICO");
  assert(coreContent.includes("profitSharePercent: true"), "selectUsuarioSistema must keep profitSharePercent");
  assert(coreContent.includes("profitShareEnabled: true"), "selectUsuarioSistema must keep profitShareEnabled");
});

// 2. Schema check
const schemaFile = path.resolve(__dirname, "../prisma/schema.prisma");
const schemaContent = fs.readFileSync(schemaFile, "utf-8");

test("Schema: SystemUser has pdvProfitShareEnabled and pdvProfitSharePercent", () => {
  assert(schemaContent.includes("pdvProfitShareEnabled Boolean @default(false)"), "SystemUser missing pdvProfitShareEnabled");
  assert(schemaContent.includes("pdvProfitSharePercent Decimal @default(0)"), "SystemUser missing pdvProfitSharePercent");
  assert(schemaContent.includes("attendantProductSales") && schemaContent.includes('@relation("ProductSaleAttendant")'), "SystemUser missing attendantProductSales");
});

test("Schema: ProductSale has attendantUserId, attendantProfitShare and attendantProfitPercentSnapshot", () => {
  assert(schemaContent.includes("attendantUserId"), "ProductSale missing attendantUserId");
  assert(schemaContent.includes("attendantProfitPercentSnapshot"), "ProductSale missing attendantProfitPercentSnapshot");
  assert(schemaContent.includes("attendantProfitShare"), "ProductSale missing attendantProfitShare");
  assert(schemaContent.includes("attendantUser") && schemaContent.includes('@relation("ProductSaleAttendant"'), "ProductSale missing attendantUser relation");
  assert(schemaContent.includes("@@index([attendantUserId])"), "ProductSale missing index on attendantUserId");
});

// 3. User Management UI
const usuariosPageFile = path.resolve(__dirname, "../app/usuarios-sistema/page.tsx");
const usuariosPageContent = fs.readFileSync(usuariosPageFile, "utf-8");

test("UI Usuários: Displays attendant profit share card exclusively for ATENDENTE", () => {
  assert(usuariosPageContent.includes('form.role === "ATENDENTE"'), "Must check form.role === 'ATENDENTE'");
  assert(usuariosPageContent.includes("Participa do lucro das vendas do PDV"), "Must have attendant profit card checkbox");
  assert(usuariosPageContent.includes("Não funciona nem se aplica ao estoque de peças nem em Ordens de Serviço (OS)"), "Must display disclaimer about OS/parts isolation");
  assert(usuariosPageContent.includes("pdvProfitShareEnabled"), "Must bind pdvProfitShareEnabled");
  assert(usuariosPageContent.includes("pdvProfitSharePercent"), "Must bind pdvProfitSharePercent");
});

test("UI Usuários: Keeps technician profit share card strictly for TECNICO", () => {
  assert(usuariosPageContent.includes('form.role === "TECNICO"'), "Must keep check form.role === 'TECNICO'");
  assert(usuariosPageContent.includes("Participa do lucro das OS"), "Must keep technician profit card checkbox");
});

// 4. PDV Nova Venda UI
const novaVendaFile = path.resolve(__dirname, "../app/produtos/vendas/nova/page.tsx");
const novaVendaContent = fs.readFileSync(novaVendaFile, "utf-8");

test("PDV Nova Venda: Allows selecting attendant for the sale", () => {
  assert(novaVendaContent.includes("/api/vendas-produtos/atendentes"), "Must fetch active attendants");
  assert(novaVendaContent.includes("attendantUserId"), "Must bind and submit attendantUserId");
  assert(novaVendaContent.includes("Atendente / Vendedor"), "Must display attendant selection label");
});

// 5. PDV Listagem de Vendas UI & API
const vendasPageFile = path.resolve(__dirname, "../app/produtos/vendas/page.tsx");
const vendasPageContent = fs.readFileSync(vendasPageFile, "utf-8");
const vendasApiFile = path.resolve(__dirname, "../app/api/vendas-produtos/route.ts");
const vendasApiContent = fs.readFileSync(vendasApiFile, "utf-8");

test("PDV Vendas: Calculates and displays attendant commission", () => {
  assert(vendasApiContent.includes("attendantProfitShare"), "API must calculate attendantProfitShare");
  assert(vendasApiContent.includes("attendantProfitPercentSnapshot"), "API must snapshot attendantProfitPercentSnapshot");
  assert(vendasApiContent.includes("totalComissaoAtendentes"), "API must return totalComissaoAtendentes");
  assert(vendasPageContent.includes("totalComissaoAtendentes"), "Page must handle totalComissaoAtendentes");
  assert(vendasPageContent.includes("Comissão Atendentes"), "Page must render card for attendant commission");
});

// 6. Relatórios de Produtos
const relatoriosApiFile = path.resolve(__dirname, "../app/api/produtos/relatorios/route.ts");
const relatoriosApiContent = fs.readFileSync(relatoriosApiFile, "utf-8");
const relatoriosPageFile = path.resolve(__dirname, "../app/produtos/relatorios/page.tsx");
const relatoriosPageContent = fs.readFileSync(relatoriosPageFile, "utf-8");

test("Relatórios Produtos: Aggregates attendant commissions and ranking on PDV sales", () => {
  assert(relatoriosApiContent.includes("attendantUser:"), "API must include attendantUser");
  assert(relatoriosApiContent.includes("totalComissaoAtendentes"), "API must aggregate totalComissaoAtendentes");
  assert(relatoriosApiContent.includes("atendentes:"), "API must return atendentes ranking");
  assert(relatoriosPageContent.includes("Comissão atendentes"), "Page must show summary card for attendant commissions");
  assert(relatoriosPageContent.includes("Vendas e comissões por atendente (PDV)"), "Page must show attendant ranking table");
});

// 7. Verification of SQLite DB columns in active database
const { DatabaseSync } = require("node:sqlite");
const dbPath = path.resolve(__dirname, "../data/nio-os.db");

test("Database: Active SQLite database has all columns and indices", () => {
  const db = new DatabaseSync(dbPath, { open: true });
  try {
    const userColumns = db.prepare("PRAGMA table_info(SystemUser)").all().map(c => c.name);
    assert(userColumns.includes("pdvProfitShareEnabled"), "SystemUser missing pdvProfitShareEnabled column in SQLite");
    assert(userColumns.includes("pdvProfitSharePercent"), "SystemUser missing pdvProfitSharePercent column in SQLite");

    const saleColumns = db.prepare("PRAGMA table_info(ProductSale)").all().map(c => c.name);
    assert(saleColumns.includes("attendantUserId"), "ProductSale missing attendantUserId column in SQLite");
    assert(saleColumns.includes("attendantProfitPercentSnapshot"), "ProductSale missing attendantProfitPercentSnapshot column in SQLite");
    assert(saleColumns.includes("attendantProfitShare"), "ProductSale missing attendantProfitShare column in SQLite");

    const fkList = db.prepare("PRAGMA foreign_key_list(ProductSale)").all();
    const hasAttendantFk = fkList.some(fk => fk.table === "SystemUser" && fk.from === "attendantUserId" && fk.to === "id");
    assert(hasAttendantFk, "ProductSale missing foreign key to SystemUser(id)");

    const fkCheck = db.prepare("PRAGMA foreign_key_check").all();
    assert.strictEqual(fkCheck.length, 0, "No foreign key violations allowed");
  } finally {
    db.close();
  }
});

console.log(`\nALL ${totalAssertions} ASSERTIONS PASSED SUCCESSFULLY!`);
