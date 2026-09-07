# Etapa 2C — Integração segura do migrador SQLite ao Electron

Data da execução: 2026-07-28  
Projeto: `C:\projetos\sistema-os`

## Resultado

A Etapa 2C foi implementada com o migrador executado de forma bloqueante somente
no modo servidor, depois que o banco runtime é localizado ou criado e antes de
qualquer processo Next.js ser iniciado. O modo cliente não carrega o runner, não
prepara diretórios locais, não copia seed e não abre ou migra SQLite.

Nenhuma tabela `TechnicalPart`, `ServiceOrderPart` ou
`TechnicalPartMovement` foi criada. `prisma/schema.prisma`,
`prisma/migrations`, `core.cjs` e `migrations.cjs` permaneceram inalterados.

## Fluxo anterior

1. O Electron definia `userData` como `%APPDATA%\Nio-OS`.
2. A interface seletora era aberta e escolhia servidor ou cliente por IPC; a
   escolha também podia ser restaurada do arquivo
   `nio-os-desktop-config.json`.
3. No modo servidor, `prepararPastasLocais()` criava os diretórios runtime,
   copiava o seed quando necessário e gravava `%APPDATA%\Nio-OS\.env`.
4. `iniciarProcessoServidor()` repetia a preparação e iniciava o Next.
5. O health check aguardava uma rota responder e então carregava a interface.
6. `before-quit` encerrava o processo servidor com `serverProcess.kill()`.

O log desktop já ficava em
`%APPDATA%\Nio-OS\nio-os-desktop.log`. No pacote, o standalone ficava em
`resources\app\.next\standalone`.

## Fluxo novo

1. O Electron define `userData` como `%APPDATA%\Nio-OS`.
2. Obtém o lock de instância única com `app.requestSingleInstanceLock()`.
3. A escolha servidor/cliente continua usando o fluxo existente.
4. Somente no modo servidor, `prepararPastasLocais()` cria os diretórios,
   localiza o banco e aplica a regra existente de cópia do seed.
5. O código confirma que o caminho do banco é absoluto e que o arquivo existe.
6. `executarMigradorSchema()` carrega
   `desktop/schemaMigratorRunner.cjs` dentro do fluxo servidor.
7. O runner executa o CLI com `--db`, `--apply`, `--json` e `--backup-dir`.
8. O desktop aguarda o término. Somente um resultado `ok` com exit code zero
   permite continuar.
9. Só então o processo Next é iniciado.
10. O health check existente aguarda o servidor e a interface normal é aberta.

O ponto exato da migração é `iniciarServidor()`, imediatamente depois de
`prepararPastasLocais()` e antes de `servidorRespondendo()` e
`iniciarProcessoServidor()`.

## Runner isolado

`desktop/schemaMigratorRunner.cjs`:

- resolve o CLI por `app.getAppPath()`, `__dirname` e
  `process.resourcesPath`, sem caminho absoluto de desenvolvimento;
- valida script, banco e diretório de backup;
- rejeita banco relativo ou inexistente;
- usa `spawn(executablePath, args)` com argumentos em array,
  `shell: false` e `windowsHide: true`;
- remove `DATABASE_URL` do ambiente do filho;
- define `ELECTRON_RUN_AS_NODE=1`;
- limita stdout e stderr individualmente a 1 MiB;
- limita a execução a no máximo 120 segundos;
- encerra o filho em timeout ou excesso de saída;
- valida o JSON e devolve resultado estruturado.

## CLI JSON e backup-dir

O CLI preserva a saída humana quando `--json` não é usado. Com `--json`,
stdout contém somente o objeto JSON final e os logs técnicos vão para stderr.
O JSON usa apenas o nome do banco, nunca seu caminho completo.

`--backup-dir` é opcional no uso manual. Quando fornecido, precisa ser absoluto;
o diretório é criado se necessário, o arquivo do banco não pode ser o destino,
backups nunca são sobrescritos e o SHA-256 é verificado após a cópia. Sem
pendências não há backup.

No desktop o destino é `%APPDATA%\Nio-OS\backups\schema`.

## Falhas

Falha de migração impede o spawn do Next. Não há `db push`, reparo, substituição
por seed, exclusão ou renomeação do banco. O log local recebe apenas resumo
técnico: código, ID, nome do banco, backup, duração e mensagem sanitizada.

A caixa de diálogo informa que o sistema não iniciou para proteger os dados e
oferece fechar ou abrir a pasta conhecida de backups. `shell.openPath` só é
chamado depois de validar que o diretório está confinado ao `userData` do
Nio-OS.

Códigos do runner:

- `MIGRATION_DATABASE_PATH_INVALID`
- `MIGRATION_DATABASE_NOT_FOUND`
- `MIGRATION_BACKUP_PATH_INVALID`
- `MIGRATION_SCRIPT_NOT_FOUND`
- `MIGRATION_PROCESS_ERROR`
- `MIGRATION_TIMEOUT`
- `MIGRATION_OUTPUT_LIMIT`
- `MIGRATION_INVALID_RESPONSE`

Os códigos do migrador interno, incluindo `CHECKSUM_MISMATCH`,
`MISSING_BASE_TABLE`, `UNKNOWN_TABLE` e `UNKNOWN_MIGRATION`, são preservados.

## Garantia do modo cliente

`iniciarCliente()` não chama `prepararPastasLocais()`,
`executarMigradorSchema()` nem o runner. O `require` do runner não está no topo
de `main.cjs`; ele ocorre somente dentro de `executarMigradorSchema()`, que é
invocada exclusivamente por `iniciarServidor()`.

## Testes em laboratório

Laboratório usado: `C:\projetos\_nio_os_db_lab\20260728-163000`.
`runtime.db` e `desenvolvimento.db` existentes nesse diretório não foram
alterados.

- A — `ELECTRON_RUN_AS_NODE`: Electron Node v24.18.0; `node:sqlite`
  disponível.
- B — baseline pendente: aplicada na cópia `baseline-pendente.db`; um backup
  externo criado; JSON válido; `integrityCheck=ok`;
  `foreignKeyViolations=0`.
- C — segunda execução: nenhuma pendência, zero backups novos e hash do banco
  inalterado.
- D — checksum divergente: `CHECKSUM_MISMATCH` preservado e servidor simulado
  não iniciado.
- E — schema incompleto: `MISSING_BASE_TABLE`; tabela removida não foi recriada.
- F — script ausente: `MIGRATION_SCRIPT_NOT_FOUND`.
- G — JSON inválido: `MIGRATION_INVALID_RESPONSE`.
- H — timeout: filho encerrado e `MIGRATION_TIMEOUT`.
- I — limite de saída: filho encerrado e `MIGRATION_OUTPUT_LIMIT`.
- J — modo cliente: comprovado pela separação de fluxo e pelo `require` local ao
  servidor.
- Saída humana sem `--json`: preservada e validada em dry-run.
- Tabelas técnicas: ausentes no banco de desenvolvimento original e na cópia
  migrada.

Os scripts fictícios usados nos testes G, H e I ficaram somente no laboratório
e não fazem parte do projeto ou dos ZIPs.

## Validações e builds

Todos passaram:

- `node --check desktop/schemaMigratorRunner.cjs`
- `node --check desktop/main.cjs`
- `node --check scripts/schema-migrator/core.cjs`
- `node --check scripts/schema-migrator/migrations.cjs`
- `node --check scripts/schema-migrator/cli.cjs`
- `npm run build`
- `BUILD-DESKTOP-DIR-V11N-SEGURO.bat`

O primeiro `npm run build` no sandbox encontrou `spawn EPERM`; a repetição com
permissão apropriada passou. O build V11N informou: “The database is already in
sync with the Prisma schema.”

Executável:
`C:\projetos\sistema-os\release\win-unpacked\Nio-OS.exe`

Arquivos confirmados fisicamente no pacote:

- `resources\app\desktop\schemaMigratorRunner.cjs`
- `resources\app\scripts\schema-migrator\core.cjs`
- `resources\app\scripts\schema-migrator\migrations.cjs`
- `resources\app\scripts\schema-migrator\cli.cjs`

Os hashes dos quatro arquivos empacotados coincidem com as fontes.

## Arquivos

Alterados:

- `desktop/main.cjs`
- `scripts/schema-migrator/cli.cjs`

Criados:

- `desktop/schemaMigratorRunner.cjs`
- `docs/auditoria/ETAPA2C_INTEGRACAO_ELECTRON_RESULTADO.md`
- `docs/auditoria/etapa2c-integracao-electron.zip`

Não foi necessário alterar `scripts/preparar-standalone-desktop.js` ou
`package.json`: a configuração existente `desktop/**` e `scripts/**` já inclui
os arquivos necessários.

## Limitações e teste manual pendente

A negociação de versão entre clientes e servidor LAN não foi implementada
nesta etapa. Schema desconhecido ou mais novo é bloqueado; compatibilidade entre
versões cliente/servidor será tratada futuramente. `/api/local/health` não foi
alterada.

Por proteção aos dados reais, o executável não foi aberto. Permanece pendente um
teste manual controlado em ambiente instalado descartável para observar a caixa
de diálogo e o fluxo visual completo sem usar o AppData real.
