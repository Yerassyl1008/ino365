/**
 * Offline PDF / photo menu extraction: text layer first, OCR for scans and photos.
 */

import { ocrImage, ocrImages, pdfPagesAsImages, sniffImageKind } from './menu-ocr';

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_PAGES = 40;
export const MAX_MENU_ITEMS = 2_000;

export interface ParsedMenuItem {
  name: string;
  price: number;
  description: string;
  category: string;
}

export interface ParseMenuResult {
  items: ParsedMenuItem[];
  skipped: { line: string; reason: string }[];
  warnings: string[];
}

const CURRENCY_TOKEN = String.raw`(?:₸|тг\.?|тнг|kzt|тенге|\$|€|£)`;
const NUMBER_TOKEN = String.raw`(?:\d{1,3}(?:[ \u00a0.,]\d{3})+|\d+)(?:[.,]\d{1,2})?`;
const WEIGHT_TOKEN = /(?:\d+(?:[.,]\d+)?\s?(?:г|гр|грамм|kg|кг|ml|мл|l|л)\b)/i;
const PRICE_TAIL = new RegExp(
  String.raw`(?:[\s.·•…─\-–—_]{2,}|\s)(${NUMBER_TOKEN})\s*${CURRENCY_TOKEN}?\s*$`,
  'i',
);
const PRICE_ONLY = new RegExp(String.raw`^(${NUMBER_TOKEN})\s*${CURRENCY_TOKEN}?\s*$`, 'i');
const JUNK_LINE = /^(?:page\s+\d+|\d+\s*\/\s*\d+|wifi|instagram|facebook|telegram|www\.|https?:|тел\.?|phone|режим|address|меню|menu|мәзір)$/i;
const CATEGORY_HINT =
  /^(?:напитки|салаты|супы|горяч\w*|гарниры|десерты|завтраки|кофе|чай|бар|кухня|пицц\w*|паста|бургер\w*|соусы|drinks?|beverages?|coffee|tea|desserts?|starters?|mains?|salads?|soups?|breakfast|burgers?|pasta|sides?|sauces?|combos?|food|snacks?|kitchen|bar)$/i;

function parsePriceToken(raw: string): number | null {
  let s = raw.replace(/[₸$€£]/g, '').replace(/тг\.?|тнг|kzt|тенге/gi, '').trim();
  s = s.replace(/\u00a0/g, ' ').replace(/\s+/g, '');
  if (!s) return null;

  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) return Number(s.replace(/,/g, ''));
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d+,\d{1,2}$/.test(s)) return Number(s.replace(',', '.'));
  if (/^\d+(\.\d{1,2})?$/.test(s)) return Number(s);
  return null;
}

function isMostlyUppercase(value: string): boolean {
  const letters = value.replace(/[^\p{L}]/gu, '');
  if (letters.length < 3) return false;
  let upper = 0;
  for (const ch of letters) {
    if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) upper++;
  }
  return upper / letters.length >= 0.8;
}

function isJunkLine(line: string): boolean {
  if (!line) return true;
    if (JUNK_LINE.test(line)) return true;
    if (/^(?:wifi|instagram|facebook|telegram)\b/i.test(line)) return true;
  if (/@|https?:\/\/|www\./i.test(line)) return true;
  if (/^\d{4}$/.test(line)) return true;
  return false;
}

function looksLikeCategory(line: string): boolean {
  if (line.length > 48) return false;
  if (WEIGHT_TOKEN.test(line)) return false;
  const stripped = line.replace(/[:.\-–—]/g, '').trim();
  if (CATEGORY_HINT.test(stripped)) return true;
  if (isMostlyUppercase(line) && line.split(/\s+/).length <= 6) return true;
  if (line.endsWith(':') && line.length <= 40) return true;
  return false;
}

function cleanName(raw: string): string {
  return raw
    .replace(/[\s.·•…─\-–—_]+$/g, '')
    .replace(/^[\s.·•…─\-–—_]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractItemsFromLine(line: string): { name: string; price: number; extra?: string }[] {
  const results: { name: string; price: number; extra?: string }[] = [];
  let rest = line.trim();

  while (rest) {
    const match = rest.match(PRICE_TAIL);
    if (!match || match.index === undefined) break;
    let price = parsePriceToken(match[1]);
    if (price === null || !Number.isFinite(price) || price < 0) break;

    let before = rest.slice(0, match.index).trim();
    let extra: string | undefined;

    const dual = before.match(/^(.*?)\s+(\d[\d \u00a0.,]*)\s*\/\s*$/);
    if (dual) {
      before = dual[1].trim();
      extra = `${dual[2].replace(/\s+/g, ' ').trim()} / ${match[1].replace(/\s+/g, ' ').trim()}`;
      const firstPrice = parsePriceToken(dual[2]);
      if (firstPrice !== null) price = firstPrice;
    }

    const parts = before.split(/\s{2,}|\t+/);
    if (parts.length >= 2) {
      const name = cleanName(parts.pop() || '');
      if (name) results.unshift({ name, price, extra });
      const next = parts.join('  ').trim();
      if (!next || next === rest) break;
      rest = next;
      continue;
    }

    const name = cleanName(before);
    if (name) results.unshift({ name, price, extra });
    break;
  }

  return results;
}

export function parseMenuText(text: string, fallbackCategory = ''): ParseMenuResult {
  const skipped: { line: string; reason: string }[] = [];
  const warnings: string[] = [];
  const items: ParsedMenuItem[] = [];
  const seen = new Set<string>();

  const rawLines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\u00a0/g, ' ').trim())
    .filter((line) => line.length > 0);

  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (PRICE_ONLY.test(line) && lines.length > 0 && !PRICE_TAIL.test(lines[lines.length - 1])) {
      lines[lines.length - 1] = `${lines[lines.length - 1]}  ${line}`;
      continue;
    }
    lines.push(line);
  }

  let category = fallbackCategory;
  let pendingDescriptionFor = -1;

  for (const line of lines) {
    if (isJunkLine(line)) {
      skipped.push({ line, reason: 'header_or_contact' });
      continue;
    }

    const extracted = extractItemsFromLine(line);
    if (extracted.length > 0) {
      for (const row of extracted) {
        if (items.length >= MAX_MENU_ITEMS) {
          warnings.push(`Stopped after ${MAX_MENU_ITEMS} items`);
          return { items, skipped, warnings };
        }
        const key = `${category.toLowerCase()}::${row.name.toLowerCase()}`;
        if (seen.has(key)) {
          skipped.push({ line: row.name, reason: 'duplicate' });
          continue;
        }
        seen.add(key);
        items.push({
          name: row.name.slice(0, 200),
          price: row.price,
          description: (row.extra || '').slice(0, 2000),
          category,
        });
        pendingDescriptionFor = items.length - 1;
      }
      continue;
    }

    if (looksLikeCategory(line)) {
      category = cleanName(line.replace(/:$/, ''));
      pendingDescriptionFor = -1;
      continue;
    }

    if (pendingDescriptionFor >= 0) {
      const current = items[pendingDescriptionFor];
      const extra = cleanName(line);
      if (extra) {
        current.description = [current.description, extra].filter(Boolean).join(' ').slice(0, 2000);
      }
      pendingDescriptionFor = -1;
      continue;
    }

    skipped.push({ line, reason: 'no_price' });
  }

  if (items.length === 0) {
    warnings.push('no_items');
  }

  return { items, skipped, warnings };
}

export async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages: number }> {
  if (!Buffer.isBuffer(buffer)) {
    throw Object.assign(new Error('PDF data must be a buffer'), { statusCode: 400 });
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw Object.assign(new Error(`PDF exceeds the ${MAX_PDF_BYTES}-byte size limit`), { statusCode: 400 });
  }
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw Object.assign(new Error('File is not a PDF'), { statusCode: 400 });
  }

  // Import the implementation file directly so pdf-parse's debug bootstrap
  // (which reads a fixture PDF when required as a program) never runs.
  const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
    data: Uint8Array,
    options?: { max?: number },
  ) => Promise<{ text?: string; numpages?: number }>;

  try {
    // pdf.js 1.x misreads Node Buffers (Uint8Array subclass) as an ArrayBuffer
    // view and then fails with "bad XRef entry". Pass a plain Uint8Array copy.
    const result = await pdfParse(Uint8Array.from(buffer), { max: MAX_PDF_PAGES });
    return { text: result.text || '', pages: result.numpages || 0 };
  } catch (error: any) {
    const message = String(error?.message || error);
    if (/password|encrypted/i.test(message)) {
      throw Object.assign(new Error('This PDF is password-protected'), { statusCode: 400 });
    }
    throw Object.assign(new Error('Could not read this PDF'), { statusCode: 400 });
  }
}

export async function parseMenuPdf(buffer: Buffer, fallbackCategory = ''): Promise<ParseMenuResult & { pages: number; textLength: number; ocr: boolean }> {
  let text = '';
  let pages = 0;
  try {
    const extracted = await extractPdfText(buffer);
    text = extracted.text;
    pages = extracted.pages;
  } catch (error: any) {
    if (error?.statusCode === 400 && /password|encrypted/i.test(String(error.message))) throw error;
    // Image-only scans sometimes fail pdf-parse; OCR the pages instead.
    text = '';
    pages = 0;
  }

  let parsed = parseMenuText(text, fallbackCategory);
  let ocr = false;
  let usedText = text;

  if (parsed.items.length === 0 || text.trim().length < 20) {
    const images = await pdfPagesAsImages(buffer);
    if (images.length > 0) {
      const ocrText = await ocrImages(images);
      const ocrParsed = parseMenuText(ocrText, fallbackCategory);
      if (ocrParsed.items.length >= parsed.items.length) {
        parsed = ocrParsed;
        usedText = ocrText;
        ocr = true;
      }
    }
    if (!ocr && text.trim().length < 20) {
      parsed.warnings = ['scanned_or_empty', ...parsed.warnings.filter((w) => w !== 'no_items')];
    }
  }

  if (ocr) parsed.warnings = ['ocr_used', ...parsed.warnings.filter((w) => w !== 'scanned_or_empty' && w !== 'no_items')];
  if (parsed.items.length === 0 && !parsed.warnings.includes('no_items')) parsed.warnings.push('no_items');

  return { ...parsed, pages, textLength: usedText.trim().length, ocr };
}

export async function parseMenuImage(buffer: Buffer, fallbackCategory = ''): Promise<ParseMenuResult & { pages: number; textLength: number; ocr: boolean }> {
  if (!Buffer.isBuffer(buffer) || !sniffImageKind(buffer)) {
    throw Object.assign(new Error('File is not a supported photo (JPEG, PNG, WebP, BMP)'), { statusCode: 400 });
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw Object.assign(new Error(`Photo exceeds the ${MAX_PDF_BYTES}-byte size limit`), { statusCode: 400 });
  }
  const text = await ocrImage(buffer);
  const parsed = parseMenuText(text, fallbackCategory);
  parsed.warnings = ['ocr_used', ...parsed.warnings.filter((w) => w !== 'no_items')];
  if (parsed.items.length === 0 && !parsed.warnings.includes('no_items')) parsed.warnings.push('no_items');
  return { ...parsed, pages: 1, textLength: text.trim().length, ocr: true };
}

export async function parseMenuFile(buffer: Buffer, fallbackCategory = ''): Promise<ParseMenuResult & { pages: number; textLength: number; ocr: boolean }> {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return parseMenuPdf(buffer, fallbackCategory);
  }
  if (sniffImageKind(buffer)) {
    return parseMenuImage(buffer, fallbackCategory);
  }
  throw Object.assign(new Error('File must be a PDF or a photo (JPEG, PNG, WebP, BMP)'), { statusCode: 400 });
}

export function decodeMenuFileBase64(raw: unknown): Buffer {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw Object.assign(new Error('No menu file provided'), { statusCode: 400 });
  }
  const stripped = raw.trim().replace(/^data:[^;]+;base64,/i, '');
  let buffer: Buffer;
  try {
    buffer = Buffer.from(stripped, 'base64');
  } catch {
    throw Object.assign(new Error('Invalid file encoding'), { statusCode: 400 });
  }
  if (!buffer.length) {
    throw Object.assign(new Error('Invalid file encoding'), { statusCode: 400 });
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw Object.assign(new Error(`File exceeds the ${MAX_PDF_BYTES}-byte size limit`), { statusCode: 400 });
  }
  return buffer;
}

export function decodePdfBase64(raw: unknown): Buffer {
  return decodeMenuFileBase64(raw);
}
