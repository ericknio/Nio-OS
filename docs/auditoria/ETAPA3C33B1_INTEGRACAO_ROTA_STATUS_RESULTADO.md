# ETAPA 3C.3.3B1 — Integração segura do consumo à rota de status

## Escopo

O `PATCH /api/ordens/[id]/status` agora encaminha exclusivamente o destino
`PRONTO` para `markServiceOrderReadyAndConsumeTechnicalParts`. Os demais status
mantêm o fluxo Prisma e o contrato anterior. Não houve alteração de schema,
migrador, páginas, Electron ou banco.

## Contrato e segurança

- A rota continua exigindo sessão e `ordens.marcar_pronto` por
  `exigirPermissaoApi`.
- O operador é obtido da sessão (`id` e nome/username); a permissão
  `relatorios.financeiro` é avaliada no servidor.
- `Idempotency-Key` é obrigatório no ramo PRONTO, validado como UUID e nunca é
  devolvido.
- O payload PRONTO aceita somente `status`, `expectedCurrentStatus`,
  `confirmation` e `technicianResponsible`; identidades, custos, pagamentos,
  saldos, peças e totais são rejeitados.
- `Content-Type: application/json` é exigido para PRONTO.

## Fluxo transacional

Após autenticação, validação e contexto interno, a rota chama uma única vez o
serviço técnico. Não há `update` Prisma de status, criação manual de histórico,
movimento ou recálculo no ramo PRONTO. O serviço executa consumo, status,
histórico e idempotência na transação SQLite própria.

Após o commit, a rota tenta uma leitura Prisma somente para reconstruir a
resposta completa histórica, aplicando a sanitização de pagamentos existente.
Se essa leitura falhar, retorna HTTP 200 com o resultado operacional seguro e
`reloadOrder: true`, sem indicar rollback.

## Erros e CSRF

`StockDomainError` é convertido pelo mapeador seguro para códigos/status
apropriados; banco ocupado retorna 503 com `Retry-After: 1`. Nenhum SQL,
caminho, stack, causa interna, token ou payload é exposto. A rota não possui
proteção Origin/CSRF específica além das proteções globais existentes; uma
solução uniforme para mutações deve ser avaliada em etapa posterior, sem
introduzir regra isolada incompatível com clientes LAN/Electron.

## Testes e validação

- `etapa3c33b1-integracao-rota-status.cjs`: 14 asserções aprovadas;
- suíte 3C.3.3A1: 89 asserções aprovadas;
- `npx tsc --noEmit`: aprovado.

Prisma validate/generate e `npm run build` devem ser executados no fechamento
da etapa.

## Limitação temporária

A tela atual não foi alterada. A 3C.3.3B2 deverá enviar o novo payload e o
header `Idempotency-Key`, além de tratar a indicação de recarregamento.

