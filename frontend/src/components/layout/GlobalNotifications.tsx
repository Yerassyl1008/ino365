import { useEffect, useState } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { useAuthStore } from '@/store/auth';
import { ROLE_ACCESS, hasRole } from '@shared/role-permissions';
import api from '@/lib/api';

export default function GlobalNotifications() {
  const tCustomers = useTranslations('customers');
  const tCommon = useTranslations('common');
  const { currentTenant } = useAuthStore();
  const [invalidPhonesCount, setInvalidPhonesCount] = useState(0);
  const canViewAlerts = hasRole(currentTenant?.role, ROLE_ACCESS.sales);

  useEffect(() => {
    if (!canViewAlerts) return;
    const fetchAlerts = () => {
      api.get('/customers/alerts')
        .then(res => {
          setInvalidPhonesCount(res.data?.invalidPhonesCount || 0);
        })
        .catch(() => {});
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, [canViewAlerts]);

  if (invalidPhonesCount === 0) return null;

  const displayMsg = tCustomers('invalidPhoneCount', { count: invalidPhonesCount });

  return (
    <div className="bg-red-50 border-b border-red-100 px-4 py-2 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <AlertCircle className="text-red-500 w-5 h-5 shrink-0" />
        <p className="text-sm text-red-800 font-medium">
          {displayMsg}
        </p>
        <Link 
          href="/customers?filter=invalid_phones" 
          className="text-sm text-red-600 hover:text-red-700 font-bold flex items-center underline underline-offset-2"
        >
          {tCommon('reviewFix')} <ChevronRight className="w-4 h-4 ms-0.5 rtl-flip" />
        </Link>
      </div>
    </div>
  );
}
