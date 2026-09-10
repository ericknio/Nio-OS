/**
 * @file app/produtos/novo/page.tsx
 * @description Tela de Cadastro e Edição de Produtos do Catálogo Comercial (Frontend).
 * 
 * Funcionalidades:
 * - Cadastro de novos itens ou edição de produtos existentes (via parâmetro `?id=`).
 * - Upload de imagem do produto via endpoint `/api/produtos/upload`.
 * - Simulador dinâmico de margem: calcula em tempo real o lucro bruto (R$) e margem (%) baseando-se no preço de venda, custo e impostos.
 * - Controle de estoque físico vs. ilimitado com definição de gatilho de estoque mínimo (`minStock`).
 */

"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUsuarioPermissoes } from "@/app/Permissao";

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
  isUnlimited?: boolean;
  minStock: number;
  isActive: boolean;
};

type ProdutoResponse = {
  message?: string;
  produto?: Produto;
};

type UploadResponse = {
  message?: string;
  imageUrl?: string;
};

type ProdutoForm = {
  name: string;
  sku: string;
  category: string;
  description: string;
  imageUrl: string;
  salePrice: string;
  costPrice: string;
  taxPercent: string;
  stockQuantity: string;
  unlimitedStock: boolean;
  minStock: string;
  isActive: boolean;
};

const FORM_INICIAL: ProdutoForm = {
  name: "",
  sku: "",
  category: "",
  description: "",
  imageUrl: "",
  salePrice: "",
  costPrice: "",
  taxPercent: "0",
  stockQuantity: "0",
  unlimitedStock: false,
  minStock: "0",
  isActive: true,
};

import CardMensagem from "@/app/components/CardMensagem";
import { formatarMoeda, inteiro } from "@/lib/formatadores";
import { inputClass, textareaClass } from "@/lib/uiConstantes";

function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
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

function lerModuloProdutosCache() {
  if (typeof window === "undefined") return true;

  const valor = window.localStorage.getItem("nio-os-products-module-enabled");

  if (valor === null) return true;

  return valor === "true";
}

async function buscarStatusModuloProdutos() {
  const cache = lerModuloProdutosCache();

  try {
    const response = await fetch(`/api/configuracoes?t=${Date.now()}`, {
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
      return cache;
    }

    const ativo = data.productsModuleEnabled !== false;

    window.localStorage.setItem(
      "nio-os-products-module-enabled",
      String(ativo)
    );

    return ativo;
  } catch {
    return cache;
  }
}

function ModuloProdutosDesativado() {
  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
      <section className="mx-auto max-w-5xl rounded-3xl bg-white dark:bg-slate-900 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
        <p className="text-sm font-bold text-orange-600">Módulo desativado</p>

        <h1 className="mt-2 text-3xl font-black tracking-tight">
          Produtos, estoque e vendas estão desativados
        </h1>

        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
          O cadastro e edição de produtos ficam bloqueados enquanto o módulo de
          produtos estiver desligado nas configurações do sistema.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
          >
            Painel inicial
          </Link>

          <Link
            href="/configuracoes"
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
          >
            Abrir configurações
          </Link>
        </div>
      </section>
    </main>
  );
}

function calcularProdutoLocal(form: ProdutoForm) {
  const salePrice = numero(form.salePrice);
  const costPrice = numero(form.costPrice);
  const taxPercent = numero(form.taxPercent);

  const taxAmount = salePrice * (taxPercent / 100);
  const profitAmount = salePrice - costPrice - taxAmount;
  const marginPercent = salePrice > 0 ? (profitAmount / salePrice) * 100 : 0;

  return {
    salePrice,
    costPrice,
    taxPercent,
    taxAmount,
    profitAmount,
    marginPercent,
  };
}


function CampoTexto({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  type = "text",
  help,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: "text" | "number";
  help?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label}
        {required ? " *" : ""}
      </label>

      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />

      {help && (
        <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{help}</p>
      )}
    </div>
  );
}

function CampoResumo({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {titulo}
      </p>

      <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{children}</div>
    </div>
  );
}

/**
 * Componente principal da Tela de Criação e Edição de Produto.
 * 
 * Gerencia os campos de cadastro, upload de foto, cálculos reativos
 * de margem de lucro e persistência via POST/PUT `/api/produtos`.
 */
export default function ProdutoNovoPage() {
  const router = useRouter();

  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const [produtoId, setProdutoId] = useState("");
  const [form, setForm] = useState<ProdutoForm>(FORM_INICIAL);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [imagemVersao, setImagemVersao] = useState(0);
  const [mensagem, setMensagem] = useState("");
  const [moduloProdutosAtivo, setModuloProdutosAtivo] = useState(
    lerModuloProdutosCache
  );

  const editando = Boolean(produtoId);

  const podeCriar = !carregandoPermissoes && tem("produtos.criar");
  const podeEditar = !carregandoPermissoes && tem("produtos.editar");
  const podeAcessar = editando ? podeEditar : podeCriar;
  const financeiroSensivelLiberado =
    !carregandoPermissoes && tem("relatorios.financeiro");

  const calculo = useMemo(() => calcularProdutoLocal(form), [form]);

  function atualizarCampo(campo: keyof ProdutoForm, valor: string | boolean) {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));

    setMensagem("");
  }

  function preencherFormulario(produto: Produto) {
    setForm({
      name: produto.name || "",
      sku: produto.sku || "",
      category: produto.category || "",
      description: produto.description || "",
      imageUrl: produto.imageUrl || "",
      salePrice: String(produto.salePrice || ""),
      costPrice: String(produto.costPrice || ""),
      taxPercent: String(produto.taxPercent || 0),
      stockQuantity:
        produto.stockQuantity === null ? "" : String(produto.stockQuantity),
      unlimitedStock:
        produto.isUnlimited === true || produto.stockQuantity === null,
      minStock: String(produto.minStock || 0),
      isActive: produto.isActive !== false,
    });
  }

  async function carregarProduto(id: string) {
    try {
      setCarregando(true);
      setMensagem("");

      const response = await fetch(`/api/produtos/${id}`, {
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | ProdutoResponse
        | null;

      if (!response.ok || !data?.produto) {
        setMensagem(data?.message || "Erro ao carregar produto.");
        return;
      }

      preencherFormulario(data.produto);
    } catch {
      setMensagem("Erro ao carregar produto.");
    } finally {
      setCarregando(false);
    }
  }

  async function enviarImagemProduto(file: File | null) {
    setMensagem("");

    if (!file) return;

    const tiposPermitidos = ["image/png", "image/jpeg", "image/webp"];

    if (!tiposPermitidos.includes(file.type)) {
      setMensagem("Escolha uma imagem PNG, JPG ou WEBP.");
      return;
    }

    const maxSize = 3 * 1024 * 1024;

    if (file.size > maxSize) {
      setMensagem("A imagem deve ter no máximo 3MB.");
      return;
    }

    try {
      setEnviandoImagem(true);

      const formData = new FormData();
      formData.append("imagem", file);

      const response = await fetch("/api/produtos/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json().catch(() => null)) as
        | UploadResponse
        | null;

      if (!response.ok || !data?.imageUrl) {
        setMensagem(data?.message || "Erro ao enviar imagem.");
        return;
      }

      atualizarCampo("imageUrl", data.imageUrl);
      setImagemVersao(Date.now());
      setMensagem(data?.message || "Imagem enviada com sucesso.");
    } catch {
      setMensagem("Erro ao enviar imagem.");
    } finally {
      setEnviandoImagem(false);
    }
  }

  function validarProduto() {
    if (!form.name.trim()) {
      return "Informe o nome do produto.";
    }

    if (numero(form.salePrice) <= 0) {
      return "Informe o valor de venda do produto.";
    }

    if (numero(form.taxPercent) > 100) {
      return "O imposto não pode ser maior que 100%.";
    }

    if (
      !form.unlimitedStock &&
      (form.stockQuantity.trim() === "" ||
        !Number.isInteger(Number(form.stockQuantity)) ||
        Number(form.stockQuantity) < 0)
    ) {
      return "Informe uma quantidade inteira maior ou igual a zero.";
    }

    return "";
  }

  async function salvarProduto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    if (!podeAcessar) {
      setMensagem("Você não tem permissão para salvar produto.");
      return;
    }

    const erro = validarProduto();

    if (erro) {
      setMensagem(erro);
      return;
    }

    try {
      setSalvando(true);

      const response = await fetch(
        editando ? `/api/produtos/${produtoId}` : "/api/produtos",
        {
          method: editando ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...form,
            salePrice: numero(form.salePrice),
            costPrice: financeiroSensivelLiberado
              ? numero(form.costPrice)
              : undefined,
            taxPercent: financeiroSensivelLiberado
              ? numero(form.taxPercent)
              : undefined,
            stockQuantity: form.unlimitedStock
              ? undefined
              : Number(form.stockQuantity),
            unlimitedStock: form.unlimitedStock,
            confirmStockModeChange: editando,
            minStock: inteiro(form.minStock),
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao salvar produto.");
        return;
      }

      setMensagem(data?.message || "Produto salvo com sucesso.");

      setTimeout(() => {
        router.push("/produtos");
      }, 500);
    } catch {
      setMensagem("Erro ao salvar produto.");
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    let ativo = true;

    async function inicializarPagina() {
      setCarregando(true);
      setMensagem("");

      const moduloAtivo = await buscarStatusModuloProdutos();

      if (!ativo) return;

      setModuloProdutosAtivo(moduloAtivo);

      if (!moduloAtivo) {
        setCarregando(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const id = params.get("id") || "";
      const podeAcessarUrl = id ? podeEditar : podeCriar;

      setProdutoId(id);

      if (!podeAcessarUrl) {
        setCarregando(false);
        return;
      }

      if (id) {
        await carregarProduto(id);
        return;
      }

      setCarregando(false);
    }

    inicializarPagina();

    return () => {
      ativo = false;
    };
  }, [carregandoPermissoes, podeCriar, podeEditar]);

  if (carregandoPermissoes || carregando) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-5xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Carregando cadastro de produto...
        </section>
      </main>
    );
  }

  if (!moduloProdutosAtivo) {
    return <ModuloProdutosDesativado />;
  }

  if (!podeAcessar) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-5xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
          Você não tem permissão para {editando ? "editar" : "cadastrar"}{" "}
          produtos.
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">
                Produtos e estoque
              </p>

              <h1 className="text-3xl font-black tracking-tight">
                {editando ? "Editar produto" : "Cadastrar produto"}
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Informe os dados de venda, custo, imposto, foto e o modo de
                controle do estoque.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/produtos"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Voltar para produtos
              </Link>

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

        <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <form
            onSubmit={salvarProduto}
            className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
          >
            <div className="mb-6">
              <p className="text-sm font-bold text-blue-600">
                Dados do produto
              </p>

              <h2 className="text-2xl font-black tracking-tight">
                Informações principais
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <CampoTexto
                label="Nome do produto"
                required
                value={form.name}
                disabled={salvando}
                onChange={(valor) => atualizarCampo("name", valor)}
                placeholder="Ex.: Carregador USB-C"
              />

              <CampoTexto
                label="Código/SKU"
                value={form.sku}
                disabled={salvando}
                onChange={(valor) => atualizarCampo("sku", valor)}
                placeholder="Opcional"
              />

              <CampoTexto
                label="Categoria"
                value={form.category}
                disabled={salvando}
                onChange={(valor) => atualizarCampo("category", valor)}
                placeholder="Ex.: Acessórios"
              />

              <div>
                <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                  Foto do produto
                </label>

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={salvando || enviandoImagem}
                  onChange={(event) =>
                    enviarImagemProduto(event.target.files?.[0] || null)
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-800 disabled:text-slate-500 dark:text-slate-400"
                />

                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Formatos: PNG, JPG ou WEBP. Máximo 3MB.
                </p>

                {enviandoImagem && (
                  <p className="mt-2 text-xs font-black text-blue-600">
                    Enviando imagem...
                  </p>
                )}
              </div>

              <CampoTexto
                label="Valor de venda"
                type="number"
                required
                value={form.salePrice}
                disabled={salvando}
                onChange={(valor) => atualizarCampo("salePrice", valor)}
                placeholder="0,00"
              />

              {financeiroSensivelLiberado && <CampoTexto
                label="Valor de custo"
                type="number"
                value={form.costPrice}
                disabled={salvando}
                onChange={(valor) => atualizarCampo("costPrice", valor)}
                placeholder="0,00"
              />}

              {financeiroSensivelLiberado && <CampoTexto
                label="% imposto"
                type="number"
                value={form.taxPercent}
                disabled={salvando}
                onChange={(valor) => atualizarCampo("taxPercent", valor)}
                placeholder="0"
              />}

              <CampoTexto
                label="Quantidade em estoque"
                type="number"
                required={!form.unlimitedStock}
                value={form.stockQuantity}
                disabled={salvando || form.unlimitedStock}
                onChange={(valor) => atualizarCampo("stockQuantity", valor)}
                placeholder="Aceita zero"
                help="Zero significa sem estoque disponível."
              />

              <label className="flex items-center gap-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.unlimitedStock}
                  disabled={salvando}
                  onChange={(event) => {
                    const unlimitedStock = event.target.checked;
                    setForm((atual) => ({
                      ...atual,
                      unlimitedStock,
                      stockQuantity: unlimitedStock ? "" : atual.stockQuantity || "0",
                    }));
                    setMensagem("");
                  }}
                  className="h-4 w-4"
                />
                Estoque ilimitado
              </label>

              <CampoTexto
                label="Estoque mínimo"
                type="number"
                value={form.minStock}
                disabled={salvando}
                onChange={(valor) => atualizarCampo("minStock", valor)}
                placeholder="Avisar abaixo de..."
              />

              <div>
                <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                  Status
                </label>

                <select
                  value={form.isActive ? "ATIVO" : "INATIVO"}
                  disabled={salvando}
                  onChange={(event) =>
                    atualizarCampo("isActive", event.target.value === "ATIVO")
                  }
                  className={inputClass}
                >
                  <option value="ATIVO">Ativo</option>
                  <option value="INATIVO">Inativo</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                  Descrição
                </label>

                <textarea
                  rows={4}
                  value={form.description}
                  disabled={salvando}
                  onChange={(event) =>
                    atualizarCampo("description", event.target.value)
                  }
                  placeholder="Observações sobre o produto"
                  className={textareaClass}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={salvando || enviandoImagem}
              className="mt-6 w-full rounded-xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando
                ? "Salvando..."
                : editando
                  ? "Salvar produto"
                  : "Cadastrar produto"}
            </button>
          </form>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <p className="text-sm font-bold text-blue-600">Prévia</p>

              <h2 className="mt-1 text-2xl font-black tracking-tight">
                Produto
              </h2>

              <div className="mt-5 flex h-44 items-center justify-center overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-800/50 ring-1 ring-slate-200 dark:ring-slate-800">
                {form.imageUrl ? (
                  <img
  key={`${form.imageUrl}-${imagemVersao}`}
  src={imagemProdutoUrl(form.imageUrl, imagemVersao)}
  alt="Prévia do produto"
  className="h-full w-full object-contain"
  onLoad={(event) => {
    event.currentTarget.style.visibility = "visible";
  }}
  onError={(event) => {
    event.currentTarget.style.visibility = "hidden";
  }}
/>
                ) : (
                  <span className="text-sm font-black text-slate-400">
                    Sem imagem
                  </span>
                )}
              </div>

              {form.imageUrl && (
                <button
                  type="button"
                  onClick={() => atualizarCampo("imageUrl", "")}
                  disabled={salvando}
                  className="mt-3 w-full rounded-xl bg-red-50 px-4 py-3 text-xs font-black text-red-700 dark:text-red-400 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Remover imagem
                </button>
              )}
            </section>

            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <p className="text-sm font-bold text-blue-600">Prévia</p>

              <h2 className="mt-1 text-2xl font-black tracking-tight">
                Cálculo do produto
              </h2>

              <div className="mt-5 space-y-3">
                <CampoResumo titulo="Valor de venda">
                  {formatarMoeda(calculo.salePrice)}
                </CampoResumo>

                {financeiroSensivelLiberado && <CampoResumo titulo="Imposto">
                  {formatarMoeda(calculo.taxAmount)}{" "}
                  <span className="text-slate-500 dark:text-slate-400">
                    ({calculo.taxPercent.toFixed(1)}%)
                  </span>
                </CampoResumo>}

                {financeiroSensivelLiberado && <CampoResumo titulo="Custo">
                  {formatarMoeda(calculo.costPrice)}
                </CampoResumo>}

                {financeiroSensivelLiberado && <CampoResumo titulo="Lucro por unidade">
                  <span
                    className={
                      calculo.profitAmount >= 0
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                    }
                  >
                    {formatarMoeda(calculo.profitAmount)}
                  </span>
                </CampoResumo>}

                {financeiroSensivelLiberado && <CampoResumo titulo="Margem">
                  {calculo.marginPercent.toFixed(1)}%
                </CampoResumo>}

                <CampoResumo titulo="Estoque">
                  {form.unlimitedStock
                    ? "Ilimitado"
                    : inteiro(form.stockQuantity) === 0
                      ? "Sem estoque"
                      : `${inteiro(form.stockQuantity)} unidade(s)`}
                </CampoResumo>
              </div>
            </section>

            <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-lg shadow-slate-950/10">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-slate-300">
                Regra importante
              </p>

              <div className="mt-4 space-y-3 text-sm font-semibold leading-6 text-slate-300">
                <p>Estoque ilimitado deve ser selecionado explicitamente.</p>
                <p>Quantidade 0 significa produto sem estoque.</p>
                <p>Produtos inativos não aparecem para venda.</p>
                <p>Lucro = venda - custo - imposto.</p>
              </div>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}
