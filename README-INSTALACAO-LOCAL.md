# Nio-OS — Instalação Local Temporária

Este documento é para o pacote local atual em Next.js + PostgreSQL.

> **Importante:** a instalação em outro computador deve ficar para a fase do instalador `.exe` com SQLite. Este pacote serve para desenvolvimento, testes locais e validação antes do instalador final.

---

## 1. Requisitos atuais

Nesta fase, o computador precisa ter:

- Node.js LTS instalado
- PostgreSQL instalado e rodando
- Banco `sistema_os` criado no PostgreSQL
- Arquivo `.env` configurado

---

## 2. Preparar o sistema

Na pasta do projeto, execute:

```powershell
preparar-local.bat
```

Esse arquivo faz:

```txt
1. Instala dependências
2. Gera Prisma Client
3. Sincroniza o banco com prisma db push
4. Gera build de produção
```

Se aparecer aviso de perda de dados no `prisma db push`, leia antes de confirmar.

---

## 3. Iniciar o sistema

Execute:

```powershell
start-local.bat
```

O sistema abrirá em:

```txt
http://localhost:3000
```

Para acessar de outra máquina na mesma rede, use o IP do computador servidor:

```txt
http://IP-DO-SERVIDOR:3000
```

Exemplo:

```txt
http://192.168.0.10:3000
```

A segunda máquina **não deve criar banco nem rodar primeiro acesso**. Ela apenas acessa o servidor principal pelo navegador ou, futuramente, pelo cliente do instalador.

---

## 4. Backup

Backup manual:

```powershell
npm run backup
```

Restore manual:

```powershell
npm run restore
```

O backup atual inclui:

```txt
banco.sql
public/uploads
storage
backup-info.json
```

---

## 5. Fase final planejada

Na fase final, o sistema deve migrar para:

```txt
✓ instalador .exe
✓ banco SQLite local
✓ modo servidor principal
✓ modo cliente em outra máquina via IP/porta
✓ sem depender de PostgreSQL instalado manualmente
```
