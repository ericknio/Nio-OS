# Nio-OS — Pacote Cliente de Teste

Extraia este pacote na raiz do projeto:

```txt
C:\projetos\sistema-os
```

Depois execute:

```powershell
.\CRIAR-PACOTE-CLIENTE-TESTE.bat
```

Ele cria:

```txt
C:\projetos\sistema-os\dist-local\nio-os-cliente-teste.zip
```

O pacote exclui banco SQLite, `node_modules`, `.next`, `backups` e arquivos temporários. Assim evita erro de arquivo bloqueado e mantém o pacote mais leve.
