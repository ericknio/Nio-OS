<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Regras do Projeto Nio-OS

## 1. Documentação Obrigatória com JSDoc em Português
- Toda vez que criar ou editar qualquer código (funções, componentes, rotas de API, hooks, interfaces ou regras de negócio) no projeto `sistema-os`, inclua blocos de documentação **JSDoc (`/** ... */`)** com explicações didáticas em **português**.
- Explique o que a função ou componente faz, seus parâmetros (`@param`), retornos (`@returns`) e a motivação da regra de negócio.

## 2. Commit e Git Push Automático
- Toda vez que qualquer arquivo de código for modificado no ambiente físico, realizar imediatamente o commit detalhando **o que foi alterado e o motivo**, seguido de `git push` para o repositório remoto no GitHub.

## 3. Isolamento e Proteção de Dados (LGPD)
- Nunca enviar para o GitHub: pastas `release/` (instaladores `.exe`), pasta `lixo/`, arquivos `.env` privados e bancos SQLite locais com dados reais de clientes (`data/*.db`).
