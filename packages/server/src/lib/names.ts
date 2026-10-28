/**
 * Regras de apelido — as mesmas do front (packages/web/src/shared/ranking/Ranking.ts).
 * O servidor não confia no cliente: limpa e valida de novo.
 */
export const NAME_MIN = 2;
export const NAME_MAX = 16;

export function sanitizeName(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, NAME_MAX)
      .trim()
  );
}

export function isValidName(raw: string): boolean {
  const n = sanitizeName(raw);
  return n.length >= NAME_MIN && /[\p{L}\p{N}]/u.test(n);
}

/** Chave de unicidade: "Zé", "ZE" e " ze " são o mesmo apelido. */
export function nameKey(name: string): string {
  return sanitizeName(name)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
