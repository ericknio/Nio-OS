"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";
import {
  ModuloProdutosDesativado,
  useModuloProdutosAtivo,
} from "./ModuloProdutosGuard";

type Produto = {
  id: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  description?: string | null;
  imageUrl?: string | null;

  salePrice: number;
  costPrice: number;
  taxPercent: number;

  stockQuantity: number | null;
  minStock: number;
  isActive: boolean;

  taxAmount?: number;
  profitAmount?: number;
  marginPercent?: number;

  unlimitedStock?: boolean;
  lowStock?: boolean;
  soldQuantity?: number;
};

type Cliente = {
  id: string;
  name: string;
  whatsapp?: string | null;
  cpf?: string | null;
};

type LojaConfig = {
  nomeFantasia?: string | null;
  nomeEmpresa?: string | null;
  companyName?: string | null;
  telefone?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  documento?: string | null;
  cnpj?: string | null;
  endereco?: string | null;
  address?: string | null;
};

type ProdutosResponse = {
  message?: string;
  resumo?: {
    total: number;
    ativos: number;
    inativos: number;
    estoqueBaixo: number;
    estoqueIlimitado: number;
    semEstoque?: number;
    valorEstoque: number;
    lucroPotencial: number;
  };
  produtos?: Produto[];
  maisVendidos?: Produto[];
  menosVendidos?: Produto[];
};

type VendaCriada = {
  id: string;
  saleNumber: number;
  soldAt: string;
  customerName?: string | null;
  paymentMethod: string;
  subtotalAmount: number;
  discount: number;
  totalAmount: number;
  userName?: string | null;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
  }[];
};

type VendaResponse = {
  message?: string;
  venda?: VendaCriada;
};

type Filtros = {
  busca: string;
  status: string;
  estoque: string;
  categoria: string;
};

type CarrinhoItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  stockQuantity: number | null;
  unlimitedStock: boolean;
};

type VendaForm = {
  paymentMethod: string;
  customerId: string;
  customerName: string;
  discount: string;
  note: string;
};

const FILTROS_INICIAIS: Filtros = {
  busca: "",
  status: "ATIVOS",
  estoque: "TODOS",
  categoria: "",
};

const VENDA_INICIAL: VendaForm = {
  paymentMethod: "PIX",
  customerId: "",
  customerName: "",
  discount: "0",
  note: "",
};

const FORMAS_PAGAMENTO = [
  { value: "PIX", label: "PIX" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CARTAO", label: "Cartão" },
  { value: "PARCELADO", label: "Parcelado" },
];

import CardMensagem from "@/app/components/CardMensagem";
import { formatarMoeda, inteiro } from "@/lib/formatadores";
import { inputClass, textareaClass } from "@/lib/uiConstantes";

function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function estoqueTexto(produto: Produto) {
  if (produto.stockQuantity === null) return "Ilimitado";
  if (produto.stockQuantity === 0) return "Sem estoque";
  return `${produto.stockQuantity} un.`;
}

function classeEstoque(produto: Produto) {
  if (produto.stockQuantity === null) {
    return "bg-blue-50 text-blue-700 dark:text-blue-400 dark:bg-blue-900/30 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/30";
  }

  if (produto.lowStock) {
    return "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30";
  }

  return "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30";
}

function nomeFormaPagamento(forma: string) {
  return (
    FORMAS_PAGAMENTO.find((item) => item.value === forma)?.label || forma || "-"
  );
}

function imagemProdutoUrl(url?: string | null, versao = 0) {
  const valor = String(url || "").trim();

  if (!valor) return "";

  let urlFinal = valor;

  if (urlFinal.startsWith("/api/api/uploads/produtos/")) {
    urlFinal = urlFinal.replace(
      "/api/api/uploads/produtos/",
      "/api/uploads/produtos/"
    );
  } else if (urlFinal.startsWith("/api/upload/produtos/")) {
    urlFinal = urlFinal.replace(
      "/api/upload/produtos/",
      "/api/uploads/produtos/"
    );
  } else if (urlFinal.startsWith("/uploads/produtos/")) {
    urlFinal = urlFinal.replace(
      "/uploads/produtos/",
      "/api/uploads/produtos/"
    );
  }

  if (!versao) return urlFinal;

  const separador = urlFinal.includes("?") ? "&" : "?";

  return `${urlFinal}${separador}v=${versao}`;
}

function nomeLoja(config: LojaConfig | null) {
  return (
    config?.nomeFantasia ||
    config?.nomeEmpresa ||
    config?.companyName ||
    "Nio-OS"
  );
}

function imprimirReciboVenda(venda: VendaCriada, config: LojaConfig | null) {
  const data = new Date(venda.soldAt);

  const dataHora = Number.isNaN(data.getTime())
    ? new Date().toLocaleString("pt-BR")
    : data.toLocaleString("pt-BR");

  const loja = nomeLoja(config);
  const documento = config?.documento || config?.cnpj || "";
  const contato = config?.whatsapp || config?.telefone || config?.phone || "";
  const endereco = config?.endereco || config?.address || "";

  const itensHtml = venda.items
    .map(
      (item) => `
        <tr>
          <td colspan="3" class="produto">${item.productName}</td>
        </tr>
        <tr>
          <td>${item.quantity} x ${formatarMoeda(item.unitPrice)}</td>
          <td></td>
          <td class="direita">${formatarMoeda(item.totalAmount)}</td>
        </tr>
      `
    )
    .join("");

  const janela = window.open("", "_blank", "width=420,height=700");

  if (!janela) return;

  janela.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Recibo venda ${venda.saleNumber}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 4mm;
          }

          body {
            width: 72mm;
            margin: 0 auto;
            font-family: Arial, sans-serif;
            color: #000;
            font-size: 12px;
          }

          .centro {
            text-align: center;
          }

          .titulo {
            font-size: 16px;
            font-weight: 900;
            margin-bottom: 2px;
          }

          .subtitulo {
            font-size: 11px;
            line-height: 1.35;
          }

          .linha {
            border-top: 1px dashed #000;
            margin: 8px 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          td {
            padding: 2px 0;
            vertical-align: top;
          }

          .produto {
            font-weight: 800;
            padding-top: 5px;
          }

          .direita {
            text-align: right;
            white-space: nowrap;
          }

          .total {
            font-size: 16px;
            font-weight: 900;
          }

          .rodape {
            margin-top: 10px;
            text-align: center;
            font-size: 11px;
          }
        </style>
      </head>

      <body>
        <div class="centro">
          <div class="titulo">${loja}</div>
          ${documento ? `<div class="subtitulo">CNPJ/CPF: ${documento}</div>` : ""}
          ${contato ? `<div class="subtitulo">Contato: ${contato}</div>` : ""}
          ${endereco ? `<div class="subtitulo">Endereço: ${endereco}</div>` : ""}
          <div class="subtitulo">Recibo de venda</div>
        </div>

        <div class="linha"></div>

        <table>
          <tr>
            <td>Venda:</td>
            <td class="direita">Nº ${String(venda.saleNumber).padStart(3, "0")}</td>
          </tr>
          <tr>
            <td>Data:</td>
            <td class="direita">${dataHora}</td>
          </tr>
          <tr>
            <td>Cliente:</td>
            <td class="direita">${venda.customerName || "Consumidor"}</td>
          </tr>
          <tr>
            <td>Vendedor:</td>
            <td class="direita">${venda.userName || "Sistema"}</td>
          </tr>
          <tr>
            <td>Pagamento:</td>
            <td class="direita">${nomeFormaPagamento(venda.paymentMethod)}</td>
          </tr>
        </table>

        <div class="linha"></div>

        <table>
          ${itensHtml}
        </table>

        <div class="linha"></div>

        <table>
          <tr>
            <td>Subtotal</td>
            <td class="direita">${formatarMoeda(venda.subtotalAmount)}</td>
          </tr>
          <tr>
            <td>Desconto</td>
            <td class="direita">${formatarMoeda(venda.discount)}</td>
          </tr>
          <tr>
            <td class="total">TOTAL</td>
            <td class="direita total">${formatarMoeda(venda.totalAmount)}</td>
          </tr>
        </table>

        <div class="linha"></div>

        <div class="rodape">
          Obrigado pela preferência.
        </div>

        <script>
          window.onload = function () {
            window.print();
          };
        </script>
      </body>
    </html>
  `);

  janela.document.close();
}


function CardResumo({
  titulo,
  valor,
  detalhe,
  destaque = "slate",
}: {
  titulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  destaque?: "blue" | "green" | "red" | "orange" | "slate";
}) {
  const cor =
    destaque === "blue"
      ? "text-blue-700 dark:text-blue-400"
      : destaque === "green"
        ? "text-green-700 dark:text-green-400"
        : destaque === "red"
          ? "text-red-700 dark:text-red-400"
          : destaque === "orange"
            ? "text-orange-600"
            : "text-slate-950 dark:text-slate-100";

  const valorTexto =
    typeof valor === "string" || typeof valor === "number" ? String(valor) : "";

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{titulo}</p>

      <strong
        className={`mt-2 block break-words leading-tight ${cor} ${
          valorTexto.length > 9 ? "text-2xl" : "text-4xl"
        }`}
      >
        {valor}
      </strong>

      {detalhe && (
        <div className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
          {detalhe}
        </div>
      )}
    </div>
  );
}

function CampoTexto({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: "text" | "number";
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label}
      </label>

      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </div>
  );
}

function RankingCard({
  titulo,
  produtos,
  vazio,
}: {
  titulo: string;
  produtos: Produto[];
  vazio: string;
}) {
  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <h2 className="text-xl font-black tracking-tight">{titulo}</h2>

      {produtos.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-sm font-bold text-slate-500 dark:text-slate-400">
          {vazio}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {produtos.map((produto, index) => (
            <div
              key={produto.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100"
            >
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-black text-slate-900 dark:text-white">
                  {index + 1}. {produto.name}
                </p>

                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {produto.category || "Sem categoria"}
                </p>
              </div>

              <strong className="shrink-0 rounded-full bg-white dark:bg-slate-900 px-3 py-1 text-xs font-black text-blue-700 dark:text-blue-400 ring-1 ring-slate-200 dark:ring-slate-800">
                {produto.soldQuantity || 0} venda(s)
              </strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ProdutosPage() {
  const { carregando: carregandoPermissoes, tem } =
    useUsuarioPermissoes();

  const { carregandoModuloProdutos, moduloProdutosAtivo } =
    useModuloProdutosAtivo();

  const podeAcessar =
    !carregandoPermissoes && tem(["produtos.ver", "estoque.ver", "vendas.ver"]);
  const podeCriarProduto = !carregandoPermissoes && tem("produtos.criar");
  const podeEditarProduto = !carregandoPermissoes && tem("produtos.editar");
  const podeExcluirProduto = !carregandoPermissoes && tem("produtos.excluir");
  const podeRegistrarVenda = !carregandoPermissoes && tem("vendas.registrar");
  const podeVerVendasProdutos = !carregandoPermissoes && tem("vendas.ver");
  const podeVerEstoque =
    !carregandoPermissoes && tem(["estoque.ver", "produtos.ver"]);
  const podeVerRelatorioProdutos =
    !carregandoPermissoes &&
    tem(["relatorios.ver", "relatorios.financeiro"]);
  const financeiroSensivelLiberado =
    !carregandoPermissoes && tem("relatorios.financeiro");

  const [config, setConfig] = useState<LojaConfig | null>(null);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [maisVendidos, setMaisVendidos] = useState<Produto[]>([]);
  const [menosVendidos, setMenosVendidos] = useState<Produto[]>([]);
  const [resumo, setResumo] = useState<ProdutosResponse["resumo"] | null>(null);

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);

  const [produtoVendaId, setProdutoVendaId] = useState("");
  const [produtoBuscaVenda, setProdutoBuscaVenda] = useState("");
  const [quantidadeVenda, setQuantidadeVenda] = useState("1");
  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>([]);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteBusca, setClienteBusca] = useState("");
  const [carregandoClientes, setCarregandoClientes] = useState(false);

  const [formVenda, setFormVenda] = useState<VendaForm>(VENDA_INICIAL);
  const [imprimirRecibo, setImprimirRecibo] = useState(false);

  const [carregando, setCarregando] = useState(true);
  const [registrandoVenda, setRegistrandoVenda] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const subtotalVenda = useMemo(() => {
    return carrinho.reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0
    );
  }, [carrinho]);

  const descontoVenda = Math.min(numero(formVenda.discount), subtotalVenda);
  const totalVenda = Math.max(0, subtotalVenda - descontoVenda);

  const produtosVendaFiltrados = useMemo(() => {
    const busca = produtoBuscaVenda.trim().toLowerCase();

    return produtos
      .filter((produto) => produto.isActive)
      .filter((produto) => {
        if (!busca) return true;

        return [produto.name, produto.sku, produto.category]
          .filter(Boolean)
          .some((campo) => String(campo).toLowerCase().includes(busca));
      })
      .slice(0, 8);
  }, [produtos, produtoBuscaVenda]);

  function atualizarFiltro(campo: keyof Filtros, valor: string) {
    setFiltros((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  function atualizarVenda(campo: keyof VendaForm, valor: string) {
    setFormVenda((atual) => ({
      ...atual,
      [campo]: valor,
    }));

    setMensagem("");
  }

  async function carregarConfiguracoes() {
    try {
      const response = await fetch("/api/configuracoes", {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (response.ok) {
        setConfig(data);
      }
    } catch {
      setConfig(null);
    }
  }

  async function carregarProdutos(filtrosBusca = filtros) {
    try {
      setCarregando(true);
      setMensagem("");

      const params = new URLSearchParams();

      if (filtrosBusca.busca.trim()) {
        params.set("busca", filtrosBusca.busca.trim());
      }

      if (filtrosBusca.categoria.trim()) {
        params.set("categoria", filtrosBusca.categoria.trim());
      }

      params.set("status", filtrosBusca.status);
      params.set("estoque", filtrosBusca.estoque);

      const response = await fetch(`/api/produtos?${params.toString()}`, {
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | ProdutosResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar produtos.");
        setProdutos([]);
        return;
      }

      setProdutos(Array.isArray(data?.produtos) ? data.produtos : []);
      setMaisVendidos(
        Array.isArray(data?.maisVendidos) ? data.maisVendidos : []
      );
      setMenosVendidos(
        Array.isArray(data?.menosVendidos) ? data.menosVendidos : []
      );
      setResumo(data?.resumo || null);
    } catch {
      setMensagem("Erro ao carregar produtos.");
      setProdutos([]);
    } finally {
      setCarregando(false);
    }
  }

  function normalizarClienteApi(item: any): Cliente | null {
  const id = String(item?.id || "").trim();
  const name = String(item?.name || item?.nome || "").trim();

  if (!id || !name) return null;

  return {
    id,
    name,
    whatsapp: item?.whatsapp || item?.telefone || null,
    cpf: item?.cpf || null,
  };
}

  async function buscarClientes(valor: string) {
  setClienteBusca(valor);
  setMensagem("");

  if (!valor.trim()) {
    setClientes([]);
    setFormVenda((atual) => ({
      ...atual,
      customerId: "",
      customerName: "",
    }));
    return;
  }

  try {
    setCarregandoClientes(true);

    const params = new URLSearchParams();

    params.set("busca", valor.trim());
    params.set("search", valor.trim());
    params.set("q", valor.trim());

    const response = await fetch(`/api/clientes?${params.toString()}`, {
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    const origem = Array.isArray(data)
      ? data
      : Array.isArray(data?.clientes)
        ? data.clientes
        : Array.isArray(data?.customers)
          ? data.customers
          : Array.isArray(data?.data)
            ? data.data
            : [];

    const lista = origem
      .map(normalizarClienteApi)
      .filter(Boolean)
      .slice(0, 6) as Cliente[];

    setClientes(lista);

    setFormVenda((atual) => ({
      ...atual,
      customerId: "",
      customerName: valor,
    }));
  } catch {
    setClientes([]);

    setFormVenda((atual) => ({
      ...atual,
      customerId: "",
      customerName: valor,
    }));
  } finally {
    setCarregandoClientes(false);
  }
}

  

  function selecionarCliente(cliente: Cliente) {
    setClienteBusca(cliente.name);

    setFormVenda((atual) => ({
      ...atual,
      customerId: cliente.id,
      customerName: cliente.name,
    }));

    setClientes([]);
  }

  async function inativarProduto(produto: Produto) {
    const confirmou = window.confirm(
      `Deseja inativar o produto "${produto.name}"? Ele não aparecerá como ativo para venda.`
    );

    if (!confirmou) return;

    try {
      setMensagem("");

      const response = await fetch(`/api/produtos/${produto.id}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao inativar produto.");
        return;
      }

      setMensagem(data?.message || "Produto inativado com sucesso.");
      await carregarProdutos();
    } catch {
      setMensagem("Erro ao inativar produto.");
    }
  }

  function adicionarProdutoVenda(produto?: Produto) {
    const produtoEscolhido =
      produto || produtos.find((item) => item.id === produtoVendaId) || null;

    if (!produtoEscolhido) {
      setMensagem("Selecione um produto para adicionar à venda.");
      return;
    }

    if (!produtoEscolhido.isActive) {
      setMensagem("Produto inativo não pode ser vendido.");
      return;
    }

    const quantidade = inteiro(quantidadeVenda || 1);

    if (quantidade <= 0) {
      setMensagem("Informe uma quantidade válida.");
      return;
    }

    const jaExiste = carrinho.find(
      (item) => item.productId === produtoEscolhido.id
    );

    const quantidadeAtual = jaExiste?.quantity || 0;
    const novaQuantidade = quantidadeAtual + quantidade;
    if (
      produtoEscolhido.stockQuantity !== null &&
      novaQuantidade > produtoEscolhido.stockQuantity
    ) {
      setMensagem(
        `Estoque insuficiente para ${produtoEscolhido.name}. Disponível: ${produtoEscolhido.stockQuantity}.`
      );
      return;
    }

    setCarrinho((atual) => {
      if (jaExiste) {
        return atual.map((item) =>
          item.productId === produtoEscolhido.id
            ? {
                ...item,
                quantity: novaQuantidade,
              }
            : item
        );
      }

      return [
        ...atual,
        {
          productId: produtoEscolhido.id,
          name: produtoEscolhido.name,
          quantity: quantidade,
          unitPrice: numero(produtoEscolhido.salePrice),
          stockQuantity: produtoEscolhido.stockQuantity,
          unlimitedStock: produtoEscolhido.stockQuantity === null,
        },
      ];
    });

    setProdutoVendaId("");
    setProdutoBuscaVenda("");
    setQuantidadeVenda("1");
    setMensagem("");
  }

  function removerItemCarrinho(productId: string) {
    setCarrinho((atual) => atual.filter((item) => item.productId !== productId));
  }

  async function registrarVenda() {
    if (carrinho.length === 0) {
      setMensagem("Adicione pelo menos um produto à venda.");
      return;
    }

    if (totalVenda <= 0) {
      setMensagem("O total da venda precisa ser maior que zero.");
      return;
    }

    try {
      setRegistrandoVenda(true);
      setMensagem("");

      const response = await fetch("/api/vendas-produtos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentMethod: formVenda.paymentMethod,
          customerId: formVenda.customerId || null,
          customerName: formVenda.customerName,
          discount: descontoVenda,
          note: formVenda.note,
          items: carrinho.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | VendaResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao registrar venda.");
        return;
      }

      setMensagem(data?.message || "Venda registrada com sucesso.");

      if (imprimirRecibo && data?.venda) {
        imprimirReciboVenda(data.venda, config);
      }

      setCarrinho([]);
      setFormVenda(VENDA_INICIAL);
      setClienteBusca("");
      setClientes([]);

      await carregarProdutos();
    } catch {
      setMensagem("Erro ao registrar venda.");
    } finally {
      setRegistrandoVenda(false);
    }
  }

  function limparFiltros() {
    setFiltros(FILTROS_INICIAIS);
    carregarProdutos(FILTROS_INICIAIS);
  }

  function alternarImpressaoRecibo(valor: boolean) {
    setImprimirRecibo(valor);
    localStorage.setItem("nio_os_imprimir_recibo_produto", valor ? "sim" : "nao");
  }

  useEffect(() => {
    const preferencia = localStorage.getItem("nio_os_imprimir_recibo_produto");
    setImprimirRecibo(preferencia === "sim");
    carregarConfiguracoes();
  }, []);

  useEffect(() => {
    if (carregandoPermissoes || carregandoModuloProdutos) return;

    if (podeAcessar && moduloProdutosAtivo) {
      carregarProdutos();
    } else {
      setCarregando(false);
    }
  }, [
    carregandoPermissoes,
    carregandoModuloProdutos,
    podeAcessar,
    moduloProdutosAtivo,
  ]);

  if (carregandoPermissoes || carregandoModuloProdutos || carregando) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Carregando produtos...
        </section>
      </main>
    );
  }

  if (!moduloProdutosAtivo) {
    return (
      <ModuloProdutosDesativado
        titulo="Produtos desativados"
        descricao="Produtos, estoque, vendas rápidas e rankings estão desativados nas configurações do sistema."
      />
    );
  }

  if (!podeAcessar) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
          Você não tem permissão para acessar produtos.
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">
                Produtos e estoque
              </p>

              <h1 className="text-3xl font-black tracking-tight">Produtos</h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Consulte produtos, acompanhe estoque, registre vendas e veja os
                itens mais vendidos e menos vendidos.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {podeCriarProduto && (
                <Link
                  href="/produtos/novo"
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                >
                  + Cadastrar produto
                </Link>
              )}
              {podeVerRelatorioProdutos && (
  <Link
    href="/produtos/relatorios"
    className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
  >
    Relatórios
  </Link>
)}
              {podeVerEstoque && (
  <Link
    href="/produtos/estoque"
    className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
  >
    Estoque
  </Link>
)}
             {podeVerVendasProdutos && (
                <Link
                  href="/produtos/vendas"
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                >
                  Vendas
                </Link>
              )}
              <button
                type="button"
                onClick={() => carregarProdutos()}
                disabled={carregando}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Atualizar
              </button>

              <Link
                href="/"
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
              >
                Painel inicial
              </Link>
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <CardResumo
            titulo="Produtos"
            valor={resumo?.ativos || 0}
            detalhe="Ativos"
            destaque="blue"
          />

          <CardResumo
            titulo="Estoque baixo"
            valor={resumo?.estoqueBaixo || 0}
            detalhe="Precisam atenção"
            destaque="red"
          />

          <CardResumo
            titulo="Ilimitados"
            valor={resumo?.estoqueIlimitado || 0}
            detalhe="Sem controle físico"
          />

          <CardResumo
            titulo="Valor estoque"
            valor={formatarMoeda(resumo?.valorEstoque || 0)}
            detalhe="Preço de venda"
            destaque="green"
          />

          {financeiroSensivelLiberado && (
            <>
              <CardResumo
                titulo="Lucro potencial"
                valor={formatarMoeda(resumo?.lucroPotencial || 0)}
                detalhe="Estimativa"
                destaque="green"
              />
            </>
          )}

          <CardResumo
            titulo="Inativos"
            valor={resumo?.inativos || 0}
            detalhe="Ocultos da venda"
            destaque="orange"
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-bold text-blue-600">Consulta</p>

                <h2 className="text-2xl font-black tracking-tight">
                  Lista de produtos
                </h2>

                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Busque pelo nome, código, categoria ou filtre pelo estoque.
                </p>
              </div>

              <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 dark:text-blue-400 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-500/30">
                {produtos.length} produto(s) encontrado(s)
              </div>
            </div>

            <div className="mb-5 rounded-3xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-200 dark:ring-slate-800">
              <div className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr_0.65fr_0.75fr]">
                <div>
                  <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                    Buscar produto
                  </label>

                  <input
                    value={filtros.busca}
                    onChange={(event) =>
                      atualizarFiltro("busca", event.target.value)
                    }
                    placeholder="Nome, código ou categoria..."
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                    Categoria
                  </label>

                  <input
                    value={filtros.categoria}
                    onChange={(event) =>
                      atualizarFiltro("categoria", event.target.value)
                    }
                    placeholder="Ex.: carregador"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                    Status
                  </label>

                  <select
                    value={filtros.status}
                    onChange={(event) =>
                      atualizarFiltro("status", event.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="ATIVOS">Ativos</option>
                    <option value="INATIVOS">Inativos</option>
                    <option value="TODOS">Todos</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                    Estoque
                  </label>

                  <select
                    value={filtros.estoque}
                    onChange={(event) =>
                      atualizarFiltro("estoque", event.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="TODOS">Todo estoque</option>
                    <option value="BAIXO">Estoque baixo</option>
                    <option value="ILIMITADO">Ilimitado</option>
                    <option value="SEM_ESTOQUE">Sem estoque</option>
                    <option value="CONTROLADO">Controlado</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => carregarProdutos()}
                  className="rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
                >
                  🔎 Buscar produtos
                </button>

                <button
                  type="button"
                  onClick={limparFiltros}
                  className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 text-sm font-black text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
                >
                  Limpar filtros
                </button>
              </div>
            </div>

            {produtos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                Nenhum produto encontrado.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {produtos.map((produto) => (
                  <article
                    key={produto.id}
                    className={`rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ${
                      produto.lowStock
                        ? "ring-red-200"
                        : produto.isActive
                          ? "ring-slate-200 dark:ring-slate-800"
                          : "ring-slate-300 dark:ring-slate-700 opacity-70"
                    }`}
                  >
                    <div className="flex gap-4">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-50 dark:bg-slate-800/50 ring-1 ring-slate-100">
                        {produto.imageUrl ? (
                          <img
  key={produto.imageUrl || produto.id}
  src={imagemProdutoUrl(produto.imageUrl)}
  alt={produto.name}
  className="h-full w-full object-cover"
  onLoad={(event) => {
    event.currentTarget.style.visibility = "visible";
  }}
  onError={(event) => {
    event.currentTarget.style.visibility = "hidden";
  }}
/>
                        ) : (
                          <span className="text-xs font-black text-slate-400">
                            Sem foto
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="line-clamp-1 text-base font-black">
                            {produto.name}
                          </h3>

                          {!produto.isActive && (
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-black text-slate-500 dark:text-slate-400">
                              Inativo
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {produto.category || "Sem categoria"}
                        </p>

                        {produto.sku && (
                          <p className="mt-1 text-xs font-bold text-slate-400">
                            SKU: {produto.sku}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-3 ring-1 ring-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Venda
                        </p>
                        <p className="mt-1 text-sm font-black text-green-700 dark:text-green-400">
                          {formatarMoeda(produto.salePrice)}
                        </p>
                      </div>

                      {financeiroSensivelLiberado && (
                        <>
                          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-3 ring-1 ring-slate-100">
                            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                              Lucro
                            </p>
                            <p
                              className={`mt-1 text-sm font-black ${
                                numero(produto.profitAmount) >= 0
                                  ? "text-green-700 dark:text-green-400"
                                  : "text-red-700 dark:text-red-400"
                              }`}
                            >
                              {formatarMoeda(produto.profitAmount)}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-3 ring-1 ring-slate-100">
                            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                              Imposto
                            </p>
                            <p className="mt-1 text-sm font-black text-orange-600">
                              {numero(produto.taxPercent).toFixed(1)}%
                            </p>
                          </div>
                        </>
                      )}

                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-3 ring-1 ring-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Vendas
                        </p>
                        <p className="mt-1 text-sm font-black text-blue-700 dark:text-blue-400">
                          {produto.soldQuantity || 0}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${classeEstoque(
                          produto
                        )}`}
                      >
                        {estoqueTexto(produto)}
                      </span>

                      {produto.lowStock && (
                        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:bg-red-900/20 dark:ring-red-500/30">
                          Estoque baixo
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {podeRegistrarVenda && produto.isActive && (
                        <button
                          type="button"
                          onClick={() => adicionarProdutoVenda(produto)}
                          className="rounded-xl bg-green-600 px-4 py-2 text-xs font-black text-white hover:bg-green-700"
                        >
                          Vender
                        </button>
                      )}

                      {podeEditarProduto && (
                        <Link
                          href={`/produtos/novo?id=${produto.id}`}
                          className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700"
                        >
                          Editar
                        </Link>
                      )}

                      {podeExcluirProduto && produto.isActive && (
                        <button
                          type="button"
                          onClick={() => inativarProduto(produto)}
                          className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white hover:bg-red-700"
                        >
                          Inativar
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {podeRegistrarVenda && (
            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 xl:sticky xl:top-6 xl:self-start">
              <div className="mb-5">
                <p className="text-sm font-bold text-blue-600">Venda rápida</p>

                <h2 className="text-2xl font-black tracking-tight">
                  Registrar venda
                </h2>

                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Pesquise o produto, adicione ao carrinho e finalize a venda.
                </p>
              </div>

              <div className="space-y-4">
                                <div className="rounded-3xl bg-blue-50 p-4 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-500/30">
                  <div className="mb-3">
                    <p className="text-sm font-black text-blue-800">
                      1. Escolha o produto
                    </p>

                    <p className="mt-1 text-xs font-bold text-blue-600">
                      Digite parte do nome e clique no produto encontrado.
                    </p>
                  </div>

                  <input
                    value={produtoBuscaVenda}
                    onChange={(event) => {
                      setProdutoBuscaVenda(event.target.value);
                      setProdutoVendaId("");
                    }}
                    placeholder="Digite o nome do produto..."
                    className="w-full rounded-2xl border border-blue-200 bg-white dark:bg-slate-900 px-4 py-4 text-base font-black text-slate-900 dark:text-white outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />

                  {produtoBuscaVenda && produtosVendaFiltrados.length > 0 && (
                    <div className="mt-3 max-h-72 overflow-auto rounded-2xl bg-white dark:bg-slate-900 p-2 ring-1 ring-blue-200">
                      {produtosVendaFiltrados.map((produto) => (
                        <button
                          key={produto.id}
                          type="button"
                          onClick={() => {
                            setProdutoVendaId(produto.id);
                            setProdutoBuscaVenda(produto.name);
                          }}
                          className={`mb-2 flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-blue-50 ${
                            produtoVendaId === produto.id
                              ? "bg-blue-50 ring-2 ring-blue-300"
                              : "bg-slate-50 dark:bg-slate-800/50 ring-1 ring-slate-100"
                          }`}
                        >
                          <span className="min-w-0">
                            <strong className="line-clamp-1 block text-sm font-black text-slate-950 dark:text-slate-100">
                              {produto.name}
                            </strong>

                            <small className="mt-1 block text-xs font-bold text-slate-500 dark:text-slate-400">
                              Estoque: {estoqueTexto(produto)}
                            </small>
                          </span>

                          <span className="shrink-0 rounded-xl bg-green-50 px-3 py-2 text-sm font-black text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:bg-green-900/20 dark:ring-green-500/30">
                            {formatarMoeda(produto.salePrice)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {produtoBuscaVenda && produtosVendaFiltrados.length === 0 && (
                    <p className="mt-3 rounded-2xl bg-white dark:bg-slate-900 p-3 text-sm font-bold text-red-700 dark:text-red-400 ring-1 ring-red-200">
                      Nenhum produto encontrado com esse nome.
                    </p>
                  )}
                </div>

                <div className="rounded-3xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-200 dark:ring-slate-800">
                  <p className="mb-3 text-sm font-black text-slate-800 dark:text-slate-300">
                    2. Quantidade
                  </p>

                  <div className="grid grid-cols-[52px_1fr_52px] gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setQuantidadeVenda((atual) =>
                          String(Math.max(1, inteiro(atual) - 1))
                        )
                      }
                      className="rounded-2xl bg-white dark:bg-slate-900 text-2xl font-black text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
                    >
                      −
                    </button>

                    <input
                      type="number"
                      min="1"
                      value={quantidadeVenda}
                      onChange={(event) => setQuantidadeVenda(event.target.value)}
                      className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 text-center text-xl font-black outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setQuantidadeVenda((atual) => String(inteiro(atual) + 1))
                      }
                      className="rounded-2xl bg-white dark:bg-slate-900 text-2xl font-black text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
                    >
                      +
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => adicionarProdutoVenda()}
                  className="w-full rounded-2xl bg-green-600 px-5 py-5 text-base font-black text-white shadow-lg shadow-green-600/20 transition hover:bg-green-700"
                >
                  🛒 Adicionar ao carrinho
                </button>

                {carrinho.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                    Nenhum produto adicionado.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {carrinho.map((item) => (
                      <div
                        key={item.productId}
                        className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              {item.name}
                            </p>

                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {item.quantity} x {formatarMoeda(item.unitPrice)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => removerItemCarrinho(item.productId)}
                            className="rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-700 dark:text-red-400 hover:bg-red-100"
                          >
                            Remover
                          </button>
                        </div>

                        <p className="mt-2 text-sm font-black text-green-700 dark:text-green-400">
                          {formatarMoeda(item.quantity * item.unitPrice)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                      Forma de pagamento
                    </label>

                    <select
                      value={formVenda.paymentMethod}
                      onChange={(event) =>
                        atualizarVenda("paymentMethod", event.target.value)
                      }
                      className={inputClass}
                    >
                      {FORMAS_PAGAMENTO.map((forma) => (
                        <option key={forma.value} value={forma.value}>
                          {forma.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <CampoTexto
                    label="Desconto"
                    type="number"
                    value={formVenda.discount}
                    disabled={registrandoVenda}
                    onChange={(valor) => atualizarVenda("discount", valor)}
                    placeholder="0,00"
                  />

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                      Cliente
                    </label>

                    <input
                      value={clienteBusca}
                      disabled={registrandoVenda}
                      onChange={(event) => buscarClientes(event.target.value)}
                      placeholder="Pesquisar cliente cadastrado ou deixar sem cliente"
                      className={inputClass}
                    />

                    {carregandoClientes && (
                      <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                        Buscando clientes...
                      </p>
                    )}

                    {clientes.length > 0 && (
                      <div className="mt-2 max-h-48 overflow-auto rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-2 ring-1 ring-slate-200 dark:ring-slate-800">
                        {clientes.map((cliente) => (
                          <button
                            key={cliente.id}
                            type="button"
                            onClick={() => selecionarCliente(cliente)}
                            className="mb-1 flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold hover:bg-white dark:bg-slate-900"
                          >
                            <span className="line-clamp-1">{cliente.name}</span>
                            <span className="shrink-0 text-slate-500 dark:text-slate-400">
                              {cliente.whatsapp || cliente.cpf || ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Pode escolher um cliente cadastrado ou vender sem cliente.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                      Observação
                    </label>

                    <textarea
                      rows={2}
                      value={formVenda.note}
                      disabled={registrandoVenda}
                      onChange={(event) =>
                        atualizarVenda("note", event.target.value)
                      }
                      placeholder="Opcional"
                      className={textareaClass}
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 text-sm font-bold text-slate-700 dark:text-slate-200 ring-1 ring-slate-100">
                  <span>
                    Imprimir recibo ao finalizar
                    <small className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Recibo estilo cupom para impressora pequena.
                    </small>
                  </span>

                  <input
                    type="checkbox"
                    checked={imprimirRecibo}
                    onChange={(event) =>
                      alternarImpressaoRecibo(event.target.checked)
                    }
                    className="h-5 w-5"
                  />
                </label>

                <div className="rounded-3xl bg-slate-950 p-5 text-white">
                  <div className="flex justify-between text-sm font-semibold text-slate-300">
                    <span>Subtotal</span>
                    <span>{formatarMoeda(subtotalVenda)}</span>
                  </div>

                  <div className="mt-2 flex justify-between text-sm font-semibold text-slate-300">
                    <span>Desconto</span>
                    <span>{formatarMoeda(descontoVenda)}</span>
                  </div>

                  <div className="mt-4 flex justify-between border-t border-white/10 pt-4">
                    <span className="text-sm font-black">Total</span>
                    <strong className="text-2xl">
                      {formatarMoeda(totalVenda)}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={registrarVenda}
                  disabled={registrandoVenda || carrinho.length === 0}
                  className="w-full rounded-2xl bg-green-600 px-5 py-5 text-lg font-black text-white shadow-lg shadow-green-600/20 transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {registrandoVenda
                    ? "Registrando..."
                    : `✅ Finalizar venda - ${formatarMoeda(totalVenda)}`}
                </button>
              </div>
            </section>
          )}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <RankingCard
            titulo="Top 5 mais vendidos"
            produtos={maisVendidos}
            vazio="Nenhuma venda registrada ainda."
          />

          <RankingCard
            titulo="Top 5 menos vendidos"
            produtos={menosVendidos}
            vazio="Nenhum produto cadastrado ainda."
          />
        </section>
      </section>
    </main>
  );
}
