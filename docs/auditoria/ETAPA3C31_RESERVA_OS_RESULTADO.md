# ETAPA 3C.3.1 — Reserva de peça técnica em Ordem de Serviço

Data da validação: 06/08/2026.

## Resultado

Foi implementado o serviço interno transacional para reservar peças técnicas em Ordens de Serviço e consultar os itens técnicos vinculados. Nenhum Route Handler, página ou integração automática com os fluxos públicos de OS foi criado nesta etapa.

## Arquivos criados

- `lib/estoqueTecnico/orderRepository.ts`
- `lib/estoqueTecnico/orderPartRepository.ts`
- `lib/estoqueTecnico/orderPartService.ts`
- `lib/estoqueTecnico/recalculateOrder.ts`
- `scripts/test-estoque-tecnico/etapa3c31-reserva-os.cjs`
- `docs/auditoria/ETAPA3C31_RESERVA_OS_RESULTADO.md`

## Arquivos alterados

- `lib/estoqueTecnico/errors.ts`
- `lib/estoqueTecnico/index.ts`
- `lib/estoqueTecnico/movementRepository.ts`
- `lib/estoqueTecnico/partRepository.ts`
- `lib/estoqueTecnico/types.ts`

## Fluxo transacional

`reserveTechnicalPartForOrder` valida o input e o contexto antes de abrir a transação. A escrita usa a infraestrutura `BEGIN IMMEDIATE` da 3C.1 e, dentro da mesma conexão SQLite, verifica replay, relê OS e peça, valida mutabilidade, pagamento, versão, disponibilidade, duplicidade ativa e compatibilidade legada. Em seguida executa o incremento condicionado da reserva, cria `ServiceOrderPart`, cria `TechnicalPartMovement`, recalcula a OS e grava um único `OrderHistory`.

Qualquer erro reverte integralmente saldo reservado, item, movimento, totais e histórico. Os repositórios recebem a conexão já aberta, usam statements preparados e não controlam commit ou rollback.

## Idempotência vinculada ao operador

A chave lógica inclui escopo estável do operador, OS, peça e UUID externo. IDs e identidade são incorporados de forma segura e o payload relevante é canonicalizado e resumido com SHA-256. O item e o movimento recebem chaves determinísticas distintas.

A busca de replay usa prefixo preparado com escape explícito de `%`, `_` e do caractere de escape. Mesma chave e mesmo payload retornam `idempotentReplay=true`; mesma chave com payload diferente retorna `IDEMPOTENCY_KEY_REUSED`. Outro operador possui escopo diferente e não recebe o replay do primeiro.

## Status, finalização e pagamentos

Reservas são permitidas somente em `RECEBIDO`, `EM_ANALISE`, `AGUARDANDO_PECA` e `EM_REPARO`. Estados `PRONTO`, `ENTREGUE` e `CANCELADO`, bem como finalização incompatível, retornam `ORDER_NOT_MUTABLE`.

A alteração é bloqueada por `paidAmount > 0`, `paymentPercent > 0`, `paymentReceivedAt` preenchido ou existência de `ServiceOrderPayment`, retornando `ORDER_HAS_PAYMENTS` sem expor valores.

## Estoque controlado e ilimitado

No estoque controlado, o update condicionado exige peça ativa, versão atual e disponibilidade física suficiente. `quantityOnHand` permanece inalterado e `quantityReserved` aumenta. No estoque ilimitado, o físico permanece `NULL`, não há limite físico e a disponibilidade derivada continua ilimitada, embora a reserva seja contabilizada.

Zero linhas afetadas é diagnosticado dentro da transação para distinguir peça inexistente, inativa, conflito de versão, estoque insuficiente e violação de invariantes. Duas reservas concorrentes não podem fazer o reservado ultrapassar o físico.

## Snapshots e movimento

O servidor cria o item `RESERVED` com nome, SKU, custo atual persistido, preço validado, quantidades, totais arredondados, operador e horários. O custo nunca é recebido do chamador. Alterações futuras no cadastro não modificam os snapshots.

O movimento `RESERVATION` registra físico antes/depois, reservado antes/depois, custo interno, operador, item de OS e chave idempotente. A invariante de movimento é validada antes da inserção.

## Compatibilidade com custo de peças legado

Quando ainda não há item técnico ativo e `partsCost` manual é positivo, a primeira reserva exige `confirmReplaceLegacyPartsCost=true`. A confirmação substitui somente o valor manual pela soma técnica; `requiredParts` e demais textos legados permanecem intactos. A substituição é descrita de forma segura na mesma entrada idempotente de histórico.

## Recálculo e histórico

`recalculateTechnicalPartsOrderTotals` soma `totalPriceSnapshot` apenas de itens `RESERVED` e `CONSUMED`, arredonda `partsCost` e calcula `totalAmount = max(partsCost + laborCost - discount, 0)`. Pagamentos, percentuais, método, finalização e textos legados não são alterados.

O sucesso inicial grava exatamente um histórico `PECA_TECNICA_RESERVADA`, com nome snapshot, quantidade e eventual substituição do valor legado, sem custo interno, pagamento, SQL ou payload. Replay não cria histórico adicional.

## Consulta e sanitização

`listTechnicalPartsForOrder` usa conexão somente leitura, valida a OS e os estados por allowlist, ordena por criação e ID e retorna apenas dados técnicos necessários e totais operacionais. A opção `includeHistory` inclui somente os movimentos técnicos ligados aos itens retornados. Sem autorização financeira, custos são removidos de itens, movimentos, objetos aninhados e listas; preço e subtotal operacional permanecem visíveis.

## Proteção contra SQL injection

Valores externos são sempre parâmetros preparados. A única composição dinâmica de estados cria placeholders a partir de uma allowlist fechada. Ordenação é fixa. Os testes confirmaram que IDs, nomes, SKU e motivos contendo aspas e construções SQL permanecem dados e não executam statements adicionais.

## Testes

O teste `etapa3c31-reserva-os.cjs` executou 68 verificações com código 0 em banco temporário migrado. Cobertura: reserva controlada e ilimitada; saldo zero; corrida pela última unidade; versão; peça ausente/inativa; duplicidade ativa; status/finalização; quatro indicadores de pagamento; custo legado; imutabilidade de snapshots; ocultação financeira; idempotência e escopo do operador; rollback após reserva, item e movimento; SQL injection; filtros e projeção da consulta.

Regressões concluídas com código 0:

- 3C.1: 40 verificações;
- 3C.2: 64 verificações;
- 3C.2.1: 44 verificações;
- migrador 3B: apply/reapply, três rollbacks, integridade e FKs;
- migração 002: checksum `20013162c5f4f15f08618c72904a970a08e6aa2baa01ad5e3e8b66cdecfe5750`, reaplicação sem efeito e rollback preservado.

## Validação final

- `npx prisma validate`: código 0;
- `npx prisma generate`: código 0, Prisma Client 6.19.3;
- `npx tsc --noEmit`: código 0;
- `npm run build`: código 0, Next.js 16.2.10, 25 páginas estáticas geradas.

Não foram executados `prisma db push`, `prisma migrate`, build desktop ou o executável da aplicação.

## Limitações e próximo passo

Esta etapa oferece apenas reserva e consulta internas. Não implementa edição de item reservado, liberação, consumo, estorno, cancelamento, endpoints, telas, PDFs ou relatórios. A integração futura deverá construir o contexto exclusivamente da sessão autenticada e reutilizar estes serviços, sem aceitar identidade, custo ou totais do cliente.

## Confirmação de escopo

Não foram alterados schema Prisma, migrador, Electron, APIs, páginas, permissões, package.json, `.env`, bancos reais, banco de desenvolvimento original ou AppData. Todos os testes de escrita utilizaram cópias descartáveis em diretórios temporários.
