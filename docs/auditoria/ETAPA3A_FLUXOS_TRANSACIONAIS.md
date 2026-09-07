# ETAPA 3A — Fluxos transacionais, concorrência e idempotência

## 1. Executor transacional

Cada comando de escrita abre conexão SQLite exclusiva para o mesmo arquivo usado pela aplicação, configura `foreign_keys=ON` e `busy_timeout=5000`, executa `BEGIN IMMEDIATE`, realiza leituras e updates condicionais, insere movimento/item/histórico, recalcula a OS, e faz `COMMIT`. Em qualquer erro: `ROLLBACK`. Não misturar operações Prisma fora dessa conexão dentro do mesmo comando.

Contrato comum de erro: `{ message, code, details? }`; detalhes nunca expõem caminhos, SQL ou custo sem autorização. `401 AUTH_REQUIRED`; `403 PERMISSION_DENIED`; `404 *_NOT_FOUND`; `409` para conflito/idempotência/versão/saldo/estado; `422 VALIDATION_ERROR`; `503 STOCK_DB_BUSY`; `500 INTERNAL_ERROR`.

## 2. Atualizações condicionais

Reserva:

```sql
UPDATE TechnicalPart SET quantityReserved=quantityReserved+:q, version=version+1, updatedAt=:now
WHERE id=:id AND isActive=1 AND :q>0
  AND (quantityOnHand IS NULL OR quantityOnHand-quantityReserved>=:q);
```

Consumo:

```sql
UPDATE TechnicalPart SET quantityOnHand=CASE WHEN quantityOnHand IS NULL THEN NULL ELSE quantityOnHand-:q END,
 quantityReserved=quantityReserved-:q, version=version+1, updatedAt=:now
WHERE id=:id AND quantityReserved>=:q
  AND (quantityOnHand IS NULL OR quantityOnHand>=:q);
```

Liberação/decréscimo:

```sql
UPDATE TechnicalPart SET quantityReserved=quantityReserved-:q, version=version+1, updatedAt=:now
WHERE id=:id AND quantityReserved>=:q;
```

Saída/ajuste negativo:

```sql
UPDATE TechnicalPart SET quantityOnHand=quantityOnHand-:q, version=version+1, updatedAt=:now
WHERE id=:id AND quantityOnHand IS NOT NULL
  AND quantityOnHand-quantityReserved>=:q;
```

Exatamente uma linha afetada é sucesso. Zero exige releitura dentro da transação para distinguir inexistente, inativa, versão divergente, estado inválido ou saldo insuficiente.

## 3. Idempotência

O cliente envia `Idempotency-Key` UUID em toda mutação. O servidor deriva chave estável com versão do comando e recurso:

| Operação | Chave persistida de movimento |
|---|---|
| Entrada | `tp:entry:v1:{partId}:{requestKey}` |
| Ajuste positivo/negativo | `tp:adjust:{positive|negative}:v1:{partId}:{requestKey}` |
| Reserva | `sop:reserve:v1:{orderId}:{partId}:{requestKey}` |
| Alterar reserva | `sop:resize:v1:{itemId}:{oldQty}:{newQty}:{requestKey}` |
| Liberação | `sop:release:v1:{itemId}:{requestKey}` |
| Consumo | `sop:consume:v1:{itemId}` |
| Estorno | `sop:reverse:v1:{itemId}` |

Reserva usa também a chave do item `sop:item:v1:{orderId}:{partId}:{requestKey}`. Para consumo e estorno, a identidade do item basta: só podem ocorrer uma vez em toda a vida da linha. Cancelamento usa liberação determinística `sop:release:cancel:v1:{itemId}`; remoção usa `...:remove...`.

Antes de mutar, procurar a chave. Se existir com mesmo tipo/recurso/payload canônico, devolver a resposta reconstruída com `200` e `idempotentReplay:true`. Se a mesma chave externa tiver payload diferente, `409 IDEMPOTENCY_KEY_REUSED`. A restrição `UNIQUE` encerra corridas residuais. Recalcular a OS dentro da transação a partir do estado persistido torna replay neutro; nunca incrementar totais por delta informado pelo cliente.

## 4. Operações

### Cadastrar peça

Pré-condições: `pecas_tecnicas.criar`; nome; preços/minStock não negativos; `unlimitedStock` explícito; se falso, quantidade inicial obrigatória e `>=0`; reservado começa zero. Se ilimitado, gravar físico `NULL`. Normalizar textos/SKU. `BEGIN IMMEDIATE`; checar SKU; inserir peça; histórico; commit. `201`; `409 TECHNICAL_PART_SKU_EXISTS`; `422 VALIDATION_ERROR`.

### Editar peça

`pecas_tecnicas.editar`; payload inclui `version`. Ler; validar; update `WHERE id=? AND version=?`, normalizar SKU; custos só são aceitos/exibidos com `relatorios.financeiro`; preço de venda não exige essa chave. Uma linha; commit. `200`; `409 TECHNICAL_PART_VERSION_CONFLICT/SKU_EXISTS`. Nunca muda snapshots.

### Inativar/exclusão lógica

`pecas_tecnicas.inativar`; ler; rejeitar se já inativa como replay ou devolver 200; rejeitar se `quantityReserved>0` (`409 PART_HAS_RESERVATIONS`); update condicionado por versão para `isActive=0`; histórico; commit. Físico pode permanecer para inventário. Reativação pode ser `PUT` com editar/inativar conforme política. Não há exclusão física.

### Entrada

`estoque_tecnico.ajustar`; peça deve ser controlada (`quantityOnHand IS NOT NULL`), `quantity>0`, motivo/nota, custo unitário opcional apenas com `relatorios.financeiro`. Verificar idempotência; ler saldos; update físico `+q`; custo informado substitui explicitamente `currentCostPrice`; inserir `ENTRY` com antes/depois; commit. Peça ilimitada retorna `409 UNLIMITED_STOCK_REJECTS_MOVEMENT`. `201/200 replay`.

### Ajuste positivo

Mesmo fluxo da entrada, tipo `POSITIVE_ADJUSTMENT`, motivo obrigatório; não representa compra. Exige estoque controlado, físico `+q`. Custo opcional e protegido.

### Ajuste negativo

Motivo obrigatório; exige estoque controlado e update condicionado ao disponível `onHand-reserved>=q`; inserir `NEGATIVE_ADJUSTMENT`. Nunca reduz unidades reservadas. `409 INSUFFICIENT_AVAILABLE_STOCK` ou `UNLIMITED_STOCK_REJECTS_MOVEMENT`.

### Reserva

`ordens.pecas_reservar`; OS existe, não cancelada/pronta/entregue/finalizada, **sem pagamentos**, peça ativa, quantidade positiva, preço cobrado não negativo. Checar replay e ausência de item ativo para o par. Ler peça; update de reserva (uma linha). Em ilimitada, a condição de saldo é dispensada, físico continua `NULL` e disponível continua ilimitado. Criar item com snapshots, `RESERVATION`, recalcular `partsCost/totalAmount`, criar `OrderHistory`; commit. `201`; conflitos `PART_ALREADY_ACTIVE_ON_ORDER`, `INSUFFICIENT_AVAILABLE_STOCK` apenas para controlada, `ORDER_NOT_MUTABLE`, `ORDER_HAS_PAYMENTS`.

### Alteração de quantidade/preço reservados

Somente `RESERVED`. Payload contém nova quantidade positiva, novo preço opcional e request key. Ler item/peça/OS. Para aumento, reservar delta com saldo disponível; movimento `RESERVATION_INCREASE`. Para redução, liberar delta; `RESERVATION_DECREASE`. Se quantidade igual, nenhum movimento de saldo; atualizar somente preço/snapshots totais, mantendo replay. Atualizar item, recalcular OS, histórico, commit. Não permitir zero: remoção usa DELETE.

### Remoção antes do consumo

Somente `RESERVED`. Verificar replay; liberar toda quantidade; inserir `RELEASE`; marcar `RELEASED/releasedAt`; recalcular OS; histórico; commit. `200`. `CONSUMED` retorna `409 PART_ALREADY_CONSUMED` e orienta estorno manual.

### Consumo ao marcar `PRONTO`

Permissões acumulativas: a rota mantém `ordens.marcar_pronto` e o consumo interno não exige nova permissão do usuário. `BEGIN IMMEDIATE`; ler OS e todos os itens `RESERVED`, ordenados por `id`; se OS já `PRONTO`, devolver replay após verificar que não há reservas. Para cada item, procurar `sop:consume:v1:{itemId}`, ler peça, update condicionado físico e reservado, inserir `CONSUMPTION`, marcar `CONSUMED/consumedAt`. Se qualquer update afetar zero, rollback de todos. Recalcular OS (valor não muda na troca RESERVED→CONSUMED), atualizar status para `PRONTO` com condição `status NOT IN ('PRONTO','ENTREGUE','CANCELADO')`, gravar um histórico resumido, commit. `200`; `409 STOCK_INVARIANT_VIOLATION` ou `ORDER_STATUS_CONFLICT`. OS sem itens pode ir a PRONTO normalmente.

### Cancelamento

`ordens.cancelar`. `BEGIN IMMEDIATE`; ler OS e itens. Para cada `RESERVED`, liberar com chave determinística, movimento e estado `RELEASED`. Não tocar `CONSUMED/REVERSED`. Recalcular removendo liberados; atualizar OS `CANCELADO`; histórico deve mencionar quantos foram liberados e quantos consumidos permaneceram; commit. Se já cancelada, replay 200. Nunca devolver estoque consumido.

### Estorno manual

`estoque_tecnico.ajustar` **e** `ordens.pecas_reservar` (checagem AND explícita; o helper atual de array é OR). Payload `{ confirmation:true, reason, idempotencyKey }`. Somente `CONSUMED`; confirmação e motivo obrigatórios; inspeção física é responsabilidade declarada do operador. Em controlada, físico aumenta; em ilimitada, permanece `NULL`; reservado não muda. Inserir `MANUAL_REVERSAL`, marcar `REVERSED`, recalcular OS, histórico e commit. `409 ALREADY_REVERSED` pode retornar replay apenas se mesma chave/resultado.

### Reabertura

`ordens.reabrir`. Na mesma transação que remove `OrderFinalization` e muda status, apenas lê/sumariza itens; não altera saldo, estado, movimento ou cobrança. Consumidos continuam cobrados; estornados continuam fora. `200`.

### Duplicação

`ordens.criar`. Criar nova OS sem `ServiceOrderPart`, sem movimento, `partsCost=0` para fonte gerenciada e `totalAmount=max(laborCost-discount,0)`. Se fonte é puramente legado, decisão de copiar `partsCost` existente pode manter comportamento antigo, mas recomendação definitiva é zerar e registrar no histórico para evitar cobrança sem item. Não exige transação de estoque, mas criação/numeração/histórico deve ser atômico.

## 5. Ordem exata de efeitos

Em todos os comandos de estoque: autenticar/autorizar fora da transação; validar forma básica; abrir conexão; `BEGIN IMMEDIATE`; checar idempotência; reler entidades e pré-condições; update condicionado; exigir `changes=1`; inserir/atualizar item; inserir movimento; recalcular OS quando aplicável; inserir `OrderHistory`; commit; montar resposta sanitizada. Qualquer exceção antes do commit executa rollback e não há resposta parcial.

## 6. Testes de concorrência

- Duas reservas concorrentes para a última unidade controlada: uma 201, uma 409; físico intacto, reservado 1, um movimento.
- Dois `PRONTO` concorrentes: um consumo por item; segundo replay; nenhum saldo negativo.
- Cancelar versus `PRONTO`: serialização pelo lock; somente um estado final válido, sem liberação e consumo simultâneos.
- Ajuste negativo versus reserva: nunca consumir unidade reservada.
- Estorno duplicado com chaves iguais/diferentes: exatamente um movimento.
- Falha induzida no terceiro item do consumo: rollback dos dois primeiros, OS não muda.

## 7. Revisão 3A.1 — regra unificada de estoque

### Operações ilimitadas

- Reserva: `quantityOnHand=NULL` permanece `NULL`; reservado aumenta; movimento guarda físico antes/depois `NULL`; nunca retorna saldo insuficiente.
- Alteração de reserva: aumento/redução afeta apenas reservado; físico/disponível seguem ilimitados.
- Consumo: físico permanece `NULL`; reservado diminui; item e movimento seguem o fluxo normal e snapshots financeiros permanecem.
- Liberação: reservado diminui; físico permanece `NULL`.
- Estorno: físico permanece `NULL`; reservado não muda; movimento e auditoria são gravados.

### Mudança de modo de estoque

É um comando próprio, nunca `ENTRY`/ajuste. Chave idempotente: `tp:mode:v1:{partId}:{controlled|unlimited}:{requestKey}`.

Ilimitado→controlado: exige `unlimitedStock:false`, `initialQuantity` inteiro `>=0`, confirmação, motivo e versão. Como reservas podem existir, a quantidade inicial deve ser `>= quantityReserved`; update condicionado a `quantityOnHand IS NULL AND version=:version`. Movimento `STOCK_MODE_CHANGE` com antes `NULL`, depois a quantidade inicial; histórico e commit.

Controlado→ilimitado: exige confirmação explícita, motivo, versão e `quantityReserved=0`; update condicionado a `quantityOnHand IS NOT NULL AND quantityReserved=0`. Movimento guarda físico anterior e posterior `NULL`, quantidade referencial igual ao físico abandonado, sem ser entrada/saída; histórico deve declarar a mudança. A operação é auditada e não apaga movimentos anteriores.

HTTP: `200`; `409 STOCK_MODE_CONFLICT`, `PART_HAS_RESERVATIONS`, `INITIAL_QUANTITY_BELOW_RESERVED`; `422 VALIDATION_ERROR`. Repetição com mesma chave é replay; payload divergente é conflito.

### Produtos comerciais

Venda de produto ilimitado não valida nem reduz `stockQuantity`, mas cria item e movimento com quantidade vendida e snapshots. Para representar saldo antes/depois ilimitado, a evolução de `StockMovement.previousStock/newStock` deve ser avaliada: hoje são `Int NOT NULL`. Opção recomendada para coerência é torná-los `Int?` na mesma migração ou, se o escopo do schema não permitir, documentar explicitamente que esses dois campos legados usam zero apenas como snapshot de modo ilimitado, nunca como saldo do `Product`. A alternativa nullable evita ambiguidade e deve ser preferida na 3B após análise de impacto.

Cancelamento de venda ilimitada mantém `stockQuantity=NULL` e registra devolução lógica sem materializar saldo. Produto controlado recebe a quantidade e zero permanece esgotado. Mudança de modo comercial seguirá comando próprio, não ajuste.
