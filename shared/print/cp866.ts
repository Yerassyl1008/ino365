/**
 * PC866 (Cyrillic #2) — the code page cheap ESC/POS clones sold in CIS
 * markets actually have in ROM. Epson table index 17 (`ESC t 17`).
 *
 * Pure: Unicode ↔ single-byte mapping only. Renderers decide when to
 * select the code page and when a line must still be skipped.
 */

/** Epson / Xprinter / Rongta `ESC t n` index for PC866. */
export const ESC_POS_CP866_TABLE = 17;

const UPPER = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
const LOWER_FIRST = 'абвгдежзийклмноп';
const LOWER_REST = 'рстуфхцчшщъыьэюя';

const UNICODE_TO_CP866: Record<string, number> = {};
const CP866_TO_UNICODE: Record<number, string> = {};

for (let i = 0; i < UPPER.length; i++) {
  UNICODE_TO_CP866[UPPER[i]] = 0x80 + i;
  CP866_TO_UNICODE[0x80 + i] = UPPER[i];
}
for (let i = 0; i < LOWER_FIRST.length; i++) {
  UNICODE_TO_CP866[LOWER_FIRST[i]] = 0xA0 + i;
  CP866_TO_UNICODE[0xA0 + i] = LOWER_FIRST[i];
}
for (let i = 0; i < LOWER_REST.length; i++) {
  UNICODE_TO_CP866[LOWER_REST[i]] = 0xE0 + i;
  CP866_TO_UNICODE[0xE0 + i] = LOWER_REST[i];
}
UNICODE_TO_CP866['Ё'] = 0xF0;
CP866_TO_UNICODE[0xF0] = 'Ё';
UNICODE_TO_CP866['ё'] = 0xF1;
CP866_TO_UNICODE[0xF1] = 'ё';

/**
 * Romanization for Cyrillic letters that PC866 cannot print (Kazakh extras,
 * Ukrainian, etc.). Soft/hard signs that *are* in PC866 are not listed here
 * — they print natively. Soft/hard signs outside PC866 are dropped rather
 * than mapped to quotes, which would collide with ESC/POS text.
 */
const CYRILLIC_ASCII_FALLBACK: Record<string, string> = {
  'Ә': 'A', 'Ғ': 'G', 'Қ': 'Q', 'Ң': 'Ng', 'Ө': 'O', 'Ұ': 'U', 'Ү': 'U', 'Һ': 'H', 'І': 'I',
  'ә': 'a', 'ғ': 'g', 'қ': 'q', 'ң': 'ng', 'ө': 'o', 'ұ': 'u', 'ү': 'u', 'һ': 'h', 'і': 'i',
  'Ї': 'Yi', 'ї': 'yi', 'Є': 'Ye', 'є': 'ye', 'Ў': 'U', 'ў': 'u', 'Ґ': 'G', 'ґ': 'g',
};

const CP866_CYRILLIC_RE = /[А-яЁё]/g;
const ANY_CYRILLIC_RE = /[\u0400-\u04FF]/g;

export function isCp866Char(character: string): boolean {
  return UNICODE_TO_CP866[character] !== undefined;
}

export function containsCp866Cyrillic(text: string): boolean {
  CP866_CYRILLIC_RE.lastIndex = 0;
  return CP866_CYRILLIC_RE.test(text);
}

/** True when every character is ASCII or a PC866 glyph. */
export function isCp866Encodable(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) continue;
    if (UNICODE_TO_CP866[character] === undefined) return false;
  }
  return true;
}

export function encodeCp866(text: string): number[] {
  const out: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    const mapped = UNICODE_TO_CP866[character];
    out.push(mapped !== undefined ? mapped : 0x3F);
  }
  return out;
}

export function decodeCp866(bytes: ArrayLike<number>): string {
  let text = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] & 0xff;
    if (byte < 0x80) {
      text += String.fromCharCode(byte);
      continue;
    }
    text += CP866_TO_UNICODE[byte] ?? String.fromCharCode(byte);
  }
  return text;
}

/**
 * Keep PC866 glyphs (sharp native Cyrillic on the printer) and fold only
 * the letters the font ROM cannot draw, so Kazakh extras still appear.
 */
export function foldUnsupportedCyrillic(text: string): string {
  return text.replace(ANY_CYRILLIC_RE, (character) => {
    if (UNICODE_TO_CP866[character] !== undefined) return character;
    if (Object.prototype.hasOwnProperty.call(CYRILLIC_ASCII_FALLBACK, character)) {
      return CYRILLIC_ASCII_FALLBACK[character];
    }
    return '?';
  });
}

/**
 * Punctuation that Russian receipts use constantly (`Счёт №`, em dashes)
 * but generic ESC/POS skip-guards treat as "unsupported" — the whole line
 * then vanishes and a Cyrillic-only ticket looks blank.
 */
const THERMAL_PUNCTUATION_FOLD: Record<string, string> = {
  '№': 'N',
  '—': '-',
  '–': '-',
  '−': '-',
  '…': '...',
  '«': '"',
  '»': '"',
  '“': '"',
  '”': '"',
  '„': '"',
  '‘': "'",
  '’': "'",
  '×': 'x',
  '·': ' ',
  '₸': 'тг',
  '\u00A0': ' ',
  '\u202F': ' ',
};

const THERMAL_PUNCTUATION_RE = /[№—–−…«»“”„‘’×·₸\u00A0\u202F]/g;

export function foldThermalPunctuation(text: string): string {
  return text.replace(THERMAL_PUNCTUATION_RE, (character) => THERMAL_PUNCTUATION_FOLD[character] ?? character);
}

/** Cyrillic extras + typographic punctuation → a PC866-safe thermal line. */
export function foldForCp866Printer(text: string): string {
  return foldUnsupportedCyrillic(foldThermalPunctuation(text));
}

export function needsCp866Fold(text: string): boolean {
  ANY_CYRILLIC_RE.lastIndex = 0;
  return ANY_CYRILLIC_RE.test(text);
}

/**
 * Select single-byte mode and PC866. `FS .` cancels Kanji/GB2312 so high
 * bytes are glyphs, not a 2-byte Chinese pair (blank on CIS clones).
 * Cheap firmware also forgets `ESC t` after `ESC !` / `ESC E`, so callers
 * re-select immediately before each text payload.
 */
export function escPosSelectCp866(): number[] {
  return [0x1C, 0x2E, 0x1B, 0x74, ESC_POS_CP866_TABLE];
}
