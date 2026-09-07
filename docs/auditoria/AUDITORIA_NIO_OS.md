# Auditoria técnica do Nio-OS

Data da análise: 28/07/2026  
Escopo: `C:\projetos\sistema-os`  
Modo: leitura integral do código-fonte relevante, sem executar a aplicação, builds, Prisma ou banco.

## Resumo executivo

O Nio-OS é uma aplicação local/LAN em Next.js 16.2.10, React 19.2.4, Prisma 6.19.3 e SQLite, empacotada com Electron 43.2.0. O backend está implementado em Route Handlers dentro de `app/api`, e a interface usa App Router com páginas cliente. No desktop empacotado, banco, uploads, backups, configuração, segredo de sessão e logs são direcionados para `%APPDATA%\Nio-OS`.

Há dois domínios de estoque atualmente misturados sob o nome “produtos”: catálogo de produtos para venda, movimentações de estoque e vendas. As peças informadas em OS são apenas texto (`requiredParts`/`replacedParts`) e um valor agregado (`partsCost`); não existe peça cadastrada, reserva, consumo, saldo físico nem relação de item de peça com uma OS.

A permissão cujo texto é “Ver financeiro geral e relatórios com valores” tem a chave interna `relatorios.financeiro`. Ela é declarada em `lib/permissoesSistema.ts`, persistida em `SystemUserPermission`, editada em `app/usuarios-sistema/page.tsx` e nas APIs de usuários. A proteção financeira é parcialmente feita no servidor, mas não é uniforme: algumas rotas consideram também `pagamentos.ver` ou `pagamentos.registrar` como autorização para valores de OS, PDFs de OS podem mostrar total para quem possui apenas `ordens.imprimir`, e há endpoints financeiros sem autorização específica.

## Arquitetura atual

- Interface e servidor: Next.js App Router em `app/`.
- Componentes globais: `app/layout.tsx`, `app/AppShell.tsx`, `app/SistemaFrame.tsx`, `app/AuthGuard.tsx`, `app/Permissao.tsx`.
- Persistência: Prisma Client em `lib/prisma.ts`; SQLite indicado por `DATABASE_URL`.
- Modelo: `prisma/schema.prisma`; 13 diretórios de migração.
- Sessão: cookie HMAC próprio `nio_os_session`, com duração de 30 dias.
- Autorização: catálogo central em `lib/permissoesSistema.ts`; validação server-side em `lib/permissaoApi.ts`.
- PDFs: PDFKit, gerados por Route Handlers.
- Desktop: Electron inicia o servidor Next standalone e abre a interface em BrowserWindow.
- Operação em rede: servidor escuta em `0.0.0.0:3000`; clientes descobrem IPs da LAN.
- Dados desktop: `%APPDATA%\Nio-OS\data`, `public\uploads`, `storage`, `backups`, `.env`, configuração e logs.

## Árvore e módulos relevantes

A árvore detalhada está em `ARVORE_RELEVANTE.txt`.

| Módulo | Telas principais | APIs/serviços principais |
|---|---|---|
| Dashboard | `app/page.tsx` | `app/api/dashboard/route.ts` |
| Autenticação | `app/login`, `primeiro-acesso`, `trocar-senha`, `minha-conta`, `sair` | `app/api/auth/**`, `lib/authSistema.ts`, `proxy.ts` |
| Usuários/permissões | `app/usuarios-sistema/page.tsx` | `app/api/usuarios-sistema/**`, `lib/server/usuariosSistemaCore.ts` |
| Clientes | `app/clientes/**` | `app/api/clientes/**`, `lib/server/clientesCore.ts` |
| OS | `app/ordens/**` | `app/api/ordens/**`, `lib/numeroSequencial.ts`, `lib/historico.ts` |
| Pagamentos | `app/pagamentos/page.tsx`, `app/ordens/[id]/pagamento` | `app/api/pagamentos/**`, `app/api/ordens/[id]/pagamento` |
| Produtos | `app/produtos/page.tsx`, `novo` | `app/api/produtos/**`, `lib/moduloProdutos.ts` |
| Estoque de venda | `app/produtos/estoque/page.tsx` | `app/api/produtos/[id]/estoque` |
| Vendas | `app/produtos/vendas/page.tsx` | `app/api/vendas-produtos/**` |
| Relatórios | `app/relatorios`, `app/produtos/relatorios`, `app/financeiro-geral` | `app/api/relatorios/**`, `produtos/relatorios`, `financeiro-geral` |
| Garantias | `app/garantias/page.tsx` | `app/api/garantias`, `app/api/ordens/[id]/garantia` |
| Configuração/backup | `app/configuracoes/**` | `app/api/configuracoes/**`, `app/api/backups/**`, `scripts/backup-*` |
| Desktop | `desktop/main.cjs`, `preload.cjs`, `seletor.html` | `scripts/preparar-standalone-desktop.js`, `electron-afterpack-v11n.js` |

## Banco e modelos Prisma

Modelos efetivamente presentes:

- Legado/autenticação antiga: `User`.
- Clientes: `Customer`.
- OS: `ServiceOrder`, `OrderFinalization`, `OrderHistory`, `HistoricoOrdem`, `ServiceOrderAttachment`, `ServiceOrderInternalNote`, `ServiceOrderPayment`.
- Configuração: `CompanySettings`.
- Autenticação atual: `SystemUser`, `SystemUserPermission`.
- Produtos/vendas: `Product`, `ProductSale`, `ProductSaleItem`, `StockMovement`.

As migrações `add_license_system` e `add_activation_requests` criam `License`, `ActivationLog` e `ActivationRequest`, mas esses modelos não existem no `schema.prisma` atual. Isso indica remoção incompleta ou divergência de histórico. A migração inicial usa DDL com tipos PostgreSQL (`CREATE TYPE`, `SERIAL`, `TIMESTAMP`), embora o datasource atual seja SQLite. Esse desalinhamento precisa ser confirmado antes de qualquer migração nova.

Também existem dois históricos de OS em paralelo: `HistoricoOrdem`/`historicos` e `OrderHistory`/`histories`. Rotas diferentes usam um ou outro.

## Autenticação e sessão

Arquivos envolvidos:

- `proxy.ts`: bloqueio global de páginas/APIs, validação HMAC no Edge e lista pública.
- `lib/authSistema.ts`: hash PBKDF2, emissão/leitura de token, cookie e consulta do usuário.
- `app/AuthGuard.tsx`: proteção e redirecionamento no cliente por rota.
- `app/Permissao.tsx`: contexto e helpers de permissão no cliente.
- `app/login/page.tsx`, `app/primeiro-acesso/page.tsx`, `app/trocar-senha/page.tsx`, `app/minha-conta/page.tsx`, `app/sair/page.tsx`.
- `app/api/auth/login`, `logout`, `me`, `setup`, `minha-conta`, `trocar-senha`.
- `app/UsuarioLogadoBox.tsx`, `app/SistemaFrame.tsx`, `app/AppShell.tsx`.
- `prisma/schema.prisma`: `SystemUser` e `SystemUserPermission`.

Características:

- Cookie `httpOnly`, `sameSite=lax`, caminho `/`, validade 30 dias.
- `secure` é falso por padrão para suportar HTTP/LAN.
- Token contém apenas `userId` e `iat`, assinado por HMAC SHA-256.
- A cada leitura server-side, o usuário é buscado novamente e precisa estar `ATIVO`.
- Não há ID de sessão persistente, rotação, revogação por dispositivo ou invalidação após troca de senha.
- Hash de senha: PBKDF2-SHA512, salt aleatório, 100.000 iterações.
- Login possui limite em memória de 8 falhas por IP+usuário em 15 minutos. Reiniciar o processo limpa o limite; múltiplos processos não compartilham estado; cabeçalhos de IP podem ser influenciados se não houver proxy confiável.
- `AUTH_SECRET` tem fallback hardcoded idêntico em `lib/authSistema.ts` e `proxy.ts`.
- Electron gera um segredo aleatório e o armazena na configuração/AppData, mas execução fora desse fluxo pode usar o fallback.

## Permissões

Todas as chaves são declaradas em `lib/permissoesSistema.ts`:

`dashboard.ver`; `clientes.ver`, `clientes.criar`, `clientes.editar`, `clientes.excluir`; `ordens.ver`, `ordens.criar`, `ordens.editar`, `ordens.alterar_status`, `ordens.marcar_pronto`, `ordens.finalizar`, `ordens.cancelar`, `ordens.reabrir`, `ordens.imprimir`, `ordens.anexos`, `ordens.observacoes`; `pagamentos.ver`, `pagamentos.registrar`; `produtos.ver`, `produtos.criar`, `produtos.editar`, `produtos.excluir`; `estoque.ver`, `estoque.ajustar`; `vendas.ver`, `vendas.registrar`, `vendas.cancelar`; `relatorios.ver`, `relatorios.financeiro`; `garantias.ver`; `configuracoes.ver`, `configuracoes.editar`; `usuarios.gerenciar`.

Permissão financeira solicitada:

- Rótulo: “Ver financeiro geral e relatórios com valores”.
- Chave: `relatorios.financeiro`.
- Declaração e perfis padrão: `lib/permissoesSistema.ts`.
- Armazenamento: `SystemUserPermission.key`.
- Normalização/persistência: `lib/server/usuariosSistemaCore.ts`.
- Edição: `app/usuarios-sistema/page.tsx`.
- APIs de atribuição: `app/api/usuarios-sistema/route.ts`, `[id]/route.ts`, `reaplicar-permissoes/route.ts`.
- Script retroativo: `scripts/adicionar-permissoes-produtos.js`.
- Perfil `ADMIN`: todas; `FINANCEIRO`: inclui a chave; `ATENDENTE` e `TECNICO`: não incluem por padrão.

Verificação na interface:

- Menu: `app/SistemaFrame.tsx`.
- Rotas: `app/AuthGuard.tsx`.
- Contexto/componentes: `app/Permissao.tsx`.
- Dashboard, OS, atrasadas, clientes, pagamentos, relatórios, financeiro geral e produtos usam `tem(...)`.

Verificação no servidor:

- Central: `lib/permissaoApi.ts`.
- Financeiro geral: exige `relatorios.financeiro`.
- Relatório financeiro/PDF e relatório de produtos: exigem `relatorios.financeiro`.
- Dashboard seleciona e devolve campos financeiros somente quando autorizado.
- Listagem/detalhe de OS e várias mutações anulam campos financeiros na resposta.
- Vendas e produtos anulam custo, imposto e lucro quando não autorizado.
- OS trata como “financeiro” a posse de qualquer uma entre `pagamentos.ver`, `pagamentos.registrar` e `relatorios.financeiro` em vários pontos. Portanto, `relatorios.financeiro` não é hoje a única chave que revela valores de OS.

### Interface versus API

Não é apenas ocultação visual: as APIs principais de dashboard, OS, atrasadas, produtos e vendas possuem sanitização server-side. Entretanto, a cobertura não é completa:

- `app/api/manutencao/regularizar-pagamentos-finalizadas/route.ts` não chama autenticação/autorização própria e retorna valores; o proxy ainda exige sessão, mas qualquer usuário autenticado pode acessá-la e o POST altera pagamentos.
- `app/api/pagamentos/pdf/route.ts` não exige permissão específica e gera extrato com valores para qualquer sessão válida pelo proxy.
- `app/api/ordens/[id]/historico/route.ts` não exige `ordens.ver`.
- APIs de usuários são protegidas por `exigirGerenciarUsuarios()` no core, embora a inspeção superficial do route não mostre isso.
- PDFs `imprimir` e `recibo` exigem `ordens.imprimir`, mas podem exibir total/pagamento usando a política ampliada de valores, não exclusivamente `relatorios.financeiro`.
- `/uploads/**` é público no proxy; anexos novos usam endpoint protegido, mas logos/imagens de produto são públicos por desenho.

## Ordens de serviço

### Telas e ações

- Listagem: `app/ordens/page.tsx`.
- Atrasadas: `app/ordens/atrasadas/page.tsx`.
- Criação: `app/ordens/nova/page.tsx`.
- Detalhe: `app/ordens/[id]/page.tsx`.
- Edição: `app/ordens/[id]/editar/page.tsx`.
- Finalização: `app/ordens/[id]/finalizar/page.tsx`.
- Cancelamento: `app/ordens/[id]/cancelar/page.tsx`.
- Pagamento: `app/ordens/[id]/pagamento/page.tsx`.
- Componentes: `AnexosOS`, `HistoricoOS`, `ObservacoesInternasOS`, `StatusRapidoOS`, `WhatsAppOS`.

### APIs

- Coleção/criação: `app/api/ordens/route.ts`.
- Detalhe/edição/exclusão lógica: `app/api/ordens/[id]/route.ts`.
- Status, finalizar, cancelar, reabrir, duplicar.
- Pagamento, histórico, observações, anexos.
- Imprimir OS, recibo, garantia e etiqueta.
- Atrasadas.

### Cálculos

- Fórmula de abertura/edição: `totalAmount = max(partsCost + laborCost - discount, 0)`.
- Navegador: a mesma fórmula é usada para prévia em `nova/page.tsx` e `editar/page.tsx`.
- Servidor: `app/api/ordens/route.ts` e `[id]/route.ts` recalculam; não confiam no `totalAmount` enviado.
- Para usuário sem a política financeira ampliada, criação grava custos/desconto/total como zero e edição preserva os valores existentes.
- `partsCost` hoje é um valor agregado digitado, não o custo contábil de itens.
- `laborCost` funciona na prática como valor cobrado de mão de obra, apesar do nome “cost”.
- Finalização aceita `finalAmount` enviado pelo navegador, exige valor positivo e o grava como `OrderFinalization.finalAmount` e `ServiceOrder.totalAmount`.
- Na finalização, o sistema calcula saldo restante contra `paidAmount`, cria pagamento do restante e força `paidAmount=finalAmount` e `paymentPercent=100`.
- Pagamento parcial calcula valor a partir do percentual e do `totalAmount`; atualiza a OS e cria `ServiceOrderPayment` e histórico no mesmo nested update, mas sem `$transaction` explícita e sem controle otimista.

### Transações de OS

- Criação + número sequencial: `$transaction`.
- Edição/exclusão em `[id]/route.ts`: há transação em parte das operações.
- Finalização: `$transaction`.
- Reabertura: `$transaction`, incluindo remoção/reversão da finalização conforme lógica atual.
- Duplicação: número e criação são tratados no fluxo próprio; revisar antes de agregar itens de peça.
- Cancelamento simples e alteração de status: atualização única/nested write, sem transação explícita.
- Pagamento: nested write atômico no Prisma, mas leitura-cálculo-atualização pode sofrer corrida.

### Estados

`RECEBIDO`, `EM_ANALISE`, `AGUARDANDO_PECA`, `EM_REPARO`, `PRONTO`, `ENTREGUE`, `CANCELADO`.

Hoje `AGUARDANDO_PECA` é somente status. Para peças reais será necessário definir claramente em qual evento se reserva, consome e estorna. Vincular itens afeta criação/edição, duplicação, status, finalização, cancelamento, reabertura, exclusão, PDFs, histórico, relatórios, backups e concorrência.

### PDFs e impressão

- OS: `app/api/ordens/[id]/imprimir/route.ts`.
- Recibo: `app/api/ordens/[id]/recibo/route.ts`.
- Garantia: `app/api/ordens/[id]/garantia/route.ts`.
- Etiqueta/QR: `app/api/ordens/[id]/etiqueta/route.ts`.
- Relatório de OS: `app/api/relatorios/pdf/route.ts`.
- Extrato de pagamentos: `app/api/pagamentos/pdf/route.ts`.
- Helper de dados da empresa: `lib/pdfEmpresa.ts` e `lib/configuracoesSistema.ts`.

## Produtos, estoque e vendas

### Modelos

- `Product`: cadastro, preços, imposto e saldo.
- `ProductSale`: cabeçalho e snapshots agregados.
- `ProductSaleItem`: item com snapshots de nome, preço, custo e imposto.
- `StockMovement`: livro de movimentos, vinculado opcionalmente à venda.

### Cadastro

Telas: `app/produtos/page.tsx`, `app/produtos/novo/page.tsx`.  
APIs: `app/api/produtos/route.ts`, `[id]/route.ts`, upload.

O navegador calcula prévia:

- imposto unitário = `salePrice * taxPercent / 100`;
- lucro unitário = `salePrice - costPrice - imposto`;
- margem = `lucro / salePrice * 100`.

O servidor valida/preenche preços e remove `costPrice`/`taxPercent` de respostas sem `relatorios.financeiro`.

### Entrada, saída e ajuste

Tela: `app/produtos/estoque/page.tsx`.  
API: `app/api/produtos/[id]/estoque/route.ts`.

- `ENTRADA`: soma.
- `SAIDA`: subtrai.
- `AJUSTE`: define saldo exato.
- Saldo zero significa “ilimitado/sem controle”, não “sem estoque”.
- Produto, saldo anterior/novo e movimento são atualizados em `$transaction`.
- A API bloqueia saída inválida conforme a regra de estoque controlado, mas a semântica de zero ilimitado torna impossível representar falta física real.

### Venda

Tela: `app/produtos/vendas/page.tsx`.  
API: `app/api/vendas-produtos/route.ts`.

O cliente monta carrinho e prévias. No servidor, os produtos são relidos e os valores oficiais são recalculados por item:

- subtotal = preço unitário × quantidade;
- imposto = subtotal × percentual;
- custo = custo unitário × quantidade;
- total = subtotal;
- lucro = total - custo - imposto;
- totais da venda são somas dos itens menos desconto.

Venda, itens, atualização de estoque e movimentos `VENDA` ocorrem em `$transaction`. Itens guardam snapshots, preservando o histórico financeiro mesmo após alteração do produto.

### Cancelamento de venda

`app/api/vendas-produtos/[id]/cancelar/route.ts` usa `$transaction`, marca `CANCELADA`, devolve quantidades a partir dos movimentos `VENDA` e cria movimentos `CANCELAMENTO_VENDA`. Há risco de corrida porque saldos são lidos e depois gravados como valor absoluto, sem `increment`/`decrement` condicionado ou versão.

### Exclusão

- DELETE normal inativa o produto.
- `excluir-definitivo` remove movimentos e itens/vendas conforme a lógica da rota. A própria UI informa que isso altera relatórios históricos. É um risco de integridade contábil e não deve ser reproduzido no estoque técnico.

## Relatórios e dashboard

### Dashboard

Arquivos: `app/page.tsx` e `app/api/dashboard/route.ts`.

Cards/indicadores encontrados:

- OS recebidas, abertas, concluídas/entregues, em análise, em reparo, aguardando peça, prontas e atrasadas.
- Clientes.
- Garantias vencendo/vencidas.
- Produtos ativos, estoque baixo, vendas e itens vendidos.
- Recebido de OS no mês, receita de produtos, lucro/custo/imposto de produtos e total recebido.
- Últimas OS e últimas vendas.

A API faz seleção condicional: campos financeiros só são consultados/devolvidos com `relatorios.financeiro`. Contagens respeitam permissões funcionais.

### Relatórios de OS

Arquivos: `app/relatorios/page.tsx`, `app/api/relatorios/route.ts`, `app/api/relatorios/pdf/route.ts`.

Indicadores:

- total de OS, abertas, finalizadas/entregues, canceladas;
- valor total das OS;
- recebido;
- pendente;
- ticket médio;
- formas de pagamento, status, clientes mais ativos e listagem.

`relatorios.ver` permite relatório operacional; `relatorios.financeiro` libera blocos de valores. A API retorna `financeiroLiberado` e sanitiza o payload. O PDF financeiro exige `relatorios.financeiro`.

### Financeiro geral

Arquivos: `app/financeiro-geral/page.tsx`, `app/api/financeiro-geral/route.ts`.

- Receita total.
- Recebido em OS.
- Recebido em produtos.
- Quantidade de pagamentos/vendas/itens.
- Custo, imposto e lucro de produtos.
- Ticket médio e participação OS/produtos.
- Totais por forma de pagamento e movimentos.

Exige `relatorios.financeiro` no servidor.

### Produtos

Arquivos: `app/produtos/relatorios/page.tsx`, `app/api/produtos/relatorios/route.ts`.

- vendas, itens, receita, custo, imposto, lucro e margem;
- produtos mais vendidos e evolução por período;
- valor de estoque derivado de custo × quantidade onde aplicável.

Exige `relatorios.financeiro`.

### Pagamentos

Arquivos: `app/pagamentos/page.tsx`, `app/api/pagamentos/route.ts`, `app/api/pagamentos/pdf/route.ts`.

- total recebido, número de pagamentos, ticket médio, total por forma e extrato.
- JSON exige `pagamentos.ver` ou `relatorios.financeiro`.
- PDF não aplica permissão específica internamente.

### Mapa dos valores solicitados

| Dado | Locais principais |
|---|---|
| Valor total das OS | detalhe/lista/edição/finalização da OS; relatórios; PDFs; atrasadas |
| Valor recebido | dashboard; pagamentos; OS; relatórios; financeiro geral; recibo |
| Valor pendente | OS; relatórios; financeiro geral |
| Valor total do estoque | relatório de produtos |
| Custo dos produtos | produto/edição; vendas; relatório de produtos; dashboard; financeiro geral |
| Lucro | cadastro/prévia de produto; vendas; relatório de produtos; dashboard; financeiro geral |
| Margem | cadastro/prévia e relatório de produtos |
| Impostos | produto; vendas; relatório de produtos; dashboard; financeiro geral |
| Valores das vendas | vendas; dashboard; relatório de produtos; financeiro geral |

## Backup

- UI: `app/configuracoes/BackupRestoreCard.tsx`.
- APIs: `app/api/backups/route.ts`, `app/api/backups/restaurar/route.ts`.
- Execução: `scripts/backup-api.js`, `scripts/backup-core.js`, `backup-local.js`, `backup-auto.js`, `restore-local.js`.
- Inclui banco, `public/uploads` e `storage`; não copia `.env`.
- No SQLite, copia arquivo principal e, se presentes, WAL/SHM. Uma cópia direta de banco ativo com WAL merece validação de consistência.
- Restauração preserva versões antigas renomeando banco/uploads/storage.
- API restringe backup/restauração a `configuracoes.editar` e adicionalmente a ADMIN.
- O novo estoque técnico será coberto automaticamente se permanecer no mesmo SQLite, mas testes de restauração deverão validar novas tabelas e invariantes de saldo/reserva.

## Electron e AppData

`desktop/main.cjs`:

- usa `%APPDATA%\Nio-OS` como `userData`;
- cria `data`, `backups`, `public/uploads` e `storage/uploads/anexos`;
- grava `.env` runtime e configuração local;
- cria e persiste `authSecret` aleatório;
- usa SQLite em `%APPDATA%\Nio-OS\data\nio-os.db`;
- inicia Next standalone com host `0.0.0.0` e porta 3000;
- oferece modo servidor e cliente;
- varre IPs IPv4 locais para descoberta do servidor;
- grava logs de Electron e stdout/stderr do Next;
- usa `contextIsolation=true`, `nodeIntegration=false` e `webSecurity=true`; `sandbox=false` nas janelas principais/internas.

O `package.json` usa `output: standalone`, `asar: false`, NSIS, mantém AppData na desinstalação e inclui um banco seed em `extraResources`.

## Auditoria de segurança e riscos técnicos

Classificação é qualitativa e não substitui teste de intrusão.

### Críticos/altos

1. **API financeira de manutenção sem autorização específica** — `app/api/manutencao/regularizar-pagamentos-finalizadas/route.ts`. Qualquer sessão aceita pelo proxy pode listar valores e executar regularização massiva de pagamentos. POST é transacional, mas a autorização é ausente.
2. **PDF de pagamentos sem autorização específica** — `app/api/pagamentos/pdf/route.ts`. Expõe extrato completo a qualquer usuário autenticado.
3. **Segredo de sessão padrão hardcoded** — `lib/authSistema.ts`, `proxy.ts`. Se `AUTH_SECRET` faltar fora do Electron, tokens podem ser forjados com um valor conhecido.
4. **Servidor exposto à LAN por padrão** — `desktop/main.cjs`, scripts de inicialização. HTTP em `0.0.0.0`, cookie não-secure e descoberta ativa ampliam a superfície para todos na rede local.
5. **Política financeira inconsistente** — OS usa permissões de pagamentos como equivalentes a financeiro em diversos arquivos; `ordens.imprimir` pode produzir documentos com valores. O requisito futuro “ocultar custo/lucro/margem sem permissão financeira” exige uma única política server-side.
6. **Corrida de estoque/vendas** — venda, cancelamento e ajuste leem saldo e gravam saldo absoluto. Transação evita parcialidade, mas não impede duas transações concorrentes de calcularem sobre o mesmo saldo.
7. **Número sequencial por `max + 1`** — `lib/numeroSequencial.ts`. Criações concorrentes podem colidir em `osNumber`/`saleNumber`.

### Médios

8. **Sessão não revogável e longa** — 30 dias, sem tabela de sessões, versão de credencial ou rotação; trocar senha não invalida tokens já emitidos.
9. **Rate limiting somente em memória** — `app/api/auth/login/route.ts`; reinício/múltiplos processos anulam a proteção e cabeçalhos de IP precisam de confiança bem configurada.
10. **CSRF** — cookie `SameSite=Lax` reduz ataques cross-site comuns, mas não há token/origin check explícito nas mutações. Ambiente LAN e hosts confiáveis comprometidos ainda são relevantes.
11. **Endpoint de setup público** — `app/api/auth/setup/route.ts`. A lógica de “primeiro usuário” precisa permanecer atomicamente fechada; requisições concorrentes no primeiro acesso podem disputar criação.
12. **Histórico de OS sem autorização específica** — `app/api/ordens/[id]/historico/route.ts`. O proxy exige login, mas não `ordens.ver`.
13. **Uploads públicos** — `proxy.ts` libera `/uploads`; fotos/logos são públicas. Anexos novos têm rota protegida, limite, allowlist e magic bytes, mas cópias antigas sob `public/uploads` merecem inventário/migração.
14. **Upload e registro não atômicos** — anexo é gravado antes do registro/histórico; falha no banco deixa arquivo órfão. Exclusão de metadado/arquivo também pode ficar parcial.
15. **Exclusão histórica de produtos** — `app/api/produtos/[id]/excluir-definitivo/route.ts`; pode remover itens/vendas/movimentos e alterar relatórios passados.
16. **Sem constraint de saldo** — `Product.stockQuantity` não possui `CHECK >= 0`; regras residem no código. O modelo “0 = ilimitado” cria ambiguidade.
17. **Pagamento por leitura-cálculo-gravação** — `app/api/ordens/[id]/pagamento/route.ts`; pagamentos concorrentes podem ultrapassar 100% ou sobrescrever acumulados.
18. **Finalização confia em `finalAmount` do navegador** — servidor valida positividade, mas não deriva o valor de itens/mão de obra. Isso é flexível, porém permite divergência da composição da OS.
19. **Logs e caminhos sensíveis** — `desktop/main.cjs` registra caminhos de banco/AppData, URLs, processo e erros; rotas usam `console.error`. Não foi observado log intencional de senha/token, mas objetos de erro podem carregar dados contextuais.
20. **Divergência schema/migrações** — datasource SQLite versus migrações com sintaxe PostgreSQL e modelos de licença ausentes do schema.

### Baixos/controles positivos

- Prisma é usado sem `$queryRaw`/SQL concatenado nas rotas analisadas; não foi encontrada injeção SQL direta.
- React escapa texto por padrão; não foi encontrado `dangerouslySetInnerHTML` relevante.
- Rotas de arquivo usam `basename`, allowlists, limites e/ou verificação de confinamento; não foi confirmado path traversal explorável no código ativo.
- Upload de produtos limita 3 MB e valida assinatura; anexos limitam 10 MB, extensão, tipo e assinatura.
- Cookie é `httpOnly` e `SameSite=Lax`.
- Senhas usam salt e comparação temporal segura.
- Operações centrais de venda, cancelamento, ajuste e finalização usam transações.

## Arquivos obsoletos, duplicados ou possivelmente legados

- `User` e relações `createdBy` parecem anteriores ao sistema atual `SystemUser`; não há integração entre eles.
- `HistoricoOrdem` e `OrderHistory` duplicam a função de histórico.
- Migrações de licença/ativação sem modelos correspondentes no schema atual.
- Diversos `*.bak-*`, `*.antes-correcao-*` em `app`, `lib`, `desktop` e `scripts`.
- `proxy.ts.bak-*`, `tsconfig.json.bak-*`.
- `_arquivo_morto_nio_os/`, `VERSOES-FINAIS/`, `backups/`, `logs-build-v11n/` e arquivos de upload preservados após restore.
- Muitos scripts `corrigir-*`, `preparar-dados-v11*`, `electron-afterpack-v11l` e wrappers de versões antigas.
- Assets padrão de Next (`next.svg`, `vercel.svg`, etc.) possivelmente não usados.
- `sistema-os.rar` é um arquivo grande de backup/distribuição e não foi analisado.
- Cópias de imagens dentro de `app/api/uploads` parecem artefatos históricos, não código.

## Dúvidas a confirmar antes de alterar código

1. Em que estado a peça deve ser consumida: `PRONTO`, `ENTREGUE` ou ação separada “reparo concluído”?
2. Reabrir uma OS entregue deve devolver ao disponível, voltar a reservada ou manter consumida até decisão manual?
3. Cancelar uma OS com pagamento/peça consumida deve estornar automaticamente ou exigir aprovação?
4. “Custo da peça” significa custo médio, último custo, lote específico ou custo manual por item?
5. O preço cobrado pode ser alterado por OS e deve haver desconto por item?
6. Quantidades fracionárias são necessárias ou peças são sempre inteiras?
7. Usuários comuns podem ver preço cobrado e total da OS, ocultando somente custo/lucro/margem? A política atual de OS também oculta totais.
8. `relatorios.financeiro` será a única permissão sensível ou haverá permissões específicas de custo de peças?
9. É necessário rastrear fornecedor, nota de compra, lote, localização, garantia da peça e número de série?
10. Peças reservadas podem ser transferidas entre OS?
11. Duplicar OS deve copiar itens como nova reserva ou copiar apenas descrição?
12. Como migrar `requiredParts`, `replacedParts` e `partsCost` históricos: manter como legado ou criar itens sem vínculo/saldo?
13. O banco real de produção foi criado por `db push` ou pelas migrações? A divergência SQLite/PostgreSQL precisa de comprovação.
14. Há múltiplos usuários simultâneos na LAN? Isso determina a urgência de controle de concorrência.
15. Os PDFs devem mostrar preço por peça ou apenas total cobrado?

## Limitações da auditoria

- Não foram executados aplicação, testes, lint, build, Prisma, migrações ou consultas ao SQLite.
- `node_modules`, `.next`, `dist`, `release`, `win-unpacked`, binários, instaladores, arquivos compactados, backups e uploads de clientes não foram analisados, conforme solicitado.
- A regra local pede leitura da documentação interna do Next antes de escrever código. Nenhum código foi escrito; `node_modules` permaneceu excluído.
- Valores de `.env` não foram lidos nem copiados para os documentos; somente nomes de variáveis foram identificados.
- O comando `git` não está disponível no ambiente, portanto não foi possível usar `git status` para validar alterações.
