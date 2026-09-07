# Nio-OS 🛠️

> **Sistema Completo de Gestão de Ordens de Serviço, Estoque Técnico, Vendas e Licenciamento para Assistências Técnicas.**

![Versão](https://img.shields.io/badge/versão-0.1.4-blue.svg)
![Electron](https://img.shields.io/badge/Electron-43.2.0-47848F.svg?logo=electron&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.2.10-black.svg?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19.2.4-61DAFB.svg?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/Database-SQLite%20Offline-003B57.svg?logo=sqlite&logoColor=white)
![Prisma](https://img.shields.io/badge/ORM-Prisma%206.19.3-2D3748.svg?logo=prisma&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg?logo=tailwind-css&logoColor=white)

---

## 📌 Visão Geral da Arquitetura

O **Nio-OS** é uma solução híbrida projetada para máxima disponibilidade, segurança de dados e autonomia operacional:

```
┌────────────────────────────────────────────────────────────────────────┐
│                              Nio-OS Ecosystem                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       ┌────────────────────────────┴────────────────────────────┐
       ▼                                                         ▼
┌───────────────────────────────┐         ┌───────────────────────────────┐
│     1. Nio-OS Desktop App     │         │   2. Nio-OS Cloud Dashboard   │
│   (Electron + Next + SQLite)  │         │   (Web Next.js + Neon PG)     │
├───────────────────────────────┤         ├───────────────────────────────┤
│ • 100% Offline-First          │         │ • Painel Web para Gestão      │
│ • Dados locais no PC do lojista│        │ • Níveis: Admin / Revendedor  │
│ • Modo Servidor / Cliente LAN │         │ • Gestão de Licenças & Trial  │
│ • Estoque Técnico & Comissões │         │ • Submódulo oficial GitHub    │
│ • Impressão PDF com QR Code   │         │ • Hospedado na Vercel         │
└───────────────────────────────┘         └───────────────────────────────┘
```

---

## ✨ Módulos e Recursos Principais

### 🖥️ 1. Sistema Desktop Local (Assistência Técnica)
- **Ordens de Serviço (O.S.):**
  - Cadastro completo, acompanhamento por etapas e prazos.
  - Anexos fotográficos do aparelho na entrada e na saída.
  - Observações internas confidenciais e histórico de auditoria.
  - Pagamentos múltiplos e parciais.
  - Termo de garantia e recibo em PDF com QR Code de validação.
- **Estoque Técnico Avançado:**
  - Reserva automática de peças vinculadas à O.S.
  - Estornos e cancelamentos com devolução controlada ao estoque.
  - Apuração de lucro real por O.S. descontando o custo das peças.
  - Apuração e relatório de comissão por técnico responsável.
- **Produtos, Balcão & PDV:**
  - Controle de estoque geral, ponto de reposição e vendas rápidas no balcão.
- **Rede Local Multi-máquinas (LAN):**
  - **Modo Servidor:** centraliza o banco SQLite e abre portas com segurança no Windows Firewall.
  - **Modo Cliente:** conecta terminais de atendimento (recepção/bancada) ao servidor via Token LAN seguro.
- **Licenciamento Local & Segurança:**
  - Identificação de hardware exclusiva por máquina (*Hardware Fingerprint*).
  - Suporte à ativação via arquivo de licença offline assinado ou sincronização online.
  - Isolamento seguro de dados: banco de dados SQLite local protegido no diretório `%LOCALAPPDATA%\Nio-OS\data\nio-os.db`.
- **Backup & Restauração:**
  - Rotinas automatizadas de cópia de segurança e restauração do banco SQLite e arquivos de mídia.

---

### 🌐 2. Cloud Dashboard (Painel de Gestão & Revenda)
Localizado na pasta [`cloud-dashboard/`](file:///c:/projetos/sistema-os/cloud-dashboard) e vinculado ao repositório independente [`nio-os-cloud-dashboard`](https://github.com/ericknio/nio-os-cloud-dashboard.git):
- **Gestão de Revendedores Multi-nível:**
  - Administrador cadastra e gerencia revendedores.
  - Revendedores podem cadastrar outros revendedores (exigência mínima de transferência de 10 créditos para ativação).
  - Isolamento de dados: revendedores gerenciam apenas sua própria carteira de clientes e sub-revendedores.
- **Controle de Licenças & Período de Teste:**
  - Período de teste (*trial*) configurado para **1 dia** para clientes finais.
  - Geração de licenças offline e renovações online com controle de créditos.
- **Interface Moderna & Acessível:**
  - Otimizada para smartphones e computadores (Mobile-First).
  - Suporte completo a tema claro (*Light*) e escuro (*Dark*).
  - Conformidade com a LGPD e sanitização de dados.

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- **Node.js**: Versão 20 ou superior (recomendado 20.x ou 22.x LTS)
- **Git**
- **Sistema Operacional**: Windows 10/11 (para build do Electron e instalador `.exe`)

---

### A. Executando o Desktop em Desenvolvimento

1. **Instalar dependências:**
   ```powershell
   npm install
   ```

2. **Gerar artefatos do Prisma (SQLite Local):**
   ```powershell
   npm run prisma:generate
   ```

3. **Executar em modo Web Dev:**
   ```powershell
   npm run dev
   ```
   Acesse: `http://localhost:3000`

4. **Executar com o Electron Desktop:**
   ```powershell
   npm run desktop
   ```

---

### B. Executando em Rede Local (LAN)

- **Modo Servidor (Máquina Principal):**
  ```powershell
  npm run desktop:servidor
  ```
  *Ou execute o atalho:* `Nio-OS.bat` / `RODAR-DESKTOP-ELECTRON.bat`

- **Modo Cliente (Terminais de Recepção / Bancada):**
  ```powershell
  npm run desktop:cliente
  ```
  *Ou execute o assistente:* `conectar-cliente.bat`

---

### C. Build e Empacotamento do Instalador Desktop

Para gerar o instalador limpo de produção (`Nio-OS Setup 0.1.4.exe`):

```powershell
npm run desktop:instalador
```
> **Nota:** O instalador compilado é gerado na pasta `release/` local. Essa pasta é mantida exclusivamente no seu PC físico e ignorada pelo Git para não sobrecarregar o repositório.

---

### D. Executando o Cloud Dashboard (Web)

1. Acesse a pasta do submódulo:
   ```powershell
   cd cloud-dashboard
   npm install
   ```
2. Configure as variáveis em `.env`:
   ```env
   DATABASE_URL="postgresql://usuario:senha@host/neondb?sslmode=require"
   JWT_SECRET="sua-chave-secreta"
   ```
3. Inicie o servidor Next.js:
   ```powershell
   npm run dev
   ```
   Acesse: `http://localhost:3001` (ou a URL de produção na Vercel).

---

## 📂 Estrutura do Repositório

```txt
sistema-os/
├── app/                  # Rotas, páginas e layout Next.js do Desktop
├── cloud-dashboard/      # Submódulo: Dashboard Web de Revendedores e Licenças
├── desktop/              # Processo principal do Electron (main.cjs, preload, rede LAN)
├── docs/                 # Documentação técnica, relatórios de auditoria e releases
├── lib/                  # Regras de negócio, cálculo de O.S., estoque técnico e segurança
├── license/              # Módulo de assinatura e validação de licença offline
├── prisma/               # Schema e migrações do banco SQLite local
├── public/               # Uploads de fotos, comprovantes e recursos estáticos
├── scripts/              # Utilitários operacionais (backup, migrações, gerador de licenças)
├── .gitignore            # Exclusão estrita de binários (release/), temporários (lixo/) e bancos reais
├── .gitmodules           # Configuração do submódulo oficial cloud-dashboard
├── Nio-OS.bat            # Inicializador padrão para Windows
└── package.json          # Metadados e scripts de automação do Nio-OS
```

---

## 🔒 Segurança, Privacidade e LGPD

- **Bancos Locais Protegidos:** O banco de produção `data/nio-os.db` contendo informações reais de clientes e valores financeiros permanece **exclusivamente no computador local**, nunca sendo enviado ao repositório remoto.
- **Instaladores e Mídias:** As pastas `release/` e `lixo/` são estritamente mantidas no ambiente local.
- **Versionamento Seguro:** Cada alteração no código-fonte é versionada de forma descritiva, rastreável e sincronizada diretamente com o GitHub.

---

## 📄 Licença e Propriedade

Copyright © 2026 **Nio-OS**. Todos os direitos reservados.
Desenvolvido para assistências técnicas e centros de reparo.
