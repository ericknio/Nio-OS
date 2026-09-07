# ETAPA 3B — Modelos Prisma e migração SQLite do estoque técnico

Data de execução: 2026-08-04  
Migração: `20260804_001_technical_parts`  
Resultado estrutural: aprovado  
Resultado do build web: compilação aprovada; type-check bloqueado por API comercial fora do escopo.

## 1. Escopo executado

Foram implementados somente modelos Prisma, migração SQLite, suporte estrutural do migrador, teste técnico novo, este relatório e o pacote de entrega. Não foram criadas APIs, telas ou integrações funcionais com OS.

Backup externo anterior à edição:

`C:\projetos\_nio_os_code_backup\etapa3b-20260804-193040`

O backup contém, preservando estrutura, `prisma/schema.prisma`, `scripts/schema-migrator/core.cjs` e `scripts/schema-migrator/migrations.cjs` anteriores à 3B.

## 2. Arquivos alterados e criado

Alterados:

- `prisma/schema.prisma`
- `scripts/schema-migrator/core.cjs`
- `scripts/schema-migrator/migrations.cjs`

Criado:

- `scripts/schema-migrator/test-etapa3b.cjs`
- `docs/auditoria/ETAPA3B_MODELOS_MIGRACAO_RESULTADO.md`
- `docs/auditoria/etapa3b-modelos-migracao.zip`

Artefatos descartáveis de teste foram criados somente em `C:\projetos\_nio_os_db_lab\20260728-163000\etapa3b`. Não integram o ZIP.

## 3. Modelos e enums Prisma

Enums criados:

- `ServiceOrderPartState`: `RESERVED`, `CONSUMED`, `RELEASED`, `REVERSED`.
- `TechnicalPartMovementType`: `ENTRY`, `POSITIVE_ADJUSTMENT`, `NEGATIVE_ADJUSTMENT`, `RESERVATION`, `RESERVATION_INCREASE`, `RESERVATION_DECREASE`, `RELEASE`, `CONSUMPTION`, `MANUAL_REVERSAL`, `STOCK_MODE_CHANGE`.

Modelos criados:

- `TechnicalPart`, com `quantityOnHand Int?`, reservado, mínimo, custos/preços, modo ativo, versão e relações.
- `ServiceOrderPart`, com relações obrigatórias, snapshots, quantidade/totais, estado/timestamps, responsável opcional e idempotência.
- `TechnicalPartMovement`, com físico anterior/posterior nullable, reservado anterior/posterior, custo opcional, operador e idempotência.

Relações inversas foram adicionadas a `ServiceOrder` e `SystemUser`. As relações de usuário são nomeadas `TechnicalPartResponsibleUser` e `TechnicalPartMovementOperator`.

## 4. Alterações em tabelas existentes

### `Product`

Somente `stockQuantity` mudou no Prisma:

```prisma
stockQuantity Int?
```

O default zero foi removido. A migração reconstrói a tabela com:

```sql
"stockQuantity" INTEGER
  CHECK ("stockQuantity" IS NULL OR "stockQuantity" >= 0)
```

Na cópia, `0` anterior vira `NULL`; positivos permanecem iguais. IDs, demais campos, datas e índices foram preservados.

### `StockMovement`

Somente os snapshots mudaram no Prisma:

```prisma
previousStock Int?
newStock      Int?
```

A tabela foi reconstruída. Valores históricos foram copiados literalmente, inclusive zeros. IDs, `productId`, `saleId`, tipo, quantidade, motivo, operador, data, FKs e cinco índices foram preservados.

## 5. Manifesto e checksum

A baseline publicada `20260728_000_baseline_sqlite` não foi editada. A migração foi adicionada depois dela.

Checksum SHA-256 determinístico de `20260804_001_technical_parts`:

`57ad36c0c07e14457345ae506aa4c0e18dd1dfd28a71fc27d4c4e4639241224c`

O payload de checksum agora inclui `alteredTables`, `requiresForeignKeysOff`, `schemaChecks`, `structureChecks`, tabelas e SQL normalizado. `ownedTables` contém somente as três tabelas técnicas; `Product` e `StockMovement` estão em `alteredTables`.

## 6. Checks evolutivos e validação estrutural

O estado efetivo do schema é composto pelo prefixo aplicado do manifesto. Checks posteriores sobrepõem colunas de tabelas-base, evitando que o check `Product.stockQuantity NOT NULL` da baseline rejeite um banco corretamente atualizado.

Além de `PRAGMA table_info`, o core valida:

- FKs por `PRAGMA foreign_key_list`;
- existência, unicidade e parcialidade por `PRAGMA index_list`;
- ordem de colunas e collation por `PRAGMA index_xinfo`;
- predicados parciais e constraints essenciais pelo SQL normalizado de `sqlite_master`;
- triggers e fragmentos determinísticos de seus corpos;
- tipos, nulabilidade e defaults de todas as tabelas novas e alteradas.

Esses metadados fazem parte do checksum.

## 7. Estratégia de `foreign_keys`

Apenas migração com `requiresForeignKeysOff: true` e `alteredTables` válidas pode solicitar rebuild. SQL de manifesto contendo `PRAGMA foreign_keys` é recusado.

Fluxo aplicado:

1. validar banco com FKs ligadas;
2. identificar o lote pendente;
3. desligar FKs antes de `BEGIN IMMEDIATE` somente quando o lote contém rebuild autorizado;
4. executar todas as migrações pendentes em ordem na mesma transação;
5. executar `foreign_key_check` e `integrity_check` antes do commit;
6. rollback em qualquer falha;
7. restaurar e confirmar `foreign_keys=ON` após commit ou rollback.

Dry-run usa conexão somente leitura e não escreve nem muda estado persistente.

## 8. SQL aplicado nas cópias

O SQL canônico integral está em `TECHNICAL_PARTS_SQL`, dentro de `scripts/schema-migrator/migrations.cjs`, e integra o checksum. Ele executa:

- tabelas temporárias de contagem/guard;
- rebuild e cópia de `Product` com `CASE WHEN stockQuantity=0 THEN NULL`;
- recriação dos cinco índices reais de `Product`;
- rebuild e cópia literal de `StockMovement`;
- recriação de duas FKs e cinco índices reais de movimentos;
- validação SQL de contagens e referências;
- criação de `TechnicalPart`, `ServiceOrderPart` e `TechnicalPartMovement`;
- CHECKs de saldos, snapshots, estados, timestamps e deltas;
- FKs `RESTRICT`/`SET NULL`/`CASCADE` conforme arquitetura;
- índice parcial `TechnicalPart_sku_key_nocase` com `COLLATE NOCASE`;
- índice parcial de item ativo;
- triggers de normalização de SKU, com condição de inserção agrupada;
- remoção das estruturas temporárias.

Nenhum SQL foi aplicado aos bancos originais.

## 9. Testes técnicos

Suíte: `scripts/schema-migrator/test-etapa3b.cjs`.

Resultado consolidado:

```json
{
  "ok": true,
  "migrationId": "20260804_001_technical_parts",
  "checksum": "57ad36c0c07e14457345ae506aa4c0e18dd1dfd28a71fc27d4c4e4639241224c",
  "sourcesUnchanged": true,
  "dryRunHashUnchanged": true,
  "applyBackupCreated": true,
  "reapplyNoOp": true,
  "productRowsPreserved": 2,
  "productReferencesPreserved": 10,
  "stockMovementsPreserved": 10,
  "rollbackCases": 3,
  "integrityCheck": "ok",
  "foreignKeyViolations": 0,
  "foreignKeysRestored": true
}
```

Cobertura aprovada:

- A: dry-run identificou baseline+3B e preservou hash.
- B: apply criou backup, aplicou ambas uma vez e terminou íntegro.
- C: reapply não criou backup, não alterou hash e ficou sem pendências.
- D: registros/referências de produto preservados; zeros antigos viraram `NULL`; positivos foram comparados; `NULL`/zero aceitos e negativo rejeitado.
- E: movimentos preservados; snapshots nullable; índices e FKs validados.
- F: peça `NULL`/zero aceita; negativo e reserva excessiva rejeitados; ilimitado com reserva aceito; SKU vazio→`NULL`; colisão `NOCASE` rejeitada.
- G: quantidade zero, totais e timestamps incoerentes rejeitados; índice ativo e reuso após liberação/estorno validados.
- H: deltas ilimitados e `STOCK_MODE_CHANGE` válidos aceitos; entrada ilimitada, delta inválido e idempotência duplicada rejeitados.
- I: falhas após cópia de Product, após rename e após segunda tabela técnica restauraram schema, dados e hash integralmente.
- J: `foreign_key_check` vazio e `foreign_keys=ON` após sucesso/falha.
- K: adulteração de checksum e lacuna histórica bloqueadas; banco atualizado aceito.

Os testes não imprimem IDs, nomes ou dados operacionais.

## 10. Hashes dos bancos-fonte do laboratório

Os hashes foram conferidos antes e depois:

- `runtime.db`: `DBA6FB9EE58855E5BFE0486E505956B1F226C888CD51C501F44AF6B5F1481C36`
- `desenvolvimento.db`: `7D8DC61AE1FFC879676B86199B4ED3EC84A1944A29F10521DD4DE04271A749B3`

Ambos permaneceram inalterados.

Hashes SHA-256 dos artefatos de código antes do empacotamento final:

- `prisma/schema.prisma`: `800FC1AA0672794DD251A5657FC3EA10CA0D0F46594AFAD6052797781B8FF667`
- `scripts/schema-migrator/core.cjs`: `5E77732FB455B2BA9BBE0274184D9ABD6D2F134E2350CFC8B5BB6E956745EF51`
- `scripts/schema-migrator/migrations.cjs`: `8D76FE573E6BC45EE463687D2A8690804450856809A2C7FDA4140E31B77BAAC2`
- `scripts/schema-migrator/test-etapa3b.cjs`: `CAC097B79F31C43BB72BA77C76A0B4B3FA70DDE839D651D952A77317BEB462A8`

## 11. Prisma 6.19.3

- `npx prisma format --schema prisma/schema.prisma`: aprovado.
- `npx prisma validate --schema prisma/schema.prisma`: aprovado.
- `npx prisma generate --schema prisma/schema.prisma`: aprovado.
- Client gerado com Prisma 6.19.3, sem atualização de dependência.
- Tipos confirmados: `stockQuantity`, `previousStock`, `newStock`, `onHandBefore` e `onHandAfter` aceitam `number | null`; os três novos delegates/modelos estão presentes.

Não foi executado `db push` nem `prisma migrate`.

## 12. Build web

Comando executado: `npm run build` (`next build --webpack`).

- Compilação webpack: aprovada em aproximadamente 2,8 minutos.
- Type-check: falhou em `app/api/vendas-produtos/route.ts:386`, porque `produto.stockQuantity` agora é corretamente `number | null` e a API comercial atual compara o valor diretamente com zero.

Essa API está explicitamente fora dos arquivos autorizados da 3B, portanto não foi alterada. A falha é uma limitação conhecida e evidencia a adaptação obrigatória do fluxo comercial à regra `NULL = ilimitado` na próxima etapa apropriada. O build desktop não foi executado.

## 13. Limitações e próximo passo

- Adaptar APIs e páginas comerciais para a nulabilidade antes de exigir build integral verde.
- Implementar o core transacional do estoque técnico na 3C sem ainda expor APIs.
- Aplicar a migração em banco de desenvolvimento original somente após aprovação explícita e backup; esta etapa não a aplicou.
- O ZIP não inclui bancos, backups, `.env`, `node_modules`, `.next`, release, executáveis ou dados.

## 14. Confirmação de segurança

Não foram alterados bancos originais do laboratório, banco de desenvolvimento original do projeto, AppData, Electron, `desktop`, `app`, `lib`, permissões, páginas, APIs, relatórios, PDFs, `.env`, `package.json`, dependências ou `prisma/migrations`.
