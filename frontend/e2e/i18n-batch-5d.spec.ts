import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  E2E_BASE_URL,
  E2E_KDS_BASE_URL,
  E2E_SERVER_APP_BASE_URL,
} from './helpers/urls';

const BASE_API = E2E_BASE_URL;
const BASE_KDS = E2E_KDS_BASE_URL;
const BASE_SERVER_APP = E2E_SERVER_APP_BASE_URL;
const EVIDENCE_DIR =
  process.env.EVIDENCE_DIR ||
  path.join(os.tmpdir(), 'no-mistakes-evidence', '01M0D9465DMYWJPCZS0XR240HB');

async function captureScreenshot(page: Page, filename: string): Promise<void> {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
  await page.screenshot({ path: path.join(EVIDENCE_DIR, filename), fullPage: true });
}

import * as jwt from 'jsonwebtoken';

function getE2eToken(userId = 'e2e-manager', email = 'manager@flo.local', role = 'manager'): string {
  const secret = process.env.JWT_SECRET || 'e2e-test-secret';
  return jwt.sign({ userId, email, role }, secret, { expiresIn: '1h' });
}

async function setLanguage(page: Page, token: string, value: string): Promise<void> {
  const res = await page.request.put(`${BASE_API}/api/settings/language`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { value },
  });
  expect(res.ok(), `setting language=${value} should succeed (status ${res.status()})`).toBeTruthy();
  await page.evaluate((lang) => {
    try {
      const raw = localStorage.getItem('pos-settings');
      const parsed = raw ? JSON.parse(raw) : { state: {} };
      parsed.state = { ...parsed.state, language: lang };
      localStorage.setItem('pos-settings', JSON.stringify(parsed));
    } catch {}
  }, value);
}

test('Batch 5D: KDS and Server App render and function correctly in English and Persian (RTL)', async ({ page }) => {
  // 1. Setup session & seed data
  const token = getE2eToken();
  const serverToken = getE2eToken('e2e-server', 'server@flo.local', 'server');

  // Create table if not present
  await page.request.post(`${BASE_API}/api/tables`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { number: 'Table 1', capacity: 4 },
  });

  // Create a dine-in order with items
  const orderRes = await page.request.post(`${BASE_API}/api/orders`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      type: 'dine_in',
      items: [{ product_id: 'e2e-product', quantity: 2, notes: 'Extra hot' }],
    },
  });
  expect(orderRes.ok()).toBeTruthy();
  const { order } = await orderRes.json();

  // =========================================================================
  // 1. ENGLISH (EN) VERIFICATION
  // =========================================================================
  await setLanguage(page, token, 'en');

  // 1a. Standalone KDS Login Form (EN)
  await page.goto(`${BASE_KDS}/kds-standalone`);
  await page.evaluate(() => {
    localStorage.removeItem('token');
  });
  await page.goto(`${BASE_KDS}/kds-standalone`);
  await expect(page.getByTestId('kds-login-form')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kitchen Display');
  await expect(page.getByText('Sign in with your kitchen staff account')).toBeVisible();
  await expect(page.getByText('Email', { exact: true })).toBeVisible();
  await expect(page.getByText('Password', { exact: true })).toBeVisible();
  await expect(page.getByText('Keep me logged in')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByText('Only chef, manager, or owner roles can access the kitchen display.')).toBeVisible();
  await captureScreenshot(page, 'kds-login-en.png');

  // Log in to KDS
  await page.getByTestId('kds-login-email').fill('manager@flo.local');
  await page.getByTestId('kds-login-password').fill('E2ePass123!');
  await page.getByTestId('kds-login-submit').click();
  await expect(page.getByTestId('kds-workspace')).toBeVisible();

  // 1b. Standalone KDS Tabs View (EN)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kitchen Display');
  await expect(page.getByRole('button', { name: 'Tabs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kanban' })).toBeVisible();
  await expect(page.getByText('Dine In').first()).toBeVisible();
  await captureScreenshot(page, 'kds-tabs-en.png');

  // 1c. KDS Item Modal (EN)
  await page.getByText('E2E Coffee').last().click();
  const modalHeader = page.locator('#kds-item-modal-title');
  await expect(modalHeader).toBeVisible();
  await expect(page.getByText(`Order #${order.order_number}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark as Preparing' })).toBeVisible();
  await captureScreenshot(page, 'kds-item-modal-en.png');
  await page.getByLabel('Close').click();
  await expect(modalHeader).toBeHidden();

  // 1d. Standalone KDS Kanban View (EN)
  await page.getByRole('button', { name: 'Kanban' }).click();
  await expect(page.getByText('Waiting', { exact: true })).toBeVisible();
  await expect(page.getByText('Preparing', { exact: true })).toBeVisible();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible();
  await expect(page.getByText('Delivered', { exact: true })).toBeVisible();
  await captureScreenshot(page, 'kds-kanban-en.png');

  // 1e. Server App Login Form (EN)
  await page.goto(`${BASE_SERVER_APP}/server-standalone`);
  await page.evaluate(() => {
    localStorage.removeItem('flocafe:server-app-token');
  });
  await page.goto(`${BASE_SERVER_APP}/server-standalone`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Server App');
  await expect(page.getByText('Tableside ordering for service staff')).toBeVisible();
  await expect(page.getByText('Enter your 4–6 digit PIN. The owner sets it in Settings → Tableside ordering.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with PIN' })).toBeVisible();
  await page.getByRole('button', { name: 'Email' }).click();
  await expect(page.getByPlaceholder('server@flo.local')).toBeVisible();
  await expect(page.getByPlaceholder('Password')).toBeVisible();
  await expect(page.getByText('Keep me logged in')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await captureScreenshot(page, 'server-login-en.png');

  // Authenticate Server App
  await page.evaluate((tok) => {
    localStorage.setItem('flocafe:server-app-token', tok);
  }, serverToken);
  await page.reload();

  // 1f. Server App Main UI (EN)
  await expect(page.getByRole('heading', { name: 'Server App' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tables' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current ticket' })).toBeVisible();
  await expect(page.getByText('New items', { exact: true })).toBeVisible();
  await expect(page.getByText('Draft total', { exact: true })).toBeVisible();
  await expect(page.getByText('All', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Search menu')).toBeVisible();
  await expect(page.getByPlaceholder('Customer name')).toBeVisible();
  await expect(page.getByPlaceholder('Phone')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  // Click a table and an item
  await page.getByRole('button', { name: /Table 1/i }).first().click();
  await page.getByText('E2E Coffee').first().click();
  await expect(page.getByPlaceholder('Item note')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send to kitchen' })).toBeVisible();
  await captureScreenshot(page, 'server-standalone-en.png');

  // =========================================================================
  // 2. PERSIAN (FA) RTL VERIFICATION
  // =========================================================================
  try {
    await setLanguage(page, token, 'ru');

    // 2a. Standalone KDS Login Form (FA)
    await page.goto(`${BASE_KDS}/kds-standalone`);
    await page.evaluate(() => {
      localStorage.removeItem('token');
    });
    await page.goto(`${BASE_KDS}/kds-standalone`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByTestId('kds-login-form')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Кухонный дисплей');
    await expect(page.getByText('Войдите с аккаунтом сотрудника кухни')).toBeVisible();
    await expect(page.getByText('Эл. почта', { exact: true })).toBeVisible();
    await expect(page.getByText('Пароль', { exact: true })).toBeVisible();
    await expect(page.getByText('Не выходить из системы')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
    await expect(page.getByText('Доступ к кухонному дисплею есть только у повара, менеджера и владельца.')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await captureScreenshot(page, 'kds-login-fa.png');

    // Log in to KDS in FA
    await page.getByTestId('kds-login-email').fill('manager@flo.local');
    await page.getByTestId('kds-login-password').fill('E2ePass123!');
    await page.getByTestId('kds-login-submit').click();
    await expect(page.getByTestId('kds-workspace')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    // 2b. Standalone KDS Tabs View (FA)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Кухонный дисплей');
    await expect(page.getByRole('button', { name: 'Вкладки' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Канбан' })).toBeVisible();
    await expect(page.getByText('В зале').first()).toBeVisible();
    await captureScreenshot(page, 'kds-tabs-fa.png');

    // 2c. KDS Item Modal (FA)
    await page.getByText('E2E Coffee').last().click();
    const modalHeaderFa = page.locator('#kds-item-modal-title');
    await expect(modalHeaderFa).toBeVisible();
    await expect(page.getByText(`Заказ №${order.order_number}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отметить как «Готовится»' })).toBeVisible();
    await captureScreenshot(page, 'kds-item-modal-fa.png');
    await page.getByLabel('Закрыть').click();
    await expect(modalHeaderFa).toBeHidden();

    // 2d. Standalone KDS Kanban View (FA)
    await page.getByRole('button', { name: 'Канбан' }).click();
    await expect(page.getByText('В очереди', { exact: true })).toBeVisible();
    await expect(page.getByText('Готовится', { exact: true })).toBeVisible();
    await expect(page.getByText('Готово', { exact: true })).toBeVisible();
    await expect(page.getByText('Выдано', { exact: true })).toBeVisible();
    await captureScreenshot(page, 'kds-kanban-fa.png');

    // 2e. Server App Login Form (FA)
    await page.goto(`${BASE_SERVER_APP}/server-standalone`);
    await page.evaluate(() => {
      localStorage.removeItem('flocafe:server-app-token');
    });
    await page.goto(`${BASE_SERVER_APP}/server-standalone`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Приложение официанта');
    await expect(page.getByText('Приём заказов у стола для обслуживающего персонала')).toBeVisible();
    await expect(page.getByText('Введите свой PIN из 4–6 цифр. Владелец задаёт его в Настройках → Приём заказов у столика.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Войти по PIN' })).toBeVisible();
    await page.getByRole('button', { name: 'Почта' }).click();
    await expect(page.getByPlaceholder('server@flo.local')).toBeVisible();
    await expect(page.getByPlaceholder('Пароль')).toBeVisible();
    await expect(page.getByText('Не выходить из системы')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
    await captureScreenshot(page, 'server-login-fa.png');

    // Authenticate Server App in FA
    await page.evaluate((tok) => {
      localStorage.setItem('flocafe:server-app-token', tok);
    }, serverToken);
    await page.reload();

    // 2f. Server App Main UI (FA)
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Приложение официанта' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Столы' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Текущий заказ' })).toBeVisible();
    await expect(page.getByText('Новые позиции', { exact: true })).toBeVisible();
    await expect(page.getByText('Итог черновика', { exact: true })).toBeVisible();
    await expect(page.getByText('Все', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Поиск по меню')).toBeVisible();
    await expect(page.getByPlaceholder('Имя клиента')).toBeVisible();
    await expect(page.getByPlaceholder('Телефон')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    // Select table and item
    await page.getByRole('button', { name: /Table 1/i }).first().click();
    await page.getByText('E2E Coffee').first().click();
    await expect(page.getByPlaceholder('Примечание к позиции')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отправить на кухню' })).toBeVisible();
    await captureScreenshot(page, 'server-standalone-fa.png');

  } finally {
    await setLanguage(page, token, 'en');
  }
});
