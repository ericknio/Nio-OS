# Nio-OS — Base SQLite Local

Esta etapa muda a base local para SQLite.

## Servidor da loja

1. Substitua os arquivos do pacote.
2. Execute:

```powershell
preparar-local.bat
```

3. Escolha a opção `1`.
4. Depois execute:

```powershell
start-local.bat
```

O banco será criado em:

```txt
data/nio-os.db
```

## Outro computador na rede

Não rode preparação em modo servidor no computador cliente.

Use:

```powershell
conectar-cliente.bat
```

ou abra:

```txt
http://IP-DO-SERVIDOR:3000
```

## Observação sobre dados antigos

Esta etapa não migra automaticamente dados antigos do PostgreSQL para SQLite.
Antes de trocar definitivamente, gere backup do sistema atual.
