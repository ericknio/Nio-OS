import path from "node:path";

function raizPadraoWindows() {
  const base = process.env.LOCALAPPDATA || process.env.APPDATA;
  return base ? path.join(base, "Nio-OS") : process.cwd();
}

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

export function limparPartesCaminho(partes: unknown[]) {
  return partes
    .flatMap((parte) => String(parte || "").split(/[\\/]+/g))
    .map((parte) => parte.trim())
    .filter((parte) => parte && parte !== "." && parte !== "..");
}

export function caminhoPublicoRuntime(...partes: unknown[]) {
  return path.join(
    raizDadosRuntime(),
    "public",
    ...limparPartesCaminho(partes),
  );
}

export function caminhoUploadPublico(...partes: unknown[]) {
  return caminhoPublicoRuntime("uploads", ...partes);
}

export function caminhoStorageRuntime(...partes: unknown[]) {
  return path.join(
    raizDadosRuntime(),
    "storage",
    ...limparPartesCaminho(partes),
  );
}

export function caminhoBackupsRuntime(...partes: unknown[]) {
  return path.join(
    raizDadosRuntime(),
    "backups",
    ...limparPartesCaminho(partes),
  );
}

export function caminhoEstaDentro(caminho: string, raiz: string) {
  const raizResolvida = path.resolve(raiz);
  const caminhoResolvido = path.resolve(caminho);
  const relativo = path.relative(raizResolvida, caminhoResolvido);

  return (
    relativo === "" ||
    (!relativo.startsWith("..") && !path.isAbsolute(relativo))
  );
}
