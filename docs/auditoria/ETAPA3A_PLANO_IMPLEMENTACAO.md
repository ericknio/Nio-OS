# ETAPA 3A — Plano de implementação 3B–3I

## 3B — Modelos Prisma e migração técnica

Arquivos futuros: `prisma/schema.prisma`, `scripts/schema-migrator/migrations.cjs`, suporte restrito de rebuild em `scripts/schema-migrator/core.cjs`, testes do migrador e documentação de schema. Tornar `Product.stockQuantity Int?`, criar `TechnicalPart.quantityOnHand Int?`, adicionar relações/modelos/enums, reconstruir `Product`, converter zeros comerciais para `NULL` e validar índices/FKs/triggers.

Riscos: reconstrução de tabela-base referenciada; `foreign_keys` precisa ser desligado antes da transação e religado depois; checks da baseline atual fixam `NOT NULL`; divergência Prisma/SQL; checksum; índice parcial; trigger SKU. Testes: contagens e referências de `Product` antes/depois, zeros→`NULL`, positivos preservados, índices/FKs, venda ilimitada, produto zerado bloqueado, peça ilimitada/zerada, reserva/consumo/liberação/estorno ilimitados, conversões de modo, dry-run/apply/reapply, falha induzida e rollback integral. Aprovação: nenhuma relação perdida, `foreign_key_check` vazio, Client compatível e regra `NULL/0/>0` consistente. Rollback: restauração do backup pré-migração; migração publicada nunca é editada.

## 3C — Core transacional

Arquivos novos sugeridos: `lib/estoqueTecnico/db.ts`, `types.ts`, `errors.ts`, `sanitize.ts`, `idempotency.ts`, `service.ts`, `recalcularOrdem.ts`; testes de unidade/integração. Ajustes mínimos em resolução segura do caminho do banco.

Riscos: duas conexões (Prisma/node:sqlite), lock/busy, dinheiro/DateTime, transação parcialmente fora do executor. Testes: concorrência, falhas induzidas, invariantes, replay, sanitização. Aprovação: todos os comandos usam `BEGIN IMMEDIATE`, um movimento por efeito e rollback total. Rollback: remover core sem expor rotas; tabelas podem permanecer inertes.

## 3D — APIs de cadastro e estoque

Arquivos: rotas em `app/api/pecas-tecnicas/**`, `lib/permissoesSistema.ts`, projeção/sanitização e testes. Sem integrar OS ainda.

Riscos: vazamento de custo, validação frouxa, SKU concorrente. Testes: matriz 401/403, payloads, paginação, custo oculto, idempotência, versão. Aprovação: CRUD lógico e movimentos passam matriz por perfil. Rollback: retirar navegação/rotas; dados permanecem preservados.

## 3E — Telas do estoque

Arquivos: `app/pecas-tecnicas/page.tsx`, `nova/page.tsx`, `[id]/page.tsx`, `[id]/estoque/page.tsx`, componentes e `SistemaFrame.tsx`/usuários. 

Riscos: coerção de `null` para zero, cache obsoleto, ocultação apenas visual. Testes: desktop/mobile, seletor ilimitado, zero “Sem estoque”, estados vazio/inativo/abaixo mínimo, permissões e concorrência. Aprovação: UI nunca orienta zero como ilimitado e não perde `null`. Rollback: remover links/páginas; APIs continuam funcionais.

## 3F — Reserva dentro da OS

Arquivos: rotas `app/api/ordens/[id]/pecas/**`; componentes em `app/ordens/[id]`; ajustes em detalhe/edição/nova e recálculo das rotas `app/api/ordens/route.ts` e `[id]/route.ts`.

Riscos: adoção de `partsCost` legado, pagamentos existentes, dupla reserva, total cliente/servidor. Testes: adicionar/redimensionar/remover, última unidade concorrente, preço customizado, OS antiga, snapshots imutáveis. Aprovação: disponível correto e total sempre reconstruído. Rollback: feature flag/UI desligada e liberação transacional das reservas de teste antes de reverter; nunca apagar histórico real.

## 3G — Consumo, cancelamento e reabertura

Arquivos: rotas de `status`, `finalizar`, `cancelar`, `reabrir`, `duplicar`, `DELETE` de OS; core. 

Riscos: consumo parcial, corrida cancelar/pronto, consumo duplicado, reabertura indevida, cópia de cobrança. Testes: matriz completa de estados, falha no N-ésimo item, replay, concorrência, consumido permanece em cancelar/reabrir, duplicação vazia. Aprovação: invariantes e regras 1–10 confirmadas em integração. Rollback: desabilitar transições afetadas e restaurar release anterior; movimentos aplicados não são apagados, correção usa estorno manual.

## 3H — PDFs e relatórios

Arquivos: `app/api/ordens/[id]/imprimir/route.ts`, rotas reais de garantia/recibo, `app/api/relatorios/route.ts`, PDF, páginas de relatório, dashboard e financeiro geral.

Riscos: vazamento de custo em PDF/JSON, dupla contagem, chamar margem bruta de líquida, layout. Testes: golden PDFs, OS antiga/nova/mista, perfis, intervalos, cancelada/estornada. Aprovação: totais reconciliam e custo só com financeiro. Rollback: manter cálculos novos no servidor e ocultar seções novas de apresentação.

## 3I — LAN, backup, restore e instalador

Arquivos: testes/e2e, scripts do migrador/instalador apenas se comprovadamente necessários, runbooks de backup/restore e criação limpa.

Riscos: múltiplos clientes LAN, lock, WAL/SHM, caminho diferente entre Prisma/core, upgrade interrompido. Testes: duas máquinas/processos concorrentes, banco grande, backup hash, falha elétrica simulada, restore, upgrade repetido, instalação limpa sem dados operacionais. Aprovação: migração/restore reproduzíveis, nenhuma perda e diagnóstico claro. Rollback: backup verificado anterior ao schema e instalador anterior; não rebaixar banco sem restore.

## Ordem e gates

Cada etapa depende da aprovação da anterior. 3B/3C podem ser entregues sem UI; 3F não entra antes dos testes concorrentes de 3C; 3H só entra após os estados definitivos de 3G. Cada PR deve conter migração/teste/documentação coerentes, mas uma migração publicada nunca é editada: correções usam novo ID.

## Matriz mínima final

- Perfis ADMIN/ATENDENTE/TECNICO/FINANCEIRO com permissões padrão e customizadas.
- OS nova, antiga sem itens, pronta, entregue, cancelada, reaberta e duplicada.
- Itens reservados, consumidos, liberados e estornados.
- Saldos `NULL`, zero, mínimo, última unidade e concorrência.
- Custo presente/ausente em todos os JSONs e PDFs.
- Migração baseline→3B, banco já atualizado, checksum inválido, backup/restore e instalação limpa.

## Riscos que exigem decisão antes da 3F

1. Alteração de peça após pagamento está definitivamente bloqueada.
2. Duplicação sempre zera `partsCost` e não copia peças, inclusive em OS legada.
3. Nova entrada substitui explicitamente o custo atual; não há média implícita.
4. SKU é único com `COLLATE NOCASE`.
5. Decidir em 3B se `StockMovement.previousStock/newStock` também se tornam nullable; recomendado para não manter zero ambíguo em snapshots de venda ilimitada.

## Revisão 3A.1 — regra unificada de estoque

### Gate revisado da 3B

A release de schema, migração e interpretação deve ser indivisível: primeiro, em `BEGIN IMMEDIATE`, converter todo `Product.stockQuantity=0` existente para `NULL` durante a reconstrução; somente depois publicar código em que zero significa esgotado. `db push` não participa da produção.

Checklist obrigatório da 3B:

- `Product.stockQuantity Int?` e `TechnicalPart.quantityOnHand Int?`;
- reconstrução transacional de `Product` preservando registros e relações;
- suporte do migrador a alteração evolutiva de tabela-base e FKs desligadas fora da transação;
- `TechnicalPart` com constraints nullable e `quantityReserved` não nulo;
- testes de venda ilimitada sem redução e venda controlada zero bloqueada;
- testes de cancelamento ilimitado preservando `NULL` e controlado devolvendo quantidade;
- testes de peça ilimitada e zerada;
- reserva, aumento/redução, consumo, liberação e estorno ilimitados;
- conversão ilimitado→controlado com quantidade inicial, inclusive zero;
- conversão controlado→ilimitado somente com reservado zero e confirmação;
- rejeição de entrada/ajustes em ilimitado;
- alertas/relatórios excluindo ilimitados de físico/valorização e incluindo snapshots históricos;
- falha induzida após cópia e antes do rename, e após rename, ambas com rollback integral;
- contagens, índices, `foreign_key_check`, `integrity_check`, checksum e reaplicação no-op.
