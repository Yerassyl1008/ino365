/**
 * Offline OCR for menu photos and scanned PDF pages (Tesseract rus+eng).
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createWorker, PSM, type Worker } from 'tesseract.js';

const MAX_OCR_PAGES = 12;
const MAX_OCR_IMAGE_BYTES = 12 * 1024 * 1024;

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

function hasLangData(dir: string): boolean {
  return (
    (fs.existsSync(path.join(dir, 'rus.traineddata.gz')) || fs.existsSync(path.join(dir, 'rus.traineddata')))
    && (fs.existsSync(path.join(dir, 'eng.traineddata.gz')) || fs.existsSync(path.join(dir, 'eng.traineddata')))
  );
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const langPath = tessdataDir();
      if (!hasLangData(langPath)) {
        throw Object.assign(
          new Error('OCR language files are missing. Reinstall the app or run scripts/ensure-tessdata.cjs'),
          { statusCode: 500 },
        );
      }
      const gzip = fs.existsSync(path.join(langPath, 'rus.traineddata.gz'));
      const worker = await createWorker('rus+eng', 1, {
        langPath,
        cachePath: langPath,
        cacheMethod: 'none',
        gzip,
        logger: () => undefined,
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      });
      return worker;
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export function sniffImageKind(buffer: Buffer): 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | null {
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
  return null;
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

async function recognizeOne(image: Buffer): Promise<string> {
  if (image.length > MAX_OCR_IMAGE_BYTES) {
    throw Object.assign(new Error('Photo is too large for OCR'), { statusCode: 400 });
  }
  const worker = await getWorker();
  const result = await worker.recognize(image);
  return String(result?.data?.text || '').trim();
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
  if (!kind) {
    throw Object.assign(new Error('File is not a supported photo (JPEG, PNG, WebP, BMP)'), { statusCode: 400 });
  }
  return recognizeOne(buffer);
}
