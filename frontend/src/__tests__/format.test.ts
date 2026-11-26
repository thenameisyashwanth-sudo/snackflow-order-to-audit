import { describe, expect, it } from 'vitest';
import { formatBaseQty, formatINR, rupeesInputToPaisa } from '../utils/format';

describe('Frontend formatting utils', () => {
  it('formats integer paisa to INR and converts input cleanly', () => {
    expect(formatINR(18750)).toBe('₹187.50');
    expect(formatINR(787500)).toBe('₹7,875.00');
    expect(rupeesInputToPaisa('187.50')).toBe(18750);
    expect(formatBaseQty(19500, 1000, 'L')).toBe('19.5 L');
  });
});
