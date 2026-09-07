# ETAPA 3C.2.1 — Idempotência, auditoria e endurecimento

## Resultado

Os serviços internos do estoque técnico foram endurecidos antes de qualquer API ou integração com Ordens de Serviço. A etapa adiciona persistência idempotente e auditoria administrativa, corrige snapshots internos de custo, restringe o mapeamento de constraints, abre leituras em modo somente leitura e impõe limites numéricos e invariantes equivalentes ao SQLite.

## Arquivos alterados e criados

Alterados:

- `prisma/schema.prisma`
- `scripts/schema-migrator/migrations.cjs`
- `scripts/schema-migrator/test-etapa3b.cjs`
- `lib/estoqueTecnico/db.ts`
- `lib/estoqueTecnico/types.ts`
- `lib/estoqueTecnico/validation.ts`
- `lib/estoqueTecnico/commands.ts`
- `lib/estoqueTecnico/partService.ts`
- `lib/estoqueTecnico/index.ts`

Criados:

- `lib/estoqueTecnico/commandLogRepository.ts`
- `scripts/schema-migrator/test-etapa3c21.cjs`
- `scripts/test-estoque-tecnico/etapa3c21-endurecimento.cjs`
- `docs/auditoria/ETAPA3C21_IDEMPOTENCIA_AUDITORIA_RESULTADO.md`
- `docs/auditoria/etapa3c21-idempotencia-auditoria.zip`

`core.cjs` e `cli.cjs` foram analisados integralmente e não precisaram de alteração.

## Modelo de comandos administrativos

Foi criado o enum Prisma `TechnicalPartCommandOperation` com `CREATE`, `UPDATE_METADATA`, `DEACTIVATE` e `REACTIVATE`.

O modelo `TechnicalPartCommandLog` possui identificador, chave lógica única, hash SHA-256, operação, relação obrigatória com a peça, operador opcional com snapshot de nome, motivo opcional, versão resultante e data. Relações inversas foram adicionadas a `TechnicalPart` e `SystemUser`.

A tabela não guarda payload, valores antigos/novos, custo, credenciais, cliente, SQL ou caminho. O hash comprova igualdade do comando sem reter seu conteúdo.

## Migração

Nova migração no manifesto:

- ID: `20260806_002_technical_part_command_log`
- checksum SHA-256: `20013162c5f4f15f08618c72904a970a08e6aa2baa01ad5e3e8b66cdecfe5750`

A migração publicada `20260804_001_technical_parts` não foi editada e mantém o checksum `57ad36c0c07e14457345ae506aa4c0e18dd1dfd28a71fc27d4c4e4639241224c`.

A nova migração cria a tabela, duas FKs, índice único de chave lógica e índices por peça, operação, operador e data. Constraints exigem textos essenciais não vazios, hash hexadecimal minúsculo de 64 caracteres e versão resultante não negativa. Ela não solicita `foreign_keys=OFF` e não reconstrói tabela existente.

`ownedTables`, `requiredTables`, `schemaChecks`, FKs, índices e fragmentos de constraints integram o manifesto e seu checksum determinístico.

## Idempotência administrativa

O fluxo comum agora ocorre dentro da mesma transação `BEGIN IMMEDIATE`:

1. gerar chave lógica determinística;
2. canonicalizar o payload validado e calcular SHA-256;
3. buscar `TechnicalPartCommandLog` pela chave preparada;
4. comparar operação, recurso e hash;
5. em replay, recarregar a peça e não mutar;
6. executar o comando;
7. inserir o command log;
8. validar FKs e fazer commit.

Mesmo comando retorna `idempotentReplay=true`, inclusive cadastro ilimitado e controlado zero. Payload diferente com a mesma chave retorna `IDEMPOTENCY_KEY_REUSED`. Falha de peça, movimento inicial ou log reverte todos os efeitos.

Cadastro positivo continua criando um `ENTRY`, mas o command log passou a ser a fonte de idempotência administrativa. Edição, inativação e reativação podem ser repetidas com a versão original porque o replay é resolvido antes da validação da versão corrente.

## Auditoria

- `CREATE`: registra operação, operador, versão zero e razão fixa de cadastro inicial.
- `UPDATE_METADATA`: registra operação, operador, horário e versão resultante, sem valores alterados.
- `DEACTIVATE` e `REACTIVATE`: persistem o motivo validado, operador e versão resultante.

Nenhuma ação cadastral cria movimento físico falso.

## Snapshots internos de custo

A autorização financeira agora controla apenas envio e projeção de custo. Ela não apaga o custo conhecido internamente.

- `ENTRY` inicial usa `currentCostPrice` persistido.
- Entrada e ajuste positivo usam o custo atualizado quando autorizado e informado; caso contrário usam o custo já persistido.
- Ajuste negativo rejeita qualquer `unitCost` com `VALIDATION_ERROR` e usa o custo anterior.
- `unitCostSnapshot` é sempre persistido quando o custo conhecido existe, inclusive para operador sem visualização financeira.

A sanitização continua removendo `currentCostPrice` e `unitCostSnapshot` das respostas sem autorização.

## Constraints e erros

`TECHNICAL_PART_SKU_EXISTS` deixou de aceitar a expressão genérica `UNIQUE constraint failed`. O mapeamento ocorre somente quando a mensagem identifica `TechnicalPart_sku_key_nocase` ou `TechnicalPart.sku`.

Conflito lógico é detectado pelo repository antes da escrita e retorna `IDEMPOTENCY_KEY_REUSED`. IDs, `idempotencyKey` de movimento e outras constraints não são classificados como SKU; falhas não previstas seguem como erro interno sanitizado.

## Conexões somente leitura

O runtime usado é Node 24.18.0 e suporta `DatabaseSync` com `readOnly: true`. `withStockDatabase` passou a abrir a conexão com essa opção, mantendo `foreign_keys`, `busy_timeout`, consulta de `journal_mode` e validação estrutural.

O laboratório confirmou que `SELECT` funciona e `INSERT` é recusado pelo SQLite. As conexões transacionais permanecem graváveis. Nenhum comando altera `journal_mode`.

## Limites numéricos

Foram centralizados:

- `MAX_STOCK_QUANTITY = 1_000_000_000`
- `MAX_VERSION = 2_147_483_647`
- `MAX_MONEY = 999_999_999.99`
- `MAX_PAGE = 100_000`

Inteiros usam `Number.isSafeInteger`. Quantidade, saldo inicial, estoque mínimo, versão, página, custo e preço rejeitam valores inseguros ou acima do domínio. Incrementos também verificam o saldo resultante e versões no limite não podem ser incrementadas. Não há truncamento ou clamp silencioso.

## Invariantes

`ENTRY`, `POSITIVE_ADJUSTMENT` e `NEGATIVE_ADJUSTMENT` exigem saldos controlados. `MANUAL_REVERSAL` continua aceitando modo ilimitado ou controlado de acordo com o delta. `STOCK_MODE_CHANGE` exige reservas zero e quantidade exatamente igual ao físico posterior na ida para controlado ou ao físico anterior na ida para ilimitado.

Saldos, reservas e quantidades passam pelos mesmos limites e relações antes da inserção do movimento; as funções TypeScript não dependem apenas das constraints do banco.

## Testes

### Endurecimento dos serviços

Suíte: `scripts/test-estoque-tecnico/etapa3c21-endurecimento.cjs`.

Resultado: **44 asserções, código 0**.

Cobertura:

- replay persistido de cadastro ilimitado, zero e positivo;
- um command log e ausência de movimentos artificiais;
- edição repetida após incremento de versão;
- motivos e replay de inativação/reativação;
- conflito de payload com mesma chave;
- snapshots internos e sanitização externa;
- custo novo autorizado e ajuste negativo sem `unitCost`;
- conflito idempotente distinto de SKU duplicado;
- leitura somente leitura e escrita recusada;
- safe integer e todos os limites de domínio;
- `ENTRY` ilimitada e mudanças de modo incoerentes rejeitadas.

### Nova migração

Suíte: `scripts/schema-migrator/test-etapa3c21.cjs`.

Resultado: código 0. Validou apply, inspect, reapply no-op com hash estável, constraints de hash/versão/chave, FKs, checksum, rollback e fonte inalterada.

### Regressões

- 3C.1: **40 asserções, código 0**.
- 3C.2: **64 asserções, código 0**.
- migrador 3B: código 0, fontes inalteradas, três rollbacks, integridade e FKs aprovadas.

Todos os bancos usados foram cópias em diretórios temporários removidos ao final.

## Validação final

- `npx prisma format`: código 0.
- `npx prisma validate`: código 0.
- `npx prisma generate`: código 0; Prisma Client 6.19.3.
- `npx tsc --noEmit`: código 0.
- `npm run build`: código 0; Next.js 16.2.10 compilou, validou TypeScript, gerou 25 páginas estáticas e finalizou traces em 136,2 segundos.

Os engines Prisma já instalados foram usados. Não houve instalação, `db push` ou `prisma migrate`.

## Limitações e próximo passo

A migração existe no manifesto e foi validada somente em cópias temporárias; sua aplicação a um runtime real requer procedimento futuro autorizado, backup e verificação. O núcleo permanece síncrono e interno. APIs, páginas, autenticação de rota e integração com OS seguem fora do escopo.

## Confirmação de escopo

Não foram alterados bancos reais, banco de desenvolvimento original, AppData, Electron, `desktop/**`, `app/**`, APIs, páginas, permissões, `.env`, `package.json` ou dependências. Não foram executados `prisma db push`, `prisma migrate`, aplicativo desktop, build desktop ou `Nio-OS.exe`.

