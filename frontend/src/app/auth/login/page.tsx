'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { getLandingPage } from '@/components/layout/AuthGuard';
import { useAuthStore, StorageUnavailableError } from '@/store/auth';
import { parseLoginFailure } from '@/lib/login-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';
import { ROLE_LABEL_KEYS, BUSINESS_TYPE_LABEL_KEYS } from '@/lib/i18n-enums';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, pinLogin, selectTenant, user, tenants, currentTenant, loadFromStorage } = useAuthStore();
  const t = useTranslations('auth');
  const tStaff = useTranslations('staff');
  const tBusinessType = useTranslations('businessType');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'pin' | 'email'>('pin');
  const [pin, setPin] = useState('');

  useEffect(() => {
    fetch('/api/auth/setup/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.needsSetup) router.replace('/setup');
      })
      .catch(() => {});

    fetch('/api/health')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.status !== 'ok') {
          setDbError(data.db || t('dbErrorPrefix'));
        }
      })
      .catch(() => {});
  }, [router, t]);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const handleTenantSelect = useCallback(async (tenantId: number) => {
    setLoading(true);
    try {
      await selectTenant(tenantId);
      // useEffect on currentTenant will handle the redirect
    } catch {
      toast.error(t('selectBusinessFailed'));
    } finally {
      setLoading(false);
    }
  }, [selectTenant, t]);

  useEffect(() => {
    // Single-tenant sessions are already auto-selected by the auth store —
    // login() and loadFromStorage() set currentTenant when tenants.length === 1.
    // Deliberately no auto-select here: it raced manual selection through
    // selectTenant() and the shared loading flag for one login attempt (#229).
    if (user && currentTenant) {
      router.push(getLandingPage(currentTenant?.role, currentTenant?.business_type));
    }
  }, [user, currentTenant, router]);

  const applyLoginFailure = (err: unknown) => {
    if (err instanceof StorageUnavailableError) {
      setLoginError(t('storageUnavailable'));
      return;
    }
    const failure = parseLoginFailure(err);
    if (failure.status === 401) {
      const remaining = failure.attemptsRemaining;
      if (remaining === 0) {
        const mins = failure.lockoutMinutes ?? 15;
        setLoginError(t('lockedOut', { minutes: mins }));
      } else if (typeof remaining === 'number' && remaining < 4) {
        setLoginError(
          (mode === 'pin' ? t('invalidPin') : t('invalidCredentials')) + ' ' +
          t('attemptsRemaining', { count: remaining })
        );
      } else {
        setLoginError(mode === 'pin' ? t('invalidPin') : t('invalidCredentials'));
      }
    } else if (failure.status === 429) {
      setLoginError(t('lockedOut', { minutes: 15 }));
    } else if (failure.status === undefined) {
      setLoginError(t('connectionFailed'));
    } else {
      setDbError(t('loginFailed'));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError(null);
    try {
      await login(email, password, rememberMe);
      toast.success(t('signInSuccess'));
    } catch (err: unknown) {
      applyLoginFailure(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async (nextPin?: string) => {
    const value = nextPin ?? pin;
    if (value.length < 4 || loading) return;
    setLoading(true);
    setLoginError(null);
    try {
      await pinLogin(value, rememberMe);
      toast.success(t('signInSuccess'));
    } catch (err: unknown) {
      setPin('');
      applyLoginFailure(err);
    } finally {
      setLoading(false);
    }
  };

  const appendPinDigit = (digit: string) => {
    if (loading) return;
    setPin((current) => (current + digit).slice(0, 6));
  };



  const shouldShowTenantSelect = !!(user && (tenants.length > 1 || searchParams.get('select_tenant') === 'true'));

  if (shouldShowTenantSelect) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-2xl font-bold mb-2">{t('selectBusiness')}</h2>
              <p className="text-muted-foreground text-sm mb-6">{t('selectBusinessHint')}</p>
              <div className="space-y-3">
                {tenants.map((tenant) => {
                  const businessTypeKey = tenant.business_type
                    ? BUSINESS_TYPE_LABEL_KEYS[tenant.business_type as keyof typeof BUSINESS_TYPE_LABEL_KEYS]
                    : undefined;
                  const roleKey = tenant.role ? ROLE_LABEL_KEYS[tenant.role] : undefined;
                  return (
                    <button
                      key={tenant.id}
                      onClick={() => handleTenantSelect(tenant.id)}
                      disabled={loading}
                      className="w-full text-start p-4 border rounded-lg hover:border-primary hover:bg-accent transition-colors group"
                    >
                      <div className="font-semibold group-hover:text-primary">{tenant.business_name}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {businessTypeKey ? tBusinessType(businessTypeKey) : tenant.business_type ?? ''} &middot; {roleKey ? tStaff(roleKey) : tenant.role ?? ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Flo" width={120} height={77} className="mx-auto mb-3" />
          <p className="text-muted-foreground mt-2">{t('signInTitle')}</p>
        </div>
        {dbError && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <strong>{t('dbErrorPrefix')}</strong> {dbError}
          </div>
        )}
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => { setMode('pin'); setLoginError(null); }}
                className={`min-h-11 rounded-md text-sm font-medium ${mode === 'pin' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
              >
                {t('pinTab')}
              </button>
              <button
                type="button"
                onClick={() => { setMode('email'); setLoginError(null); }}
                className={`min-h-11 rounded-md text-sm font-medium ${mode === 'email' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
              >
                {t('emailTab')}
              </button>
            </div>
            {mode === 'pin' ? (
              <form
                onSubmit={(e) => { e.preventDefault(); void handlePinLogin(); }}
                className="space-y-4"
              >
                <p className="text-sm text-muted-foreground text-center">{t('pinLoginHint')}</p>
                <div className="rounded-lg border border-border px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-foreground" dir="ltr">
                  {pin ? '•'.repeat(pin.length) : '••••'}
                </div>
                <div className="grid grid-cols-3 gap-2" dir="ltr">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        if (key === 'C') setPin('');
                        else if (key === '⌫') setPin((current) => current.slice(0, -1));
                        else appendPinDigit(key);
                      }}
                      className="min-h-12 rounded-xl border border-border bg-card text-lg font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      {key === 'C' ? t('pinClear') : key}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-input text-primary focus:ring-primary"
                  />
                  {t('rememberMe')}
                </label>
                {loginError && (
                  <p className="text-sm text-destructive text-center">{loginError}</p>
                )}
                <Button type="submit" disabled={loading || pin.length < 4} className="w-full" size="lg">
                  {loading ? t('signingIn') : t('pinLogin')}
                </Button>
              </form>
            ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('emailPlaceholder')} dir="ltr" required className="text-foreground caret-foreground" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('password')}</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('passwordPlaceholder')} className="pe-10 text-foreground caret-foreground" required />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary"
                />
                {t('rememberMe')}
              </label>
              {loginError && (
                <p className="text-sm text-destructive text-center">{loginError}</p>
              )}
              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? t('signingIn') : t('signIn')}
              </Button>
              <button
                type="button"
                onClick={() => router.push('/auth/recover')}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('forgotPasswordLink')}
              </button>
            </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
