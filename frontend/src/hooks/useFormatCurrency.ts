import { useAuthStore } from '@/store/auth';
import { formatCurrencyForTenant, resolveDisplayCurrency } from '@/lib/countries';

export function useFormatCurrency() {
  const tenant = useAuthStore((s) => s.currentTenant);
  const country = tenant?.country;
  const currency = resolveDisplayCurrency(country, tenant?.currency);
  const prefs = {
    currencyDisplay: tenant?.currency_display,
    digits: tenant?.number_digits,
  };
  return (n: number) => formatCurrencyForTenant(n, country, currency, prefs);
}
