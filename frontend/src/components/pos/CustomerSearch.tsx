'use client';

import { useState, useRef, useEffect } from 'react';
import api from '@/lib/api';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';
import { usePosSettingsStore } from '@/store/pos-settings';
import { X, Pencil, Gift } from 'lucide-react';
import toast from 'react-hot-toast';
import { countryName } from '@/lib/countries';
import { parsePhone, dialCodeFor } from '@/lib/phone';
import type { Customer } from '@/lib/types';
import EditCustomerModal from './EditCustomerModal';
import { Ltr } from '@/components/layout/Ltr';

import { useTranslations } from 'use-intl';

interface Props {
  onSelected?: () => void;
}

const TAG_COLORS: Record<string, string> = {
  veg:    'bg-green-100 text-green-700',
  nonveg: 'bg-red-100 text-red-700',
  vegan:  'bg-emerald-100 text-emerald-700',
  spicy:  'bg-orange-100 text-orange-700',
};

function tagColor(tag: string) {
  return TAG_COLORS[tag.toLowerCase()] ?? 'bg-muted text-muted-foreground';
}

function digitsOnly(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

function phoneMatchesInput(customerPhoneDigits: string | null | undefined, inputDigits: string): boolean {
  if (!customerPhoneDigits || !inputDigits) return false;
  return customerPhoneDigits.includes(inputDigits);
}

function TagBadges({ counts }: { counts: Record<string, number> }) {
  const t = useTranslations('pos');
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([tag, count]) => (
        <span key={tag} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tagColor(tag)}`}>
          {t('tagCount', { tag, count })}
        </span>
      ))}
    </div>
  );
}

export default function CustomerSearch({ onSelected }: Props = {}) {
  const cart = useCartStore();
  const { currentTenant } = useAuthStore();
  const enforcePhoneLength = usePosSettingsStore((s) => s.enforcePhoneLength);
  const t = useTranslations('pos');
  const country = currentTenant?.country ?? 'IN';
  const dialCode = dialCodeFor(country);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [matched, setMatched] = useState<Customer | null>(null);
  const [searched, setSearched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const requestAbortRef = useRef<AbortController | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const autoAdvancedRef = useRef(false);

  const customer = cart.customer;
  const isNew = searched && !matched;

  // Reset the stale balance the moment the customer changes, read directly during render
  // (React's recommended pattern for "adjusting state when a prop changes") so there's no
  // flash of the previous customer's points; the actual fetch stays in the effect below.
  const [syncedCustomerId, setSyncedCustomerId] = useState(customer?.id ?? null);
  if ((customer?.id ?? null) !== syncedCustomerId) {
    setSyncedCustomerId(customer?.id ?? null);
    if (!customer) setLoyaltyPoints(null);
  }

  useEffect(() => {
    if (!customer) return;
    const controller = new AbortController();
    api.get(`/customers/${customer.id}/wallet`, { signal: controller.signal })
      .then((res) => setLoyaltyPoints(res.data.balance))
      .catch((err: unknown) => {
        if (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError')) return;
        setLoyaltyPoints(null);
      });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  useEffect(() => {
    if (cart.customerId && !cart.customer) {
      const controller = new AbortController();
      api.get(`/customers/${cart.customerId}`, { signal: controller.signal })
        .then(res => cart.setCustomer(res.data.customer))
        .catch(() => {});
      return () => controller.abort();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.customerId]);

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      requestAbortRef.current?.abort();
    };
  }, []);

  const searchByPhone = (p: string) => {
    clearTimeout(debounceRef.current);
    requestAbortRef.current?.abort();
    if (p.length < 3) { setMatched(null); setName(''); setSearched(false); return; }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      requestAbortRef.current = controller;
      try {
        const { data } = await api.get(`/customers-search?q=${encodeURIComponent(p)}`, { signal: controller.signal });
        const results = Array.isArray(data) ? data : (data.customers || []);
        const exactMatch = results.find((result: Customer) => phoneMatchesInput(result.phone_digits, p)) || null;
        const found: Customer | null = exactMatch || results[0] || null;
        setMatched(found);
        setName(found ? found.name : '');
        setSearched(true);
      } catch {
        if (controller.signal.aborted) return;
        setMatched(null);
        setName('');
        setSearched(true);
      }
    }, 300);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPhone(val);
    if (matched !== null) setMatched(null);
    if (name !== '') setName('');
    if (searched) setSearched(false);
    if (val.trim() === '') autoAdvancedRef.current = false;
    searchByPhone(digitsOnly(val));

    if (enforcePhoneLength && !autoAdvancedRef.current && parsePhone(val, country)) {
      autoAdvancedRef.current = true;
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  };

  const handleSelectMatched = () => {
    if (!matched) return;
    cart.setCustomer(matched);
    setPhone(''); setName(''); setMatched(null); setSearched(false);
    onSelected?.();
  };

  const handlePhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && matched) {
      handleSelectMatched();
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !phone.trim()) return;
    const parsed = parsePhone(phone, country);
    if (!parsed) {
      toast.error(t('invalidPhone', { country: countryName(country) }));
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post('/customers', { name: name.trim(), phone: parsed.e164, country_code: parsed.countryCode });
      cart.setCustomer(data.customer);
      setPhone(''); setName(''); setMatched(null); setSearched(false);
      toast.success(t('customerCreated'));
      onSelected?.();
    } catch {
      toast.error(t('createCustomerFailed'));
    } finally {
      setCreating(false);
    }
  };

  // Auto-commit when focus leaves the phone/name widget entirely — the user
  // shouldn't have to click Add/Select if they've already moved on.
  const handleWidgetBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (creating) return;
    if (matched) { handleSelectMatched(); return; }
    if (isNew && name.trim() && phone.trim()) { handleCreate(); }
  };

  const handleClear = () => cart.setCustomer(null);

  // ── Shared input classes ───────────────────────────────────────────────────
  const baseInput = 'min-h-11 px-3 border border-border rounded-lg focus:ring-2 focus:ring-brand focus:border-brand outline-none text-sm';

  // ── Customer already selected ──────────────────────────────────────────────
  if (customer) {
    const hasTags = customer.tag_counts && Object.keys(customer.tag_counts).length > 0;

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between px-3 py-2 bg-brand-light rounded-lg text-sm">
          <button onClick={() => setEditingCustomer(true)} className="touch-target flex-1 min-w-0 justify-start gap-2 text-start">
            <span className="font-medium text-brand truncate">{customer.name}</span>
            {customer.phone && <span className="text-xs text-muted-foreground"><Ltr>{customer.phone}</Ltr></span>}
            <Pencil size={14} className="text-brand/60 shrink-0" />
          </button>
          <button onClick={handleClear} className="touch-target rounded-full text-brand hover:text-brand-hover active:bg-card/60 ms-2 shrink-0" aria-label={t('remove')}>
            <X size={16} />
          </button>
        </div>
        {!!loyaltyPoints && loyaltyPoints > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-brand bg-brand-light rounded-full px-1.5 py-0.5">
            <Gift size={11} />
            {t('loyaltyPointsShort', { count: loyaltyPoints })}
          </span>
        )}
        {hasTags && <TagBadges counts={customer.tag_counts!} />}
        {editingCustomer && (
          <EditCustomerModal
            customer={customer}
            onClose={() => setEditingCustomer(false)}
            onSaved={(updated) => cart.setCustomer(updated)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2" onBlur={handleWidgetBlur}>
      <div className="grid grid-cols-1 gap-2">
        <div className="flex items-stretch gap-2">

          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={handlePhoneChange}
            onKeyDown={handlePhoneKeyDown}
            placeholder={dialCode ? `${dialCode} ${t('phone')}` : t('phone')}
            className={`${baseInput} flex-1 py-2`}
            dir="ltr"
          />
        </div>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={matched ? undefined : (e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if (matched) handleSelectMatched();
            else handleCreate();
          }}
          readOnly={!!matched}
          placeholder={searched ? (matched ? '' : t('enterName')) : t('nameAutoFills')}
          className={`${baseInput} w-full py-2 ${matched ? 'bg-muted cursor-pointer' : ''}`}
          onClick={matched ? handleSelectMatched : undefined}
        />
      </div>

      {searched && (
        <div className="space-y-1.5">
          {matched ? (
            <>
              <p className="text-xs text-green-600 font-medium">{t('customerFoundClick')}</p>
              {matched.tag_counts && <TagBadges counts={matched.tag_counts} />}
              <button
                onClick={handleSelectMatched}
                className="touch-target w-full bg-brand text-white text-sm rounded-lg hover:bg-brand-hover active:bg-brand-hover"
              >
                {t('selectName', { name: matched.name })}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-red-500 font-medium">{t('newCustomerEnterName')}</p>
              {name.trim() && (
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="touch-target w-full bg-brand text-white text-sm rounded-lg hover:bg-brand-hover active:bg-brand-hover disabled:opacity-50"
                >
                  {creating ? t('creating') : t('addName', { name: name.trim() })}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
