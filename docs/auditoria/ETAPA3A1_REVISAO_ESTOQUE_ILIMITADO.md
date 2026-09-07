# ETAPA 3A.1 — Revisão da arquitetura: estoque ilimitado por `NULL`

Data: 2026-08-04  
Natureza: revisão documental; nenhuma implementação ou migração aplicada.

## 1. Regra antiga e regra definitiva

O estoque comercial atual usa `stockQuantity=0` como ilimitado. O desenho original da 3A tratava zero técnico como sem estoque, criando semânticas diferentes.

A regra unificada definitiva é:

| Valor físico | Significado |
|---|---|
| `NULL` | Estoque ilimitado |
| `0` | Sem estoque |
| `> 0` | Estoque físico controlado |

Não existe `isUnlimited` persistido. `NULL` é a única fonte de verdade. APIs podem responder `isUnlimited: saldo === null` e aceitar `unlimitedStock` como conveniência de comando.

## 2. Impacto em `Product`

O modelo futuro passa de `stockQuantity Int @default(0)` para `stockQuantity Int?`, com constraint `stockQuantity IS NULL OR stockQuantity >= 0`.

Hoje, as rotas e telas analisadas derivam ilimitado de zero:

- `/api/produtos` e `/api/produtos/[id]` calculam `unlimitedStock` por `stockQuantity===0`;
- `/api/produtos/[id]/estoque` converte e movimenta zero como saldo;
- `/api/vendas-produtos` permite venda quando zero, não reduz e grava movimento;
- cancelamento soma a quantidade sobre o saldo convertido para inteiro;
- telas de cadastro, listagem e estoque instruem ou exibem zero como ilimitado;
- relatórios excluem saldos `<=0` da valorização.

Tudo isso deve mudar atomicamente com a migração. Produto ilimitado pode ser vendido sem bloqueio, não reduz `stockQuantity`, mantém quantidade vendida e snapshots de receita/custo/margem. Cancelamento mantém `NULL`. Produto controlado reduz, zero bloqueia e cancelamento devolve.

Ilimitado não entra em alertas baixo/esgotado, soma física ou valorização. Continua em quantidade vendida, receita, custo histórico e margem.

## 3. Impacto em `TechnicalPart`

`quantityOnHand` passa a `Int?`; `quantityReserved` continua `Int @default(0)`. Disponibilidade não é armazenada:

```text
quantityOnHand == NULL  => quantityAvailable = NULL (Ilimitado)
quantityOnHand != NULL  => quantityAvailable = quantityOnHand - quantityReserved
```

Constraints:

```sql
quantityOnHand IS NULL OR quantityOnHand >= 0
quantityReserved >= 0
quantityOnHand IS NULL OR quantityReserved <= quantityOnHand
minStock >= 0
```

Reserva ilimitada aumenta reservado e mantém físico/disponível `NULL`. Consumo reduz reservado e mantém físico `NULL`. Liberação reduz reservado. Estorno mantém ambos físico `NULL` e reservado inalterado. Todos criam movimentos e snapshots normais.

Peça ilimitada não aceita entrada nem ajustes. A mudança de modo usa `STOCK_MODE_CHANGE`: ilimitado→controlado exige quantidade inicial inteira `>=0` e no mínimo igual ao reservado; controlado→ilimitado exige reservado zero, confirmação, motivo, versão e auditoria.

## 4. Migração necessária

A migração continua denominada `20260804_001_technical_parts`, mas passa a:

1. reconstruir `Product` com `stockQuantity` nullable;
2. copiar `stockQuantity=0` como `NULL` e preservar positivos;
3. preservar todos os demais campos e registros;
4. preservar/recriar índices;
5. preservar referências de `ProductSaleItem` e `StockMovement`;
6. criar as três tabelas técnicas com físico nullable;
7. validar contagens, referências, FKs, integridade, constraints e schema;
8. registrar checksum e commit somente no sucesso.

SQLite não suporta remover `NOT NULL` com `ALTER COLUMN`; a reconstrução é necessária. Como `Product` é referenciada, `foreign_keys=OFF` deve ocorrer antes de `BEGIN IMMEDIATE`, seguido de rebuild transacional, `foreign_key_check`, commit e reativação. O migrador atual também fixa o check antigo da baseline; 3B precisa suportar checks evolutivos de tabelas-base. Nada disso foi executado nesta etapa.

O SQL de conversão conceitual obrigatório está incorporado à cópia:

```sql
CASE WHEN "stockQuantity" = 0 THEN NULL ELSE "stockQuantity" END
```

Isso deve acontecer antes de qualquer aplicação interpretar zero como esgotado. `prisma db push` permanece exclusivo de desenvolvimento descartável e nunca substitui o migrador de produção.

## 5. APIs

- Resposta: `isUnlimited` derivado; saldo físico permanece `null`.
- Escrita: `unlimitedStock:true` sem quantidade, ou `false` com quantidade obrigatória `>=0`.
- Payload contraditório é `422 VALIDATION_ERROR`; não há normalização silenciosa.
- Filtros usam `IS NULL`, `=0` e `IS NOT NULL`, sem coerção de `null`.
- Movimentos físicos ilimitados retornam `409 UNLIMITED_STOCK_REJECTS_MOVEMENT`.
- Mudança de modo possui idempotência e auditoria próprias.
- Custos continuam protegidos exclusivamente por `relatorios.financeiro`.

## 6. Telas

Produtos e peças terão opção “Estoque ilimitado”. Marcada: quantidade vazia/desabilitada e servidor grava `NULL`. Desmarcada: quantidade obrigatória; zero permitido e exibido como “Sem estoque”. Nunca se solicita zero para ilimitado.

Peça ilimitada exibe:

- Físico: Ilimitado
- Reservado: número real
- Disponível: Ilimitado

Controlados exibem números e alertas. A cor nunca é o único indicador.

## 7. Alertas e relatórios

Ilimitados são excluídos de alerta baixo/esgotado, quantidade física disponível e valorização física. Entram em venda/consumo, receita, custo histórico e margem quando há snapshots.

Zero controlado é “Sem estoque”, pode gerar alerta e bloqueia reserva, venda e saída. Abaixo do mínimo técnico usa somente:

```sql
quantityOnHand IS NOT NULL
AND quantityOnHand - quantityReserved < minStock
```

## 8. Riscos

1. Rebuild de tabela-base com relações exige evolução controlada do migrador.
2. Schema, migração e mudança semântica precisam estar na mesma release; implantação parcial transformaria ilimitados antigos em esgotados.
3. `StockMovement.previousStock/newStock` atuais são não nulos; recomenda-se torná-los nullable para snapshots ilimitados, sujeito a confirmação técnica na 3B.
4. Toda coerção utilitária `Number(null)`, `||0` e tipos TypeScript `number` deve ser localizada e corrigida.
5. Backup/restore e concorrência LAN precisam cobrir o rebuild e vendas simultâneas.

## 9. Decisões confirmadas

1. Alteração de peças é bloqueada após pagamento registrado.
2. Duplicação de OS sempre zera valor de peças.
3. Nova entrada substitui explicitamente o custo atual.
4. SKU é único com `COLLATE NOCASE`.
5. `partsCost` permanece sincronizado com o valor cobrado das peças técnicas.
6. Campos legados permanecem.
7. Nenhum texto antigo é convertido automaticamente.

## 10. Escopo desta revisão

Foram atualizados somente os documentos da Etapa 3A e o ZIP correspondente. Não foram alterados código, schema Prisma, migrações, scripts do migrador, APIs, páginas, Electron ou banco.
