/**
 * unicode.ts
 *
 * Fallback map for Unicode currency symbols on ESC/POS thermal printers.
 *
 * ESC/POS thermal printers render bytes against a fixed code page
 * (typically CP437 / CP850 / CP1252), none of which contain modern
 * currency symbols like ₹ (U+20B9, added to Unicode in 2010). When the
 * printer firmware cannot render a symbol, the 2–3 UTF-8 bytes that
 * encode it print as garbage glyphs.
 *
 * When the user marks their printer as *not* Unicode-capable, we replace
 * these symbols with an ASCII equivalent before handing bytes to the
 * printer.
 *
 * Russian/Kazakh receipts keep PC866 Cyrillic (native printer glyphs) and
 * only fold letters the font ROM cannot draw.
 */

import { foldForCp866Printer, needsCp866Fold } from '@print/cp866';

// Currency fallbacks are kept to two or three ASCII characters so receipt
// amount columns remain bounded for common symbols and ISO-style tokens.
export const CURRENCY_ASCII_MAP: Record<string, string> = {
  '₹': 'Rs', // Indian Rupee
  '₨': 'Rs', // Rupee sign
  '€': 'Eu',
  '£': 'Pd',
  '¥': 'Yn',
  '₩': 'Kw',
  '₺': 'Tl',
  '₫': 'Vd',
  '₪': 'Ns',
  '₽': 'Rb',
  '฿': 'Bh',
  '₱': 'Ph',
  '₴': 'Uh',
  '₦': 'Ng',
  '₵': 'Gh',
  '₡': 'Cr',
  '₲': 'Pg',
  '₸': 'KZT',
};

export function normalizeCyrillicThermalText(text: string): string {
  return foldForCp866Printer(text);
}

/**
 * Folds a receipt line to characters a generic thermal printer can render.
 * Russian/Kazakh keep PC866 Cyrillic; leftover letters and typographic
 * punctuation (`№`, em dashes) become PC866-safe so the line is not skipped.
 */
export function foldThermalText(language: string | undefined, text: string): string {
  return foldsThermalText(language) || needsCp866Fold(text)
    ? normalizeCyrillicThermalText(text)
    : text;
}

/**
 * True when `foldThermalText` may rewrite a line for this language. Folding
 * can lengthen text (`ң` → `ng`), so callers that lay out fixed-width
 * columns must clamp folded lines instead of letting the encoder wrap them.
 */
export function foldsThermalText(language: string | undefined): boolean {
  return language === 'ru' || language === 'kk';
}

export function normalizeCurrencyToAscii(text: string): string {
  let out = text;
  for (const [sym, ascii] of Object.entries(CURRENCY_ASCII_MAP)) {
    if (out.includes(sym)) out = out.split(sym).join(ascii);
  }
  return out;
}

/**
 * Pads a resolved currency symbol to a fixed 2-character slot when it is
 * shorter than two characters. Three-character fallbacks such as IRR remain
 * unchanged.
 */
export function padCurrencyPrefix(prefix: string): string {
  return prefix.length >= 2 ? prefix : ' '.repeat(2 - prefix.length) + prefix;
}

/** Select PC866 after ESC @ so Cyrillic prints as native printer glyphs. */
export function selectCyrillicCodepage<T extends { codepage?(name: string): T }>(
  enc: T,
  language?: string,
  sampleText?: string,
): T {
  if (typeof enc.codepage !== 'function') return enc;
  if (language === 'ru' || language === 'kk' || (sampleText && /[А-яЁё]/.test(sampleText))) {
    return enc.codepage('cp866');
  }
  return enc;
}
