# Etapa 1 — Separação de valores operacionais e dados financeiros sensíveis

## Resumo

Esta etapa separou os valores operacionais de ordens de serviço, vendas e estoque dos dados financeiros sensíveis. A chave existente `relatorios.financeiro` foi mantida e passou a representar exclusivamente acesso a custos, impostos, lucros e margens.

Nenhum modelo Prisma, migração, banco SQLite, arquivo `.env`, Electron ou rotina de backup da aplicação foi alterado.

## Funções centrais criadas

- `PERMISSAO_DADOS_FINANCEIROS_SENSIVEIS`
- `usuarioPodeVerDadosFinanceirosSensiveis(usuario)`
- `exigirAdministradorApi()`

As funções ficam em `lib/permissaoApi.ts`. A decisão server-side de acesso a custo, imposto, lucro e margem usa exclusivamente `relatorios.financeiro`.

## Regras aplicadas

- `partsCost`, `laborCost`, `discount`, `totalAmount` e `finalAmount` são valores operacionais da OS.
- O servidor recalcula `totalAmount = max(partsCost + laborCost - discount, 0)`.
- Criação e edição de OS não zeram valores operacionais pela ausência de `relatorios.financeiro`.
- O rótulo visível de `partsCost` passou de “Custo das peças” para “Valor das peças”.
- Preço unitário, subtotal e total de venda permanecem visíveis sem a permissão sensível.
- Custo, imposto, lucro e margem de produtos e vendas são retornados como `null` ou omitidos para usuários sem a permissão sensível.
- No POST de produto sem acesso sensível, `costPrice` e `taxPercent` são gravados como zero, ignorando o JSON recebido.
- No PUT de produto sem acesso sensível, custo e imposto existentes são preservados.
- O valor operacional do estoque usa preço de venda e exclui estoque ilimitado.
- Relatórios de OS, relatório de produtos e financeiro geral aceitam `relatorios.ver` ou `relatorios.financeiro`.
- Indicadores incorretos de lucro de OS baseados em `partsCost` foram neutralizados.
- Relatórios de OS agora usam `valorGerado`, `valorRecebido`, `valorPendente`, `valorCobradoPecas`, `valorMaoDeObra`, `descontoTotal` e `ticketMedio`.

## APIs protegidas

- `app/api/manutencao/regularizar-pagamentos-finalizadas/route.ts`: GET e POST exigem ADMIN dentro da rota.
- `app/api/pagamentos/pdf/route.ts`: exige `pagamentos.ver` ou `relatorios.financeiro`; `pagamentos.registrar` isoladamente não libera o extrato.
- `app/api/ordens/[id]/historico/route.ts`: exige `ordens.ver`.
- Erros internos alterados nesta etapa são registrados no servidor e respostas genéricas evitam expor detalhes internos.

## Ampliação mínima de escopo

As rotas auxiliares de status, cancelamento, reabertura e duplicação de OS também precisaram ser alteradas. Elas anulavam os valores operacionais após essas ações e, portanto, impediam a separação definitiva solicitada. Os originais foram incluídos no backup antes da edição.

## Valores operacionais

- Preço de venda.
- Valor cobrado pelas peças da OS.
- Mão de obra e desconto.
- Total, valor pago e valor pendente da OS.
- Preço unitário, subtotal, desconto e total das vendas.
- Receita de OS e produtos.
- Estoque valorizado pelo preço de venda.
- Totais operacionais de dashboard e relatórios.

## Dados financeiros sensíveis

- Custo de aquisição e custo unitário.
- Custo total e estoque valorizado pelo custo.
- Imposto e percentual de imposto.
- Lucro, margem, rentabilidade e lucro potencial.

## Testes de aceitação documentados

### Cenário A — operacional sem `relatorios.financeiro`

Verificar criação e edição de OS com peças, mão de obra e desconto; totais de OS e vendas; estoque a preço de venda; relatórios operacionais; financeiro geral e relatório de produtos sanitizados. Confirmar ausência de custo, imposto, lucro e margem e bloqueio da manutenção administrativa.

### Cenário B — usuário com `relatorios.financeiro`

Verificar que os mesmos valores operacionais permanecem visíveis e que custo, imposto, lucro e margem são liberados.

### Cenário C — produto novo sem financeiro

Enviar manualmente `costPrice: 500` e `taxPercent: 50`; confirmar persistência de zero para ambos.

### Cenário D — edição sem financeiro

Enviar custo e imposto adulterados; confirmar preservação dos valores anteriores.

### Cenário E — APIs protegidas

- Manutenção: 403 para não ADMIN.
- PDF de pagamentos: 403 sem `pagamentos.ver` ou `relatorios.financeiro`.
- Histórico de OS: 403 sem `ordens.ver`.

## Validação automatizada

### Lint

`npm run lint` foi executado e falhou por problemas preexistentes abrangidos pelo script global, principalmente em `_arquivo_morto_nio_os`, cópias de distribuição, arquivos minificados e regras antigas do React nos arquivos ativos. A execução focada confirmou que não há erro de parsing introduzido, mas também reportou dívidas preexistentes como `no-explicit-any`, `set-state-in-effect`, dependências de hooks e uso de `<img>`.

### Build

`npm run build` foi executado novamente e terminou com sucesso:

- compilação de produção concluída em 66 segundos;
- verificação TypeScript concluída em 15,8 segundos;
- 25 páginas estáticas geradas;
- otimização e coleta de rastros concluídas;
- processo encerrado com código `0`.

O erro anterior causado pela pasta de backup foi resolvido ao mover as cópias para fora do alcance do TypeScript, mantendo em `docs/auditoria` somente o arquivo ZIP do backup.

Também foi corrigido o erro de TypeScript em `app/api/produtos/relatorios/route.ts`: `unlimitedStock` não é um campo Prisma e foi removido do `select`. Os cálculos de `valorEstoqueVenda` e `valorEstoqueCusto` agora incluem exclusivamente produtos com `stockQuantity > 0`. A regra de estoque ilimitado continua sendo derivada em TypeScript por `stockQuantity === 0`, sem alteração de schema ou banco.

## Limitações e testes manuais pendentes

- Executar os cinco cenários com usuários reais de permissões distintas.
- Confirmar a apresentação visual responsiva dos cards sanitizados.
- Confirmar recibo, impressão e extrato com todas as combinações de permissões de pagamento.
- Confirmar os fluxos de cancelar, reabrir, duplicar e alterar status preservando os valores operacionais e ocultando detalhes de pagamentos quando necessário.
- O valor real de custo e margem de peças de OS continuará indisponível até existir o estoque técnico com snapshots históricos.
