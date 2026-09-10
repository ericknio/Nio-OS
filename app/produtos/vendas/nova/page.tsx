/**
 * @file app/produtos/vendas/nova/page.tsx
 * @description Tela de Frente de Caixa e PDV Balcão para Venda Rápida de Produtos (Frontend).
 * 
 * Funcionalidades:
 * - Interface otimizada para operador de caixa com suporte a leitor de código de barras (SKU) e atalhos de teclado.
 * - Carrinho dinâmico de compras com cálculo de subtotal, descontos e total líquido em tempo real.
 * - Suporte a múltiplos meios de pagamento (Dinheiro, PIX, Cartão e Parcelado).
 * - Calculadora de troco automática quando o meio de pagamento for Dinheiro.
 * - Impressão automática de comprovante térmico não-fiscal (80mm) após confirmação da venda.
 * - Abate imediato do estoque físico com registro de log de saída comercial.
 */

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";
import CardMensagem from "@/app/components/CardMensagem";
import { formatarMoeda, inteiro } from "@/lib/formatadores";
import {
  ModuloProdutosDesativado,
  useModuloProdutosAtivo,
} from "../../ModuloProdutosGuard";

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
  tradeName?: string | null;
  telefone?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  documento?: string | null;
  cnpj?: string | null;
  endereco?: string | null;
  address?: string | null;
  logoUrl?: string | null;
};

type ProdutosResponse = {
  message?: string;
  produtos?: Produto[];
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

type CarrinhoItem = {
  productId: string;
  name: string;
  sku?: string | null;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  stockQuantity: number | null;
  unlimitedStock: boolean;
};

type Atendente = {
  id: string;
  name: string;
  username: string;
};

type VendaForm = {
  paymentMethod: string;
  customerId: string;
  customerName: string;
  attendantUserId: string;
  discount: string;
  note: string;
};

const VENDA_INICIAL: VendaForm = {
  paymentMethod: "DINHEIRO",
  customerId: "",
  customerName: "",
  attendantUserId: "",
  discount: "0",
  note: "",
};

const FORMAS_PAGAMENTO = [
  { value: "DINHEIRO", label: "Dinheiro", icone: "💵" },
  { value: "PIX", label: "PIX", icone: "⚡" },
  { value: "CARTAO", label: "Cartão", icone: "💳" },
  { value: "PARCELADO", label: "Parcelado", icone: "📑" },
];

function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function estoqueTexto(produto: Produto) {
  if (produto.stockQuantity === null) return "Estoque Ilimitado";
  if (produto.stockQuantity === 0) return "Sem estoque";
  return `${produto.stockQuantity} em estoque`;
}

function nomeFormaPagamento(forma: string) {
  return (
    FORMAS_PAGAMENTO.find((item) => item.value === forma)?.label || forma || "-"
  );
}

function nomeLoja(config: LojaConfig | null) {
  return (
    config?.nomeFantasia ||
    config?.tradeName ||
    config?.nomeEmpresa ||
    config?.companyName ||
    "Nio-OS"
  );
}

function imprimirReciboVenda(
  venda: VendaCriada,
  config: LojaConfig | null,
  detalhesTroco?: { recebido?: number; troco?: number }
) {
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
        <title>Recibo Venda ${venda.saleNumber}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 4mm;
          }
          body {
            width: 72mm;
            margin: 0 auto;
            font-family: 'Courier New', Courier, monospace, Arial, sans-serif;
            color: #000;
            font-size: 12px;
          }
          .centro { text-align: center; }
          .titulo { font-size: 15px; font-weight: 900; margin-bottom: 2px; text-transform: uppercase; }
          .subtitulo { font-size: 11px; line-height: 1.3; }
          .linha { border-top: 1px dashed #000; margin: 6px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 2px 0; vertical-align: top; }
          .produto { font-weight: bold; padding-top: 4px; }
          .direita { text-align: right; white-space: nowrap; }
          .total { font-size: 15px; font-weight: 900; }
          .destaque-troco { font-size: 13px; font-weight: 900; }
          .rodape { margin-top: 10px; text-align: center; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="centro">
          <div class="titulo">${loja}</div>
          ${documento ? `<div class="subtitulo">CNPJ/CPF: ${documento}</div>` : ""}
          ${contato ? `<div class="subtitulo">Contato: ${contato}</div>` : ""}
          ${endereco ? `<div class="subtitulo">${endereco}</div>` : ""}
          <div class="subtitulo">*** COMPROVANTE NÃO FISCAL ***</div>
        </div>

        <div class="linha"></div>

        <table>
          <tr>
            <td>Venda:</td>
            <td class="direita">#${String(venda.saleNumber).padStart(4, "0")}</td>
          </tr>
          <tr>
            <td>Data:</td>
            <td class="direita">${dataHora}</td>
          </tr>
          <tr>
            <td>Cliente:</td>
            <td class="direita">${venda.customerName || "Consumidor Final"}</td>
          </tr>
          <tr>
            <td>Operador:</td>
            <td class="direita">${venda.userName || "Caixa"}</td>
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
          ${
            venda.discount > 0
              ? `<tr>
                  <td>Desconto</td>
                  <td class="direita">-${formatarMoeda(venda.discount)}</td>
                </tr>`
              : ""
          }
          <tr>
            <td class="total">TOTAL PAGO</td>
            <td class="direita total">${formatarMoeda(venda.totalAmount)}</td>
          </tr>
          ${
            detalhesTroco && detalhesTroco.recebido && detalhesTroco.recebido > 0
              ? `<tr>
                  <td>Valor Recebido</td>
                  <td class="direita">${formatarMoeda(detalhesTroco.recebido)}</td>
                </tr>
                <tr>
                  <td class="destaque-troco">TROCO</td>
                  <td class="direita destaque-troco">${formatarMoeda(detalhesTroco.troco || 0)}</td>
                </tr>`
              : ""
          }
        </table>

        <div class="linha"></div>

        <div class="rodape">
          Obrigado pela preferência!<br />
          Volte sempre!
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

/**
 * Componente principal da Tela de Frente de Caixa (PDV).
 * 
 * Gerencia a digitação ágil, atalhos de teclado, seleção de produtos e clientes,
 * fechamento com troco e emissão instantânea de cupom.
 */
export default function FrenteDeCaixaPDVPage() {
  const { carregando: carregandoPermissoes, usuario, tem } = useUsuarioPermissoes();
  const { carregandoModuloProdutos, moduloProdutosAtivo } = useModuloProdutosAtivo();

  const podeAcessar =
    !carregandoPermissoes && tem(["produtos.ver", "estoque.ver", "vendas.ver"]);
  const podeRegistrarVenda = !carregandoPermissoes && tem("vendas.registrar");

  const [config, setConfig] = useState<LojaConfig | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Busca e seleção rápida de produto
  const [produtoBusca, setProdutoBusca] = useState("");
  const [quantidadeVenda, setQuantidadeVenda] = useState("1");
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [indiceItemFoco, setIndiceItemFoco] = useState(0);

  // Carrinho da venda
  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>([]);

  // Checkout e pagamento
  const [formVenda, setFormVenda] = useState<VendaForm>(VENDA_INICIAL);
  const [valorRecebido, setValorRecebido] = useState("");
  const [imprimirRecibo, setImprimirRecibo] = useState(false);

  // Clientes e Atendentes
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteBusca, setClienteBusca] = useState("");
  const [buscandoClientes, setBuscandoClientes] = useState(false);
  const [mostrarBuscaCliente, setMostrarBuscaCliente] = useState(false);
  const [atendentes, setAtendentes] = useState<Atendente[]>([]);

  // Estados de submissão e modal
  const [registrandoVenda, setRegistrandoVenda] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [vendaConcluida, setVendaConcluida] = useState<{
    venda: VendaCriada;
    recebido: number;
    troco: number;
  } | null>(null);

  // Relógio em tempo real
  const [horaAtual, setHoraAtual] = useState("");

  // Refs para atalhos
  const buscaInputRef = useRef<HTMLInputElement>(null);
  const valorRecebidoRef = useRef<HTMLInputElement>(null);

  // Cálculos financeiros
  const subtotalVenda = useMemo(() => {
    return carrinho.reduce(
      (acc, item) => acc + item.unitPrice * item.quantity,
      0
    );
  }, [carrinho]);

  const descontoVenda = Math.min(numero(formVenda.discount), subtotalVenda);
  const totalVenda = Math.max(0, subtotalVenda - descontoVenda);

  const valorRecebidoNum = numero(valorRecebido);
  const trocoCalculado =
    formVenda.paymentMethod === "DINHEIRO"
      ? Math.max(0, valorRecebidoNum - totalVenda)
      : 0;
  const faltaReceber =
    formVenda.paymentMethod === "DINHEIRO" && valorRecebidoNum > 0
      ? Math.max(0, totalVenda - valorRecebidoNum)
      : 0;

  // Filtragem rápida de produtos
  const produtosFiltrados = useMemo(() => {
    const termo = produtoBusca.trim().toLowerCase();
    if (!termo) return [];

    return produtos
      .filter((p) => p.isActive)
      .filter((p) => {
        return (
          p.name.toLowerCase().includes(termo) ||
          (p.sku && p.sku.toLowerCase().includes(termo)) ||
          (p.category && p.category.toLowerCase().includes(termo))
        );
      })
      .slice(0, 8);
  }, [produtos, produtoBusca]);

  // Atualização do relógio
  useEffect(() => {
    const atualizarRelogio = () => {
      const agora = new Date();
      setHoraAtual(
        agora.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    atualizarRelogio();
    const timer = setInterval(atualizarRelogio, 1000);
    return () => clearInterval(timer);
  }, []);

  // Foco inicial
  useEffect(() => {
    buscaInputRef.current?.focus();
  }, []);

  // Carregar dados
  async function carregarConfiguracoes() {
    try {
      const response = await fetch("/api/configuracoes", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.ok && data) {
        setConfig(data);
      }
    } catch {
      setConfig(null);
    }
  }

  async function carregarProdutos() {
    try {
      setCarregando(true);
      const res = await fetch("/api/produtos?status=ATIVOS&estoque=TODOS", {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as ProdutosResponse | null;
      if (res.ok && data?.produtos) {
        setProdutos(data.produtos);
      }
    } catch {
      setProdutos([]);
    } finally {
      setCarregando(false);
    }
  }

  async function carregarAtendentes() {
    try {
      const res = await fetch("/api/vendas-produtos/atendentes", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.atendentes)) {
        setAtendentes(data.atendentes);
      }
    } catch {
      setAtendentes([]);
    }
  }

  useEffect(() => {
    const pref = localStorage.getItem("nio_os_imprimir_recibo_produto");
    setImprimirRecibo(pref === "sim");
    carregarConfiguracoes();
    carregarProdutos();
    carregarAtendentes();
  }, []);

  useEffect(() => {
    if (usuario?.id && usuario.role === "ATENDENTE") {
      setFormVenda((prev) =>
        prev.attendantUserId ? prev : { ...prev, attendantUserId: usuario.id }
      );
    }
  }, [usuario]);

  // Adicionar produto ao carrinho
  function adicionarProduto(produto: Produto, qtdParam?: number) {
    if (!produto.isActive) {
      setMensagem("Produto inativo não pode ser vendido.");
      return;
    }

    const qtd = qtdParam ?? Math.max(1, inteiro(quantidadeVenda || 1));
    const itemExistente = carrinho.find((it) => it.productId === produto.id);
    const qtdFinal = (itemExistente?.quantity || 0) + qtd;

    if (
      produto.stockQuantity !== null &&
      qtdFinal > produto.stockQuantity
    ) {
      setMensagem(
        `Estoque insuficiente para "${produto.name}". Disponível: ${produto.stockQuantity}.`
      );
      return;
    }

    setCarrinho((atual) => {
      if (itemExistente) {
        return atual.map((it) =>
          it.productId === produto.id ? { ...it, quantity: qtdFinal } : it
        );
      }
      return [
        ...atual,
        {
          productId: produto.id,
          name: produto.name,
          sku: produto.sku,
          imageUrl: produto.imageUrl,
          quantity: qtd,
          unitPrice: numero(produto.salePrice),
          stockQuantity: produto.stockQuantity,
          unlimitedStock: produto.stockQuantity === null,
        },
      ];
    });

    setProdutoBusca("");
    setQuantidadeVenda("1");
    setDropdownAberto(false);
    setIndiceItemFoco(0);
    setMensagem("");
    buscaInputRef.current?.focus();
  }

  // Ajustar quantidade diretamente no carrinho
  function alterarQuantidadeCarrinho(productId: string, delta: number) {
    setCarrinho((atual) => {
      return atual
        .map((item) => {
          if (item.productId !== productId) return item;
          const novaQtd = item.quantity + delta;
          if (novaQtd <= 0) return null;
          if (!item.unlimitedStock && item.stockQuantity !== null) {
            if (novaQtd > item.stockQuantity) {
              setMensagem(
                `Estoque máximo para "${item.name}" é ${item.stockQuantity}.`
              );
              return item;
            }
          }
          return { ...item, quantity: novaQtd };
        })
        .filter(Boolean) as CarrinhoItem[];
    });
  }

  function removerItemCarrinho(productId: string) {
    setCarrinho((atual) => atual.filter((it) => it.productId !== productId));
  }

  function limparVenda() {
    setCarrinho([]);
    setFormVenda(VENDA_INICIAL);
    setValorRecebido("");
    setClienteBusca("");
    setClientes([]);
    setMostrarBuscaCliente(false);
    setMensagem("");
    setVendaConcluida(null);
    buscaInputRef.current?.focus();
  }

  // Tecla Enter no campo de busca (leitor de código de barras ou match)
  function lidarTeclaBusca(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const termo = produtoBusca.trim().toLowerCase();
      if (!termo) return;

      // 1. Tenta match exato de SKU ou Código de barras
      const matchExato = produtos.find(
        (p) => p.isActive && p.sku && p.sku.toLowerCase() === termo
      );
      if (matchExato) {
        adicionarProduto(matchExato);
        return;
      }

      // 2. Se houver resultados filtrados, pega o item focado
      if (produtosFiltrados.length > 0) {
        const itemSelecionado =
          produtosFiltrados[indiceItemFoco] || produtosFiltrados[0];
        adicionarProduto(itemSelecionado);
        return;
      }

      setMensagem("Nenhum produto encontrado com este código ou nome.");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceItemFoco((prev) =>
        Math.min(produtosFiltrados.length - 1, prev + 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceItemFoco((prev) => Math.max(0, prev - 1));
    } else if (e.key === "Escape") {
      setDropdownAberto(false);
    }
  }

  // Atalhos globais: F2 (Busca), F4 (Finalizar), Esc (Limpar/Cancelar)
  useEffect(() => {
    function lidarAtalhosGlobais(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        buscaInputRef.current?.focus();
        buscaInputRef.current?.select();
      } else if (e.key === "F4") {
        e.preventDefault();
        if (carrinho.length > 0 && !registrandoVenda) {
          registrarVenda();
        }
      } else if (e.key === "Escape") {
        if (vendaConcluida) {
          limparVenda();
        } else if (dropdownAberto) {
          setDropdownAberto(false);
        } else if (carrinho.length > 0) {
          if (window.confirm("Deseja cancelar a venda e esvaziar o carrinho?")) {
            limparVenda();
          }
        }
      }
    }

    window.addEventListener("keydown", lidarAtalhosGlobais);
    return () => window.removeEventListener("keydown", lidarAtalhosGlobais);
  }, [carrinho, registrandoVenda, dropdownAberto, vendaConcluida, totalVenda, formVenda]);

  // Busca de clientes
  async function buscarClientes(termo: string) {
    setClienteBusca(termo);
    if (!termo.trim()) {
      setClientes([]);
      setFormVenda((prev) => ({
        ...prev,
        customerId: "",
        customerName: "",
      }));
      return;
    }

    try {
      setBuscandoClientes(true);
      const res = await fetch(`/api/clientes?busca=${encodeURIComponent(termo)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      const lista = Array.isArray(data)
        ? data
        : Array.isArray(data?.clientes)
          ? data.clientes
          : [];
      setClientes(
        lista.map((c: any) => ({
          id: String(c.id),
          name: String(c.name || c.nome || ""),
          whatsapp: c.whatsapp || c.telefone,
          cpf: c.cpf,
        }))
      );
    } catch {
      setClientes([]);
    } finally {
      setBuscandoClientes(false);
    }
  }

  function selecionarCliente(cliente: Cliente) {
    setFormVenda((prev) => ({
      ...prev,
      customerId: cliente.id,
      customerName: cliente.name,
    }));
    setClienteBusca(cliente.name);
    setClientes([]);
    setMostrarBuscaCliente(false);
  }

  function removerClienteSelecionado() {
    setFormVenda((prev) => ({
      ...prev,
      customerId: "",
      customerName: "",
    }));
    setClienteBusca("");
    setClientes([]);
  }

  // Registrar venda
  async function registrarVenda() {
    if (carrinho.length === 0) {
      setMensagem("Adicione ao menos um produto para finalizar a venda.");
      return;
    }

    if (totalVenda <= 0) {
      setMensagem("O total da venda precisa ser maior que zero.");
      return;
    }

    if (
      formVenda.paymentMethod === "DINHEIRO" &&
      valorRecebidoNum > 0 &&
      valorRecebidoNum < totalVenda
    ) {
      setMensagem(
        `Valor recebido insuficiente! Faltam ${formatarMoeda(totalVenda - valorRecebidoNum)}.`
      );
      return;
    }

    try {
      setRegistrandoVenda(true);
      setMensagem("");

      const response = await fetch("/api/vendas-produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: formVenda.paymentMethod,
          customerId: formVenda.customerId || null,
          customerName: formVenda.customerName || "Consumidor Final",
          attendantUserId: formVenda.attendantUserId || null,
          discount: descontoVenda,
          note: formVenda.note,
          items: carrinho.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        }),
      });

      const data = (await response.json().catch(() => null)) as VendaResponse | null;

      if (!response.ok || !data?.venda) {
        setMensagem(data?.message || "Erro ao registrar venda.");
        return;
      }

      const vendaFeita = data.venda;
      const rec = formVenda.paymentMethod === "DINHEIRO" ? (valorRecebidoNum || totalVenda) : 0;
      const troc = formVenda.paymentMethod === "DINHEIRO" ? Math.max(0, rec - totalVenda) : 0;

      // Se configurado para imprimir recibo térmico automaticamente
      if (imprimirRecibo) {
        imprimirReciboVenda(vendaFeita, config, {
          recebido: rec,
          troco: troc,
        });
      }

      // Exibe modal de confirmação com destaque no troco
      setVendaConcluida({
        venda: vendaFeita,
        recebido: rec,
        troco: troc,
      });

      // Recarrega produtos em background para atualizar estoque
      carregarProdutos();
    } catch {
      setMensagem("Erro ao processar venda.");
    } finally {
      setRegistrandoVenda(false);
    }
  }

  // Guardas de módulo e permissões
  if (carregandoPermissoes || carregandoModuloProdutos || carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm font-bold tracking-wider text-slate-400">
            Carregando Frente de Caixa...
          </p>
        </div>
      </main>
    );
  }

  if (!moduloProdutosAtivo) {
    return (
      <ModuloProdutosDesativado
        titulo="Módulo de Produtos Desativado"
        descricao="O módulo de produtos e vendas está desativado nas configurações do sistema."
      />
    );
  }

  if (!podeAcessar) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-900 p-8 text-slate-900 dark:text-white">
        <div className="mx-auto max-w-xl rounded-2xl bg-red-500/10 border border-red-500/20 p-6 text-center">
          <p className="font-bold text-red-500">
            Você não possui permissão para acessar a Frente de Caixa.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
          >
            Voltar ao Início
          </Link>
        </div>
      </main>
    );
  }

  const logoLojaUrl = config?.logoUrl || "/uploads/logo.png";
  const nomeEmpresaExibicao = nomeLoja(config);

  return (
    <main className="flex flex-col min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased select-none">
      {/* BARRA SUPERIOR DO PDV */}
      <header className="h-16 px-4 md:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between shrink-0 shadow-sm z-30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 flex items-center justify-center border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
              <img
                src={logoLojaUrl}
                alt="Logo"
                className="h-full w-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
              <span className="hidden h-full w-full items-center justify-center text-sm font-black text-blue-600 dark:text-blue-400">
                POS
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-slate-900 dark:text-white leading-none">
                  {nomeEmpresaExibicao}
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  CAIXA ABERTO
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                PDV Frente de Caixa • Terminal Balcão
              </p>
            </div>
          </div>
        </div>

        {/* Relógio e Usuário */}
        <div className="flex items-center gap-3 md:gap-6">
          <div className="hidden md:flex flex-col items-end text-right font-mono">
            <span className="text-sm font-black text-slate-900 dark:text-white tracking-widest">
              {horaAtual || "00:00:00"}
            </span>
            <span className="text-[10px] text-slate-400 font-sans uppercase font-bold">
              {new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
            </span>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 hidden md:block" />

          <div className="flex items-center gap-2">
            <div className="text-right">
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                {usuario?.name || "Operador"}
              </span>
              <span className="block text-[10px] font-semibold text-slate-400 uppercase">
                {usuario?.role || "Operador"}
              </span>
            </div>
            <div className="h-9 w-9 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
              {(usuario?.name || "OP").substring(0, 2).toUpperCase()}
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800" />

          <div className="flex items-center gap-2">
            <Link
              href="/produtos/vendas"
              className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              title="Ver histórico de vendas"
            >
              Vendas
            </Link>
            <Link
              href="/produtos"
              className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              title="Voltar ao catálogo de produtos"
            >
              Produtos
            </Link>
          </div>
        </div>
      </header>

      {/* ÁREA PRINCIPAL SPLIT SCREEN */}
      <div className="flex-1 p-3 md:p-4 lg:p-6 grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6 overflow-hidden max-w-[1720px] w-full mx-auto">
        {/* COLUNA ESQUERDA: BUSCA + LISTA DE ITENS DA VENDA (COM LOGO DE FUNDO) */}
        <section className="xl:col-span-7 2xl:col-span-8 flex flex-col gap-3 min-h-0">
          {/* BARRA DE LEITOR DE CÓDIGO DE BARRAS & PESQUISA */}
          <div className="relative rounded-2xl bg-white dark:bg-slate-900 p-3 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <input
                  ref={buscaInputRef}
                  value={produtoBusca}
                  onChange={(e) => {
                    setProdutoBusca(e.target.value);
                    setDropdownAberto(true);
                    setIndiceItemFoco(0);
                  }}
                  onFocus={() => setDropdownAberto(true)}
                  onKeyDown={lidarTeclaBusca}
                  placeholder="Escanear leitor de código de barras ou buscar por nome/SKU... (F2)"
                  className="w-full pl-11 pr-20 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm md:text-base font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-black tracking-wider text-slate-600 dark:text-slate-300">
                  F2
                </span>
              </div>

              {/* Seletor de Quantidade Rápida */}
              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1 shrink-0">
                <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">
                  Qtd
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setQuantidadeVenda((q) => String(Math.max(1, inteiro(q) - 1)))
                  }
                  className="h-8 w-8 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-black text-sm hover:bg-slate-100 dark:hover:bg-slate-600 shadow-xs"
                >
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  value={quantidadeVenda}
                  onChange={(e) => setQuantidadeVenda(e.target.value)}
                  className="w-12 h-8 text-center text-sm font-black bg-transparent border-none outline-none text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() =>
                    setQuantidadeVenda((q) => String(inteiro(q) + 1))
                  }
                  className="h-8 w-8 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-black text-sm hover:bg-slate-100 dark:hover:bg-slate-600 shadow-xs"
                >
                  +
                </button>
              </div>
            </div>

            {/* Dropdown de Autocomplete Rápido */}
            {dropdownAberto && produtoBusca.trim().length > 0 && (
              <div className="absolute left-3 right-3 top-full mt-1 z-40 max-h-72 overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-blue-200 dark:border-slate-700 p-2 divide-y divide-slate-100 dark:divide-slate-800">
                {produtosFiltrados.length === 0 ? (
                  <div className="p-4 text-center text-xs font-bold text-slate-400">
                    Nenhum produto ativo encontrado para "{produtoBusca}".
                  </div>
                ) : (
                  produtosFiltrados.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => adicionarProduto(p)}
                      className={`w-full text-left p-3 rounded-xl flex items-center justify-between gap-3 transition ${
                        idx === indiceItemFoco
                          ? "bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-base shrink-0 border border-slate-200 dark:border-slate-700 overflow-hidden">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            "📦"
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                            {p.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {p.sku && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                {p.sku}
                              </span>
                            )}
                            <span className="text-[11px] font-semibold text-slate-400">
                              {estoqueTexto(p)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                          {formatarMoeda(p.salePrice)}
                        </span>
                        <span className="block text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                          Pressione Enter ↵
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <CardMensagem mensagem={mensagem} />

          {/* ÁREA DO CUPOM / ITENS DA VENDA COM A MARCA D'ÁGUA DA LOJA */}
          <div className="relative flex-1 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between overflow-hidden">
            {/* MARCA D'ÁGUA GIGANTE DA LOJA NO FUNDO */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden p-6">
              <img
                src={logoLojaUrl}
                alt="Marca d'água da Loja"
                className="max-w-[360px] max-h-[360px] w-auto h-auto object-contain opacity-[0.06] dark:opacity-[0.04] filter grayscale contrast-125 transition-all duration-300 transform scale-110"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.src.includes("logo.png")) {
                    img.src = "/uploads/logo.png";
                  } else {
                    img.style.display = "none";
                  }
                }}
              />
            </div>

            {/* CONTEÚDO DOS ITENS (SOBREPOSTO À MARCA D'ÁGUA) */}
            <div className="relative z-10 flex-1 flex flex-col min-h-0">
              {carrinho.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center text-3xl mb-3 shadow-inner">
                    🛒
                  </div>
                  <h3 className="text-base font-black text-slate-700 dark:text-slate-300">
                    Caixa Pronto para Venda
                  </h3>
                  <p className="text-xs font-medium text-slate-400 mt-1 max-w-sm leading-relaxed">
                    Aponte o leitor de código de barras ou pressione <strong className="text-blue-500">F2</strong> para buscar um produto pelo nome ou SKU.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <kbd className="font-mono bg-white dark:bg-slate-700 px-1 rounded text-[10px]">F2</kbd> Buscar
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <kbd className="font-mono bg-white dark:bg-slate-700 px-1 rounded text-[10px]">F4</kbd> Finalizar
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <kbd className="font-mono bg-white dark:bg-slate-700 px-1 rounded text-[10px]">Esc</kbd> Cancelar
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-2 sm:p-4">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3">Item / Descrição</th>
                        <th className="py-2.5 px-3 text-right">Preço Unit.</th>
                        <th className="py-2.5 px-3 text-center w-36">Qtd</th>
                        <th className="py-2.5 px-3 text-right">Subtotal</th>
                        <th className="py-2.5 px-3 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                      {carrinho.map((item, index) => (
                        <tr
                          key={item.productId}
                          className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition group"
                        >
                          <td className="py-3 px-3 text-center font-bold text-slate-400">
                            {index + 1}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700 text-sm overflow-hidden">
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  "📦"
                                )}
                              </div>
                              <div>
                                <p className="font-black text-slate-900 dark:text-white leading-tight">
                                  {item.name}
                                </p>
                                {item.sku && (
                                  <span className="text-[10px] font-mono text-slate-400">
                                    SKU: {item.sku}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-600 dark:text-slate-300">
                            {formatarMoeda(item.unitPrice)}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => alterarQuantidadeCarrinho(item.productId, -1)}
                                className="h-7 w-7 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black hover:bg-slate-200 dark:hover:bg-slate-700"
                              >
                                −
                              </button>
                              <span className="w-8 text-center font-black text-sm text-slate-900 dark:text-white">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => alterarQuantidadeCarrinho(item.productId, 1)}
                                className="h-7 w-7 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black hover:bg-slate-200 dark:hover:bg-slate-700"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-black text-sm text-emerald-600 dark:text-emerald-400">
                            {formatarMoeda(item.unitPrice * item.quantity)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => removerItemCarrinho(item.productId)}
                              className="h-7 w-7 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center transition"
                              title="Remover item"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Rodapé do Carrinho */}
              {carrinho.length > 0 && (
                <div className="border-t border-slate-200 dark:border-slate-800 p-3 px-4 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400 font-bold">
                    <span>
                      {carrinho.reduce((acc, it) => acc + it.quantity, 0)} unidade(s)
                    </span>
                    <span>•</span>
                    <span>{carrinho.length} item(ns)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Deseja esvaziar todos os itens da venda?")) {
                        limparVenda();
                      }
                    }}
                    className="text-xs font-bold text-red-500 hover:text-red-600 transition"
                  >
                    Esvaziar Carrinho (Esc)
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* COLUNA DIREITA: PAINEL DE CHECKOUT / FECHAMENTO */}
        <section className="xl:col-span-5 2xl:col-span-4 flex flex-col gap-4">
          {/* DISPLAY DE TOTAL DO CAIXA */}
          <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 md:p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
                <span>Total a Pagar</span>
                <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-slate-300">
                  {carrinho.length} {carrinho.length === 1 ? "item" : "itens"}
                </span>
              </div>

              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-3xl sm:text-4xl 2xl:text-5xl font-black font-mono tracking-tight text-emerald-400">
                  {formatarMoeda(totalVenda)}
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Subtotal:</span>
                  <strong className="text-slate-200 font-bold">
                    {formatarMoeda(subtotalVenda)}
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[11px]">Desconto:</span>
                  <strong className="text-slate-200 font-bold">
                    {descontoVenda > 0 ? `-${formatarMoeda(descontoVenda)}` : "R$ 0,00"}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* PAINEL DE FORMAS DE PAGAMENTO & FINALIZAÇÃO */}
          <div className="flex-1 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              {/* Formas de Pagamento (Botoes) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Forma de Pagamento
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {FORMAS_PAGAMENTO.map((fp) => {
                    const ativo = formVenda.paymentMethod === fp.value;
                    return (
                      <button
                        key={fp.value}
                        type="button"
                        onClick={() => {
                          setFormVenda((prev) => ({ ...prev, paymentMethod: fp.value }));
                          if (fp.value === "DINHEIRO") {
                            setTimeout(() => valorRecebidoRef.current?.focus(), 100);
                          }
                        }}
                        className={`p-3 rounded-2xl text-center border transition flex flex-col items-center justify-center gap-1 ${
                          ativo
                            ? "bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20 shadow-sm"
                            : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span className="text-xl">{fp.icone}</span>
                        <span className="text-xs font-black">{fp.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SELEÇÃO DINHEIRO: VALOR RECEBIDO E CÁLCULO DE TROCO EM TEMPO REAL */}
              {formVenda.paymentMethod === "DINHEIRO" && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      Valor Recebido (R$)
                    </label>
                    {/* Botões Rápidos de Cédulas */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setValorRecebido(totalVenda.toFixed(2))}
                        className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:bg-amber-50"
                      >
                        Exato
                      </button>
                      {[10, 20, 50, 100].map((nota) => {
                        if (nota < totalVenda && totalVenda > 50) return null;
                        return (
                          <button
                            key={nota}
                            type="button"
                            onClick={() => setValorRecebido(String(nota))}
                            className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:bg-amber-50"
                          >
                            +{nota}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <input
                    ref={valorRecebidoRef}
                    type="number"
                    step="0.01"
                    value={valorRecebido}
                    onChange={(e) => setValorRecebido(e.target.value)}
                    placeholder={totalVenda > 0 ? totalVenda.toFixed(2) : "0.00"}
                    className="w-full rounded-xl border border-amber-300 dark:border-amber-600 bg-white dark:bg-slate-900 px-4 py-2.5 text-base font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/30"
                  />

                  {/* DISPLAY DE TROCO OU FALTA */}
                  {valorRecebidoNum > 0 && (
                    <div className="pt-2 border-t border-amber-200 dark:border-amber-900/50 flex items-center justify-between">
                      {faltaReceber > 0 ? (
                        <div className="flex items-center justify-between w-full text-xs font-bold text-amber-600 dark:text-amber-400">
                          <span>Faltam a pagar:</span>
                          <strong className="text-sm font-black text-red-500">
                            {formatarMoeda(faltaReceber)}
                          </strong>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between w-full text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          <span>Troco a devolver:</span>
                          <strong className="text-lg font-black text-emerald-500">
                            {formatarMoeda(trocoCalculado)}
                          </strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Desconto & Cliente em Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Desconto (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formVenda.discount}
                    onChange={(e) =>
                      setFormVenda((prev) => ({ ...prev, discount: e.target.value }))
                    }
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Cliente
                    </label>
                    {formVenda.customerName && (
                      <button
                        type="button"
                        onClick={removerClienteSelecionado}
                        className="text-[10px] font-bold text-red-500 hover:underline"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  {mostrarBuscaCliente ? (
                    <div className="relative">
                      <input
                        value={clienteBusca}
                        onChange={(e) => buscarClientes(e.target.value)}
                        placeholder="Buscar por nome ou CPF..."
                        className="w-full rounded-xl border border-blue-400 dark:border-blue-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none"
                      />
                      {clientes.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-40 overflow-y-auto rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 shadow-lg divide-y divide-slate-100 dark:divide-slate-700">
                          {clientes.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => selecionarCliente(c)}
                              className="w-full text-left p-2 rounded-lg text-xs hover:bg-blue-50 dark:hover:bg-slate-700"
                            >
                              <strong className="block font-bold">{c.name}</strong>
                              <span className="text-[10px] text-slate-400">{c.whatsapp || c.cpf || ""}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMostrarBuscaCliente(true)}
                      className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 truncate"
                    >
                      {formVenda.customerName || "Consumidor Final (Venda Rápida)"}
                    </button>
                  )}
                </div>
              </div>

              {/* Atendente / Vendedor */}
              {atendentes.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Atendente / Vendedor
                  </label>
                  <select
                    value={formVenda.attendantUserId}
                    onChange={(e) =>
                      setFormVenda((prev) => ({
                        ...prev,
                        attendantUserId: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  >
                    <option value="">Operador atual do caixa</option>
                    {atendentes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} (@{a.username})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Observação rápida */}
              <div>
                <input
                  value={formVenda.note}
                  onChange={(e) =>
                    setFormVenda((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder="Observação opcional da venda..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              {/* Toggle de Impressão de Cupom Térmico */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Imprimir Cupom Não-Fiscal
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    Gera recibo térmico de 80mm para impressão ao finalizar
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={imprimirRecibo}
                  onChange={(e) => {
                    setImprimirRecibo(e.target.checked);
                    localStorage.setItem(
                      "nio_os_imprimir_recibo_produto",
                      e.target.checked ? "sim" : "nao"
                    );
                  }}
                  className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>
            </div>

            {/* BOTÃO FINALIZAR VENDA (F4) */}
            <button
              type="button"
              disabled={carrinho.length === 0 || registrandoVenda || !podeRegistrarVenda}
              onClick={registrarVenda}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-base md:text-lg shadow-lg shadow-emerald-600/30 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-3"
            >
              {registrandoVenda ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>REGISTRANDO VENDA...</span>
                </>
              ) : (
                <>
                  <span>⚡ FINALIZAR VENDA (F4)</span>
                  <span className="text-emerald-200 text-sm font-mono font-bold">
                    • {formatarMoeda(totalVenda)}
                  </span>
                </>
              )}
            </button>
          </div>
        </section>
      </div>

      {/* MODAL DE CONCLUSÃO DA VENDA COM TROCO */}
      {vendaConcluida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 md:p-8 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-3xl font-black mb-4">
              ✓
            </div>

            <h2 className="text-2xl font-black text-slate-900 dark:text-white">
              Venda Concluída!
            </h2>
            <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">
              Venda Nº #{String(vendaConcluida.venda.saleNumber).padStart(4, "0")}
            </p>

            {/* DESTAQUE DO TROCO SE DINHEIRO */}
            {vendaConcluida.venda.paymentMethod === "DINHEIRO" && (
              <div className="my-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
                <span className="block text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Troco do Cliente
                </span>
                <strong className="block text-3xl font-black font-mono mt-1 text-emerald-600 dark:text-emerald-400">
                  {formatarMoeda(vendaConcluida.troco)}
                </strong>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Recebido: {formatarMoeda(vendaConcluida.recebido)} • Total: {formatarMoeda(vendaConcluida.venda.totalAmount)}
                </span>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() =>
                  imprimirReciboVenda(vendaConcluida.venda, config, {
                    recebido: vendaConcluida.recebido,
                    troco: vendaConcluida.troco,
                  })
                }
                className="w-full py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-sm transition flex items-center justify-center gap-2"
              >
                <span>🖨️ Re-imprimir Recibo (80mm)</span>
              </button>

              <button
                type="button"
                autoFocus
                onClick={limparVenda}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition shadow-lg shadow-emerald-600/20"
              >
                Nova Venda (Enter / Espaço)
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
