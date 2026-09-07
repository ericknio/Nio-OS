import {
  ConfiguracoesSistema,
  montarContatoEmpresa,
  montarEnderecoEmpresa,
} from "./configuracoesSistema";

export function blocoCabecalhoEmpresa(config: ConfiguracoesSistema) {
  const endereco = montarEnderecoEmpresa(config);
  const contato = montarContatoEmpresa(config);

  return `
    <div class="empresa-header">
      <div class="empresa-logo-box">
        <img src="${config.logoUrl}" class="empresa-logo" />
      </div>

      <div class="empresa-info">
        <div class="empresa-nome">${config.nomeEmpresa}</div>

        ${
          config.documento
            ? `<div class="empresa-linha">${config.documento}</div>`
            : ""
        }

        ${endereco ? `<div class="empresa-linha">${endereco}</div>` : ""}

        ${contato ? `<div class="empresa-linha">${contato}</div>` : ""}
      </div>
    </div>
  `;
}

export function estilosCabecalhoEmpresa() {
  return `
    .empresa-header {
      display: flex;
      align-items: center;
      gap: 14px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }

    .empresa-logo-box {
      width: 74px;
      height: 74px;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      overflow: hidden;
      background: #ffffff;
      flex-shrink: 0;
    }

    .empresa-logo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .empresa-info {
      flex: 1;
      min-width: 0;
    }

    .empresa-nome {
      font-size: 20px;
      font-weight: 900;
      color: #0f172a;
      line-height: 1.1;
      margin-bottom: 4px;
    }

    .empresa-linha {
      font-size: 11px;
      color: #475569;
      line-height: 1.35;
    }

    .empresa-rodape {
      margin-top: 14px;
      border-top: 1px solid #e5e7eb;
      padding-top: 8px;
      font-size: 10px;
      color: #64748b;
      text-align: center;
    }
  `;
}

export function blocoRodapeEmpresa(config: ConfiguracoesSistema) {
  if (!config.rodape) return "";

  return `
    <div class="empresa-rodape">
      ${config.rodape}
    </div>
  `;
}