# ETAPA 3C.3.1A — Endurecimento da reserva de peças

Data da validação: 06/08/2026.

## Resultado

O serviço interno de reserva foi endurecido antes das etapas de liberação, consumo e exposição por API. As mudanças corrigem o histórico consultável, tornam o replay independente do estado atual, estabelecem projeções públicas por allowlist, reduzem o barrel público e validam integralmente os totais antes de atualizar a OS.

## Arquivos alterados

- `lib/estoqueTecnico/index.ts`
- `lib/estoqueTecnico/movementRepository.ts`
- `lib/estoqueTecnico/orderPartService.ts`
- `lib/estoqueTecnico/recalculateOrder.ts`
- `lib/estoqueTecnico/sanitize.ts`
- `lib/estoqueTecnico/types.ts`
- `scripts/test-estoque-tecnico/etapa3c31-reserva-os.cjs`
- `docs/auditoria/ETAPA3C31A_ENDURECIMENTO_RESERVA_RESULTADO.md`

## Correção de includeHistory

Na implementação anterior, `includeHistory` ampliava implicitamente os estados consultados e não retornava `TechnicalPartMovement`. Agora a opção controla exclusivamente a presença da propriedade `movements`.

- `includeHistory=false` retorna somente `items` e `totals`;
- `includeHistory=true` retorna `items`, `movements` e `totals`;
- sem `states`, permanecem somente `RESERVED` e `CONSUMED`;
- `RELEASED` e `REVERSED` exigem seleção explícita.

`listMovementsForOrderPartIds` recebe apenas os IDs dos itens previamente retornados pela consulta da OS. A consulta usa placeholders preparados gerados pela quantidade desses IDs internos, devolve lista vazia quando não há itens e ordena por `createdAt` e `id`. Portanto, não inclui movimentos de itens filtrados, de outra OS ou IDs externos.

## Replay após mudança de estado

O replay deixou de exigir estado `RESERVED`. Mesma chave lógica, hash, OS e peça retorna replay válido para itens `RESERVED`, `CONSUMED`, `RELEASED` ou `REVERSED`, sem reservar novamente, inserir item/movimento, recalcular ou gravar histórico.

A integridade histórica continua obrigatória: deve existir movimento `RESERVATION` com a chave esperada, vinculado ao mesmo item e peça e com quantidade igual à do item. Movimento ausente ou divergente retorna `STOCK_INVARIANT_VIOLATION`. Uma mudança normal de estado não é tratada como reutilização da chave.

## Projeções explícitas e metadados removidos

As projeções de `ServiceOrderPart` e `TechnicalPartMovement` são construídas por allowlists explícitas. Essa regra é aplicada no sucesso inicial, replay e consultas, inclusive listas e movimentos de `includeHistory`.

Nunca são retornados:

- `ServiceOrderPart.idempotencyKey`;
- `ServiceOrderPart.responsibleUserId`;
- `TechnicalPartMovement.idempotencyKey`;
- `TechnicalPartMovement.operatorId`.

Sem permissão financeira, `unitCostSnapshot` e `totalCostSnapshot` ficam completamente ausentes. Com permissão, apenas os custos permitidos são acrescentados. Nenhum campo removido é convertido em zero, `null` ou `undefined` serializável.

## Superfície pública

O barrel `lib/estoqueTecnico/index.ts` passou a exportar explicitamente apenas serviços seguros de peças, reserva/consulta, erros destinados à integração futura e tipos de projeção/resultado.

Foram removidos do barrel repositories, funções de insert/update, recálculo interno, resolvedores/conexões de banco, validadores internos, helpers de idempotência e todas as factories `__create*ForTests`. Os testes continuam acessando factories diretamente nos arquivos específicos.

## Totais e invariantes

Antes do update da OS, `partsCost`, `laborCost`, `discount` e `totalAmount` precisam ser finitos, não negativos e menores ou iguais a `MAX_MONEY`. Não ocorre truncamento nem limitação silenciosa. Valor fora do domínio retorna `STOCK_INVARIANT_VIOLATION`, e a transação preserva os totais anteriores, reserva, itens e movimentos.

## Testes

`etapa3c31-reserva-os.cjs` foi ampliado de 68 para 108 verificações, todas concluídas com código 0 em banco temporário. Além da cobertura original, foram verificados:

- formatos com e sem `movements`;
- isolamento dos movimentos pelos itens retornados;
- ausência de ampliação automática de estados;
- consulta explícita de `RELEASED` com histórico;
- remoção recursiva de metadados internos;
- custos ocultos e autorizados;
- replay nos quatro estados;
- ausência de efeitos adicionais no replay;
- movimento ausente, peça divergente e quantidade divergente;
- exports seguros do barrel;
- total acima de `MAX_MONEY` e rollback integral.

## Regressões

Todas concluídas com código 0:

- 3C.1: 40 verificações;
- 3C.2: 64 verificações;
- 3C.2.1: 44 verificações;
- 3C.3.1 endurecida: 108 verificações;
- migrador 3B: apply/reapply, integridade, FKs e três cenários de rollback;
- migração 002: checksum `20013162c5f4f15f08618c72904a970a08e6aa2baa01ad5e3e8b66cdecfe5750`, reaplicação sem efeito, rollback preservado e fonte inalterada.

## Validação final

- `npx prisma validate`: código 0;
- `npx prisma generate`: código 0, Prisma Client 6.19.3;
- `npx tsc --noEmit`: código 0;
- `npm run build`: código 0, Next.js 16.2.10, 25 páginas estáticas geradas.

Não foram executados `prisma db push`, `prisma migrate`, instalação/atualização de dependências, build desktop ou `Nio-OS.exe`.

## Escopo preservado

Não foram alterados schema Prisma, migrador, APIs, páginas, Electron, permissões, package.json, `.env`, bancos reais, banco original de desenvolvimento ou AppData. Todas as escritas de teste ocorreram em cópias temporárias descartáveis.
