'use client';

import { useState } from 'react';
import { ChefHat } from 'lucide-react';
import { useTranslations } from 'use-intl';
import type { UseKdsConnectionResult } from '@/hooks/useKdsConnection';

export function KdsLoginForm({ conn }: { conn: UseKdsConnectionResult }) {
  const t = useTranslations('kds');
  const tAuth = useTranslations('auth');
  const [mode, setMode] = useState<'pin' | 'email'>('pin');
  const [pin, setPin] = useState('');

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <ChefHat size={48} className="mx-auto text-brand mb-4" />
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('loginSubtitle')}</p>
        </div>

        <div data-testid="kds-login-form">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              data-testid="kds-login-pin-tab"
              onClick={() => { setMode('pin'); conn.setLoginEmail(''); }}
              className={`min-h-11 rounded-md text-sm font-medium ${mode === 'pin' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
            >
              {tAuth('pinTab')}
            </button>
            <button
              type="button"
              data-testid="kds-login-email-tab"
              onClick={() => setMode('email')}
              className={`min-h-11 rounded-md text-sm font-medium ${mode === 'email' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
            >
              {tAuth('emailTab')}
            </button>
          </div>

          {conn.loginError && (
            <div role="alert" aria-live="polite" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
              {conn.loginError}
            </div>
          )}

          {mode === 'pin' ? (
            <form onSubmit={(e) => void conn.handlePinLogin(e, pin)} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">{tAuth('pinLoginHint')}</p>
              <div className="rounded-lg border border-border px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-foreground" dir="ltr">
                {pin ? '•'.repeat(pin.length) : '••••'}
              </div>
              <div className="grid grid-cols-3 gap-2" dir="ltr">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={conn.loginLoading}
                    onClick={() => {
                      if (key === 'C') setPin('');
                      else if (key === '⌫') setPin((current) => current.slice(0, -1));
                      else setPin((current) => (current + key).slice(0, 6));
                    }}
                    className="min-h-12 rounded-xl border border-border bg-card text-lg font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {key === 'C' ? tAuth('pinClear') : key}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={conn.rememberMe}
                  onChange={(e) => conn.setRememberMe(e.target.checked)}
                  className="rounded border-gray-300 dark:border-border text-brand focus:ring-brand"
                />
                {tAuth('rememberMe')}
              </label>
              <button
                type="submit"
                disabled={conn.loginLoading || pin.length < 4}
                className="w-full py-3 bg-brand text-white font-semibold rounded-lg hover:bg-brand/90 disabled:opacity-50"
              >
                {conn.loginLoading ? tAuth('signingIn') : tAuth('pinLogin')}
              </button>
            </form>
          ) : (
            <form onSubmit={conn.handleLogin} className="space-y-4">
              <div>
                <label htmlFor="kds-login-email" className="block text-sm font-medium text-foreground mb-1">{tAuth('email')}</label>
                <input
                  id="kds-login-email"
                  data-testid="kds-login-email"
                  type="email"
                  value={conn.loginEmail}
                  onChange={(e) => conn.setLoginEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-border bg-card rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="chef@flo.local"
                  required
                />
              </div>

              <div>
                <label htmlFor="kds-login-password" className="block text-sm font-medium text-foreground mb-1">{tAuth('password')}</label>
                <input
                  id="kds-login-password"
                  data-testid="kds-login-password"
                  type="password"
                  value={conn.loginPassword}
                  onChange={(e) => conn.setLoginPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-border bg-card rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="••••••••"
                  required
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={conn.rememberMe}
                  onChange={(e) => conn.setRememberMe(e.target.checked)}
                  className="rounded border-gray-300 dark:border-border text-brand focus:ring-brand"
                />
                {tAuth('rememberMe')}
              </label>

              <button
                data-testid="kds-login-submit"
                type="submit"
                disabled={conn.loginLoading}
                className="w-full py-3 bg-brand text-white font-semibold rounded-lg hover:bg-brand/90 disabled:opacity-50"
              >
                {conn.loginLoading ? tAuth('signingIn') : tAuth('signIn')}
              </button>
            </form>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">{t('loginHint')}</p>
      </div>
    </div>
  );
}
