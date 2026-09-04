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
 */

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
};

/**
 * Romanization table for Russian and Kazakh Cyrillic (BGN/PCGN-style, ASCII
 * only). Generic ESC/POS font ROMs carry no Cyrillic glyphs, and the
 * encoders skip any line they cannot render — so without folding, Cyrillic
 * item names and totals would silently vanish from the receipt. Soft and
 * hard signs carry no sound and are dropped rather than mapped to quotes,
 * which would collide with ESC/POS text.
 */
const CYRILLIC_THERMAL_ASCII_MAP: Record<string, string> = {
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh',
  'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O',
  'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts',
  'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu',
  'Я': 'Ya',
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
  'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
  'я': 'ya',
  // Kazakh-specific letters.
  'Ә': 'A', 'Ғ': 'G', 'Қ': 'Q', 'Ң': 'Ng', 'Ө': 'O', 'Ұ': 'U', 'Ү': 'U', 'Һ': 'H', 'І': 'I',
  'ә': 'a', 'ғ': 'g', 'қ': 'q', 'ң': 'ng', 'ө': 'o', 'ұ': 'u', 'ү': 'u', 'һ': 'h', 'і': 'i',
};

export function normalizeCyrillicThermalText(text: string): string {
  return text.replace(/[\u0400-\u04FF]/g, (character) => CYRILLIC_THERMAL_ASCII_MAP[character] ?? character);
}

/**
 * Folds a receipt line to characters a generic thermal printer can render,
 * based on the print language. A no-op for languages whose script the
 * printer already handles.
 */
export function foldThermalText(language: string | undefined, text: string): string {
  return foldsThermalText(language) ? normalizeCyrillicThermalText(text) : text;
}

/**
 * True when `foldThermalText` may rewrite a line for this language. Folding
 * can lengthen text (`щ` → `shch`), so callers that lay out fixed-width
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
