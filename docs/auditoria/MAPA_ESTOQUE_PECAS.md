# Mapa para o módulo “Estoque de Peças Técnicas”

## Princípios de desenho

O módulo deve ser separado de `Product`, `ProductSale`, `ProductSaleItem` e `StockMovement`. Reutilizar essas tabelas herdaria a semântica perigosa “saldo zero = ilimitado”, permitiria que exclusões de produtos afetassem histórico e misturaria receita de balcão com consumo técnico.

O vínculo recomendado é `TechnicalPart` → `TechnicalPartMovement` e `ServiceOrder` → `ServiceOrderPart`. Toda alteração de saldo/reserva e estado da OS deve acontecer em uma única transação server-side. Totais cobrados podem ser exibidos a usuários operacionais; custo, lucro e margem devem ser selecionados/sanitizados apenas com `relatorios.financeiro`.

## Arquivos exatos que precisam ser analisados novamente antes da implementação

### Núcleo e banco

- `package.json`
- `prisma/schema.prisma`
- todas as migrações em `prisma/migrations`
- `lib/prisma.ts`
- `lib/numeroSequencial.ts`
- `lib/historico.ts`
- `lib/operadorSistema.ts`
- `lib/permissoesSistema.ts`
- `lib/permissaoApi.ts`
- `lib/authSistema.ts`
- `lib/runtimeStorage.ts`
- `lib/moduloProdutos.ts` — apenas para evitar acoplamento indevido

### OS

- `app/ordens/nova/page.tsx`
- `app/ordens/page.tsx`
- `app/ordens/atrasadas/page.tsx`
- `app/ordens/[id]/page.tsx`
- `app/ordens/[id]/editar/page.tsx`
- `app/ordens/[id]/finalizar/page.tsx`
- `app/ordens/[id]/cancelar/page.tsx`
- `app/ordens/[id]/pagamento/page.tsx`
- `app/ordens/[id]/StatusRapidoOS.tsx`
- `app/ordens/[id]/HistoricoOS.tsx`
- `app/api/ordens/route.ts`
- `app/api/ordens/[id]/route.ts`
- `app/api/ordens/[id]/status/route.ts`
- `app/api/ordens/[id]/finalizar/route.ts`
- `app/api/ordens/[id]/cancelar/route.ts`
- `app/api/ordens/[id]/reabrir/route.ts`
- `app/api/ordens/[id]/duplicar/route.ts`
- `app/api/ordens/[id]/historico/route.ts`
- `app/api/ordens/atrasadas/route.ts`

### PDFs/relatórios/dashboard

- `app/api/ordens/[id]/imprimir/route.ts`
- `app/api/ordens/[id]/recibo/route.ts`
- `app/api/ordens/[id]/garantia/route.ts`
- `app/api/ordens/[id]/etiqueta/route.ts`
- `app/relatorios/page.tsx`
- `app/api/relatorios/route.ts`
- `app/api/relatorios/pdf/route.ts`
- `app/financeiro-geral/page.tsx`
- `app/api/financeiro-geral/route.ts`
- `app/page.tsx`
- `app/api/dashboard/route.ts`
- `lib/pdfEmpresa.ts`

### Navegação/permissões/usuários

- `app/SistemaFrame.tsx`
- `app/AuthGuard.tsx`
- `app/Permissao.tsx`
- `app/usuarios-sistema/page.tsx`
- `app/api/usuarios-sistema/route.ts`
- `app/api/usuarios-sistema/[id]/route.ts`
- `app/api/usuarios-sistema/reaplicar-permissoes/route.ts`
- `lib/server/usuariosSistemaCore.ts`

### Operação

- `app/configuracoes/BackupRestoreCard.tsx`
- `app/api/backups/route.ts`
- `app/api/backups/restaurar/route.ts`
- `scripts/backup-core.js`
- `desktop/main.cjs`
- `scripts/preparar-standalone-desktop.js`
- `scripts/electron-afterpack-v11n.js`

## Modelos Prisma recomendados

Nomes finais devem seguir a convenção do projeto, mas a separação conceitual deve ser preservada.

### `TechnicalPart`

- `id`
- `name`
- `sku`/código interno, idealmente único quando informado
- categoria, descrição, localização física e unidade
- `currentCost` ou referência de custo atual
- `defaultChargePrice`
- `physicalQuantity`
- `reservedQuantity`
- disponível derivado como `physicalQuantity - reservedQuantity`, não persistido, ou persistido com constraints rigorosas
- `minStock`
- `isActive`
- timestamps
- relações com itens de OS e movimentos

### `ServiceOrderPart`

- `id`
- `serviceOrderId`
- `technicalPartId` anulável para preservar histórico após inativação
- snapshot de nome/SKU
- quantidade
- `unitCostSnapshot`
- `unitChargePriceSnapshot`
- `costTotalSnapshot`
- `chargeTotalSnapshot`
- desconto opcional
- estado: `RESERVADA`, `CONSUMIDA`, `DEVOLVIDA`, `CANCELADA` ou máquina de estados equivalente
- datas de reserva, consumo e estorno
- operador responsável
- timestamps

Esse é o registro histórico/contábil. Nunca deve recalcular OS antiga usando o preço atual da peça.

### `TechnicalPartMovement`

- `id`
- `technicalPartId`
- `serviceOrderPartId` opcional
- `serviceOrderId` opcional para consulta
- tipo: `ENTRADA`, `SAIDA`, `AJUSTE`, `RESERVA`, `LIBERACAO_RESERVA`, `CONSUMO`, `ESTORNO_CONSUMO`
- quantidade física delta e quantidade reservada delta
- saldos anterior/posterior, se mantidos como trilha
- motivo e operador
- timestamp
- chave de idempotência/evento opcional

### Extensão de `ServiceOrder`

- relação `technicalParts ServiceOrderPart[]`.
- manter `requiredParts` e `partsCost` por compatibilidade histórica durante a transição.
- considerar novos agregados explícitos: `partsChargeAmount`, `partsCostAmount`, `laborChargeAmount`, `grossMarginAmount`. Evitar reaproveitar `partsCost` com dois significados.

### Constraints/invariantes

- `physicalQuantity >= 0`.
- `reservedQuantity >= 0`.
- `reservedQuantity <= physicalQuantity`.
- quantidade do item > 0.
- snapshots monetários >= 0.
- transições de item válidas e idempotentes.
- índices por peça, OS, estado e data.
- exclusão física proibida quando houver histórico; usar `isActive`.

SQLite exige verificar como implementar `CHECK`, enumeração e migração compatíveis com a versão Prisma efetivamente usada.

## APIs novas recomendadas

- `app/api/pecas-tecnicas/route.ts` — listar/criar.
- `app/api/pecas-tecnicas/[id]/route.ts` — detalhe/editar/inativar.
- `app/api/pecas-tecnicas/[id]/estoque/route.ts` — movimentos manuais e histórico.
- `app/api/pecas-tecnicas/relatorios/route.ts` — saldo, custo e giro com sanitização.
- `app/api/ordens/[id]/pecas/route.ts` — listar/adicionar e reservar.
- `app/api/ordens/[id]/pecas/[itemId]/route.ts` — alterar quantidade/preço/remover/liberar.
- Opcional: endpoints explícitos `consumir`, `estornar` somente se não forem parte atômica de finalizar/reabrir.

Não criar chamadas separadas do navegador para “finalizar OS” e “consumir peças”: uma poderia ter sucesso e a outra falhar. A rota de finalização deve executar ambos no mesmo `$transaction`.

## Arquivos existentes que provavelmente precisarão ser alterados

### Obrigatórios

- `prisma/schema.prisma`
- nova migração em `prisma/migrations/<timestamp>_estoque_pecas_tecnicas/migration.sql`
- `lib/permissoesSistema.ts`
- `app/usuarios-sistema/page.tsx`
- `lib/server/usuariosSistemaCore.ts`
- `app/SistemaFrame.tsx`
- `app/AuthGuard.tsx`
- `app/ordens/nova/page.tsx`
- `app/ordens/[id]/page.tsx`
- `app/ordens/[id]/editar/page.tsx`
- `app/api/ordens/route.ts`
- `app/api/ordens/[id]/route.ts`
- `app/api/ordens/[id]/finalizar/route.ts`
- `app/api/ordens/[id]/cancelar/route.ts`
- `app/api/ordens/[id]/reabrir/route.ts`
- `app/api/ordens/[id]/duplicar/route.ts`
- `app/api/ordens/[id]/status/route.ts` se status disparar consumo
- `app/api/relatorios/route.ts`
- `app/api/relatorios/pdf/route.ts`
- `app/relatorios/page.tsx`

### Prováveis

- `app/page.tsx` e `app/api/dashboard/route.ts`
- `app/financeiro-geral/page.tsx` e `app/api/financeiro-geral/route.ts`
- `app/api/ordens/[id]/imprimir/route.ts`
- `app/api/ordens/[id]/recibo/route.ts`
- `app/api/ordens/[id]/garantia/route.ts`
- `app/api/ordens/atrasadas/route.ts`
- `app/ordens/page.tsx`, `atrasadas/page.tsx`, `finalizar/page.tsx`
- `lib/pdfEmpresa.ts`
- backup/testes de restauração, sem mudar o mecanismo se as tabelas ficarem no mesmo banco

### Não acoplar

- `Product`
- `ProductSale`
- `ProductSaleItem`
- `StockMovement`
- `app/produtos/**`
- `app/api/produtos/**`
- `app/api/vendas-produtos/**`

Relatórios gerais podem somar os dois domínios, mas consultas, tabelas, permissões e movimentos devem permanecer separados.

## Arquivos novos recomendados

- `lib/estoqueTecnico.ts` — regras puras, invariantes e máquina de estados.
- `lib/server/estoqueTecnicoCore.ts` — selects seguros, normalização e autorização.
- `lib/server/ordemPecasCore.ts` — reserva/consumo/estorno dentro de `TransactionClient`.
- `app/pecas-tecnicas/page.tsx`
- `app/pecas-tecnicas/nova/page.tsx`
- `app/pecas-tecnicas/[id]/page.tsx`
- `app/pecas-tecnicas/estoque/page.tsx`
- `app/pecas-tecnicas/relatorios/page.tsx`
- `app/ordens/[id]/PecasTecnicasOS.tsx`
- as APIs listadas acima
- testes unitários das regras e testes de integração transacionais, seguindo a estrutura de testes que vier a ser adotada

## Permissões recomendadas

- `pecas_tecnicas.ver`
- `pecas_tecnicas.criar`
- `pecas_tecnicas.editar`
- `pecas_tecnicas.inativar`
- `estoque_tecnico.ver`
- `estoque_tecnico.ajustar`
- `ordens.pecas_reservar`
- `ordens.pecas_consumir` se o consumo puder ocorrer fora da finalização
- `relatorios.estoque_tecnico`

`relatorios.financeiro` deve continuar sendo a única chave para:

- custo unitário/total;
- valor de estoque a custo;
- lucro e margem;
- custo de peças por OS e margem bruta.

Usuários com `ordens.ver`/`ordens.editar` e permissão de peças podem ver quantidade, disponibilidade, preço cobrado e total cobrado, mas as respostas server-side devem omitir (preferível) ou definir como `null` todo custo/lucro/margem. Não basta esconder JSX.

## Fluxos transacionais recomendados

### Entrada/ajuste

Validar permissão e quantidade; atualizar saldo com operação atômica/condicional; criar movimento no mesmo `$transaction`.

### Adicionar peça à OS

1. Recarregar peça e OS dentro da transação.
2. Validar estado da OS e disponibilidade.
3. Criar/atualizar `ServiceOrderPart` com snapshots.
4. Incrementar reservado condicionalmente.
5. Criar movimento `RESERVA` e histórico de OS.
6. Recalcular os agregados cobrados da OS no servidor.

### Remover antes do consumo

Liberar reserva, marcar item como devolvido/cancelado, criar movimento e recalcular totais na mesma transação.

### Finalizar reparo

Para cada item reservado: decrementar físico e reservado, marcar consumido, criar movimento `CONSUMO`; finalizar a OS; criar pagamento/finalização/histórico. Tudo na mesma transação e com revalidação de estado.

### Cancelar

- Reservada: liberar reserva.
- Consumida: regra de negócio explícita — estornar físico apenas se a peça voltou fisicamente.
- Nunca apagar o item/movimento histórico.

### Reabrir

Não assumir estorno automático. Registrar uma decisão explícita por item: mantém consumida, retorna à reserva ou estorna ao físico. A transição precisa ser idempotente para impedir devolução dupla.

### Duplicar

Copiar somente dados descritivos por padrão. Se copiar peças, criar novos itens e novas reservas com snapshots atuais, nunca reutilizar o estado/snapshot da OS original sem confirmação.

## Relatórios envolvidos

### Relatório de OS

Adicionar:

- receita de peças cobrada;
- custo histórico das peças consumidas;
- receita de mão de obra;
- receita total;
- margem bruta = receita da OS - custo das peças;
- margem percentual;
- quantidades reservadas/consumidas/estornadas.

Para não financeiros, manter receita/total cobrado se essa for a decisão de negócio e remover custo/margem na própria API.

### Estoque técnico

- físico, reservado e disponível;
- valor do estoque a custo;
- abaixo do mínimo;
- entradas, ajustes, reservas, consumo e estornos;
- giro e consumo por peça/período/técnico/OS;
- divergências/invariantes.

### Dashboard/financeiro geral

- alertas de disponibilidade e mínimo podem aparecer sem permissão financeira;
- valor do estoque, custo consumido e margem apenas com `relatorios.financeiro`;
- separar receita de peças de OS, mão de obra, produtos de balcão e total consolidado.

## Riscos de migração

1. Migrações históricas parecem PostgreSQL, mas o datasource é SQLite.
2. O banco pode ter sido criado por `db push`, não pela cadeia registrada.
3. `partsCost` histórico não distingue custo real de preço cobrado.
4. `requiredParts` e `replacedParts` são texto livre; migração automática confiável não é possível.
5. Duplos históricos de OS podem gerar trilhas incompletas.
6. Adicionar campos não nulos a tabelas existentes exige defaults/backfill seguro.
7. SQLite tem limitações em alterações de tabela e concorrência.
8. Operações concorrentes na LAN exigem update condicional/retry.
9. Backups diretos com WAL precisam ser validados antes do rollout.
10. Uma implantação com app antigo contra schema novo pode criar inconsistência; versão do schema/aplicação deve ser coordenada.
11. Desfazer migração de estoque após consumo real é um problema contábil, não apenas técnico.
12. Scripts de empacotamento copiam `prisma/**`; é preciso confirmar que o cliente gerado e o banco AppData recebem a versão correta sem executar `db push` automaticamente de forma insegura.

## Ordem segura de implementação

1. Confirmar regras de reserva, consumo, cancelamento, reabertura, visibilidade e valoração.
2. Inventariar o schema real do SQLite de uma cópia de backup, sem usar o banco de produção.
3. Resolver/entender a divergência entre migrações PostgreSQL e datasource SQLite.
4. Definir invariantes, estados e política de idempotência.
5. Criar testes das regras antes de integrar com telas.
6. Adicionar modelos e uma migração explícita, ensaiada somente em cópia descartável.
7. Implementar core server-side transacional e sanitização financeira.
8. Criar APIs de cadastro/movimento e auditar cada método por permissão.
9. Integrar reserva à OS sem ainda consumir automaticamente.
10. Integrar finalização/cancelamento/reabertura/duplicação com testes de falha e concorrência.
11. Atualizar detalhes, edição, menu e telas de estoque técnico.
12. Atualizar PDFs e relatórios com snapshots.
13. Validar dashboard e financeiro geral.
14. Testar backup/restauração do conjunto completo em cópia.
15. Testar empacotamento Electron/AppData e dois clientes concorrentes na LAN.
16. Implantar com backup verificado, janela de manutenção e plano de reversão que preserve movimentos.

