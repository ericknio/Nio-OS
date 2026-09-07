# Nio-OS — modo único servidor/cliente

Este pacote prepara o fluxo do instalador final com o mesmo programa em dois modos:

1. Servidor da loja
   - Inicia o Nio-OS neste computador.
   - Usa o banco SQLite local em `data/nio-os.db`.
   - Faz backup automático ao iniciar.
   - Abre a janela local do sistema.

2. Cliente da rede
   - Não cria banco.
   - Não restaura backup.
   - Não inicia servidor.
   - Procura automaticamente um servidor Nio-OS na rede.
   - Salva o último servidor encontrado em `data/cliente-servidor.json`.
   - Abre uma janela em modo aplicativo usando Edge/Chrome quando disponível.

## Arquivo principal

Use:

```bat
Nio-OS.bat
```

O `start-local.bat` apenas chama o `Nio-OS.bat` para manter compatibilidade.

## Cliente Windows

No cliente Windows, use o mesmo pacote/programa e escolha:

```txt
[2] CLIENTE da rede
```

Ele vai tentar encontrar automaticamente o servidor por `/api/local/health`.

## Android/celular

Celular não executa `.exe` Windows. Para celular, continue usando navegador pelo IP atual do servidor ou QR Code em etapa futura.

## Etapa futura

Este fluxo será aproveitado dentro do `.exe` final com uma janela nativa/embutida. Nesta etapa, a janela é aberta em modo aplicativo usando Edge/Chrome quando disponível.
