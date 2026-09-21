/**
 * Offline OCR for menu photos and scanned PDF pages (Tesseract rus+eng).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { createWorker, PSM, type Worker } from 'tesseract.js';

const MAX_OCR_PAGES = 12;
const MAX_OCR_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_OCR_SIDE = 2000;

function packagedResources(): string | null {
  try {
    const electron = require('electron') as { app?: { isPackaged?: boolean } };
    if (electron?.app?.isPackaged && typeof process.resourcesPath === 'string') {
      return process.resourcesPath;
    }
  } catch {
    // tests stub electron; unpackaged `npm start`
  }
  return null;
}

function userDataDir(): string | null {
  try {
    const electron = require('electron') as { app?: { getPath?: (name: string) => string } };
    if (typeof electron?.app?.getPath === 'function') {
      return electron.app.getPath('userData');
    }
  } catch {
    // tests / plain node
  }
  return null;
}

export function tessdataDir(): string {
  const fromEnv = process.env.FLO_TESSDATA;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const packaged = packagedResources();
  const candidates = [
    packaged ? path.join(packaged, 'tessdata') : '',
    path.join(__dirname, '../../../resources/tessdata'),
    path.join(__dirname, '../../resources/tessdata'),
    path.join(process.cwd(), 'resources/tessdata'),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'rus.traineddata.gz')) || fs.existsSync(path.join(dir, 'rus.traineddata'))) {
      return dir;
    }
  }
  return candidates[1] || candidates[0];
}

function hasLangFile(dir: string, lang: string): boolean {
  return fs.existsSync(path.join(dir, `${lang}.traineddata.gz`)) || fs.existsSync(path.join(dir, `${lang}.traineddata`));
}

function hasLangData(dir: string): boolean {
  return hasLangFile(dir, 'rus') && hasLangFile(dir, 'eng');
}

/**
 * Tesseract.js treats a filesystem `langPath` as an HTTP URL when `is-electron`
 * is true, then node-fetch throws "Only absolute URLs are supported".
 * Unpack gzip models to a real `.traineddata` cache and load via cachePath.
 */
export function prepareTessLangDir(): string {
  const src = tessdataDir();
  if (!hasLangData(src)) {
    throw Object.assign(
      new Error('OCR language files are missing. Reinstall the app or run scripts/ensure-tessdata.cjs'),
      { statusCode: 500 },
    );
  }

  const uncompressed =
    fs.existsSync(path.join(src, 'rus.traineddata'))
    && fs.existsSync(path.join(src, 'eng.traineddata'));
  if (uncompressed) return src;

  const dest = path.join(userDataDir() || os.tmpdir(), 'flo-tessdata');
  fs.mkdirSync(dest, { recursive: true });
  for (const lang of ['eng', 'rus']) {
    const outFile = path.join(dest, `${lang}.traineddata`);
    try {
      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 10_000) continue;
    } catch {
      // rewrite below
    }
    const raw = path.join(src, `${lang}.traineddata`);
    if (fs.existsSync(raw)) {
      fs.copyFileSync(raw, outFile);
      continue;
    }
    const gz = path.join(src, `${lang}.traineddata.gz`);
    fs.writeFileSync(outFile, zlib.gunzipSync(fs.readFileSync(gz)));
  }
  return dest;
}

function workerScriptPath(): string {
  try {
    return require.resolve('tesseract.js/src/worker-script/node/index.js');
  } catch {
    return path.join(
      path.dirname(require.resolve('tesseract.js/package.json')),
      'src/worker-script/node/index.js',
    );
  }
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const langPath = prepareTessLangDir();
      const worker = await createWorker('rus+eng', 1, {
        workerPath: workerScriptPath(),
        langPath,
        cachePath: langPath,
        cacheMethod: 'readOnly',
        gzip: false,
        logger: () => undefined,
        errorHandler: (error) => {
          console.error('[menu-ocr] tesseract:', error);
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      return worker;
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export function sniffImageKind(buffer: Buffer): 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'heic' | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'gif';
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'bmp';
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (/heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(brand)) return 'heic';
  }
  return null;
}

export function heicUnsupportedError(): Error & { statusCode: number; code: string } {
  return Object.assign(
    new Error('HEIC photos are not supported. Save the photo as JPEG and try again.'),
    { statusCode: 400, code: 'heic_unsupported' },
  );
}

/** Pull embedded JPEGs out of scan-to-PDF files (common phone "PDF photo"). */
export function extractEmbeddedJpegs(buffer: Buffer): Buffer[] {
  const images: Buffer[] = [];
  for (let i = 0; i < buffer.length - 3; i++) {
    if (buffer[i] !== 0xff || buffer[i + 1] !== 0xd8 || buffer[i + 2] !== 0xff) continue;
    let end = i + 3;
    while (end < buffer.length - 1) {
      if (buffer[end] === 0xff && buffer[end + 1] === 0xd9) {
        const slice = buffer.subarray(i, end + 2);
        if (slice.length >= 8_000 && slice.length <= MAX_OCR_IMAGE_BYTES) {
          images.push(Buffer.from(slice));
        }
        i = end + 1;
        break;
      }
      end++;
    }
  }
  return images.slice(0, MAX_OCR_PAGES);
}

async function renderPdfPages(buffer: Buffer): Promise<Buffer[]> {
  let createCanvas: ((w: number, h: number) => { getContext: (t: string) => unknown; toBuffer: (t: string) => Buffer; width: number; height: number }) | null = null;
  try {
    createCanvas = require('@napi-rs/canvas').createCanvas;
  } catch {
    return [];
  }
  if (!createCanvas) return [];

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
  const workerPath = path.join(
    path.dirname(require.resolve('pdfjs-dist/package.json')),
    'legacy/build/pdf.worker.mjs',
  );
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  }

  class NodeCanvasFactory {
    create(width: number, height: number) {
      const canvas = createCanvas!(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
      return { canvas, context: canvas.getContext('2d') };
    }
    reset(pair: { canvas: { width: number; height: number } }, width: number, height: number) {
      pair.canvas.width = Math.max(1, Math.floor(width));
      pair.canvas.height = Math.max(1, Math.floor(height));
    }
    destroy(pair: { canvas: { width: number; height: number } | null; context: unknown }) {
      if (pair.canvas) {
        pair.canvas.width = 0;
        pair.canvas.height = 0;
      }
      pair.canvas = null;
      pair.context = null;
    }
  }

  const data = Uint8Array.from(buffer);
  const doc = await pdfjs.getDocument({
    data,
    canvasFactory: new NodeCanvasFactory(),
    disableFontFace: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;

  const pageCount = Math.min(doc.numPages || 0, MAX_OCR_PAGES);
  const pages: Buffer[] = [];
  for (let n = 1; n <= pageCount; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 2 });
    const factory = new NodeCanvasFactory();
    const canvasAndContext = factory.create(viewport.width, viewport.height);
    await page.render({
      canvasContext: canvasAndContext.context,
      viewport,
      canvasFactory: factory,
    }).promise;
    const png = (canvasAndContext.canvas as { toBuffer: (t: string) => Buffer }).toBuffer('image/png');
    if (png.length > 0) pages.push(png);
    factory.destroy(canvasAndContext);
  }
  try { await doc.destroy(); } catch { /* ignore */ }
  return pages;
}

export async function pdfPagesAsImages(buffer: Buffer): Promise<Buffer[]> {
  const embedded = extractEmbeddedJpegs(buffer);
  if (embedded.length > 0) return embedded;
  try {
    return await renderPdfPages(buffer);
  } catch (error) {
    console.warn('[menu-ocr] PDF page render failed:', (error as Error)?.message || error);
    return [];
  }
}

async function downscaleForOcr(image: Buffer): Promise<Buffer> {
  try {
    const { loadImage, createCanvas } = require('@napi-rs/canvas') as {
      loadImage: (buf: Buffer) => Promise<{ width: number; height: number }>;
      createCanvas: (w: number, h: number) => {
        getContext: (t: '2d') => { drawImage: (img: unknown, x: number, y: number, w: number, h: number) => void };
        toBuffer: (t: string) => Buffer;
      };
    };
    const img = await loadImage(image);
    const maxSide = Math.max(img.width, img.height);
    if (!maxSide || maxSide <= MAX_OCR_SIDE) return image;
    const scale = MAX_OCR_SIDE / maxSide;
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = createCanvas(width, height);
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    return canvas.toBuffer('image/png');
  } catch {
    return image;
  }
}

function ocrFailure(error: unknown): Error {
  const message = String((error as Error)?.message || error || '');
  if (/missing|traineddata/i.test(message)) {
    return Object.assign(
      new Error('OCR language files are missing. Reinstall the app or run scripts/ensure-tessdata.cjs'),
      { statusCode: 500 },
    );
  }
  return Object.assign(
    new Error('Could not read text from this photo. Try a clearer JPEG or PNG.'),
    { statusCode: 500 },
  );
}

async function recognizeOne(image: Buffer): Promise<string> {
  if (image.length > MAX_OCR_IMAGE_BYTES) {
    throw Object.assign(new Error('Photo is too large for OCR'), { statusCode: 400 });
  }
  try {
    const prepared = await downscaleForOcr(image);
    const worker = await getWorker();
    const result = await worker.recognize(prepared);
    return String(result?.data?.text || '').trim();
  } catch (error) {
    throw ocrFailure(error);
  }
}

export async function ocrImages(images: Buffer[]): Promise<string> {
  const chunks: string[] = [];
  const limited = images.slice(0, MAX_OCR_PAGES);
  for (const image of limited) {
    const text = await recognizeOne(image);
    if (text) chunks.push(text);
  }
  return chunks.join('\n');
}

export async function ocrImage(buffer: Buffer): Promise<string> {
  const kind = sniffImageKind(buffer);
  if (kind === 'heic') throw heicUnsupportedError();
  if (!kind) {
    throw Object.assign(new Error('File is not a supported photo (JPEG, PNG, WebP, BMP)'), { statusCode: 400 });
  }
  return recognizeOne(buffer);
}
