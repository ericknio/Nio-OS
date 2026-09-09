/**
 * @file runtimeStorage.ts
 * @description Gerenciador seguro de caminhos de arquivos em tempo de execução (Runtime).
 * 
 * Garante que os dados da assistência técnica (banco de dados SQLite, backups, fotos e mídias)
 * sejam gravados na pasta do usuário do Windows (%LOCALAPPDATA%\Nio-OS). Isso permite que
 * novas versões do aplicativo sejam instaladas sem apagar os dados existentes.
 */

import path from "node:path";

/**
 * Obtém o caminho padrão da pasta do usuário no Windows (%LOCALAPPDATA%\Nio-OS).
 * Em caso de indisponibilidade das variáveis de ambiente, usa o diretório de execução atual.
 *
 * @returns Caminho absoluto para a pasta de dados do Nio-OS no Windows
 */
function raizPadraoWindows() {
  const base = process.env.LOCALAPPDATA || process.env.APPDATA;
  return base ? path.join(base, "Nio-OS") : process.cwd();
}

/**
 * Determina o diretório raiz para persistência de dados em produção ou desenvolvimento.
 * Permite sobrescrita via variáveis de ambiente específicas (ex: NIO_OS_DATA_DIR).
 *
 * @returns Caminho base resolvido para gravação de dados
 */
export function raizDadosRuntime() {
  const explicit =
    process.env.NIO_OS_DATA_DIR ||
    process.env.NIO_OS_RUNTIME_DIR ||
    process.env.NIO_OS_APPDATA_DIR;

  if (explicit) return path.resolve(explicit);

  if (process.env.NODE_ENV !== "production") {
    return process.cwd();
  }

  if (process.platform === "win32") {
    return raizPadraoWindows();
  }

  return path.join(process.env.HOME || process.cwd(), ".nio-os");
}

/**
 * Sanitiza segmentos de caminho para prevenir ataques de Path Traversal (ex: uso de "../").
 * Divide barras, apara espaços e remove referências a diretórios superiores.
 *
 * @param partes - Lista de fragmentos do caminho do arquivo
 * @returns Vetor de partes limpas e seguras
 */
export function limparPartesCaminho(partes: unknown[]) {
  return partes
    .flatMap((parte) => String(parte || "").split(/[\\/]+/g))
    .map((parte) => parte.trim())
    .filter((parte) => parte && parte !== "." && parte !== "..");
}

/**
 * Retorna o caminho absoluto seguro dentro da pasta pública de runtime.
 *
 * @param partes - Fragmentos ou subpastas desejadas
 * @returns Caminho absoluto seguro
 */
export function caminhoPublicoRuntime(...partes: unknown[]) {
  return path.join(
    raizDadosRuntime(),
    "public",
    ...limparPartesCaminho(partes),
  );
}

/**
 * Retorna o caminho absoluto para gravação e leitura de uploads (fotos de OS, anexos, logos).
 *
 * @param partes - Subpastas ou nomes de arquivo
 * @returns Caminho absoluto na pasta de uploads
 */
export function caminhoUploadPublico(...partes: unknown[]) {
  return caminhoPublicoRuntime("uploads", ...partes);
}

/**
 * Retorna o caminho absoluto para arquivos internos de storage.
 *
 * @param partes - Subpastas ou arquivos internos
 * @returns Caminho absoluto na pasta de storage
 */
export function caminhoStorageRuntime(...partes: unknown[]) {
  return path.join(
    raizDadosRuntime(),
    "storage",
    ...limparPartesCaminho(partes),
  );
}

/**
 * Retorna o caminho absoluto da pasta onde os backups automáticos e manuais do SQLite são armazenados.
 *
 * @param partes - Subpastas ou nomes de arquivo de backup
 * @returns Caminho absoluto na pasta de backups
 */
export function caminhoBackupsRuntime(...partes: unknown[]) {
  return path.join(
    raizDadosRuntime(),
    "backups",
    ...limparPartesCaminho(partes),
  );
}

/**
 * Validação de segurança: Verifica se um caminho resultante reside estritamente dentro da pasta raiz esperada.
 * Impede que requisições maliciosas acessem arquivos fora da área designada da aplicação.
 *
 * @param caminho - Caminho de destino a validar
 * @param raiz - Pasta base que deve conter o caminho
 * @returns true se o caminho estiver contido na raiz; false se tentar escapar
 */
export function caminhoEstaDentro(caminho: string, raiz: string) {
  const raizResolvida = path.resolve(raiz);
  const caminhoResolvido = path.resolve(caminho);
  const relativo = path.relative(raizResolvida, caminhoResolvido);

  return (
    relativo === "" ||
    (!relativo.startsWith("..") && !path.isAbsolute(relativo))
  );
}
