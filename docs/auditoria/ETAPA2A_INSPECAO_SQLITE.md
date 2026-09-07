# Etapa 2A — Inspeção segura dos bancos SQLite

## Escopo e método

A inspeção foi executada em 28/07/2026 com Node.js `v24.18.0` e o módulo nativo `node:sqlite`. Nenhum banco original foi aberto pelo SQLite durante o inventário.

Antes das cópias foram confirmados:

- ausência de processo Nio-OS, Electron ou servidor Node relacionado;
- ausência de `nio-os.db-wal` e `nio-os.db-shm`;
- abertura exclusiva com `FileMode.Open`, `FileAccess.Read` e `FileShare.None`;
- hash SHA-256 do original.

Como os bancos estavam fechados, sem WAL/SHM e com acesso exclusivo, foi usada cópia de arquivo para o laboratório externo. Os hashes das cópias foram comparados com os originais. Toda consulta SQLite ocorreu nas cópias abertas com `new DatabaseSync(path, { readOnly: true })`.

Laboratório:

`C:\projetos\_nio_os_db_lab\20260728-163000`

## Bancos encontrados

| Papel | Original | Cópia externa |
|---|---|---|
| Runtime instalado | `C:\Users\PC\AppData\Roaming\Nio-OS\data\nio-os.db` | `C:\projetos\_nio_os_db_lab\20260728-163000\runtime.db` |
| Desenvolvimento/seed | `C:\projetos\sistema-os\data\nio-os.db` | `C:\projetos\_nio_os_db_lab\20260728-163000\desenvolvimento.db` |

## Hashes

| Banco | SHA-256 antes | SHA-256 da cópia | SHA-256 depois |
|---|---|---|---|
| Runtime | `DBA6FB9EE58855E5BFE0486E505956B1F226C888CD51C501F44AF6B5F1481C36` | `DBA6FB9EE58855E5BFE0486E505956B1F226C888CD51C501F44AF6B5F1481C36` | `DBA6FB9EE58855E5BFE0486E505956B1F226C888CD51C501F44AF6B5F1481C36` |
| Desenvolvimento | `7D8DC61AE1FFC879676B86199B4ED3EC84A1944A29F10521DD4DE04271A749B3` | `7D8DC61AE1FFC879676B86199B4ED3EC84A1944A29F10521DD4DE04271A749B3` | `7D8DC61AE1FFC879676B86199B4ED3EC84A1944A29F10521DD4DE04271A749B3` |

## PRAGMAs das cópias

Os dois bancos apresentaram o mesmo resultado:

| Verificação | Resultado |
|---|---|
| `PRAGMA integrity_check` | `ok` |
| `PRAGMA foreign_key_check` | zero violações |
| `PRAGMA journal_mode` | `delete` |
| `PRAGMA user_version` | `0` |
| `PRAGMA application_id` | `0` |
| `PRAGMA encoding` | `UTF-8` |
| `PRAGMA page_size` | `4096` |
| `PRAGMA foreign_keys` | `1` na conexão somente leitura |

## Inventário estrutural

Cada banco possui:

- 16 tabelas de aplicação;
- 45 índices declarados ou automáticos;
- zero views;
- zero triggers;
- nenhuma constraint `CHECK` explícita;
- nenhuma tabela `_prisma_migrations`.

Tabelas:

`CompanySettings`, `Customer`, `HistoricoOrdem`, `OrderFinalization`, `OrderHistory`, `Product`, `ProductSale`, `ProductSaleItem`, `ServiceOrder`, `ServiceOrderAttachment`, `ServiceOrderInternalNote`, `ServiceOrderPayment`, `StockMovement`, `SystemUser`, `SystemUserPermission` e `User`.

O inventário completo de colunas, tipos, nulabilidade, defaults, chaves, índices e SQL de criação está nos arquivos `ETAPA2A_SCHEMA_RUNTIME.sql` e `ETAPA2A_SCHEMA_DESENVOLVIMENTO.sql`. O DDL dos dois arquivos tem o mesmo SHA-256:

`876E93DE7F0817D7F1B94C01131843CE3146EF455C49DA42DD4AA3D1C4C87AE2`

## Contagens agregadas

Nenhum registro foi lido ou exibido. Foram executados apenas `COUNT(*)` por tabela.

| Tabela | Runtime | Desenvolvimento |
|---|---:|---:|
| CompanySettings | 1 | 1 |
| Customer | 2 | 1 |
| HistoricoOrdem | 0 | 0 |
| OrderFinalization | 1 | 0 |
| OrderHistory | 33 | 10 |
| Product | 2 | 1 |
| ProductSale | 10 | 8 |
| ProductSaleItem | 10 | 8 |
| ServiceOrder | 3 | 2 |
| ServiceOrderAttachment | 1 | 1 |
| ServiceOrderInternalNote | 0 | 0 |
| ServiceOrderPayment | 3 | 1 |
| StockMovement | 10 | 8 |
| SystemUser | 2 | 2 |
| SystemUserPermission | 62 | 66 |
| User | 0 | 0 |

As diferenças de contagem confirmam que o banco de desenvolvimento contém dados e não deve ser tratado como seed limpo ou reproduzível. Nenhum conteúdo desses registros foi consultado.

## Achados principais

- Os schemas runtime e desenvolvimento são idênticos byte a byte no DDL.
- Ambos estão íntegros e sem violações de chave estrangeira.
- O schema não possui controle de versão interno útil: `user_version=0`, `application_id=0` e ausência de `_prisma_migrations`.
- O banco de desenvolvimento pode servir como fotografia estrutural para instalação nova, mas não como seed confiável de dados.
- A estrutura atual depende de disciplina externa; o próprio banco não informa qual versão da aplicação o criou.

## Limitações

- A inspeção representa o estado no instante da cópia.
- Não foram testados bancos de clientes de versões antigas.
- Não foi executada migração, escrita, reparo, `VACUUM` ou Prisma.
- A semântica das rotas foi inferida do código e do DDL; dados individuais não foram usados para validar comportamento.
