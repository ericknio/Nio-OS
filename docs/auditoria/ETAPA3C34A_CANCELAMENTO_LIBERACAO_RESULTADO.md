# ETAPA 3C.3.4A — Cancelamento atômico com liberação de reservas

## Regras preservadas

O cancelamento atual exige motivo, bloqueia OS inexistente, já cancelada,
entregue ou finalizada, exige a permissão `ordens.cancelar` e cria histórico
`CANCELAMENTO_OS`. O serviço interno mantém essas regras e não altera
pagamentos, finalização ou textos legados.

## Serviço

Foi criado `orderCancellationService.ts`, usando a operação existente
`RELEASE_ON_CANCEL` de `ServiceOrderTechnicalCommandLog`.

Na mesma transação `BEGIN IMMEDIATE`, o serviço valida a OS e todos os itens
`RESERVED`, reduz `quantityReserved` com predicado condicional, mantém
`quantityOnHand` (inclusive `NULL`), muda os itens para `RELEASED`, cria um
movimento `RELEASE`, cancela a OS, recalcula totais, registra histórico e grava
o command log.

Itens `CONSUMED` permanecem intactos; não há devolução física automática. Itens
`RELEASED` e `REVERSED` são ignorados. Peças inativas podem liberar reservas
existentes.

## Idempotência e rollback

A chave lógica é vinculada ao operador, OS e request key. O replay reconstrói
somente os movimentos `RELEASE` persistidos, valida OS, item, peça, quantidade,
tipo, chave e duplicidade, e não repete nenhuma mutação ou histórico. Qualquer
falha reverte integralmente reservas, itens, movimentos, status, totais,
histórico e command log.

## Totais e sanitização

`RELEASED` deixa de compor `partsCost`; `CONSUMED` continua compondo. As
projeções usam as allowlists existentes e ocultam custos e identificadores
internos sem permissão financeira.

## Testes e validação

- `etapa3c34a-cancelamento.cjs`: 17 asserções aprovadas;
- Prisma validate: aprovado;
- Prisma generate: aprovado;
- TypeScript: executado com sucesso;
- build: executado no fechamento da etapa.

Não houve alteração de Route Handler, schema, migrador, páginas, Electron ou
bancos reais.

