/**
 * Validação de CNPJ — numérico e ALFANUMÉRICO (IN RFB nº 2.229/2024,
 * vigente desde julho/2026). Os 12 primeiros caracteres podem ser [0-9A-Z];
 * os 2 dígitos verificadores são sempre numéricos. Cada caractere vale
 * (código ASCII − 48), o que mantém compatibilidade com CNPJs numéricos.
 */
const WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeCnpj(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function checkDigit(base: string, weights: number[]): number {
  const sum = [...base].reduce((acc, ch, i) => acc + (ch.charCodeAt(0) - 48) * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCnpj(input: string): boolean {
  const cnpj = normalizeCnpj(input);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false; // 00000000000000, 11111111111111…
  const d1 = checkDigit(cnpj.slice(0, 12), WEIGHTS_1);
  const d2 = checkDigit(cnpj.slice(0, 12) + d1, WEIGHTS_2);
  return cnpj.endsWith(`${d1}${d2}`);
}

export function formatCnpj(input: string): string {
  const c = normalizeCnpj(input);
  if (c.length !== 14) return input;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
