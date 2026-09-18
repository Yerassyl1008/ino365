'use client';

import { useRef, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { FileText, Image as ImageIcon, Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { useConfirm } from '@/hooks/use-confirm';

const MAX_PDF_MB = 15;

type PreviewItem = {
  name: string;
  price: number | string;
  description: string;
  category: string;
  selected: boolean;
};

type ImportResult = {
  created?: number;
  skipped?: number;
  failed?: number;
  categories_created?: number;
  replaced_products?: number;
  errors?: string[];
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export default function PdfMenuImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const t = useTranslations('products');
  const tCommon = useTranslations('common');
  const { confirm, ConfirmDialog } = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [replaceMenu, setReplaceMenu] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setFileName('');
    setParsing(false);
    setImporting(false);
    setItems([]);
    setWarnings([]);
    setSkippedCount(0);
    setReplaceMenu(false);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      toast.error(t('pdfTooLarge', { size: MAX_PDF_MB }));
      return;
    }
    setFileName(file.name);
    setResult(null);
    setItems([]);
    setWarnings([]);
    setSkippedCount(0);
    setParsing(true);
    try {
      const file_base64 = await fileToBase64(file);
      const res = await api.post('/menu-pdf/parse', { file_base64, pdf_base64: file_base64 });
      const parsed = (res.data.items || []) as Omit<PreviewItem, 'selected'>[];
      setItems(parsed.map((item) => ({
        name: item.name || '',
        price: item.price,
        description: item.description || '',
        category: item.category || '',
        selected: Boolean(item.name),
      })));
      setWarnings(Array.isArray(res.data.warnings) ? res.data.warnings : []);
      setSkippedCount(Number(res.data.skipped_count) || 0);
      if (!parsed.length) {
        toast.error(t('pdfNoItems'));
      }
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message || t('pdfParseFailed'));
    } finally {
      setParsing(false);
    }
  };

  const selectedItems = items.filter((item) => item.selected && item.name.trim());
  const allSelected = items.length > 0 && items.every((item) => item.selected);

  const updateItem = (index: number, patch: Partial<PreviewItem>) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const handleImport = async () => {
    if (!selectedItems.length) return;
    if (replaceMenu) {
      const ok = await confirm(t('pdfReplaceHint'), {
        title: t('pdfReplace'),
        confirmLabel: t('pdfImport'),
        destructive: true,
      });
      if (!ok) return;
    }

    setImporting(true);
    try {
      const payload = selectedItems.map((item) => ({
        name: item.name.trim(),
        price: Number(item.price),
        description: String(item.description || '').trim(),
        category: String(item.category || '').trim(),
      })).filter((item) => item.name && Number.isFinite(item.price) && item.price >= 0);

      const res = await api.post('/menu-pdf/import', { items: payload, replace: replaceMenu });
      setResult(res.data);
      onImported();
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message || tCommon('importFailed'));
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-card rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
          <div className="flex justify-between items-center p-6 border-b border-border shrink-0">
            <h2 className="text-lg font-bold">{t('pdfModalTitle')}</h2>
            <button onClick={handleClose} className="text-gray-400 hover:text-muted-foreground">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 space-y-5">
            <p className="text-sm text-muted-foreground">{t('pdfHint')}</p>

            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted transition-colors">
              <Upload size={20} className="text-gray-400 mb-1" />
              <span className="text-sm text-muted-foreground text-center px-3">
                {parsing ? t('pdfParsing') : fileName || t('pdfChooseFile')}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png,image/webp,.webp,image/bmp,.bmp,image/gif,.gif"
                className="hidden"
                onChange={(e) => { void handleFile(e.target.files?.[0]); }}
              />
            </label>

            {(warnings.includes('ocr_used') || warnings.includes('scanned_or_empty')) && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {warnings.includes('ocr_used') ? t('pdfOcrHint') : t('pdfScannedHint')}
              </div>
            )}

            {items.length > 0 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {t('pdfPreviewCount', { count: items.length })}
                    {skippedCount > 0 ? ` · ${t('pdfUnreadable')}: ${skippedCount}` : ''}
                  </p>
                  <button
                    type="button"
                    className="text-sm text-brand hover:underline"
                    onClick={() => setItems((current) => current.map((item) => ({ ...item, selected: !allSelected })))}
                  >
                    {t('pdfSelectAll')}
                  </button>
                </div>

                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="max-h-80 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="p-2 w-10" />
                          <th className="text-start p-2">{t('nameLabel')}</th>
                          <th className="text-start p-2">{t('columnCategory')}</th>
                          <th className="text-end p-2 w-28">{t('columnPrice')}</th>
                          <th className="text-start p-2">{t('categoryDescription')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map((item, index) => (
                          <tr key={index} className={item.selected ? '' : 'opacity-50'}>
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={(e) => updateItem(index, { selected: e.target.checked })}
                                className="rounded border-gray-300 dark:border-border text-brand focus:ring-brand"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                value={item.name}
                                onChange={(e) => updateItem(index, { name: e.target.value })}
                                className="w-full px-2 py-1 border border-border rounded-md bg-background"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                value={item.category}
                                onChange={(e) => updateItem(index, { category: e.target.value })}
                                className="w-full px-2 py-1 border border-border rounded-md bg-background"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.price}
                                onChange={(e) => updateItem(index, { price: e.target.value })}
                                className="w-full px-2 py-1 border border-border rounded-md bg-background text-end"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                value={item.description}
                                onChange={(e) => updateItem(index, { description: e.target.value })}
                                className="w-full px-2 py-1 border border-border rounded-md bg-background"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{t('pdfMergeHint')}</p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={replaceMenu}
                    onChange={(e) => setReplaceMenu(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 dark:border-border text-brand focus:ring-brand"
                  />
                  <span>
                    <span className="font-medium">{t('pdfReplace')}</span>
                    <span className="block text-xs text-muted-foreground">{t('pdfReplaceHint')}</span>
                  </span>
                </label>
              </>
            )}

            {result && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border-b border-border">
                  <CheckCircle size={15} className="text-green-600" />
                  <span className="text-sm font-medium text-green-800">{t('importComplete')}</span>
                </div>
                <div className="px-4 py-3 text-sm text-foreground space-y-1">
                  <p>{tCommon('created')} <span className="font-medium">{String(result.created ?? 0)}</span></p>
                  <p>{t('pdfCategoriesCreated')} <span className="font-medium">{String(result.categories_created ?? 0)}</span></p>
                  <p>{tCommon('skipped')} <span className="font-medium">{String(result.skipped ?? 0)}</span></p>
                </div>
                {Array.isArray(result.errors) && result.errors.length > 0 && (
                  <div className="px-4 py-3 border-t border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={14} className="text-red-500" />
                      <span className="text-xs font-medium text-red-700">{t('csvSkippedErrors')}</span>
                    </div>
                    <ul className="space-y-1">
                      {result.errors.map((error, i) => (
                        <li key={i} className="text-xs text-muted-foreground">{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 p-6 border-t border-border shrink-0">
            <Button variant="outline" onClick={handleClose}>{tCommon('cancel')}</Button>
            <Button onClick={() => { void handleImport(); }} disabled={!selectedItems.length || importing || parsing}>
              {importing ? t('pdfImporting') : `${t('pdfImport')} (${selectedItems.length})`}
            </Button>
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </>
  );
}

export function PdfMenuImportButton({ onImported }: { onImported: () => void }) {
  const t = useTranslations('products');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileText size={16} className="me-1" />
        <ImageIcon size={16} className="me-1" /> {t('pdfImport')}
      </Button>
      <PdfMenuImportModal open={open} onClose={() => setOpen(false)} onImported={onImported} />
    </>
  );
}
