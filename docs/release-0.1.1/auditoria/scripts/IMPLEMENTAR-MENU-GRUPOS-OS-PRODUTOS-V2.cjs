#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const target = path.join(root, "app", "SistemaFrame.tsx");
const expectedSha = "10652d42ff60c93e0e5ed35a1059d63e283088c5653df43c6041d0a1c6532c11";
const content = "\"use client\";\n\nimport Link from \"next/link\";\nimport { usePathname } from \"next/navigation\";\nimport { ReactNode, useEffect, useMemo, useState } from \"react\";\nimport UsuarioLogadoBox from \"./UsuarioLogadoBox\";\nimport { useUsuarioPermissoes } from \"./Permissao\";\n\ntype ConfiguracoesSistema = {\n  nomeEmpresa?: string | null;\n  companyName?: string | null;\n  nomeFantasia?: string | null;\n  tradeName?: string | null;\n  productsModuleEnabled?: boolean | null;\n};\n\ntype DashboardData = {\n  osAbertas?: number;\n  osAtrasadas?: number;\n  clientes?: number;\n  garantiasVencendo?: number;\n};\n\ntype MenuExtra = \"clientes\" | \"garantias\" | \"atrasadas\" | \"›\";\n\ntype MenuLeaf = {\n  kind: \"link\";\n  label: string;\n  href: string;\n  permissao: string | string[];\n  extra?: MenuExtra;\n  modulo?: \"produtos\";\n};\n\ntype MenuGroup = {\n  kind: \"group\";\n  key: string;\n  label: string;\n  children: MenuLeaf[];\n  modulo?: \"produtos\";\n  contador?: \"os\" | \"children\";\n};\n\ntype MenuNode = MenuLeaf | MenuGroup;\n\ntype MenuSection = {\n  titulo: string;\n  items: MenuNode[];\n};\n\nconst MENU_SECTIONS: MenuSection[] = [\n  {\n    titulo: \"Gestão\",\n    items: [\n      {\n        kind: \"link\",\n        label: \"Painel inicial\",\n        href: \"/\",\n        permissao: \"dashboard.ver\",\n      },\n      {\n        kind: \"group\",\n        key: \"ordens\",\n        label: \"Ordens de Serviço\",\n        contador: \"os\",\n        children: [\n          {\n            kind: \"link\",\n            label: \"Todas as OS\",\n            href: \"/ordens\",\n            extra: \"›\",\n            permissao: \"ordens.ver\",\n          },\n          {\n            kind: \"link\",\n            label: \"Nova OS\",\n            href: \"/ordens/nova\",\n            extra: \"›\",\n            permissao: \"ordens.criar\",\n          },\n          {\n            kind: \"link\",\n            label: \"Relatórios OS\",\n            href: \"/relatorios\",\n            extra: \"›\",\n            permissao: \"relatorios.ver\",\n          },\n        ],\n      },\n      {\n        kind: \"link\",\n        label: \"Clientes\",\n        href: \"/clientes\",\n        extra: \"clientes\",\n        permissao: \"clientes.ver\",\n      },\n      {\n        kind: \"group\",\n        key: \"produtos\",\n        label: \"Produtos\",\n        contador: \"children\",\n        modulo: \"produtos\",\n        children: [\n          {\n            kind: \"link\",\n            label: \"Cadastro de produtos\",\n            href: \"/produtos\",\n            extra: \"›\",\n            permissao: \"produtos.ver\",\n            modulo: \"produtos\",\n          },\n          {\n            kind: \"link\",\n            label: \"Vendas produtos\",\n            href: \"/produtos/vendas\",\n            extra: \"›\",\n            permissao: \"vendas.ver\",\n            modulo: \"produtos\",\n          },\n          {\n            kind: \"link\",\n            label: \"Estoque\",\n            href: \"/produtos/estoque\",\n            extra: \"›\",\n            permissao: \"estoque.ver\",\n            modulo: \"produtos\",\n          },\n          {\n            kind: \"link\",\n            label: \"Relat. produtos\",\n            href: \"/produtos/relatorios\",\n            extra: \"›\",\n            permissao: [\"relatorios.ver\", \"relatorios.financeiro\"],\n            modulo: \"produtos\",\n          },\n        ],\n      },\n      {\n        kind: \"link\",\n        label: \"Estoque técnico\",\n        href: \"/estoque-tecnico\",\n        extra: \"›\",\n        permissao: \"estoque.ver\",\n      },\n    ],\n  },\n  {\n    titulo: \"Financeiro\",\n    items: [\n      {\n        kind: \"link\",\n        label: \"Financeiro geral\",\n        href: \"/financeiro-geral\",\n        extra: \"›\",\n        permissao: [\"relatorios.ver\", \"relatorios.financeiro\"],\n      },\n    ],\n  },\n  {\n    titulo: \"Controle\",\n    items: [\n      {\n        kind: \"link\",\n        label: \"Garantias\",\n        href: \"/garantias\",\n        extra: \"garantias\",\n        permissao: \"garantias.ver\",\n      },\n      {\n        kind: \"link\",\n        label: \"OS atrasadas\",\n        href: \"/ordens/atrasadas\",\n        extra: \"atrasadas\",\n        permissao: \"ordens.ver\",\n      },\n    ],\n  },\n  {\n    titulo: \"Sistema\",\n    items: [\n      {\n        kind: \"link\",\n        label: \"Configurações\",\n        href: \"/configuracoes\",\n        extra: \"›\",\n        permissao: \"configuracoes.editar\",\n      },\n      {\n        kind: \"link\",\n        label: \"Usuários do sistema\",\n        href: \"/usuarios-sistema\",\n        extra: \"›\",\n        permissao: \"usuarios.gerenciar\",\n      },\n    ],\n  },\n];\n\nfunction numeroSeguro(valor: unknown) {\n  const numero = Number(valor ?? 0);\n  return Number.isFinite(numero) ? numero : 0;\n}\n\nfunction itemAtivo(pathname: string, href: string) {\n  if (href === \"/\") return pathname === \"/\";\n  return pathname === href || pathname.startsWith(`${href}/`);\n}\n\nfunction primeiraLetra(valor: string) {\n  return valor.trim().charAt(0).toUpperCase() || \"N\";\n}\n\nfunction lerModuloProdutosCache() {\n  if (typeof window === \"undefined\") return true;\n\n  const valor = window.localStorage.getItem(\"nio-os-products-module-enabled\");\n  if (valor === null) return true;\n\n  return valor === \"true\";\n}\n\nexport default function SistemaFrame({ children }: { children: ReactNode }) {\n  const pathname = usePathname();\n  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();\n\n  const [dados, setDados] = useState<DashboardData | null>(null);\n  const [config, setConfig] = useState<ConfiguracoesSistema | null>(null);\n  const [productsModuleEnabled, setProductsModuleEnabled] = useState(\n    lerModuloProdutosCache\n  );\n  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({\n    ordens: pathname.startsWith(\"/ordens\") || pathname.startsWith(\"/relatorios\"),\n    produtos: pathname.startsWith(\"/produtos\"),\n  });\n\n  const secoesPermitidas = useMemo(() => {\n    if (carregandoPermissoes) return [];\n\n    function filtrarItem(item: MenuNode): MenuNode | null {\n      if (item.modulo === \"produtos\" && !productsModuleEnabled) {\n        return null;\n      }\n\n      if (item.kind === \"link\") {\n        return tem(item.permissao) ? item : null;\n      }\n\n      const filhos = item.children.filter((child) => {\n        if (child.modulo === \"produtos\" && !productsModuleEnabled) return false;\n        return tem(child.permissao);\n      });\n\n      if (filhos.length === 0) return null;\n\n      return {\n        ...item,\n        children: filhos,\n      };\n    }\n\n    return MENU_SECTIONS\n      .map((secao) => {\n        const items = secao.items\n          .map(filtrarItem)\n          .filter((item): item is MenuNode => item !== null);\n\n        return {\n          ...secao,\n          items,\n        };\n      })\n      .filter((secao) => secao.items.length > 0);\n  }, [carregandoPermissoes, productsModuleEnabled, tem]);\n\n  const nomeLoja =\n    config?.nomeFantasia?.trim() ||\n    config?.tradeName?.trim() ||\n    config?.nomeEmpresa?.trim() ||\n    config?.companyName?.trim() ||\n    \"Nio-OS\";\n\n  function valorExtra(extra?: MenuExtra) {\n    if (!extra) return \"\";\n    if (extra === \"›\") return extra;\n    if (!dados) return \"\";\n\n    if (extra === \"clientes\") return String(numeroSeguro(dados.clientes));\n    if (extra === \"garantias\") {\n      return String(numeroSeguro(dados.garantiasVencendo));\n    }\n    if (extra === \"atrasadas\") {\n      return String(numeroSeguro(dados.osAtrasadas));\n    }\n\n    return \"\";\n  }\n\n  function contadorGrupo(item: MenuGroup) {\n    if (item.contador === \"os\") {\n      return dados ? String(numeroSeguro(dados.osAbertas)) : \"\";\n    }\n\n    if (item.contador === \"children\") {\n      return String(item.children.length);\n    }\n\n    return \"\";\n  }\n\n  function grupoAtivo(item: MenuGroup) {\n    return item.children.some((child) => itemAtivo(pathname, child.href));\n  }\n\n  function alternarGrupo(key: string) {\n    setGruposAbertos((prev) => ({\n      ...prev,\n      [key]: !prev[key],\n    }));\n  }\n\n  function renderLink(item: MenuLeaf, nested = false) {\n    const ativo = itemAtivo(pathname, item.href);\n    const extra = valorExtra(item.extra);\n\n    return (\n      <Link\n        key={item.href}\n        href={item.href}\n        className={`flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-bold transition ${\n          nested\n            ? ativo\n              ? \"bg-blue-50 text-blue-700\"\n              : \"text-slate-700 hover:bg-slate-50\"\n            : ativo\n              ? \"bg-blue-50 text-blue-700\"\n              : \"text-slate-700 hover:bg-slate-50\"\n        }`}\n      >\n        <span>{item.label}</span>\n\n        {extra && (\n          <span\n            className={`rounded-full px-2 py-0.5 text-xs font-black ${\n              item.extra === \"atrasadas\"\n                ? \"text-red-700\"\n                : ativo\n                  ? \"bg-white text-blue-700\"\n                  : \"bg-slate-100 text-slate-500\"\n            }`}\n          >\n            {extra}\n          </span>\n        )}\n      </Link>\n    );\n  }\n\n  function renderNode(item: MenuNode, nested = false) {\n    if (item.kind === \"link\") {\n      return renderLink(item, nested);\n    }\n\n    const aberto = gruposAbertos[item.key] ?? false;\n    const ativo = grupoAtivo(item);\n    const contador = contadorGrupo(item);\n\n    return (\n      <div key={item.key} className=\"space-y-1\">\n        <button\n          type=\"button\"\n          onClick={() => alternarGrupo(item.key)}\n          className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-sm font-bold transition ${\n            ativo || aberto\n              ? \"bg-blue-50 text-blue-700\"\n              : \"text-slate-700 hover:bg-slate-50\"\n          }`}\n        >\n          <span>{item.label}</span>\n\n          <span className=\"flex items-center gap-2\">\n            {contador && (\n              <span\n                className={`rounded-full px-2 py-0.5 text-xs font-black ${\n                  ativo || aberto\n                    ? \"bg-white text-blue-700\"\n                    : \"bg-slate-100 text-slate-500\"\n                }`}\n              >\n                {contador}\n              </span>\n            )}\n\n            <span\n              className={`inline-block text-sm transition-transform ${\n                aberto ? \"rotate-90\" : \"\"\n              }`}\n            >\n              ›\n            </span>\n          </span>\n        </button>\n\n        {aberto && (\n          <div className=\"ml-3 space-y-1 border-l border-slate-200 pl-3\">\n            {item.children.map((child) => renderLink(child, true))}\n          </div>\n        )}\n      </div>\n    );\n  }\n\n  useEffect(() => {\n    setGruposAbertos((prev) => ({\n      ...prev,\n      ordens:\n        prev.ordens ||\n        pathname.startsWith(\"/ordens\") ||\n        pathname.startsWith(\"/relatorios\"),\n      produtos: prev.produtos || pathname.startsWith(\"/produtos\"),\n    }));\n  }, [pathname]);\n\n  useEffect(() => {\n    let ativo = true;\n\n    async function carregarConfiguracoes() {\n      try {\n        const response = await fetch(`/api/configuracoes?t=${Date.now()}`, {\n          cache: \"no-store\",\n          credentials: \"same-origin\",\n        });\n\n        const data = await response.json().catch(() => null);\n\n        if (!ativo || !response.ok || !data) return;\n\n        const moduloAtivo = data.productsModuleEnabled !== false;\n\n        setConfig(data);\n        setProductsModuleEnabled(moduloAtivo);\n\n        window.localStorage.setItem(\n          \"nio-os-products-module-enabled\",\n          String(moduloAtivo)\n        );\n      } catch {\n        if (ativo) {\n          setConfig(null);\n        }\n      }\n    }\n\n    async function carregarDashboard() {\n      if (carregandoPermissoes || !tem(\"dashboard.ver\")) {\n        if (ativo) setDados(null);\n        return;\n      }\n\n      try {\n        const response = await fetch(`/api/dashboard?t=${Date.now()}`, {\n          cache: \"no-store\",\n          credentials: \"same-origin\",\n        });\n\n        const data = await response.json().catch(() => null);\n\n        if (ativo) {\n          setDados(response.ok ? data : null);\n        }\n      } catch {\n        if (ativo) setDados(null);\n      }\n    }\n\n    carregarConfiguracoes();\n    carregarDashboard();\n\n    return () => {\n      ativo = false;\n    };\n  }, [pathname, carregandoPermissoes, tem]);\n\n  return (\n    <div className=\"min-h-screen bg-slate-100 text-slate-950 lg:flex\">\n      <aside className=\"fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-slate-200 bg-white lg:flex\">\n        <div className=\"border-b border-slate-100 p-5\">\n          <Link href=\"/\" className=\"flex items-center gap-3\">\n            <div className=\"flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200\">\n              <img\n                src=\"/uploads/logo.png\"\n                alt=\"Logo\"\n                className=\"h-full w-full object-contain\"\n                onError={(event) => {\n                  event.currentTarget.style.display = \"none\";\n                }}\n              />\n            </div>\n\n            <div className=\"min-w-0\">\n              <p className=\"line-clamp-1 text-xl font-black leading-none\">\n                {nomeLoja}\n              </p>\n\n              <span className=\"mt-1 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500\">\n                NIO-OS\n              </span>\n            </div>\n          </Link>\n        </div>\n\n        <nav className=\"flex-1 space-y-6 overflow-y-auto p-4\">\n          {secoesPermitidas.map((secao) => (\n            <div key={secao.titulo}>\n              <p className=\"mb-2 px-2 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400\">\n                {secao.titulo}\n              </p>\n\n              <div className=\"space-y-1\">\n                {secao.items.map((item) => renderNode(item))}\n              </div>\n            </div>\n          ))}\n        </nav>\n\n        <div className=\"border-t border-slate-100 p-3\">\n          <UsuarioLogadoBox />\n        </div>\n      </aside>\n\n      <div className=\"lg:hidden\">\n        <div className=\"sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white p-4\">\n          <Link href=\"/\" className=\"flex min-w-0 items-center gap-2\">\n            <div className=\"flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-600 font-black text-white\">\n              <img\n                src=\"/uploads/logo.png\"\n                alt=\"Logo\"\n                className=\"h-full w-full object-contain\"\n                onError={(event) => {\n                  event.currentTarget.outerHTML = primeiraLetra(nomeLoja);\n                }}\n              />\n            </div>\n\n            <strong className=\"line-clamp-1\">{nomeLoja}</strong>\n          </Link>\n\n          {!carregandoPermissoes && tem(\"ordens.criar\") && (\n            <Link\n              href=\"/ordens/nova\"\n              className=\"rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white\"\n            >\n              + Nova OS\n            </Link>\n          )}\n        </div>\n\n        <div className=\"border-b border-slate-200 bg-white p-3\">\n          <nav className=\"space-y-4\">\n            {secoesPermitidas.map((secao) => (\n              <div key={secao.titulo}>\n                <p className=\"mb-2 px-2 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400\">\n                  {secao.titulo}\n                </p>\n\n                <div className=\"space-y-1\">\n                  {secao.items.map((item) => renderNode(item))}\n                </div>\n              </div>\n            ))}\n          </nav>\n        </div>\n      </div>\n\n      <main className=\"min-w-0 flex-1 lg:ml-64\">{children}</main>\n    </div>\n  );\n}";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function sha256(text) {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(text, "utf8"))
    .digest("hex");
}

function validar(content) {
  const obrigatorios = [
    'key: "ordens"',
    'contador: "os"',
    'label: "Todas as OS"',
    'label: "Nova OS"',
    'label: "Relatórios OS"',
    'key: "produtos"',
    'contador: "children"',
    'function contadorGrupo(item: MenuGroup)',
  ];

  for (const trecho of obrigatorios) {
    if (!content.includes(trecho)) {
      throw new Error(`Validação final falhou: ${trecho} ausente.`);
    }
  }

  if ((content.match(/label: "Relatórios OS"/g) || []).length !== 1) {
    throw new Error("Relatórios OS deve existir somente dentro do grupo Ordens.");
  }

  if ((content.match(/label: "Nova OS"/g) || []).length !== 1) {
    throw new Error("Nova OS deve existir somente dentro do grupo Ordens.");
  }
}

function main() {
  if (!fs.existsSync(target)) {
    throw new Error("app/SistemaFrame.tsx não encontrado.");
  }

  const current = fs.readFileSync(target, "utf8");

  if (current === content) {
    validar(current);
    console.log(JSON.stringify({
      ok: true,
      stage: "MENU-GRUPOS-OS-PRODUTOS-V2",
      changed: false,
      reason: "ALREADY_APPLIED"
    }));
    return;
  }

  const actualSha = sha256(current);

  if (actualSha !== expectedSha) {
    throw new Error(
      `SistemaFrame.tsx mudou desde a coleta atual. Esperado ${expectedSha}, atual ${actualSha}. Nenhum arquivo foi alterado.`
    );
  }

  validar(content);

  const backup = `${target}.bak-menu-grupos-v2-${stamp}`;
  fs.copyFileSync(target, backup);
  fs.writeFileSync(target, content, "utf8");

  const final = fs.readFileSync(target, "utf8");
  validar(final);

  console.log(JSON.stringify({
    ok: true,
    stage: "MENU-GRUPOS-OS-PRODUTOS-V2",
    changed: true,
    file: "app/SistemaFrame.tsx",
    backup: path.basename(backup),
    ordens: {
      contador: "OS abertas",
      submenu: ["Todas as OS", "Nova OS", "Relatórios OS"]
    },
    produtos: {
      contador: "opções visíveis por permissão",
      submenu: ["Cadastro de produtos", "Vendas produtos", "Estoque", "Relat. produtos"]
    },
    databaseChanged: false,
    buildExecuted: false
  }));
}

main();
