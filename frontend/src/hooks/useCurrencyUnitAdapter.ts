import { useAuthStore } from '@/store/auth';
import { getCurrencyUnitAdapter, resolveDisplayCurrency, type CurrencyUnitAdapter } from '@/lib/countries';

export function useCurrencyUnitAdapter(): CurrencyUnitAdapter {
  const tenant = useAuthStore((s) => s.currentTenant);
  const country = tenant?.country;
  const currency = resolveDisplayCurrency(country, tenant?.currency);
  const prefs = {
    currencyDisplay: tenant?.currency_display,
    digits: tenant?.number_digits,
  };
  return getCurrencyUnitAdapter(currency, country, prefs);
}
