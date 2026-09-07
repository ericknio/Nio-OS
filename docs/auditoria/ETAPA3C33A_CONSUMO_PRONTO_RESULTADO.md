# ETAPA 3C.3.3A — Consumo atômico ao marcar a OS como pronta

Data da validação: 06/08/2026.

## Resultado

Foi criado o núcleo interno `markServiceOrderReadyAndConsumeTechnicalParts`, responsável por consumir todos os itens `RESERVED` e mudar a OS para `PRONTO` dentro de uma única transação SQLite `BEGIN IMMEDIATE`. O Route Handler público permanece inalterado.

## Análise da rota atual

A rota atual `PATCH /api/ordens/[id]/status`:

- permite mudança rápida entre `RECEBIDO`, `EM_ANALISE`, `AGUARDANDO_PECA`, `EM_REPARO` e `PRONTO`;
- exige `ordens.marcar_pronto` para o destino `PRONTO`;
- exige técnico responsável, normalizado com trim e limitado a 120 caracteres;
- bloqueia OS cancelada, entregue ou com finalização;
- rejeita status igual ao atual;
- atualiza `status` e, para `PRONTO`, `technicianResponsible`;
- cria um `OrderHistory` com ação `ALTERACAO_STATUS`, status anterior/novo e técnico;
- não altera pagamentos ou totais;
- retorna a OS com relações, ocultando pagamentos conforme permissões.

O serviço novo preserva status, técnico e histórico normal. A futura integração 3C.3.3B deverá substituir a escrita Prisma para `PRONTO` por uma única chamada ao serviço, evitando histórico duplicado.

## Arquivos criados

- `lib/estoqueTecnico/orderTechnicalCommandRepository.ts`
- `lib/estoqueTecnico/orderConsumptionService.ts`
- `scripts/schema-migrator/test-etapa3c33a.cjs`
- `scripts/test-estoque-tecnico/etapa3c33a-consumo-pronto.cjs`
- `docs/auditoria/ETAPA3C33A_CONSUMO_PRONTO_RESULTADO.md`

## Arquivos alterados

- `prisma/schema.prisma`
- `scripts/schema-migrator/migrations.cjs`
- `lib/estoqueTecnico/db.ts`
- `lib/estoqueTecnico/errors.ts`
- `lib/estoqueTecnico/index.ts`
- `lib/estoqueTecnico/movementRepository.ts`
- `lib/estoqueTecnico/orderPartRepository.ts`
- `lib/estoqueTecnico/orderRepository.ts`
- `lib/estoqueTecnico/partRepository.ts`
- `lib/estoqueTecnico/types.ts`

## Modelo e migração 003

Foi adicionado `ServiceOrderTechnicalCommandLog` e o enum `ServiceOrderTechnicalOperation`, com operações previstas `CONSUME_ON_READY`, `RELEASE_ON_CANCEL` e `MANUAL_REVERSAL`.

O log armazena somente chave lógica, SHA-256, operação, OS, operador/snapshot, número de itens, status resultante e data. Não armazena payload, cliente, senha, observações, custos, preços, pagamentos, SQL ou caminho.

A migração `20260806_003_service_order_technical_command_log` cria a tabela, FKs `RESTRICT`/`SET NULL`, índice único e índices de consulta. Ela participa de `ownedTables`, `requiredTables`, `schemaChecks`, `structureChecks` e checksum determinístico. Não desativa FKs nem reconstrói tabelas.

Checksum 003: `e7e05f31ccb1f8664030ea58e0d98172dd30681077e31b4052e1db92298eabd4`.

Os checksums publicados permaneceram:

- 001: `57ad36c0c07e14457345ae506aa4c0e18dd1dfd28a71fc27d4c4e4639241224c`;
- 002: `20013162c5f4f15f08618c72904a970a08e6aa2baa01ad5e3e8b66cdecfe5750`.

## Transição para PRONTO

O input aceita somente `expectedCurrentStatus`, `confirmation=true` e `technicianResponsible`. O alvo não é recebido: sempre é `PRONTO`. Técnico continua obrigatório e limitado a 120 caracteres.

São aceitas origens `RECEBIDO`, `EM_ANALISE`, `AGUARDANDO_PECA` e `EM_REPARO`. Divergência do status esperado retorna `ORDER_STATUS_CONFLICT`; finalização retorna `ORDER_NOT_MUTABLE`. Pagamentos não bloqueiam o consumo e não são alterados.

A atualização da OS é condicionada por ID, status esperado, allowlist de origem, ausência de `finalizedAt` e ausência de `OrderFinalization`.

## Consumo controlado e ilimitado

No controlado, o update atômico exige físico e reserva suficientes, versão atual e versão incrementável. Diminui `quantityOnHand` e `quantityReserved` pela quantidade do item e incrementa a versão.

No ilimitado, exige `quantityOnHand IS NULL`, reserva suficiente e versão válida. Diminui somente `quantityReserved`; o físico permanece `NULL`.

Peça inativa pode ser consumida quando já reservada. Todos os itens e peças são validados antes do primeiro update. Itens são processados em `createdAt ASC, id ASC`.

## Itens e movimentos

Cada item é atualizado condicionalmente por ID, OS, peça, estado `RESERVED` e quantidade. Passa a `CONSUMED`, recebe `consumedAt` e preserva quantidade, snapshots, preços, custos, responsável, reserva original e idempotência original.

Cada item gera exatamente um `TechnicalPartMovement` `CONSUMPTION`, com físico/reserva antes e depois, custo histórico interno, operador, item e chave determinística própria. Movimentos anteriores inesperados bloqueiam a operação. A invariante TypeScript é validada antes da inserção.

## Idempotência no nível da OS

A chave lógica vincula operador, OS e UUID externo; o payload validado recebe SHA-256. Antes de qualquer alteração, o command log é consultado.

Mesmo comando retorna replay sem status, estoque, item, movimento, totais ou histórico adicionais. Payload divergente retorna `IDEMPOTENCY_KEY_REUSED`. Outro operador possui escopo próprio. Replay permanece válido mesmo após a OS evoluir posteriormente para `ENTREGUE`.

OS sem itens também gera command log com `affectedItems=0`, sem movimento ou histórico técnico artificial.

## Totais e histórico

Após o consumo, o recálculo é executado dentro da transação. `CONSUMED` continua somando junto com `RESERVED`, portanto `partsCost` normalmente permanece; `totalAmount` é validado contra os limites do domínio.

O serviço cria o histórico normal `ALTERACAO_STATUS`. Quando há consumo, acrescenta exatamente uma entrada `PECAS_TECNICAS_CONSUMIDAS`, contendo somente quantidade de tipos e unidades. Sem itens, não cria histórico técnico falso. Replay não duplica históricos.

## Concorrência e rollback

Testes em workers confirmaram uma transição vencedora para duas tentativas de `PRONTO`, um command log e um movimento por item. Também foram exercitados consumo contra liberação e consumo contra alteração, com a transição adquirindo a transação primeiro; a operação concorrente perde pelo estado da OS, sem efeito parcial.

Foram injetadas falhas após a primeira peça, primeiro item, primeiro movimento, todos os itens, status, histórico e imediatamente antes do command log. Em todos os sete pontos, estoques, reservas, itens, movimentos, status, técnico, totais, históricos e command log retornaram ao estado inicial.

## Sanitização

A resposta usa allowlists explícitas para OS, itens e movimentos. Não retorna chaves idempotentes, IDs internos de operador/responsável, pagamentos, cliente, senha, SQL, caminho, stack ou causa interna. Custos ficam ausentes sem `relatorios.financeiro` e aparecem somente quando autorizados. Preço e totais operacionais permanecem visíveis.

## Testes

`etapa3c33a-consumo-pronto.cjs` concluiu 79 verificações com código 0 em banco temporário migrado. Cobertura: controlado, ilimitado, múltiplos itens, ordem determinística, peça inativa, reservas/físicos inconsistentes, peça ausente, movimento anterior, status, finalização, OS vazia, replay/conflito/operador, replay após entrega, pagamentos preservados, totais e rollback, concorrência, sanitização, SQL injection e barrel seguro.

`test-etapa3c33a.cjs` validou apply, inspect, reaplicação sem efeito, checksum, constraints, FKs, rollback e preservação das migrações anteriores.

## Regressões

Todas concluídas com código 0:

- 3C.1: 40 verificações;
- 3C.2: 64 verificações;
- 3C.2.1: 44 verificações;
- 3C.3.1A: 108 verificações;
- 3C.3.2: 69 verificações;
- migrador 3B: integridade, FKs, reaplicação e três rollbacks;
- migração 002: checksum, reaplicação e rollback;
- migração 003: constraints, FKs, checksum, reaplicação e rollback.

## Validação final

- `npx prisma format`: código 0;
- `npx prisma validate`: código 0;
- `npx prisma generate`: código 0, Prisma Client 6.19.3;
- `npx tsc --noEmit`: código 0;
- `npm run build`: código 0, Next.js 16.2.10, 25 páginas estáticas geradas.

## Limitações e plano 3C.3.3B

Esta etapa não integra o Route Handler, não cria API/página e não implementa cancelamento, liberação automática, estorno, entrega, PDF ou relatório. Na 3C.3.3B, a rota deverá montar o contexto a partir da sessão, exigir chave idempotente e delegar exclusivamente ao novo serviço quando o destino for `PRONTO`, preservando o fluxo antigo para outros status e evitando escrita/histórico duplicados.

## Escopo preservado

Não foram alterados APIs, páginas, Electron, permissões, package.json, `.env`, dependências, dados ou bancos reais. Não foram executados `prisma db push`, `prisma migrate`, build desktop ou `Nio-OS.exe`. Todos os testes usaram bancos temporários descartáveis.
