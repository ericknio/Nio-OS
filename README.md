# Nio-OS

Sistema local de ordem de serviço para assistência técnica.

## Módulos principais

```txt
✓ Clientes
✓ Ordens de serviço
✓ Anexos e observações internas
✓ Pagamentos
✓ Garantias
✓ Relatórios
✓ Produtos, estoque e vendas
✓ Backup e restauração
✓ Usuários e permissões
```

## Desenvolvimento

```powershell
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Acesse:

```txt
http://localhost:3000
```

## Produção local temporária

```powershell
preparar-local.bat
start-local.bat
```

## Observação

A fase atual ainda usa PostgreSQL. A fase final planejada será um instalador `.exe` com SQLite e modo servidor/cliente para acesso por outra máquina na rede.
