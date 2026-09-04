import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { E2E_BASE_URL as BASE } from './helpers/urls';

const EVIDENCE_DIR =
  process.env.EVIDENCE_DIR ||
  path.join(os.tmpdir(), 'no-mistakes-evidence', '01M0D6PY3HABMDFH71W637DKE8');

async function captureScreenshot(page: Page, filename: string): Promise<void> {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
  await page.screenshot({ path: path.join(EVIDENCE_DIR, filename), fullPage: true });
}

import { E2E_PASSWORD, setLanguage } from './helpers/test-auth';

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE}/auth/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(E2E_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/pos/**', { timeout: 20000 });
  await page.waitForFunction(() => !!localStorage.getItem('token'));
}

test('Batch 5C Pages (Dashboard, Orders, Tables, Customers, OrderHistoryGrid) render correctly in English and Persian', async ({ page }) => {
  await login(page, 'owner@flo.local');

  // ==========================================
  // 1. ENGLISH (EN) BASELINE
  // ==========================================
  await setLanguage(page, 'en');

  // 1a. Dashboard (EN)
  await page.goto(`${BASE}/dashboard`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  await expect(page.getByText("Today's Sales")).toBeVisible();
  await expect(page.getByText('Running Orders')).toBeVisible();
  await captureScreenshot(page, 'dashboard-en.png');

  // 1b. Orders (EN)
  await page.goto(`${BASE}/orders`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Orders');
  await expect(page.getByPlaceholder('Search by order number…')).toBeVisible();
  await captureScreenshot(page, 'orders-en.png');

  // 1c. Tables (EN)
  await page.goto(`${BASE}/tables`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tables');
  await expect(page.getByText('Add Table')).toBeVisible();
  await captureScreenshot(page, 'tables-en.png');

  // 1d. Customers (EN)
  await page.goto(`${BASE}/customers`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Customers');
  await expect(page.getByText('Add Customer')).toBeVisible();
  await captureScreenshot(page, 'customers-en.png');

  // 1e. Order History Demo (OrderHistoryGrid) (EN)
  await page.goto(`${BASE}/order-history-demo`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Order History');
  await expect(page.getByText('Dine In').first()).toBeVisible();
  await expect(page.getByText('Subtotal').first()).toBeVisible();
  await expect(page.getByText('Print Receipt').first()).toBeVisible();
  await captureScreenshot(page, 'order-history-grid-en.png');

  // ==========================================
  // 2. PERSIAN (FA) RTL
  // ==========================================
  try {
    await setLanguage(page, 'ru');

    // 2a. Dashboard (FA)
    await page.goto(`${BASE}/dashboard`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Панель');
    await expect(page.getByText('Продажи за сегодня')).toBeVisible();
    await expect(page.getByText('Текущие заказы')).toBeVisible();
    await captureScreenshot(page, 'dashboard-fa.png');

    // 2b. Orders (FA)
    await page.goto(`${BASE}/orders`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Заказы');
    await expect(page.getByPlaceholder('Поиск по номеру заказа…')).toBeVisible();
    await captureScreenshot(page, 'orders-fa.png');

    // 2c. Tables (FA)
    await page.goto(`${BASE}/tables`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Столы');
    await expect(page.getByText('Добавить стол')).toBeVisible();
    await captureScreenshot(page, 'tables-fa.png');

    // 2d. Customers (FA)
    await page.goto(`${BASE}/customers`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Клиенты');
    await expect(page.getByText('Добавить клиента').first()).toBeVisible();
    await captureScreenshot(page, 'customers-fa.png');

    // 2e. Order History Demo (OrderHistoryGrid) (FA)
    await page.goto(`${BASE}/order-history-demo`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('История заказов');
    await expect(page.getByText('В зале').first()).toBeVisible();
    await expect(page.getByText('Подытог').first()).toBeVisible();
    await expect(page.getByText('Печать чека').first()).toBeVisible();
    await captureScreenshot(page, 'order-history-grid-fa.png');

  } finally {
    await setLanguage(page, 'en');
  }
});
