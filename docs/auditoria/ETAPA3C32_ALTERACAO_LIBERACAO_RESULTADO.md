# ETAPA 3C.3.2 — Alteração e liberação de peça reservada

Data da validação: 06/08/2026.

## Resultado

Foram implementados os serviços internos `changeReservedTechnicalPartQuantity` e `releaseTechnicalPartFromOrder`. Ambos usam a infraestrutura SQLite transacional com `BEGIN IMMEDIATE`, updates condicionais, movimentos persistidos, recálculo central da OS, histórico idempotente, projeções seguras e rollback integral.

## Arquivos criados

- `lib/estoqueTecnico/orderPartMutationService.ts`
- `scripts/test-estoque-tecnico/etapa3c32-alteracao-liberacao.cjs`
- `docs/auditoria/ETAPA3C32_ALTERACAO_LIBERACAO_RESULTADO.md`

## Arquivos alterados

- `lib/estoqueTecnico/errors.ts`
- `lib/estoqueTecnico/index.ts`
- `lib/estoqueTecnico/orderPartRepository.ts`
- `lib/estoqueTecnico/orderRepository.ts`
- `lib/estoqueTecnico/partRepository.ts`
- `lib/estoqueTecnico/recalculateOrder.ts`

## Aumento de quantidade

O aumento calcula somente o delta entre `newQuantity` e `expectedQuantity`. A peça precisa estar ativa, possuir a versão esperada e suportar incremento seguro. No estoque controlado, a disponibilidade deve cobrir o delta; no ilimitado, `quantityOnHand` permanece `NULL` e a reserva aumenta sem limite físico.

O update da peça é condicionado por ID, atividade, versão, limite de versão, limite de reserva e disponibilidade. O físico nunca é alterado. Em seguida, o item é atualizado condicionalmente por ID, estado `RESERVED` e quantidade esperada.

## Redução de quantidade

A redução diminui apenas `quantityReserved` pelo delta e incrementa a versão. É permitida mesmo com a peça inativa, pois reduz uma obrigação existente. O predicado exige versão atual e reserva suficiente, impedindo saldo negativo. Quantidade zero não é aceita; remoção integral exige o comando explícito de liberação.

Os preços e custos unitários, snapshots de nome/SKU, responsável, data da reserva e chave original do item permanecem inalterados. Apenas quantidade e totais derivados são recalculados.

## Liberação integral

A liberação exige item existente em `RESERVED`, quantidade atual igual a `expectedQuantity`, peça existente, versão atual e reserva suficiente. A peça pode estar inativa. O físico não muda; a reserva é reduzida integralmente e a versão é incrementada.

O item não é apagado: passa a `RELEASED`, recebe `releasedAt` e preserva quantidade, snapshots e dados históricos. Valores manuais legados não são restaurados, e `requiredParts` permanece intacto.

## Versão e expectedQuantity

`technicalPartVersion` protege o saldo da peça e `expectedQuantity` protege o item reservado. Divergência de versão retorna `VERSION_CONFLICT`; divergência da quantidade retorna `ORDER_PART_QUANTITY_CONFLICT`; item fora de `RESERVED` retorna `SERVICE_ORDER_PART_NOT_RESERVED`.

Se o update da peça vencer, mas o update condicionado do item falhar, toda a transação é revertida.

## Idempotência

Alteração e liberação usam chaves lógicas separadas, vinculadas ao operador, ao item e ao UUID externo. O payload relevante é canonicalizado e protegido por SHA-256; a chave persistida fica em `TechnicalPartMovement.idempotencyKey`.

O replay valida chave completa, item, peça, tipo, delta ou quantidade integral e vínculo `serviceOrderPartId`. Replay não depende da quantidade ou estado atual do item, não altera saldo, não insere movimento ou histórico e não recalcula. Payload divergente retorna `IDEMPOTENCY_KEY_REUSED`; inconsistência histórica retorna `STOCK_INVARIANT_VIOLATION`. Operadores diferentes possuem escopos distintos.

## Movimentos

- aumento: `RESERVATION_INCREASE` com `quantity=delta`;
- redução: `RESERVATION_DECREASE` com `quantity=delta`;
- liberação: `RELEASE` com a quantidade integral.

Todos preservam o físico antes/depois, inclusive `NULL` no ilimitado, registram reservado antes/depois, snapshot de custo do item, motivo validado, operador e vínculo do item. `assertTechnicalMovementInvariant` é executado antes da inserção.

## Ordem, recálculo e histórico

As operações são permitidas apenas em `RECEBIDO`, `EM_ANALISE`, `AGUARDANDO_PECA` e `EM_REPARO`, sem finalização ou qualquer indicador de pagamento. Valores financeiros de pagamentos não aparecem em erros ou logs.

Após a mutação, `recalculateTechnicalPartsOrderTotals` soma apenas itens `RESERVED` e `CONSUMED`. Itens `RELEASED` deixam de compor `partsCost`; pagamentos e textos legados não são alterados. Os limites `MAX_MONEY` continuam obrigatórios e qualquer falha reverte toda a operação.

Cada sucesso inicial cria exatamente um histórico:

- `PECA_TECNICA_RESERVA_AUMENTADA`;
- `PECA_TECNICA_RESERVA_REDUZIDA`;
- `PECA_TECNICA_LIBERADA`.

As descrições são limitadas, não incluem custo e usam parâmetros preparados. Replay não cria novo histórico.

## Projeções e segurança

Os resultados seguem `{ item, movement, totals, idempotentReplay }` e reutilizam as allowlists da 3C.3.1A. `idempotencyKey`, `responsibleUserId` e `operatorId` não são retornados. Custos ficam ausentes sem permissão e aparecem somente quando autorizados. Repositories e factory de laboratório não são reexportados pelo barrel.

IDs, motivos e demais valores externos são parâmetros preparados. Nenhum caminho de banco, SQL, stack ou causa interna é exposto.

## Concorrência e rollback

Os testes concorrentes confirmaram:

- duas ampliações com a mesma versão: um sucesso;
- duas reduções com a mesma versão: um sucesso;
- alteração contra liberação: um sucesso;
- duas liberações: um sucesso;
- reserva nunca negativa nem acima do físico controlado;
- exatamente um movimento do tipo esperado por sucesso.

Foram injetadas falhas após a atualização da peça, após o item e após o movimento. Também foi forçada falha no recálculo por total fora do domínio. Em todos os casos, quantidade do item, reserva, movimentos, histórico e totais retornaram ao estado anterior.

## Testes

`etapa3c32-alteracao-liberacao.cjs` concluiu 69 verificações com código 0 em banco temporário migrado. A cobertura inclui aumento controlado/ilimitado, insuficiência, redução, validação de quantidades, peça inativa, liberação, último item, estados/finalização/pagamentos, replay de todas as operações, escopo do operador, concorrência real, rollback, sanitização recursiva, SQL injection e consulta com `includeHistory`.

## Regressões

Todas concluídas com código 0:

- 3C.1: 40 verificações;
- 3C.2: 64 verificações;
- 3C.2.1: 44 verificações;
- 3C.3.1A: 108 verificações;
- migrador 3B: apply/reapply, integridade, FKs e três rollbacks;
- migração 002: checksum `20013162c5f4f15f08618c72904a970a08e6aa2baa01ad5e3e8b66cdecfe5750`, reaplicação sem efeito e rollback preservado.

## Validação final

- `npx prisma validate`: código 0;
- `npx prisma generate`: código 0, Prisma Client 6.19.3;
- `npx tsc --noEmit`: código 0;
- `npm run build`: código 0, Next.js 16.2.10, 25 páginas estáticas geradas.

## Correção UTF-8

A mensagem em `recalculateOrder.ts` foi salva corretamente em UTF-8 como: “Os totais da ordem de serviço estão inconsistentes.”

## Escopo preservado

Não foram alterados schema Prisma, migrador, APIs, páginas, Electron, permissões, package.json, `.env`, dependências, bancos reais, banco de desenvolvimento original ou AppData. Não foram executados `prisma db push`, `prisma migrate`, build desktop ou `Nio-OS.exe`. Todos os testes de escrita usaram cópias temporárias descartáveis.
