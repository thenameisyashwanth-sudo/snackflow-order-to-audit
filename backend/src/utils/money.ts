/**
 * Integer-paisa and Decimal(14,4) arithmetic utilities.
 *
 * Strict rule: Never use IEEE-754 floating-point arithmetic for monetary amounts.
 * All monetary amounts are stored and calculated in integer paisa (₹1 = 100 paisa).
 * All unit rates are handled as exact decimal strings with up to 4 fractional digits
 * (matching PostgreSQL Decimal(14, 4)).
 */

/**
 * Parses a decimal string or number into a scaled BigInt with `scale` fractional digits.
 * Uses string parsing to avoid IEEE-754 float precision drift.
 */
export function parseScaledBigInt(value: string | number, scale: number): bigint {
  const str = typeof value === 'number' ? value.toString() : value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid decimal value: "${value}"`);
  }

  const isNegative = str.startsWith('-');
  const unsigned = isNegative ? str.slice(1) : str;
  const [intPart, fracPart = ''] = unsigned.split('.');

  const paddedFrac = (fracPart + '0'.repeat(scale + 1)).slice(0, scale + 1);
  const mainFrac = paddedFrac.slice(0, scale);
  const roundDigit = Number(paddedFrac[scale] ?? '0');

  let scaled = BigInt(intPart + mainFrac);
  if (roundDigit >= 5) {
    scaled += 1n;
  }

  return isNegative ? -scaled : scaled;
}

/**
 * Formats a scaled BigInt back into a fixed-decimal string.
 */
export function formatScaledBigInt(scaled: bigint, scale: number): string {
  const isNegative = scaled < 0n;
  const abs = isNegative ? -scaled : scaled;
  const factor = 10n ** BigInt(scale);
  const intPart = abs / factor;
  const fracPart = (abs % factor).toString().padStart(scale, '0');
  const sign = isNegative ? '-' : '';
  return scale > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

/**
 * Half-up integer division for BigInt: rounds `numerator / denominator` to nearest integer.
 */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error('Division by zero');
  }
  const neg = (numerator < 0n) !== (denominator < 0n);
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const quotient = absNum / absDen;
  const remainder = absNum % absDen;
  const rounded = remainder * 2n >= absDen ? quotient + 1n : quotient;
  return neg ? -rounded : rounded;
}

/**
 * Converts rupees (string or number) into exact integer paisa.
 * Example: rupeesToPaisa("187.50") => 18750
 */
export function rupeesToPaisa(rupees: string | number): number {
  const scaled = parseScaledBigInt(rupees, 2);
  const asNum = Number(scaled);
  if (!Number.isSafeInteger(asNum)) {
    throw new Error(`Paisa value exceeds safe integer range: ${scaled}`);
  }
  return asNum;
}

/**
 * Formats integer paisa as plain rupee string with 2 decimals (e.g. 18750 -> "187.50").
 */
export function paisaToRupeesString(paisa: number): string {
  if (!Number.isInteger(paisa)) {
    throw new Error(`Expected integer paisa, received ${paisa}`);
  }
  return formatScaledBigInt(BigInt(paisa), 2);
}

/**
 * Formats integer paisa with Indian Rupee symbol and Indian numbering commas.
 * Example: 787500 -> "₹7,875.00"
 */
export function formatINR(paisa: number): string {
  if (!Number.isInteger(paisa)) {
    throw new Error(`Expected integer paisa, received ${paisa}`);
  }
  const isNeg = paisa < 0;
  const abs = Math.abs(paisa);
  const rupees = Math.floor(abs / 100);
  const paise = (abs % 100).toString().padStart(2, '0');
  const formattedRupees = rupees.toLocaleString('en-IN');
  return `${isNeg ? '-' : ''}₹${formattedRupees}.${paise}`;
}

/**
 * Normalizes a rate value to a 4-decimal string matching Decimal(14, 4).
 */
export function normalizeRateDecimal(rate: string | number): string {
  const scaled = parseScaledBigInt(rate, 4);
  return formatScaledBigInt(scaled, 4);
}

/**
 * Computes total monetary value in integer paisa from base quantity, display factor,
 * and a Decimal(14,4) unit rate in ₹ per displayUnit.
 *
 * Example: qtyBase = 40000 g, displayFactor = 1000 (40 kg), rate = "43.1250" ₹/kg
 * => (40000 * 431250 * 100) / (1000 * 10000) = 172500 paisa (₹1,725.00)
 */
export function computeValuePaisaFromQtyAndRate(
  qtyBase: number,
  displayFactor: number,
  ratePerDisplayDecimal: string | number
): number {
  if (!Number.isInteger(qtyBase) || !Number.isInteger(displayFactor) || displayFactor <= 0) {
    throw new Error(`Invalid qtyBase (${qtyBase}) or displayFactor (${displayFactor})`);
  }
  const scaledRate = parseScaledBigInt(ratePerDisplayDecimal, 4); // rate * 10^4
  const numerator = BigInt(qtyBase) * scaledRate * 100n; // * 100 for ₹ -> paisa
  const denominator = BigInt(displayFactor) * 10000n;
  const paisa = Number(divideRoundHalfUp(numerator, denominator));
  if (!Number.isSafeInteger(paisa)) {
    throw new Error('Computed paisa overflows safe integer');
  }
  return paisa;
}

/**
 * Computes new weighted average rate (₹ per displayUnit, Decimal(14,4) string)
 * after adding `addedQtyBase` at `addedRateDecimal` to existing `currentQtyBase` at `currentRateDecimal`.
 *
 * Example (Section 5 Flour):
 *   Opening: 100 kg (100000 g) @ ₹42.0000/kg
 *   Purchase: 60 kg (60000 g) @ ₹45.0000/kg
 *   Result: "43.1250"
 */
export function computeWeightedAverageRateDecimal(
  currentQtyBase: number,
  currentRateDecimal: string | number,
  addedQtyBase: number,
  addedRateDecimal: string | number,
  displayFactor: number
): string {
  if (displayFactor <= 0) {
    throw new Error('displayFactor must be positive');
  }
  const effectiveCurrentQty = Math.max(0, currentQtyBase);
  const totalQtyBase = effectiveCurrentQty + addedQtyBase;
  if (totalQtyBase <= 0) {
    return normalizeRateDecimal(addedRateDecimal);
  }

  const currentScaled = parseScaledBigInt(currentRateDecimal, 4);
  const addedScaled = parseScaledBigInt(addedRateDecimal, 4);

  const weightedNumerator =
    BigInt(effectiveCurrentQty) * currentScaled + BigInt(addedQtyBase) * addedScaled;
  const newRateScaled = divideRoundHalfUp(weightedNumerator, BigInt(totalQtyBase));
  return formatScaledBigInt(newRateScaled, 4);
}
