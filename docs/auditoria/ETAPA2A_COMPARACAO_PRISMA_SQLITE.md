# Etapa 2A — Comparação Prisma × SQLite

## Resultado geral

Os dois bancos SQLite possuem estrutura idêntica e correspondem aos 16 modelos do `prisma/schema.prisma` atual.

| Modelo Prisma | Tabela runtime | Tabela desenvolvimento |
|---|---|---|
| User | User | User |
| Customer | Customer | Customer |
| ServiceOrder | ServiceOrder | ServiceOrder |
| OrderFinalization | OrderFinalization | OrderFinalization |
| OrderHistory | OrderHistory | OrderHistory |
| CompanySettings | CompanySettings | CompanySettings |
| HistoricoOrdem | HistoricoOrdem | HistoricoOrdem |
| ServiceOrderAttachment | ServiceOrderAttachment | ServiceOrderAttachment |
| ServiceOrderInternalNote | ServiceOrderInternalNote | ServiceOrderInternalNote |
| ServiceOrderPayment | ServiceOrderPayment | ServiceOrderPayment |
| SystemUser | SystemUser | SystemUser |
| SystemUserPermission | SystemUserPermission | SystemUserPermission |
| Product | Product | Product |
| ProductSale | ProductSale | ProductSale |
| ProductSaleItem | ProductSaleItem | ProductSaleItem |
| StockMovement | StockMovement | StockMovement |

## Tabelas e modelos sem correspondência

- Tabelas no banco ausentes do schema atual: nenhuma.
- Modelos no schema atual ausentes no runtime: nenhum.
- Modelos no schema atual ausentes no desenvolvimento: nenhum.
- Divergências entre runtime e desenvolvimento em coluna, tipo, nulabilidade, default, FK ou índice: nenhuma.

Os tipos SQLite seguem o mapeamento esperado do Prisma atual: `String` para `TEXT`, `Int` para `INTEGER`, `DateTime` para `DATETIME`, `Decimal` para `DECIMAL` e `Boolean` para `BOOLEAN`. Enums são persistidos como `TEXT`.

## Histórico de migrações

`prisma/migrations/migration_lock.toml` declara `provider = "postgresql"`. As migrações usam construções PostgreSQL, incluindo `CREATE TYPE`, enums nativos, `SERIAL`, `TIMESTAMP(3)` e `ALTER TYPE`. Elas não constituem uma cadeia aplicável aos bancos SQLite examinados.

Nos dois SQLite:

- `_prisma_migrations` não existe;
- `PRAGMA user_version = 0`;
- `PRAGMA application_id = 0`.

Esses fatos, combinados com os scripts que executam `prisma db push`, são forte evidência de criação/atualização por `db push` e/ou cópia de seed, não por `prisma migrate deploy`.

## Tabelas antigas de licença

As migrações PostgreSQL contêm:

- `License`;
- `ActivationLog`;
- `ActivationRequest`.

Essas tabelas:

- não existem no `schema.prisma` atual;
- não existem no runtime SQLite;
- não existem no desenvolvimento SQLite;
- não possuem migração posterior de remoção no histórico examinado.

Conclusão: o histórico de migrações não representa o estado real dos SQLite. A ausência é compatível com posterior sincronização via `db push` do schema já sem os modelos de licença. Não há base segura para reaplicar toda a pasta `prisma/migrations` nesses bancos.

## Dois sistemas de histórico

Ambos existem no schema e nos dois bancos:

- `HistoricoOrdem`: estrutura antiga em português, FK `ordemId`, exclusão em cascata;
- `OrderHistory`: estrutura mais rica, FK `serviceOrderId`, exclusão restrita.

As contagens agregadas mostram `HistoricoOrdem` vazio nos dois bancos e `OrderHistory` em uso. Isso sugere legado mantido por compatibilidade. Não deve ser apagado automaticamente: outros bancos antigos podem conter registros.

## Igualdade runtime × desenvolvimento

O DDL extraído de `sqlite_master` é idêntico, com o mesmo hash SHA-256. Os dados agregados diferem. Portanto:

- estrutura: igual;
- conteúdo: diferente;
- desenvolvimento como referência estrutural: aceitável;
- desenvolvimento como seed confiável: não, pois contém registros operacionais e permissões.

Para instalação nova, o seed deveria ser produzido de maneira reproduzível, conter somente dados mínimos não pessoais e ter versão de schema explícita.

## Divergências relevantes entre fontes

| Fonte | Situação |
|---|---|
| `schema.prisma` atual | Compatível com os dois SQLite |
| `prisma/migrations` | Cadeia PostgreSQL, incompatível com SQLite |
| `_prisma_migrations` | Ausente |
| `user_version` | Zero |
| Scripts de build | Executam `prisma db push` no banco de desenvolvimento |
| Aplicativo instalado | Copia seed apenas quando AppData não possui banco; não migra banco existente |

## Conclusão

O schema real está consistente hoje, mas não existe trilha de atualização SQLite versionada. Uma atualização futura que apenas troque o executável pode deixar clientes existentes com banco antigo. Uma atualização que execute `db push` diretamente em produção pode provocar alterações não auditadas. O módulo de estoque técnico exige um migrador SQLite explícito, versionado, transacional e idempotente.
