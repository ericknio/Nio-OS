# Etapa 2A — Plano de migração segura em AppData

## Fluxo atual

### Build

`package.json` define:

- `prisma:push`: `prisma db push`;
- `local:prepare`: prepara `.env`, executa `prisma generate`, `prisma db push` e build;
- builds portable/installer/release/win chamam `local:prepare`.

`BUILD-DESKTOP-DIR-V11N-SEGURO.ps1` também executa explicitamente:

1. `npm run sqlite:env`;
2. `npx prisma generate`;
3. `npx prisma db push`;
4. `npm run build`.

`scripts/preparar-env-sqlite-local.js` aponta `DATABASE_URL` para `file:../data/nio-os.db`, relativo à pasta Prisma. Assim, o `db push` de build altera o banco de desenvolvimento/seed em `data\nio-os.db`, não o banco AppData do cliente.

### Inicialização instalada

`desktop/main.cjs` define `userData` como `%APPDATA%\Nio-OS` e usa:

`%APPDATA%\Nio-OS\data\nio-os.db`

Quando empacotado:

- cria pastas AppData;
- se o banco destino não existe, tenta primeiro um banco legado dentro da instalação;
- depois tenta o seed em `resources\seed\data\nio-os.db`;
- copia WAL/SHM se acompanharem a origem;
- se o banco AppData já existe, interrompe o laço e não o substitui;
- escreve o `.env` runtime apontando para AppData;
- inicia o Next standalone.

Não existe chamada de Prisma, migração SQL ou verificação de versão durante a inicialização. Portanto, uma atualização do programa não atualiza um banco AppData já existente.

## Riscos

- Cliente novo pode abrir banco antigo e falhar ao consultar tabelas/colunas novas.
- Cliente antigo pode abrir banco já migrado se houver compartilhamento em LAN.
- Dois executáveis de versões distintas podem operar simultaneamente no mesmo arquivo.
- `db push` não fornece uma sequência auditável nem rollback operacional.
- O seed contém registros e não é uma fonte reprodutível confiável.
- Backup SQLite atual usa cópia direta e auxiliares WAL/SHM; sem coordenação/exclusividade, pode capturar estado inconsistente.
- Restore substitui o banco inteiro; tabelas futuras são preservadas apenas se estiverem presentes no backup restaurado.
- Restauração de backup antigo pode rebaixar o schema sem que a aplicação perceba.

## Alternativas

### A. SQL próprio versionado executado na inicialização

É viável e auditável. Exige um executor confiável, controle de lock, backup e tabela de versões. Sem uma camada interna coordenadora, a integração fica espalhada no Electron.

### B. Prisma migrate deploy

Não é recomendado neste estado. A pasta de migrações está bloqueada como PostgreSQL, os SQLite não têm `_prisma_migrations` e não existe baseline SQLite. Adotar essa opção exigiria criar uma nova linha de base SQLite cuidadosamente conciliada antes de qualquer deploy.

### C. Prisma db push

Não recomendado para clientes reais. É uma sincronização de estado, não uma sequência de mudanças revisável. Não oferece estratégia de rollback adequada, não registra versão no banco e pode produzir operações destrutivas ou dependentes da versão do Prisma.

### D. Migrador interno controlado

Recomendado. Deve embutir SQL SQLite próprio, versionado e testado, com tabela de controle, backup prévio, lock de aplicação e invariantes pós-migração. É uma implementação organizada da alternativa A, integrada ao ciclo real do desktop.

## Estratégia recomendada

Criar um migrador interno executado pelo processo servidor antes de iniciar o Next:

1. Adquirir lock exclusivo de atualização no diretório AppData.
2. Recusar migração se houver outro servidor/cliente gravando no banco.
3. Abrir SQLite com timeout e `foreign_keys=ON`.
4. Ler uma tabela própria, por exemplo `NioSchemaMigration`.
5. Validar versão mínima/máxima compatível da aplicação.
6. Executar `PRAGMA integrity_check` e `foreign_key_check`.
7. Criar backup consistente antes da primeira mudança.
8. Aplicar cada migração pendente em ordem, uma única vez.
9. Usar `BEGIN IMMEDIATE` para serializar escritores.
10. Criar tabelas, índices e registros de versão na mesma transação.
11. Validar estrutura e FKs antes de `COMMIT`.
12. Em erro, executar `ROLLBACK`, manter backup e não iniciar a aplicação.
13. Registrar somente metadados técnicos: id da migração, checksum, versão, início, fim e resultado; nunca dados pessoais.

## Idempotência e versionamento

Tabela proposta:

```sql
CREATE TABLE "NioSchemaMigration" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "checksum" TEXT NOT NULL,
  "appVersion" TEXT NOT NULL,
  "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Cada arquivo SQL deve possuir identificador imutável e checksum. Se um id já aplicado tiver checksum diferente, a inicialização deve parar. A migração do estoque técnico deve usar `CREATE TABLE IF NOT EXISTS` apenas como proteção secundária; a decisão principal deve ser a tabela de versões e validação explícita das colunas/índices.

## Instalação nova

- Preferir criar banco vazio e aplicar todas as migrações SQLite versionadas.
- Inserir somente configurações mínimas e usuário inicial pelo fluxo normal.
- Não distribuir dados operacionais no seed.
- Se o seed continuar temporariamente, registrar nele a mesma versão e checksum do migrador.

## Atualização de cliente existente

- Nunca substituir `AppData\data\nio-os.db` por seed novo.
- Bloquear início até terminar backup e migração.
- Não apagar tabelas antigas.
- Não converter `requiredParts`, `replacedParts` ou `partsCost`.
- Adicionar apenas as três tabelas novas, índices, constraints e controle de versão.

## Rollback e falha de energia

- DDL SQLite deve ocorrer em uma transação.
- `BEGIN IMMEDIATE` evita dois migradores concorrentes.
- Falha antes do commit preserva schema anterior.
- Backup prévio permite restauração integral.
- Rollback de versão da aplicação não deve tentar desfazer automaticamente o schema; versões antigas devem recusar bancos acima de sua faixa compatível.

## LAN e compatibilidade

- Apenas o host servidor deve abrir o SQLite; clientes LAN usam HTTP.
- O migrador deve rodar somente no host.
- Um lock em AppData deve impedir dois servidores locais.
- Expor um endpoint de health com `schemaVersion` e `appVersion`.
- Cliente e servidor devem negociar versão de API; cliente incompatível deve ser bloqueado com mensagem clara.

## Backup e restauração

- Antes de futuras migrações, usar a API de backup SQLite ou parar escritores e confirmar exclusividade.
- Após restore, verificar integridade e versão antes de iniciar.
- Backup antigo restaurado deve acionar migrações pendentes.
- Backup mais novo que a aplicação deve bloquear o downgrade.
- As novas tabelas serão incluídas automaticamente em backup integral do arquivo, mas o método atual de cópia deve ser endurecido para bancos ativos.

## Ordem segura para o módulo técnico

1. Implementar tabela de versão e lock, sem tabelas técnicas.
2. Testar baseline em cópias de bancos reais antigos e atuais.
3. Implementar migração aditiva das três tabelas.
4. Validar backup/restore e falha simulada.
5. Liberar servidor capaz de ler schema antigo e migrá-lo antes de servir.
6. Só então liberar telas/APIs do estoque técnico.
