# ETAPA 3C.2 — Cadastro e movimentações de peças técnicas

## Resultado

Foram implementados serviços internos síncronos e reutilizáveis para cadastro, consulta, listagem, edição cadastral, inativação, reativação, entrada, ajustes positivo/negativo e mudança de modo do estoque técnico. Nenhum Route Handler, página ou integração com Ordem de Serviço foi criado.

## Arquivos

Criados:

- `lib/estoqueTecnico/commands.ts`
- `lib/estoqueTecnico/partRepository.ts`
- `lib/estoqueTecnico/movementRepository.ts`
- `lib/estoqueTecnico/partService.ts`
- `scripts/test-estoque-tecnico/etapa3c2-servicos.cjs`
- `docs/auditoria/ETAPA3C2_CADASTRO_MOVIMENTACOES_RESULTADO.md`
- `docs/auditoria/etapa3c2-cadastro-movimentacoes.zip`

Alterados:

- `lib/estoqueTecnico/db.ts`
- `lib/estoqueTecnico/errors.ts`
- `lib/estoqueTecnico/types.ts`
- `lib/estoqueTecnico/validation.ts`
- `lib/estoqueTecnico/index.ts`

## Arquitetura

Os repositórios recebem a conexão `StockDatabase` já aberta, usam statements preparados, não abrem conexões, não controlam transação e não conhecem autenticação ou HTTP. O serviço valida fronteiras `unknown`, coordena idempotência, consulta estado atual, executa update condicionado, cria movimento, verifica invariantes e sanitiza a projeção final.

Escritas usam `withImmediateTransaction` da 3C.1, portanto executam `BEGIN IMMEDIATE`, rollback integral, `foreign_key_check`, commit e fechamento. Leituras usam o novo `withStockDatabase`, que aplica as mesmas configurações seguras e fecha a conexão sem adquirir lock de escrita. A injeção de banco temporário permanece interna e não é reexportada pelo módulo público.

## Regra de saldo

Depois do cadastro, nenhum comando de metadados aceita `quantityOnHand`, `quantityReserved`, `unlimitedStock` ou `initialQuantity`. Toda mudança posterior do físico ocorre por update condicionado e gera exatamente um `TechnicalPartMovement` na mesma transação.

`quantityOnHand = NULL` representa ilimitado. Zero é saldo controlado sem estoque. A resposta deriva `isUnlimited` e `quantityAvailable` sem converter `NULL` em zero.

## Cadastro inicial

`createTechnicalPart` aceita somente os campos autorizados. Ilimitado rejeita `initialQuantity` e grava físico `NULL`, reservado zero. Controlado exige quantidade inteira não negativa e grava zero literalmente quando informado.

Controlado positivo cria `ENTRY` com físico anterior zero, físico posterior igual à quantidade, reservas zero, motivo sanitizado, operador snapshot e chave idempotente. Controlado zero não cria entrada artificial de quantidade zero. Ilimitado não cria movimento físico.

SKU recebe trim, vazio vira `NULL`, preserva caixa e conflito do índice parcial `NOCASE` é convertido em `TECHNICAL_PART_SKU_EXISTS`. Custo enviado sem autorização produz `FINANCIAL_FIELD_FORBIDDEN`, sem normalização silenciosa.

## Consultas

`getTechnicalPartById` e `listTechnicalParts` são internos. A listagem suporta busca, ativo, ilimitado/controlado, sem estoque disponível, abaixo do mínimo, categoria, marca, página, tamanho e ordenação. Paginação é limitada a 100. Ordenação usa allowlist fechada; os fragmentos de filtro são constantes e todos os valores usam parâmetros preparados. Busca `LIKE` escapa barra, `%` e `_`.

Custos são removidos conforme `canViewFinancialData`. Erros não expõem SQL, caminho ou causa interna.

## Edição e estado ativo

`updateTechnicalPartMetadata` permite somente metadados, mínimo, custo, preço e versão. O serviço relê a peça, mescla campos autorizados e executa update por `id + version`, incrementando a versão. Saldo e snapshots históricos permanecem inalterados. Custo exige autorização e SKU repetido é tratado semanticamente.

Inativação exige versão e motivo, bloqueia reserva maior que zero, não apaga nem altera saldo. Reativação também exige versão e motivo. Ambas usam update condicionado e incremento de versão. Como não existe entidade de auditoria cadastral no schema, não é criado movimento físico falso.

## Entrada e ajustes

Entrada e ajuste positivo exigem peça ativa, controlada, quantidade positiva, motivo e versão. Ambos somam o físico, preservam reservado e geram `ENTRY` ou `POSITIVE_ADJUSTMENT`. Custo opcional só é aceito com autorização; quando presente substitui `currentCostPrice`, e quando ausente o custo persistido é preservado.

Ajuste negativo usa condição atômica no banco para `quantityOnHand - quantityReserved >= quantity`, além de modo controlado, ativo e versão. Reservado nunca é reduzido. Zero linhas provoca releitura dentro da transação para distinguir inexistência, versão, inatividade, modo ilimitado e saldo insuficiente. Falha não deixa saldo ou movimento parcial.

## Mudança de modo

Ilimitado para controlado exige confirmação verdadeira, motivo, versão e quantidade inicial não negativa. O comando atualiza somente estado ilimitado e cria `STOCK_MODE_CHANGE`, inclusive com quantidade zero.

Controlado para ilimitado exige confirmação, motivo, versão e reserva zero. O físico passa a `NULL`, a reserva permanece zero e o movimento registra o físico anterior e `NULL` posterior, sem apagar histórico.

Limitação estrutural: a constraint SQLite publicada para `STOCK_MODE_CHANGE` exige `reservedBefore = reservedAfter = 0`. Embora o requisito conceitual permita converter ilimitado com reserva quando o novo físico cobrir a reserva, isso não pode ser registrado com fidelidade no schema atual. Para não falsificar histórico nem contornar constraint, esta versão bloqueia a conversão quando há qualquer reserva; se a quantidade inicial também for menor que a reserva, informa primeiro saldo insuficiente. Suporte completo exige migração futura específica.

## Idempotência

Movimentações usam uma chave lógica formada por namespace, operação, versão, recurso e UUID externo. O SHA-256 completo do payload normalizado é anexado à chave persistida. Antes da mutação, o repositório procura o prefixo lógico com `LIKE` preparado e curingas escapados:

- prefixo e hash iguais, tipo e peça iguais: replay sem novo saldo ou movimento;
- mesmo prefixo com hash, tipo ou recurso diferente: `IDEMPOTENCY_KEY_REUSED`;
- ausência: operação normal, protegida também pelo índice `UNIQUE`.

Cadastro positivo utiliza o movimento inicial como registro idempotente. O schema não oferece portador adequado para cadastro controlado zero ou ilimitado, nem para edição/inativação administrativa. Não foi armazenado hash em `reason` e não foi inventado registro físico artificial. Uma migração futura com tabela de comandos idempotentes é necessária para replay persistido completo nesses casos. Inativar/reativar no estado já desejado é um no-op seguro, mas não substitui auditoria persistida de payload.

## Autorização financeira

O contexto interno contém somente operador, flag financeira e UUID. Não recebe usuário completo, cookie ou `Request`. Sem autorização, custo no comando é rejeitado e custos são removidos recursivamente de peça e movimento. Com autorização, custos persistidos e snapshots podem ser projetados. Preço de venda permanece operacional.

## Concorrência

Todas as escritas são serializadas por `BEGIN IMMEDIATE`, mas continuam usando versão e predicados de estado/saldo no próprio update. O laboratório executou duas conexões reais em workers:

- duas entradas com a mesma versão: um sucesso, um `VERSION_CONFLICT`, saldo 1 e um movimento;
- dois ajustes negativos sobre a última unidade: um sucesso, um `VERSION_CONFLICT`, saldo zero e um movimento.

Nenhum saldo negativo ou efeito parcial foi observado.

## Segurança SQL e logs

IDs, quantidades, nomes, SKU, motivos, filtros e padrões `LIKE` são parâmetros preparados. Apenas fragmentos fixos e ordenação selecionada em allowlist entram na composição SQL. Valores com aspas, terminador, comentários e curingas permaneceram dados e não executaram instruções adicionais.

O serviço não registra payload, custo, motivo, caminho ou SQL. O logger opcional herdado da 3C.1 continua recebendo somente metadados técnicos mínimos e é silencioso em produção.

## Testes

Suíte: `scripts/test-estoque-tecnico/etapa3c2-servicos.cjs`.

Resultado: **64 asserções, código 0**.

Cobertura aprovada:

- ilimitado, controlado zero, controlado positivo e movimento inicial;
- payload contraditório, custo proibido e SKU duplicado `NOCASE`;
- edição, saldo proibido, versão, custo e histórico preservado;
- inativação, reserva bloqueando, reativação e versão concorrente;
- entrada, custo autorizado, ilimitado, replay e reuso de chave;
- ajustes positivo/negativo, disponível, reserva e rollback;
- mudanças de modo zero/positivo, reservas e movimento correto;
- duas corridas reais de entrada e ajuste negativo;
- custo oculto em objeto/lista e custo autorizado;
- nome, SKU, motivo e busca maliciosos tratados como dados.

Regressão 3C.1: **40 asserções, código 0**.

O banco de desenvolvimento foi apenas copiado para diretório temporário. O migrador existente foi aplicado somente à cópia, que foi removida ao final. Nenhum dado operacional foi impresso.

## Validação final

- `npx prisma validate`: código 0; schema válido.
- `npx prisma generate`: código 0; Prisma Client 6.19.3 gerado.
- `npx tsc --noEmit`: código 0.
- `npm run build`: código 0; Next.js 16.2.10 compilou, concluiu TypeScript, gerou 25 páginas estáticas e finalizou traces em 361 segundos.

Os engines Prisma já existentes foram usados localmente. Não houve instalação, atualização, `db push` ou migração.

## Limitações e próximo passo

- Persistência idempotente completa para cadastro zero/ilimitado e comandos administrativos exige estrutura futura própria.
- Conversão ilimitado→controlado com reserva exige ajuste futuro da constraint de movimento.
- Motivos administrativos são validados, mas ainda não existe tabela de auditoria cadastral onde possam ser persistidos corretamente.
- O contexto é deliberadamente interno; autenticação e permissões deverão ser montadas pela futura API.
- Reserva, consumo, liberação, estorno, APIs, páginas, relatórios e PDFs continuam fora do escopo.

## Confirmação de escopo

Não foram alterados schema Prisma, migrador, Electron, `app/**`, `desktop/**`, permissões, `.env`, `data`, `package.json` ou dependências. Os hashes do schema e do migrador permanecem iguais aos registrados na auditoria 3B. Nenhum banco original, banco runtime real ou AppData foi escrito. Não foram executados `prisma db push`, `prisma migrate`, aplicativo desktop, build desktop ou executável do Nio-OS.

