# ETAPA 3A — APIs, permissões e telas

## 1. Permissões definitivas

Manter as oito chaves propostas; elas separam catálogo, saldo, vínculo com OS e relatório sem replicar verbos por tela:

- `pecas_tecnicas.ver`, `.criar`, `.editar`, `.inativar`
- `estoque_tecnico.ver`, `.ajustar`
- `ordens.pecas_reservar`
- `relatorios.estoque_tecnico`

`relatorios.financeiro` permanece a única chave de sensibilidade para custo atual, custo snapshot, estoque a custo, margem, rentabilidade e lucro bruto. Permissões de visualização operacional não concedem custo.

| Perfil | Permissões padrão novas |
|---|---|
| ADMIN | Todas (comportamento atual) |
| ATENDENTE | `pecas_tecnicas.ver`, `estoque_tecnico.ver`, `ordens.pecas_reservar` |
| TECNICO | `pecas_tecnicas.ver`, `estoque_tecnico.ver`, `ordens.pecas_reservar` |
| FINANCEIRO | `pecas_tecnicas.ver`, `estoque_tecnico.ver`, `relatorios.estoque_tecnico`; já possui `relatorios.financeiro` |

Criação/edição/inativação/ajuste ficam fora dos padrões operacionais; ADMIN delega individualmente. Para estorno manual, exigir simultaneamente `estoque_tecnico.ajustar` e `ordens.pecas_reservar`; implementar AND explícito, pois array em `exigirPermissaoApi` atualmente significa OR.

## 2. Convenções de API

- Route Handlers Node.js, dinâmicos e sem cache; `params` é Promise conforme documentação Next local.
- IDs e textos têm trim/limites; números devem ser JSON numbers finitos, inteiros quando quantidade/versão, nunca coerção permissiva de string vazia.
- Mutação requer `Idempotency-Key`; replay retorna `idempotentReplay`.
- Respostas de produto/peça adicionam `isUnlimited` derivado (`saldo físico === null`). Para peça, `quantityAvailable` é `null` quando ilimitada e, quando controlada, é físico menos reservado.
- Função de projeção central remove recursivamente: `currentCostPrice`, `unitCostSnapshot`, `totalCostSnapshot`, `stockCostValue`, `historicalConsumedCost`, `grossMargin`, `grossMarginPercent`, `grossProfit` e equivalentes sem `relatorios.financeiro`.
- Custo não autorizado enviado no payload é rejeitado (`403 FINANCIAL_FIELD_FORBIDDEN`), não apenas ignorado.

## 3. Endpoints definitivos

### `GET /api/pecas-tecnicas`

Permissão `pecas_tecnicas.ver`. Query: `q`, `category`, `brand`, `active`, `belowMin`, `outOfStock`, `page`, `pageSize`, ordenação permitida. Resposta paginada com físico/reservado/disponível, mínimo, preço e flags; custo somente com financeiro. Validação 400/422; sem transação; `no-store`.

### `POST /api/pecas-tecnicas`

`pecas_tecnicas.criar`. Payload inclui `{unlimitedStock:boolean, initialQuantity?:integer}`; `true` exige ausência de quantidade e grava `NULL`; `false` exige quantidade `>=0`. Contradição como `true` mais `10` é `422 VALIDATION_ERROR`. Custo só com financeiro. Valida/normaliza, transação imediata, 201. Idempotência por header. Erros SKU 409.

### `GET /api/pecas-tecnicas/[id]`

`pecas_tecnicas.ver`. Resposta completa operacional, agregados e disponível; custo sanitizado. 404.

### `PUT /api/pecas-tecnicas/[id]`

`pecas_tecnicas.editar`. Payload parcial explícito mais `version`; não aceita saldos. Mudança de custo requer financeiro. Transação imediata; 200; conflito de versão/SKU 409.

### `DELETE /api/pecas-tecnicas/[id]`

`pecas_tecnicas.inativar`. Payload opcional `{version,reason}` e chave idempotente. Exclusão lógica; rejeita reservas. 200. Nunca executa delete físico.

### `GET /api/pecas-tecnicas/[id]/movimentacoes`

`estoque_tecnico.ver`. Query paginada por tipo/período/OS. Resposta com saldos e operador; custos removidos sem financeiro. Sem transação de escrita.

### `POST /api/pecas-tecnicas/[id]/movimentacoes`

`estoque_tecnico.ajustar`. Payload `{type:'ENTRY'|'POSITIVE_ADJUSTMENT'|'NEGATIVE_ADJUSTMENT'|'STOCK_MODE_CHANGE', quantity?, initialQuantity?, unlimitedStock?, confirmation?, reason, unitCost?}`. Movimentos físicos rejeitam peça ilimitada. Mudança de modo é tipo próprio: para ilimitado exige reservado zero; para controlado exige quantidade inicial `>=0` e não menor que reservado. Chave obrigatória; `BEGIN IMMEDIATE`; 201/200 replay; conflitos 409. Custo só com financeiro.

### `GET /api/ordens/[id]/pecas`

Permissão: `ordens.ver` **e** `pecas_tecnicas.ver` (AND). Query `state=active|all|...`. Resposta traz snapshots de nome/SKU/preço/quantidade/subtotal/estado/datas, nunca custo sem financeiro, mais totais e capacidade de ações. 404.

### `POST /api/ordens/[id]/pecas`

`ordens.pecas_reservar`. Payload `{technicalPartId,quantity,unitPrice,idempotencyKey?,confirmReplaceLegacyPartsCost?}`; preferir header para chave. Não aceita snapshots/custo/estado. Transação de reserva e recálculo; 201. Erros de saldo/estado/pagamento/conversão legado 409.

### `PUT /api/ordens/[id]/pecas/[itemId]`

`ordens.pecas_reservar`. Payload `{quantity,unitPrice}` e chave. Somente `RESERVED`; redimensiona reserva e recalcula. 200; conflitos 409.

### `DELETE /api/ordens/[id]/pecas/[itemId]`

`ordens.pecas_reservar`. Chave via header; somente reservado; libera, marca RELEASED e recalcula. 200/replay; consumido 409.

### `POST /api/ordens/[id]/pecas/[itemId]/estornar`

AND de `estoque_tecnico.ajustar` + `ordens.pecas_reservar`. Payload `{confirmation:true,reason}`; header idempotente. Somente consumido; devolve físico, não reserva; remove cobrança ativa; 200. Confirmação ausente 422; estado 409.

Não criar endpoints separados para entrada/ajustes, ativação ou cada estado: os recursos acima são suficientes. Consumo/cancelamento/reabertura continuam nas rotas de OS existentes para garantir atomicidade do agregado.

## 4. Alterações nas APIs existentes

- `POST/PUT /api/ordens`: ignorar/rejeitar `partsCost` em OS técnica e sempre recalcular. Includes/projeções de detalhe podem trazer itens sanitizados.
- `PATCH /api/ordens/[id]/status`: consumo atômico ao destino `PRONTO`; mantém `ordens.marcar_pronto`.
- `POST /api/ordens/[id]/finalizar`: verifica ausência de `RESERVED`; não consome.
- `POST /api/ordens/[id]/cancelar`: libera reservas e muda status no mesmo commit.
- `PATCH /api/ordens/[id]/reabrir`: mantém itens.
- `POST /api/ordens/[id]/duplicar`: não inclui itens e zera cobrança técnica.
- `DELETE /api/ordens/[id]`: bloqueia histórico técnico.
- impressão, garantia e recibo: consultar snapshots e nunca custo.
- relatório/dashboard/financeiro: agregações novas e sanitização na API, não apenas ocultação no React.

## 5. Telas e componentes

### Catálogo

- `/pecas-tecnicas`: tabela responsiva com busca/filtros; nome, SKU, categoria, localização, físico, reservado, disponível, mínimo, preço padrão e badges.
- `/pecas-tecnicas/nova`: cadastro com opção “Estoque ilimitado”; quando controlado, quantidade inicial obrigatória e zero permitido; quando ilimitado, quantidade vazia/desabilitada.
- `/pecas-tecnicas/[id]`: dados, indicadores e ações editar/inativar; custo condicionado.
- `/pecas-tecnicas/[id]/estoque`: formulário único de movimento e extrato paginado; confirmação forte para negativo.
- `/relatorios/estoque-tecnico`: operacionais para `relatorios.estoque_tecnico`; seção sensível aparece apenas com financeiro.

### Componentes de OS

- `BuscaPecaTecnica`: busca ativa por nome/SKU/modelo, mostra disponível e preço; custo nunca.
- `PecasTecnicasDaOS`: seções separadas “Reservadas”, “Consumidas” e histórico recolhível de liberadas/estornadas.
- `ItemPecaTecnicaOS`: quantidade, preço cobrado editável enquanto reservado, subtotal, status e ações.
- `ConfirmarEstornoPeca`: exige checkbox de conferência física, motivo e resumo do efeito.
- `ResumoValoresOS`: peças técnicas, mão de obra, desconto e total, todos vindos do servidor.

## 6. Comportamento visual

- Exibir sempre três números distintos: `Físico`, `Reservado`, `Disponível`.
- “Ilimitado” somente quando o físico é `null`; “Sem estoque” quando o disponível controlado é `0`. “Abaixo do mínimo” somente quando `quantityOnHand IS NOT NULL AND quantityOnHand - quantityReserved < minStock`; cor de alerta não deve ser o único sinal.
- Inativa recebe badge e não aparece na busca de reserva por padrão, mas permanece em OS/históricos.
- Usuário sem financeiro vê “Custo oculto” ou simplesmente ausência da coluna; API não entrega valor.
- Preço cobrado e subtotal são operacionais e visíveis a ATENDENTE/TECNICO; subtotal = snapshot × quantidade.
- Itens consumidos são somente leitura. Estornados não somam no total e exibem data/operador/motivo, sem custo quando não autorizado.
- Ao tentar `PRONTO`, mostrar resumo; erro de concorrência atualiza saldos e não deixa a UI aparentar sucesso parcial.

## 7. Relatórios e PDFs

Relatório operacional: valor gerado, peças cobradas, mão de obra, desconto, recebido, pendente, reservado atual, consumido no período e itens abaixo do mínimo. Relatório sensível: custo histórico consumido, margem bruta por OS/percentual, estoque a custo e lucro bruto por peça/consolidado.

PDF de OS/recibo: nome snapshot, SKU snapshot, quantidade, preço, subtotal e totais; nunca custo. Garantia: peças `CONSUMED` vinculadas à entrega, mantendo `replacedParts` como texto legado separado. PDF de relatório recebe dados já sanitizados da API e não inclui seção financeira se a chave não existir.

## 8. Revisão 3A.1 — regra unificada de estoque

### Contrato JSON comum

`isUnlimited` é somente derivado e somente resposta. Payloads usam `unlimitedStock` como intenção de escrita. `{ "unlimitedStock": true }` grava saldo físico `null`; `{ "unlimitedStock": false, "quantity": 0 }` grava zero e exibe “Sem estoque”. O servidor rejeita combinações contraditórias (`true` com quantidade preenchida, `false` sem quantidade, quantidade negativa/fracionária) com `422 VALIDATION_ERROR`; não normaliza silenciosamente.

Listagens/filtros consultam `IS NULL` para ilimitado, `=0` para sem estoque e `IS NOT NULL` para controlado. Nunca usar `Number(null)`, `|| 0` ou comparação com zero para derivar ilimitado.

### Produtos comerciais existentes

As rotas atuais `/api/produtos`, `/api/produtos/[id]`, `/estoque`, `/api/vendas-produtos` e cancelamento dependem de zero ilimitado. Na futura implementação, todas mudam na mesma release da migração:

- cadastro/edição aceita `unlimitedStock` e persiste `null`;
- resposta mantém `stockQuantity:null` e deriva `isUnlimited:true`;
- venda ilimitada não bloqueia nem reduz; controlada em zero bloqueia;
- cancelamento ilimitado não converte `null` em zero nem soma saldo;
- movimento físico manual é recusado no modo ilimitado; mudança de modo usa comando próprio;
- relatórios excluem ilimitados de baixo/sem estoque, quantidade física e valorização, mas mantêm venda, receita, custos e margens snapshots.

### Telas revisadas

Cadastro/edição de produto e peça terá opção explícita “Estoque ilimitado”. Marcada: quantidade vazia e desabilitada, submit sem quantidade e exibição “Ilimitado”. Desmarcada: quantidade obrigatória, aceita zero e exibe “Sem estoque”. Nunca instruir o usuário a digitar zero para ilimitado.

Peça ilimitada exibe `Físico: Ilimitado`, `Reservado: N` e `Disponível: Ilimitado`. Em controlada, os três são numéricos. Produto não possui reservado, mas usa a mesma distinção visual de físico.

Ilimitado não recebe alerta baixo/esgotado. Zero controlado recebe “Sem estoque” e bloqueia reserva, venda ou saída. Relatórios não somam quantidade/valor físico ilimitado; vendas e consumos ilimitados continuam nas métricas históricas.
