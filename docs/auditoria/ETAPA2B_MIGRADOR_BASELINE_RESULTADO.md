# Etapa 2B — Migrador SQLite: baseline versionada e endurecimento

## Resultado

A infraestrutura do migrador foi corrigida para aceitar schemas produzidos por
migrações futuras conhecidas sem deixar de bloquear tabelas desconhecidas. O
manifesto oficial continua contendo somente a baseline: nenhuma tabela real de
estoque técnico foi declarada ou criada.

Não houve integração com Electron, servidor ou Prisma.

## Problema corrigido

O código anterior comparava todas as tabelas do banco com uma lista final fixa
de 16 tabelas. Assim, uma tabela criada por qualquer migração posterior seria
tratada como inesperada e impediria a próxima inicialização.

O novo modelo separa:

- `BASE_TABLES`: as 16 tabelas obrigatórias da baseline;
- `CONTROL_TABLE`: `NioSchemaMigration`;
- `KNOWN_MIGRATION_TABLES`: união determinística de `ownedTables` das
  migrações conhecidas.

Uma tabela adicional só é aceita quando pertence a uma migração conhecida.
Tabela de migração pendente pode estar ausente e não bloqueia a baseline.
Migração aplicada exige todas as suas tabelas e todos os seus `schemaChecks`.
Tabela não declarada bloqueia com `UNKNOWN_TABLE`; schema ausente ou divergente
de migração aplicada bloqueia com `APPLIED_MIGRATION_SCHEMA_MISMATCH`.

## Manifesto e validação versionada

Cada entrada do manifesto declara:

- `id` e `appVersion`;
- SQL normalizado;
- `ownedTables`;
- `requiredTables`;
- `schemaChecks`.

A baseline declara as 16 tabelas em `requiredTables` e as verificações de
colunas críticas em `schemaChecks`. Seu `ownedTables` é vazio. O SQL da
baseline cria somente `NioSchemaMigration`.

O fluxo implementado é:

1. executar `integrity_check` e `foreign_key_check`;
2. exigir as 16 tabelas base e bloquear tabelas desconhecidas;
3. validar a tabela de controle, quando existente;
4. ler o histórico em ordem de inserção;
5. validar duplicidade, IDs, checksums, versões e prefixo contínuo;
6. validar o schema de cada migração aplicada;
7. calcular as pendências como o sufixo restante do manifesto;
8. aplicar esse sufixo em ordem.

## Checksum canônico

| Campo | Valor |
|---|---|
| ID | `20260728_000_baseline_sqlite` |
| Versão | `0.1.1` |
| Checksum novo | `bb57a0b014ff78230f323c2df6748ac1959721474800b118ce6502d4cdef9efb` |
| Algoritmo | SHA-256 de JSON canônico |

O payload inclui `id`, `appVersion`, SQL normalizado, `ownedTables`,
`requiredTables` e `schemaChecks`. Objetos têm chaves ordenadas
recursivamente; arrays preservam a ordem declarada.

## Histórico contínuo

A lista aplicada deve ser exatamente um prefixo do manifesto. Foram
implementados os seguintes bloqueios:

| Estado | Código |
|---|---|
| migração conhecida sem predecessora | `MIGRATION_HISTORY_GAP` |
| migrações conhecidas fora de ordem | `MIGRATION_ORDER_INVALID` |
| ID repetido | `DUPLICATE_MIGRATION_RECORD` |
| ID não presente no manifesto | `UNKNOWN_MIGRATION` |
| checksum divergente | `CHECKSUM_MISMATCH` |
| versão divergente | `APP_VERSION_MISMATCH` |

O migrador não reordena, remove, completa ou repara registros.

## Apply, backup e concorrência

O CLI faz uma inspeção somente leitura antes do apply. Sem pendências, informa
`pendentes=nenhuma`, não cria backup, não abre a conexão de escrita e termina
com código 0.

Com pendências, o backup:

- usa no nome o ID sanitizado da última migração a aplicar;
- nunca sobrescreve arquivo anterior;
- recusa presença de WAL/SHM;
- usa lock exclusivo;
- compara SHA-256 da origem e da cópia;
- ocorre antes de qualquer escrita do migrador.

Depois do backup, o core abre `BEGIN IMMEDIATE`, revalida saúde, schema e
histórico, recalcula as pendências e somente então aplica o sufixo atual em
ordem. O estado observado antes do backup não é usado sozinho.

## Validação sintática

| Comando | Resultado |
|---|---|
| `node --check scripts/schema-migrator/core.cjs` | código 0 |
| `node --check scripts/schema-migrator/migrations.cjs` | código 0 |
| `node --check scripts/schema-migrator/cli.cjs` | código 0 |

Ambiente: Node.js `v24.18.0`.

## Laboratório

Todos os bancos descartáveis, o utilitário de teste e a cópia temporária dos
três scripts ficaram somente em:

`C:\projetos\_nio_os_db_lab\20260728-163000\etapa2b-hardening`

As bases originais do laboratório permaneceram inalteradas:

| Base | SHA-256 inicial e final |
|---|---|
| `runtime.db` | `DBA6FB9EE58855E5BFE0486E505956B1F226C888CD51C501F44AF6B5F1481C36` |
| `desenvolvimento.db` | `7D8DC61AE1FFC879676B86199B4ED3EC84A1944A29F10521DD4DE04271A749B3` |

## Testes da baseline

Foram criadas novas cópias das duas bases; nenhuma cópia já marcada com o
checksum anterior foi reutilizada.

| Cenário | Resultado |
|---|---|
| dry-run de `runtime.db` | baseline pendente, código 0, integridade ok, FK vazia |
| dry-run de `desenvolvimento.db` | baseline pendente, código 0, integridade ok, FK vazia |
| primeiro apply runtime | baseline aplicada uma vez e backup verificado |
| primeiro apply desenvolvimento | baseline aplicada uma vez e backup verificado |
| segundo apply runtime | nenhuma pendência, código 0, nenhum backup novo |
| checksum adulterado | `CHECKSUM_MISMATCH`, código 1 |
| schema base incompleto | `INCOMPATIBLE_BASE_SCHEMA`, código 1 |
| tabela desconhecida | `UNKNOWN_TABLE`, código 1 |
| histórico fora de ordem | `MIGRATION_ORDER_INVALID`, código 1 |

No segundo apply de runtime:

- hash antes e depois:
  `438763610CB796059B0DFD20DC07208D6DC2D8227DC19DA6975BD3748AF29E81`;
- backups antes e depois: 1;
- nenhum byte foi alterado.

Hashes finais das cópias aplicadas:

| Cópia | SHA-256 |
|---|---|
| `runtime-baseline-v2.db` | `438763610CB796059B0DFD20DC07208D6DC2D8227DC19DA6975BD3748AF29E81` |
| `desenvolvimento-baseline-v2.db` | `73BCCD0E45C4393ED9F03ED2918D4D51BC896FEBFC1A85EEDD3E0740439B0BD4` |

## Migração futura simulada

Somente na cópia laboratorial do manifesto foi acrescentada:

- ID `20260728_001_future_migration_test`;
- tabela `NioFutureMigrationTest`;
- checksum laboratorial
  `17719ed012ca5daaf6f50a1f3afb197c9aa3e609ca21c7669249177594c1957e`.

Resultados:

| Cenário | Resultado |
|---|---|
| A — banco só com baseline | futura pendente; banco aceito; código 0 |
| B — primeiro apply | tabela e registro criados; integridade ok; FK vazia |
| C — segundo apply | tabela aceita; nenhuma pendência; nenhum backup ou byte novo |
| D — tabela aplicada removida | `APPLIED_MIGRATION_SCHEMA_MISMATCH`, código 1 |
| E — tabela intrusa | `UNKNOWN_TABLE`, código 1 |

O backup do cenário B foi nomeado
`future-migration.before-schema-20260728_001_future_migration_test.db`.

No cenário C, o hash antes e depois foi
`7E88202B4D22F096F930A3ED1956993C928F9AC1E541C00F0E9C29E4B0A34443`,
e a contagem de backups permaneceu 1.

A migração fictícia, sua tabela e seus scripts não foram copiados ao projeto
nem incluídos no ZIP.

## Históricos inválidos

| Cenário descartável | Código técnico | Exit code |
|---|---|---|
| futura sem baseline | `MIGRATION_HISTORY_GAP` | 1 |
| `appVersion` adulterada | `APP_VERSION_MISMATCH` | 1 |
| checksum adulterado | `CHECKSUM_MISMATCH` | 1 |
| migração desconhecida | `UNKNOWN_MIGRATION` | 1 |
| conhecidas fora de ordem | `MIGRATION_ORDER_INVALID` | 1 |
| registro duplicado | `DUPLICATE_MIGRATION_RECORD` | 1 |
| schema aplicado ausente | `APPLIED_MIGRATION_SCHEMA_MISMATCH` | 1 |

Todos esses bancos continuaram com `integrity_check=ok` e
`foreign_key_check` vazio. Não houve reparo automático.

## Privacidade e limites

Os testes e o migrador consultaram somente `sqlite_master`,
`PRAGMA table_info`, verificações de integridade/FK e a tabela técnica de
migrações. Dados operacionais não foram consultados.

Não foram executados Prisma, `VACUUM`, `REINDEX` ou `ANALYZE`. Não foram
alterados `prisma/schema.prisma`, `prisma/migrations`, `desktop/main.cjs`,
`.env`, dependências, backups da aplicação ou bancos originais.
