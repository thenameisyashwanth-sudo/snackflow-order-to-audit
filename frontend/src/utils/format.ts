/**
 * Frontend display formatting utilities matching backend integer-paisa and base-unit rules.
 */

export function formatINR(paisa: number): string {
  const isNeg = paisa < 0;
  const abs = Math.abs(Math.trunc(paisa));
  const rupees = Math.floor(abs / 100);
  const paise = (abs % 100).toString().padStart(2, '0');
  return `${isNeg ? '-' : ''}₹${rupees.toLocaleString('en-IN')}.${paise}`;
}

export function formatBaseQty(qtyBase: number, displayFactor: number, displayUnit: string): string {
  const value = qtyBase / displayFactor;
  const formatted = Number.isInteger(value)
    ? value.toString()
    : Number(value.toFixed(3)).toString();
  return `${formatted} ${displayUnit}`;
}

export function rupeesInputToPaisa(input: string): number {
  const trimmed = input.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid rupee amount: ${input}`);
  }
  const isNeg = trimmed.startsWith('-');
  const unsigned = isNeg ? trimmed.slice(1) : trimmed;
  const [r, p = ''] = unsigned.split('.');
  const paisa = Number(r) * 100 + Number(p.padEnd(2, '0'));
  return isNeg ? -paisa : paisa;
}
