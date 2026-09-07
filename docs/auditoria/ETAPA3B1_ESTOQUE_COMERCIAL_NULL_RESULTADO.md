# ETAPA 3B.1 — Estoque comercial com `NULL = ilimitado`

## Resultado

A camada comercial foi adaptada para distinguir explicitamente:

- `stockQuantity = NULL`: estoque ilimitado;
- `stockQuantity = 0`: estoque controlado sem saldo;
- `stockQuantity > 0`: estoque controlado com saldo.

`StockMovement.previousStock` e `StockMovement.newStock` permanecem `NULL` nas vendas e cancelamentos de produtos ilimitados. O campo de resposta `isUnlimited` é derivado de `stockQuantity === null` e não é persistido. O alias de resposta legado `unlimitedStock` foi mantido para compatibilidade das telas atuais.

## Arquivos alterados

- `app/api/produtos/route.ts`
- `app/api/produtos/[id]/route.ts`
- `app/api/produtos/[id]/estoque/route.ts`
- `app/api/produtos/relatorios/route.ts`
- `app/api/vendas-produtos/route.ts`
- `app/api/vendas-produtos/[id]/cancelar/route.ts`
- `app/api/dashboard/route.ts`
- `app/produtos/page.tsx`
- `app/produtos/novo/page.tsx`
- `app/produtos/estoque/page.tsx`
- `scripts/validar-etapa3b1-estoque-null.mjs`
- `docs/auditoria/ETAPA3B1_ESTOQUE_COMERCIAL_NULL_RESULTADO.md`

Foram analisados e não precisaram de alteração: `app/produtos/relatorios/page.tsx`, `app/produtos/vendas/page.tsx`, `app/api/financeiro-geral/route.ts`, `lib/moduloProdutos.ts`, `lib/permissaoApi.ts` e `prisma/schema.prisma`.

## APIs e regras aplicadas

### Cadastro

`POST /api/produtos` exige `unlimitedStock` booleano. Para ilimitado, a quantidade deve ser omitida e o valor persistido é `NULL`. Para controlado, `stockQuantity` é obrigatório, inteiro e maior ou igual a zero. Combinações contraditórias retornam HTTP 422 com `code: VALIDATION_ERROR`. Usuário sem `relatorios.financeiro` continua sem poder definir custo ou imposto.

### Edição

`PUT /api/produtos/[id]` exige modo explícito. A conversão de ilimitado para controlado exige quantidade inteira maior ou igual a zero. A conversão de controlado para ilimitado exige `confirmStockModeChange: true`, omite a quantidade e persiste `NULL`. Custo e imposto existentes são preservados para usuário sem acesso financeiro.

Não existe modelo de histórico cadastral de produto. Por isso, a mudança de modo é informada claramente na resposta, mas não é gravada como movimento físico comum; criar um `StockMovement` artificial comprometeria a semântica de movimentação física.

### Movimentação manual

`POST /api/produtos/[id]/estoque` rejeita entrada, saída e ajuste de produto ilimitado com HTTP 409 e `code: UNLIMITED_STOCK_REJECTS_MOVEMENT`. Produtos controlados aceitam zero como saldo real, permitem entrada positiva a partir de zero e não permitem saldo negativo. Seus snapshots são sempre numéricos.

### Venda

`POST /api/vendas-produtos` continua transacional. Produto ilimitado não sofre verificação ou redução de saldo e gera movimento de venda com `previousStock = NULL` e `newStock = NULL`. Produto controlado, inclusive o zerado, exige saldo suficiente, reduz numericamente o saldo e retorna HTTP 409 com `code: INSUFFICIENT_STOCK` quando insuficiente.

### Cancelamento

`POST /api/vendas-produtos/[id]/cancelar` mantém `NULL` para produto ilimitado, não soma quantidade ao produto e registra cancelamento `NULL/NULL`. Para controlado, devolve a quantidade e registra os saldos numéricos antes e depois.

## Telas

Cadastro e edição agora possuem a opção explícita **Estoque ilimitado**. Marcada, ela limpa/desabilita quantidade e o envio omite `stockQuantity`; desmarcada, exige quantidade e aceita zero. Textos que recomendavam zero para ilimitado foram removidos.

Listagem e venda exibem `NULL` como **Ilimitado**, zero como **Sem estoque** e positivos como quantidade. O filtro **Sem estoque** foi separado de **Ilimitado** e **Controlado**.

Na tela de estoque, produtos ilimitados exibem orientação para conversão e não mostram o formulário de movimentação física. Zero permanece movimentável por entrada. O histórico exibe infinito somente quando os snapshots são `NULL`.

## Relatórios e dashboard

Produtos ilimitados foram excluídos da valorização de venda/custo e dos alertas físicos. Produto controlado zerado entra em **Sem estoque**. Estoque baixo considera somente `stockQuantity IS NOT NULL AND stockQuantity < minStock`. Vendas, receita, custos históricos e margem continuam baseados nos itens vendidos, inclusive ilimitados.

`app/api/financeiro-geral/route.ts` não usa diretamente `stockQuantity` e não precisou ser modificado.

## Testes de laboratório

Comando:

```text
node scripts/validar-etapa3b1-estoque-null.mjs
```

Resultado: código 0, com os dez cenários A–J validados. O script cria uma pasta no diretório temporário do sistema, copia `data/nio-os.db`, aplica o migrador 3B exclusivamente nessa cópia, executa os testes Prisma e remove recursivamente toda a pasta no bloco `finally`. O banco real não é migrado nem escrito.

Cobertura: cadastro ilimitado; cadastro controlado zero; venda ilimitada; bloqueio do controlado zero; venda controlada positiva; cancelamento ilimitado; cancelamento controlado; exclusão de ilimitado da valorização/alertas e inclusão de zero em sem estoque; payload contraditório; proteção de custo/imposto sem permissão financeira.

## ETAPA 3B.2 — concorrência e cancelamento histórico

### Produtos duplicados

`POST /api/vendas-produtos` valida os identificadores antes de consultar ou alterar estoque. Se o mesmo `productId` aparecer mais de uma vez, a API não consolida os itens: retorna HTTP 422 com `code: DUPLICATE_PRODUCT_IN_SALE` e mensagem sem identificadores ou dados internos. A transação não é iniciada e nenhum saldo, venda, item ou movimento é alterado.

### Redução condicional e rollback

Produtos controlados são reduzidos por `updateMany` dentro da mesma transação Prisma da venda, usando simultaneamente `id`, `stockQuantity IS NOT NULL` e `stockQuantity >= quantity`, com `decrement: quantity`. Somente `count = 1` permite continuar.

Após a tentativa, o produto é relido na transação. Produto removido produz `PRODUCT_NOT_FOUND`; mudança concorrente para ilimitado é aceita sem decremento e gera snapshot `NULL/NULL`; saldo insuficiente produz `INSUFFICIENT_STOCK`. Quando a redução vence, `newStock` vem da releitura e `previousStock` é reconstruído por `newStock + quantity`.

A venda e seus itens podem ser criados antes da redução dentro do callback transacional, mas qualquer falha lança erro e causa rollback integral: nenhuma venda, item, movimentação ou redução parcial permanece.

### Cancelamento orientado pelo histórico

O cancelamento decide a devolução a partir do movimento `VENDA`, não do modo atual do produto:

- movimento original `NULL/NULL`: a venda era ilimitada e nunca devolve quantidade. Se hoje controlado, o movimento de cancelamento registra saldo atual/saldo atual; se hoje ilimitado, registra `NULL/NULL`;
- movimento original numérico: a venda reduziu estoque. Se hoje controlado, a devolução usa incremento atômico e snapshots numéricos; se hoje ilimitado, não materializa saldo e registra `NULL/NULL`.

O `reason` informa apenas se a venda original não movimentou estoque físico ou se a devolução não alterou saldo por causa do modo ilimitado atual, sem expor dados internos.

### Idempotência

Além da verificação de status e de movimentos de cancelamento existentes, a transação reserva o cancelamento com `updateMany` condicionado a `status = CONCLUIDA`. Exatamente uma tentativa recebe `count = 1`. É criado um movimento `CANCELAMENTO_VENDA` por movimento `VENDA`; uma segunda tentativa não altera saldo nem cria movimentos. Falhas posteriores também revertem a reserva de status.

### Testes concorrentes

O laboratório passou a executar 16 cenários: os dez da 3B.1 e os seis da 3B.2. Na disputa pela última unidade, duas reduções condicionais simultâneas produziram exatamente um `count = 1` e um `count = 0`; o saldo final foi zero, sem saldo negativo, com uma venda e um movimento apenas.

Também foram validados: duplicidade sem alteração; venda originalmente ilimitada convertida depois para controlada sem devolução; venda originalmente controlada convertida para ilimitada sem materialização; devolução controlada normal; e segunda tentativa de cancelamento sem movimento adicional.

## Validações

- `npx prisma validate`: código 0; schema válido.
- `npx prisma generate`: código 0; Prisma Client 6.19.3 gerado.
- `npx tsc --noEmit`: código 0.
- `npm run build`: código 0; compilação, TypeScript, páginas estáticas e traces concluídos.

Não foram executados `prisma db push`, `prisma migrate`, build desktop nem `BUILD-DESKTOP-DIR-V11N-SEGURO.bat`.

## Limitações e escopo preservado

- O banco real ainda está no formato anterior à migração 3B, fato confirmado pelo teste inicial somente leitura/cópia; ele não foi alterado.
- A migração 3B e `prisma/schema.prisma` não foram editados.
- Electron, AppData, arquivos de ambiente, executáveis e estoque técnico não foram alterados.
- O build Next.js atualizou somente artefatos descartáveis em `.next`, que não integram o ZIP.
