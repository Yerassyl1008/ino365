/**
 * Guest service-charge percent and owner/staff split.
 * Amounts are stored on the order; the owner report reads those stored values.
 */

import Decimal from 'decimal.js';
import { getSettingValue } from '../db';

export type ServiceChargeSettings = {
  percent: number;
  ownerPercent: number;
  dineInOnly: boolean;
};

function clampPercent(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
}

export function getServiceChargeSettings(): ServiceChargeSettings {
  return {
    percent: clampPercent(getSettingValue('service_charge_percent'), 0),
    ownerPercent: clampPercent(getSettingValue('service_charge_owner_percent'), 50),
    dineInOnly: getSettingValue('service_charge_dine_in_only') !== 'false',
  };
}

export function computeServiceChargeAmount(
  orderType: string | null | undefined,
  subtotal: number,
  discountAmount = 0,
  settings: ServiceChargeSettings = getServiceChargeSettings(),
): number {
  if (!(settings.percent > 0)) return 0;
  if (settings.dineInOnly && orderType !== 'dine_in') return 0;
  const base = Math.max(0, Number(subtotal || 0) - Number(discountAmount || 0));
  return new Decimal(base).mul(settings.percent).div(100).toDecimalPlaces(2).toNumber();
}

export function splitServiceCharge(
  amount: number,
  ownerPercent: number,
): { ownerShare: number; staffShare: number } {
  const total = new Decimal(amount || 0);
  const ownerShare = total.mul(ownerPercent).div(100).toDecimalPlaces(2).toNumber();
  return {
    ownerShare,
    staffShare: total.minus(ownerShare).toDecimalPlaces(2).toNumber(),
  };
}

export function computeServiceChargeFields(
  orderType: string | null | undefined,
  subtotal: number,
  discountAmount = 0,
): { amount: number; ownerAmount: number; staffAmount: number } {
  const settings = getServiceChargeSettings();
  const amount = computeServiceChargeAmount(orderType, subtotal, discountAmount, settings);
  const split = splitServiceCharge(amount, settings.ownerPercent);
  return { amount, ownerAmount: split.ownerShare, staffAmount: split.staffShare };
}
