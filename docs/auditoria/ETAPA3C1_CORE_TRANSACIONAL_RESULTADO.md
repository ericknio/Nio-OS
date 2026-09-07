# ETAPA 3C.1 — Core transacional do estoque técnico

## Resultado

A infraestrutura interna do estoque técnico foi criada sem endpoints públicos, páginas ou integração com Ordens de Serviço. O núcleo fornece resolução segura do banco runtime, conexão SQLite configurada, transação de escrita com `BEGIN IMMEDIATE`, erros sanitizados, validação estrita, idempotência, sanitização financeira, invariantes e log técnico opcional.

## Arquitetura e arquivos criados

- `lib/estoqueTecnico/db.ts`: resolução do banco, conexão `node:sqlite`, transação imediata e logger mínimo.
- `lib/estoqueTecnico/errors.ts`: catálogo e mapeamento de erros do domínio.
- `lib/estoqueTecnico/types.ts`: tipos de saldo, comando, operador, transação, projeções e idempotência.
- `lib/estoqueTecnico/validation.ts`: normalização, validações e invariantes puras.
- `lib/estoqueTecnico/idempotency.ts`: chave persistida, payload canônico, SHA-256 e replay.
- `lib/estoqueTecnico/sanitize.ts`: projeções financeiras e operacionais recursivas.
- `lib/estoqueTecnico/index.ts`: superfície pública do núcleo, sem exportar injeções de teste.
- `scripts/test-estoque-tecnico/etapa3c1-core.cjs`: laboratório descartável da etapa.

## Resolução segura do banco

O mapeamento existente foi preservado:

- em desenvolvimento, a URL relativa do Prisma é resolvida a partir do diretório do schema, dentro do projeto;
- no servidor Electron, as variáveis internas já injetadas apontam para a raiz runtime e para a URL absoluta do banco;
- no fallback empacotado, a raiz vem de `runtimeStorage`, sob a área de dados da aplicação;
- nos testes, uma função interna recebe explicitamente raiz e arquivo temporários. Ela não é reexportada pelo `index.ts` e não lê caminho de query, body, header ou variável pública específica de teste.

O resolvedor exige raiz e banco absolutos, extensão `.db`, existência e arquivo regular. Raiz e arquivo passam por `realpath`; a comparação posterior rejeita banco fora da raiz e symlink que escape dela. Mensagens retornáveis nunca incluem o caminho completo. `DATABASE_URL` somente é considerada após validação de protocolo, formato, raiz e arquivo final.

## Transação e conexão SQLite

Cada escrita abre uma conexão própria com `node:sqlite`, configura `foreign_keys = ON` e `busy_timeout = 5000`, apenas consulta o `journal_mode`, valida a presença das tabelas técnicas e executa `BEGIN IMMEDIATE`. Depois do callback, executa `foreign_key_check` e somente então faz `COMMIT`.

Qualquer falha provoca `ROLLBACK` integral. A conexão é fechada em `finally`, inclusive após falha de abertura da transação, validação de integridade ou callback. Contenção SQLite é convertida em `STOCK_DB_BUSY`, marcada como repetível. Não foram executados `VACUUM`, `REINDEX`, `ANALYZE` nem alteração de journal mode.

## Erros técnicos

Foi criado `StockDomainError` com `code`, `httpStatus`, `safeMessage`, `retryable`, detalhes sanitizados opcionais e causa interna não enumerável. Também há um mapeador para uma futura resposta HTTP, sem Route Handler.

Códigos disponíveis: `AUTH_REQUIRED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`, `TECHNICAL_PART_NOT_FOUND`, `SERVICE_ORDER_NOT_FOUND`, `SERVICE_ORDER_PART_NOT_FOUND`, `INSUFFICIENT_AVAILABLE_STOCK`, `UNLIMITED_STOCK_REJECTS_MOVEMENT`, `STOCK_MODE_CONFLICT`, `VERSION_CONFLICT`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_INVALID`, `IDEMPOTENCY_KEY_REUSED`, `STOCK_DB_BUSY`, `STOCK_DB_UNAVAILABLE`, `STOCK_DB_INCOMPATIBLE`, `STOCK_INVARIANT_VIOLATION` e `INTERNAL_ERROR`.

SQL, caminho, payload, stack, custos e dados pessoais não são incorporados às mensagens seguras.

## Validação e invariantes

Os limites de texto foram centralizados. Os helpers rejeitam tipo inesperado, string vazia usada como número, `NaN`, infinito, quantidade negativa ou fracionária e textos acima do limite. SKU recebe `trim`, vazio vira `null` e a caixa é preservada. Valores monetários precisam ser finitos, não negativos e são arredondados para duas casas.

As invariantes distinguem saldo ilimitado (`quantityOnHand = null`, disponível `null`) de controlado, validam reserva não negativa e, no modo controlado, reserva menor ou igual ao físico. Também verificam preços, quantidade de comando, total arredondado e coerência dos saldos antes/depois para cada enum de movimento já gerado pelo Prisma.

## Idempotência

Chaves externas exigem UUID válido. A chave persistida é composta somente por segmentos de allowlist alfanumérica, hífen e sublinhado, no formato namespace/operação/versão/recursos/chave. O payload relevante é percorrido recursivamente, rejeita valores não JSON seguros, ordena chaves de objetos e gera SHA-256 do JSON canônico. Mesmo hash produz replay; reutilização da chave com hash diferente produz `IDEMPOTENCY_KEY_REUSED`.

## Sanitização financeira

As projeções de `TechnicalPart`, `ServiceOrderPart` e `TechnicalPartMovement` removem recursivamente custos, valor de estoque, lucro, margem e custo histórico quando a permissão financeira não está disponível. A regra vale para objetos, listas e estruturas aninhadas. Campos são removidos, nunca substituídos por zero, e entradas `undefined` são omitidas. Com autorização financeira, os valores são preservados.

## Proteção SQL e logs

Valores variáveis são enviados exclusivamente por statements preparados. Não existe ordenação ou cláusula SQL construída a partir de entrada externa. Os únicos comandos diretos são comandos e PRAGMAs constantes definidos pelo núcleo.

O logger é opcional e silencioso por padrão e em produção. Quando um sink interno é fornecido fora de produção, recebe somente operação, código, duração, replay, linhas afetadas e status final. Não recebe payload, SQL, caminhos, tokens, dados pessoais, observações ou custos.

## Testes de laboratório

O teste cria diretórios temporários, copia o banco de desenvolvimento sem alterá-lo, aplica o migrador existente somente à cópia e remove os artefatos ao final. Nenhum dado operacional é impresso.

Resultado: **40 asserções, código 0**.

Cobertura:

- caminho interno válido, relativo, fora da raiz, diretório e symlink escapando;
- commit, rollback, `foreign_keys`, fechamento e ausência de dado parcial;
- duas conexões concorrentes com `BEGIN IMMEDIATE`, timeout e `STOCK_DB_BUSY`;
- números especiais, negativos, frações, texto longo, SKU e arredondamento;
- UUID, composição de chave, canonicalização estável, replay e conflito;
- custo removido em objeto, lista e aninhamento; financeiro autorizado preservado;
- saldos ilimitado/controlado, reserva excessiva, negativo, total e movimentos;
- entrada maliciosa com aspas, comentário e terminador SQL persistida como dado, sem statement adicional.

## Validação final

- `npx prisma validate`: código 0; schema válido.
- `npx prisma generate`: código 0; Prisma Client 6.19.3 gerado.
- `npx tsc --noEmit`: código 0.
- `npm run build`: código 0; Next.js 16.2.10 compilou, validou TypeScript, gerou 25 páginas estáticas e concluiu os traces.

Os comandos Prisma usaram os engines já existentes em `node_modules`, pois a verificação externa de checksum não estava disponível no ambiente. Não houve instalação, atualização de dependência nem migração de banco.

## Limitações e próximo passo

O núcleo é síncrono por característica do `DatabaseSync` e o callback transacional deve permanecer curto e sem espera externa. Idempotência nesta etapa fornece composição, hash e comparação; a leitura e persistência do registro idempotente ficarão para os comandos internos futuros. Autorização deverá ser feita pela camada chamadora antes de projetar dados financeiros.

O próximo passo pode implementar os serviços internos de cadastro e movimentação sobre este núcleo, mantendo endpoints e telas fora do escopo até a etapa correspondente.

## Confirmações de escopo

Não foram alterados schema Prisma, migrador, Electron, `app/**`, permissões, APIs, páginas, relatórios, PDFs, `.env`, `package.json` ou dependências. Nenhum banco original, banco runtime real ou AppData foi escrito. Não foram executados `db push`, `prisma migrate`, aplicativo desktop, build desktop ou executável do Nio-OS.

