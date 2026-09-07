# ETAPA 3A — Arquitetura definitiva do estoque de peças técnicas

Data da análise: 2026-08-04  
Escopo: desenho técnico somente; nenhuma implementação ou migração aplicada.

## 1. Decisões definitivas

1. O domínio novo usa exclusivamente `TechnicalPart`, `ServiceOrderPart` e `TechnicalPartMovement`. Não há relação, reaproveitamento de saldo nem movimento compartilhado com `Product`, `ProductSale`, `ProductSaleItem` ou `StockMovement`.
2. O saldo disponível é sempre derivado e nunca armazenado: se `quantityOnHand IS NULL`, `quantityAvailable` também é `NULL` e significa ilimitado; caso contrário, vale `quantityOnHand - quantityReserved`.
3. Reserva reduz apenas o disponível de estoque controlado. Em peça ilimitada, o físico e o disponível permanecem `NULL`, embora `quantityReserved` registre a demanda real. O consumo, exclusivamente na transição atômica da OS para `PRONTO`, reduz físico apenas quando controlado e sempre reduz reservado.
4. Cancelamento libera itens `RESERVED`; itens `CONSUMED` permanecem consumidos. Reabertura não muda itens. Duplicação não copia itens.
5. Estorno de consumo é comando manual, individual, confirmado fisicamente, auditado e idempotente; devolve o físico e leva o item a `REVERSED`, sem nova reserva.
6. Cadastro não é apagado fisicamente. `DELETE` significa inativação. As FKs também usam `RESTRICT/NO ACTION` para impedir perda de histórico.
7. Quantidades de operação e item são inteiras positivas. Saldo físico `NULL` é a única representação de estoque ilimitado; zero significa sem estoque. Dinheiro é aceito como número decimal não negativo, normalizado a duas casas no servidor e persistido como `Decimal`/`DECIMAL`.
8. `partsCost` será mantido e sincronizado com o total cobrado das peças técnicas (alternativa A). Custos reais ficam apenas nos snapshots protegidos por `relatorios.financeiro`.
9. Toda mutação de saldo usa uma conexão SQLite exclusiva, `BEGIN IMMEDIATE`, updates condicionais, movimento e histórico no mesmo commit. Prisma continua apropriado para leitura; não se presume que `$transaction` do Prisma 6.19.3 emita `BEGIN IMMEDIATE`.
10. O servidor é autoridade de snapshots, totais, estados e saldos; payloads de cliente nunca informam custo snapshot, total snapshot, estado ou saldos.

## 2. Estrutura real e pontos de integração

Foram lidos integralmente os arquivos solicitados e os guias locais do Next.js sobre Route Handlers, rotas dinâmicas e convenção `route.ts`. A versão local exige `params` assíncrono; as rotas existentes já usam `params: Promise` e `await context.params`.

### 2.1 Persistência e infraestrutura

- `prisma/schema.prisma`: `ServiceOrder` contém `requiredParts`, `partsCost`, `laborCost`, `discount`, `totalAmount`, `status`, `finalizedAt`, pagamentos, `finalization` e dois históricos (`HistoricoOrdem` e `OrderHistory`). `OrderFinalization` contém `replacedParts`. O módulo comercial é separado e possui sua própria família `Product*`/`StockMovement`.
- `lib/prisma.ts`: singleton do `PrismaClient`; adequado às leituras gerais, mas o core de estoque precisará de executor SQLite imediato dedicado.
- `lib/authSistema.ts`: sessão em cookie, usuário `SystemUser`, ADMIN recebe todas as permissões; permissões persistidas são strings.
- `lib/permissaoApi.ts`: `exigirPermissaoApi` aceita uma chave ou lista em semântica **OU**; `usuarioPodeVerDadosFinanceirosSensiveis` centraliza `relatorios.financeiro`. Toda nova rota deve devolver `Cache-Control: no-store` também no sucesso.
- `lib/historico.ts`: grava no legado `HistoricoOrdem`; as rotas modernas gravam majoritariamente `OrderHistory` por `histories.create`. O estoque deve usar `OrderHistory` como trilha da OS, sem duplicar em ambas.
- `lib/operadorSistema.ts`: resolve nome do operador; o core novo deve capturar também `SystemUser.id` e snapshot do nome.
- `scripts/schema-migrator/migrations.cjs`: manifesto hoje contém somente baseline `20260728_000_baseline_sqlite`; checksum é SHA-256 do JSON canônico de `appVersion`, `id`, `ownedTables`, `requiredTables`, `schemaChecks` e SQL normalizado.
- `scripts/schema-migrator/core.cjs`: valida tabelas conhecidas, baseline, checks, sequência sem lacunas, checksum e versão; aplicação inteira ocorre em `BEGIN IMMEDIATE`, com rollback no erro, `integrity_check` e `foreign_key_check`.
- `scripts/schema-migrator/cli.cjs`: dry-run é somente leitura; apply exige backup verificado e recusa WAL/SHM. Banco sem pendências é no-op.

### 2.2 Permissões e navegação

- `lib/permissoesSistema.ts` é a fonte de chaves, grupos e padrões por perfil.
- `app/usuarios-sistema/page.tsx` renderiza/edita os grupos retornados pela API de usuários; precisa receber as novas chaves via fonte central, sem lista paralela.
- `app/AuthGuard.tsx` carrega sessão e disponibiliza permissões no cliente.
- `app/Permissao.tsx` faz ocultação visual; não substitui autorização de API.
- `app/SistemaFrame.tsx` contém a navegação e deve ganhar entrada “Peças técnicas” protegida por `pecas_tecnicas.ver` e subentrada de relatório quando aplicável.

### 2.3 Ordens de serviço

- `app/ordens/nova/page.tsx`: hoje envia `partsCost`, mão de obra e desconto diretamente. Na integração, nova OS começa sem itens; seleção/reserva ocorre após existir `id`. O texto `requiredParts` permanece independente.
- `app/ordens/page.tsx`: lista e ações por status; não deve carregar itens em massa. Pode mostrar um resumo agregado opcional vindo da API de listagem.
- `app/ordens/[id]/page.tsx`: ponto principal para blocos “Peças reservadas” e “Peças consumidas”, busca/adição, alteração, remoção e estorno conforme status/permissão.
- `app/ordens/[id]/editar/page.tsx`: hoje permite editar `partsCost`; quando a OS estiver em modo técnico, o campo vira somente leitura calculada e os itens são administrados no componente próprio.
- `app/ordens/[id]/finalizar/page.tsx` e `app/api/ordens/[id]/finalizar/route.ts`: “finalizar” atualmente cria `OrderFinalization` e muda para `ENTREGUE`; não é o gatilho primário de consumo. Deve apenas exigir que não restem reservas e que eventual consumo em `PRONTO` já esteja concluído.
- `app/ordens/[id]/cancelar/page.tsx` e rota correspondente: o cancelamento deve incorporar liberação atômica das reservas antes de salvar `CANCELADO`; consumidos permanecem.
- `StatusRapidoOS.tsx` chama `PATCH /api/ordens/[id]/status`. Esta rota é o ponto definitivo de consumo na transição para `PRONTO`.
- `reabrir`: atualmente remove finalização e retorna a `RECEBIDO`; deve manter consumos e estornos existentes.
- `duplicar`: hoje copia `partsCost` e demais valores. Após 3G deve criar a cópia com zero peças técnicas, `partsCost=0` para OS gerenciada e recalcular o total; não copiar `ServiceOrderPart`.
- `DELETE /api/ordens/[id]`: hoje pode apagar OS sem pagamento/finalização/anexo. Com qualquer `ServiceOrderPart`, exclusão física deve ser bloqueada; usar cancelamento. Sem itens, regra atual pode permanecer.
- `imprimir`: hoje mostra `requiredParts` e total. Deve incluir tabela de itens ativos, sem custo, com nome/SKU/quantidade/preço/subtotal, preservando o texto legado em seção separada.

### 2.4 Dashboard, financeiro e relatórios

- `app/api/relatorios/route.ts` lê `partsCost`, `laborCost`, `discount`, `totalAmount`, `paidAmount` e exclui canceladas dos valores. Já sanitiza bloco sensível conforme `relatorios.financeiro`.
- `app/api/relatorios/pdf/route.ts` consome a própria API de relatório e deve respeitar a mesma projeção sanitizada; não deve refazer autorização de custo por inferência.
- `app/api/dashboard/route.ts` e `app/page.tsx` agregam OS/status/valores; incluir somente indicadores operacionais autorizados, sem custo.
- `app/api/financeiro-geral/route.ts` e página agregam pagamentos/OS/vendas; `partsCost` sincronizado preserva compatibilidade, e métricas de custo técnico só entram para `relatorios.financeiro`.

## 3. Limites do domínio

O catálogo técnico representa peças usadas em reparos. O catálogo comercial representa mercadorias vendidas. IDs, saldo, SKU, telas, permissões, relatórios e movimentos são próprios. Mesmo que uma peça e um produto tenham o mesmo SKU, não existe sincronização automática. Qualquer integração futura deverá ser uma operação explícita de transferência entre domínios e está fora desta etapa.

## 4. Cálculo da OS e decisão sobre `partsCost`

Para OS gerenciada pelo estoque técnico:

```text
valorPecasTecnicas = Σ totalPriceSnapshot dos itens em RESERVED ou CONSUMED
totalAmount = max(valorPecasTecnicas + laborCost - discount, 0)
partsCost = valorPecasTecnicas
```

Itens `RELEASED` e `REVERSED` não compõem o valor atual. O servidor recalcula após toda inclusão, alteração, liberação, consumo, estorno e edição de mão de obra/desconto; ignora `partsCost`, totais e snapshots calculados vindos do cliente.

Recomendação: **alternativa A**. Apesar do nome histórico, o sistema atual usa `partsCost` como valor cobrado: ele entra no total, aparece nas telas/PDFs e alimenta “valor cobrado em peças”. Criar `partsChargeAmount` agora exigiria migração e alteração simultânea de todas essas superfícies, além de introduzir duas fontes de verdade.

Compatibilidade: OS antigas, sem `ServiceOrderPart`, continuam em modo legado e preservam seu `partsCost`. Nenhum texto é convertido. Ao adicionar o primeiro item técnico, a API exige confirmação explícita se o `partsCost` legado for maior que zero; aceito o comando, o valor passa a ser gerenciado e substituído pela soma dos itens. Novas OS iniciam com zero. Duplicação não transporta itens nem cobrança técnica gerenciada.

## 5. Fluxos de OS

| Fluxo atual | Impacto definitivo |
|---|---|
| Criar | Cria OS sem peça/reserva; textos legados permanecem. |
| Editar | Servidor recalcula; `partsCost` técnico não é editável diretamente. Itens só mudam pelas APIs próprias. |
| Alterar status | Estados comuns não alteram estoque. Transição para `PRONTO` chama o core de consumo. |
| Marcar PRONTO | Única rota: `PATCH /api/ordens/[id]/status`; consome todos os `RESERVED` de modo atômico e idempotente, depois atualiza status/histórico. |
| Finalizar/entregar | Não consome novamente; rejeita reservas remanescentes/inconsistência. Cria finalização e `ENTREGUE`. |
| Cancelar | Libera todos os `RESERVED` na mesma transação; não devolve `CONSUMED`; recalcula cobrança retirando liberados. |
| Reabrir | Mantém `CONSUMED`/`REVERSED`; não recria reservas. Volta a `RECEBIDO` conforme fluxo atual. |
| Duplicar | Não copia itens, movimentos ou reservas. Recalcula nova OS sem cobrança técnica. |
| Excluir | Bloqueado se existir qualquer item/movimento técnico; orientar cancelamento. |
| Imprimir | Inclui snapshots de itens ativos; nunca inclui custo. Texto `requiredParts` separado. |
| Garantia | Inclui consumidos (e indica estornados apenas se útil); mantém `replacedParts` legado separado. |
| Recibo | Exibe itens cobrados e subtotais, sem custo; total deve coincidir com OS. |

## 6. Relatórios

Métricas operacionais, disponíveis com as permissões operacionais correspondentes: valor gerado das OS não canceladas, valor cobrado em peças (`partsCost`), mão de obra, desconto, recebido, pendente, quantidade atualmente reservada, quantidade consumida no período e peças ativas controladas abaixo do mínimo (`quantityOnHand IS NOT NULL AND quantityOnHand - quantityReserved < minStock`). Itens ilimitados não entram em alertas nem somas de quantidade física.

Métricas sensíveis, sempre removidas da resposta sem `relatorios.financeiro`: custo histórico consumido (`quantity * unitCostSnapshot` no evento de consumo), margem bruta por OS (`totalAmount - custo histórico consumido`, com regra documentada sobre desconto), margem percentual, estoque controlado valorizado a custo (`quantityOnHand * currentCostPrice`, excluindo `NULL`), lucro bruto por peça (`valor cobrado - custo snapshot`) e lucro bruto consolidado. Consumos ilimitados continuam entrando em custo histórico e margem por snapshot. Não usar “lucro líquido”: impostos e demais despesas não estão integralmente alocados.

## 7. Riscos abertos

1. Definir na 3B a estratégia operacional de executor SQLite dedicado compartilhando exatamente o mesmo caminho de banco do Prisma/Electron; conexão Prisma não assegura `BEGIN IMMEDIATE`.
2. O esquema possui dois históricos de OS; o novo domínio deve padronizar `OrderHistory` e evitar dupla gravação.
3. Reabertura atual apaga `OrderFinalization`; isso preserva peças, mas altera documentos de garantia. Testar e documentar o comportamento jurídico/operacional.
4. Pagamentos percentuais já registrados podem ficar desalinhados se o total mudar; por decisão confirmada, qualquer mudança de peça é bloqueada após pagamento registrado.
5. O migrador atual recusa bancos vazios e tabelas desconhecidas; a criação limpa requer artefato de schema, não seed operacional.
6. SQLite `DECIMAL` não garante escala monetária. O servidor deve arredondar a duas casas; em 3B avaliar armazenamento futuro em centavos. Para esta migração, manter compatibilidade Prisma `Decimal`.
7. SKU é definitivamente único sem diferenciar maiúsculas/minúsculas, usando índice `COLLATE NOCASE` após trim; testar colisões durante a migração.

## 8. Critérios arquiteturais de aceite

- Nenhuma operação deixa `reserved > onHand` ou saldo negativo.
- Toda alteração de saldo tem exatamente um movimento idempotente.
- Transição para `PRONTO` é tudo-ou-nada para todas as peças.
- Respostas sem `relatorios.financeiro` não contêm nenhum campo de custo, inclusive aninhado.
- OS antigas permanecem legíveis sem conversão automática.
- Domínio comercial permanece sem referências ao estoque técnico.

## 9. Revisão 3A.1 — regra unificada de estoque

Esta revisão substitui integralmente a convenção anterior:

| Saldo físico | Significado definitivo |
|---|---|
| `NULL` | Estoque ilimitado |
| `0` | Sem estoque |
| `> 0` | Estoque físico controlado |

A regra vale para `Product.stockQuantity` e `TechnicalPart.quantityOnHand`. Não será criado `isUnlimited`; esse nome pode aparecer apenas como derivado de resposta (`saldo === null`). A separação de domínios permanece: unifica-se apenas a semântica, não tabelas, movimentos ou relações.

### Impacto real no estoque comercial

O código atual ainda interpreta `stockQuantity === 0` como ilimitado em cadastro/edição, filtros, listagem, tela de estoque, venda e cancelamento. A venda hoje não reduz zero e o cancelamento usa coerção de zero. Antes da nova interpretação entrar em produção, a migração deve converter todos os zeros existentes para `NULL`; depois, APIs e telas passam a distinguir `null` de `0` sem coerção `Number(null)`.

Produto ilimitado pode ser vendido sem validação de saldo, mantém `stockQuantity=NULL` na venda e no cancelamento, e ainda gera item/movimento com quantidade, receita, custo e margem snapshots. Produto controlado reduz na venda, bloqueia saldo insuficiente inclusive zero e recebe devolução no cancelamento. Ilimitados são excluídos de baixo/sem estoque e valorização física.

### Impacto no estoque técnico

`TechnicalPart.quantityOnHand` passa a ser `Int?`; `quantityReserved` continua inteiro `0+`. Em ilimitado, reserva aumenta o reservado; consumo/liberação diminuem reservado; estorno não altera físico nem reservado; o físico e o disponível continuam `NULL`. Movimentos preservam `onHandBefore/onHandAfter=NULL` e registram quantidade normalmente.

Peça ilimitada rejeita `ENTRY`, `POSITIVE_ADJUSTMENT` e `NEGATIVE_ADJUSTMENT`. A mudança de modo é operação própria e auditada: ilimitado→controlado exige quantidade inicial explícita `>=0`; controlado→ilimitado exige `quantityReserved=0` e confirmação explícita. O mesmo contrato deverá ser aplicado ao produto comercial.

### Decisões confirmadas na revisão

- Mudança de peças após pagamento permanece bloqueada.
- Duplicação de OS sempre cria `partsCost=0` e nenhuma peça.
- Entrada em estoque controlado substitui explicitamente o custo atual informado.
- SKU permanece único com `COLLATE NOCASE`.
- `partsCost` permanece sincronizado com o total cobrado das peças técnicas.
- Campos legados permanecem e nenhum texto legado é convertido.
