/**
 * @file rateLimit.ts
 * @description Mecanismo em memória para limitação de taxa de requisições (Rate Limiting) no Cloud Dashboard.
 *
 * Utilidade de Segurança:
 * 1. Mitigação de Força Bruta: Protege endpoints críticos como `/api/v1/auth/login` e `/api/v1/license/sync`
 *    contra tentativas massivas de adivinhação de senhas ou chaves.
 * 2. Janela Temporal (Sliding Window): Rastreia o número de requisições por identificador (ex: IP ou login)
 *    dentro de uma janela configurável em milissegundos.
 * 3. Garbage Collection Periódico: Executa limpeza automática a cada 5 minutos para liberar memória
 *    de identificadores já expirados.
 */

/**
 * Registro de controle de requisições armazenado para um identificador.
 */
type RateLimitEntry = {
  count: number;
  resetAt: number;
};

/**
 * Armazenamento em memória dos limites por identificador.
 */
const store = new Map<string, RateLimitEntry>();

// Limpa entradas expiradas periodicamente a cada 5 minutos
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * Verifica se um determinado identificador (ex: IP) excedeu o limite de requisições permitidas
 * dentro da janela de tempo especificada.
 *
 * @param identifier - Identificador único da origem (ex: endereço IP ou e-mail)
 * @param limit - Número máximo de requisições autorizadas no período (padrão: 5)
 * @param windowMs - Duração da janela temporal em milissegundos (padrão: 60.000 ms / 1 minuto)
 * @returns Objeto com status de autorização (`allowed`), requisições restantes (`remaining`) e tempo de espera (`retryAfterSeconds`)
 */
export function checkRateLimit(
  identifier: string,
  limit: number = 5,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now > entry.resetAt) {
    store.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (entry.count >= limit) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, retryAfterSeconds: 0 };
}

/**
 * Redefine o contador de taxa para um identificador específico (útil após login com sucesso).
 *
 * @param identifier - Identificador da origem a ser resetado
 */
export function resetRateLimit(identifier: string): void {
  store.delete(identifier);
}

