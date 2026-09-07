# ETAPA 3C.3.3B2 — Cliente para marcar OS como PRONTO

## Chamador identificado

O único chamador real de `PATCH /api/ordens/[id]/status` é
`app/ordens/[id]/StatusRapidoOS.tsx`, usado na tela de detalhe da OS.

## Implementação

- Para PRONTO, a interface envia exatamente `status`,
  `expectedCurrentStatus`, `confirmation` e `technicianResponsible`.
- A chave é criada em memória com `globalThis.crypto.randomUUID()` somente
  quando a tentativa está pronta. Indisponibilidade da API criptográfica impede
  a mutação e mostra mensagem segura.
- O estado `TentativaPronto` mantém chave, OS, status esperado e técnico.
  Retry após 503, timeout ou erro de rede reutiliza a mesma chave e payload.
- Alteração do técnico ou do status descarta a tentativa pendente; a próxima
  confirmação gera nova chave.
- O botão fica desabilitado durante a requisição, impedindo chamadas paralelas.
- Resposta 200, inclusive `reloadOrder: true`, encerra a tentativa e recarrega
  a OS sem repetir o PATCH. Conflitos descartam a tentativa e recarregam os
  dados antes de nova ação.
- Outros status continuam enviando somente `{ status }`, sem header ou campos
  específicos do fluxo PRONTO.

Nenhuma chave é persistida em storage, URL, banco, log ou console. Identidade,
permissões, custos, peças, saldos, pagamentos e totais não são enviados.

## Erros

Mensagens da API são exibidas de forma segura. Erros de rede/timeout e 503
permitem nova tentativa com a mesma chave; 409 força atualização da OS; demais
erros encerram a tentativa sem expor detalhes internos.

## Testes e validação

- Microendurecimento posterior: trava síncrona com `useRef`, timeout abortável
  de 30 segundos, tratamento seguro de `AbortError` mantendo a tentativa e
  `maxLength={120}` no técnico;
- `etapa3c33b2-cliente-pronto.cjs`: 32 asserções aprovadas, incluindo a chave
  existente, retry, reload, ausência de `Math.random`, trava, abort e limpeza
  do timer;
- `npx tsc --noEmit`: aprovado;
- `npm run build`: aprovado, código 0, sem warnings novos.

Schema, migradores, core do estoque técnico, Electron, APIs server-side,
bancos reais e dependências não foram alterados. A próxima etapa poderá ajustar
detalhes visuais do diálogo e tratamento de recarga conforme a experiência de
uso.
