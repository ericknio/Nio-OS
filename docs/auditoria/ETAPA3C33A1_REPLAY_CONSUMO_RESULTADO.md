# ETAPA 3C.3.3A1 — Replay do consumo após mudança posterior do item

## Escopo

O replay de `markServiceOrderReadyAndConsumeTechnicalParts` deixou de depender
do estado atual `CONSUMED` de `ServiceOrderPart`. Nenhuma API, página, schema,
migrador ou integração pública foi alterada.

## Implementação

- `movementRepository.ts`: adicionada consulta preparada
  `listConsumptionMovementsForCommand`, limitada à OS e à chave determinística
  do operador, request e hash; LIKE usa escape de barra, `%` e `_`.
- `orderConsumptionService.ts`: replay reconstruído pelo
  `ServiceOrderTechnicalCommandLog`, movimentos `CONSUMPTION` e itens
  relacionados. O item pode estar `CONSUMED` ou `REVERSED`.
- `orderConsumptionService.ts`: validação de integridade exige tipo,
  relacionamento OS/peça/item, quantidade, chave esperada, exatamente um
  movimento por item e contagem igual a `affectedItems`. Comando com zero itens
  exige zero movimentos e também permite replay.
- `etapa3c33a-consumo-pronto.cjs`: cobertura de replay normal e após
  `REVERSED`, ausência/divergência/duplicidade de movimentos e comando sem itens.

Mudança posterior de estado não é tratada como reutilização de chave: somente
divergência histórica produz `STOCK_INVARIANT_VIOLATION`. O replay não altera
estoque, reservas, itens, status, totais, histórico ou command log.

## Testes

Suíte 3C.3.3A: **89 asserções aprovadas**. Também foram executadas regressões:

- 3C.1: 40 asserções;
- 3C.2: 64 asserções;
- 3C.2.1: 44 asserções;
- 3C.3.1A: 108 asserções;
- 3C.3.2: 69 asserções.

## Validação

- `npx prisma validate`: aprovado;
- `npx prisma generate`: aprovado;
- `npx tsc --noEmit`: aprovado;
- `npm run build`: aprovado (Next.js, código 0).

## Limitações

Esta etapa somente corrige a reconstrução histórica do replay. Não implementa
estorno futuro, novas APIs, páginas ou alteração de estados fora dos fluxos já
existentes.

