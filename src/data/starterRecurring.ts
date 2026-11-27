import { RecurringItem } from '../types';

const DAY_MS = 86_400_000;

export function createStarterRecurringItems(ownerId: string): RecurringItem[] {
  const now = Date.now();
  return [
    {
      id: 'rec_item_confituur',
      ownerId,
      name: 'Confituur (aardbei)',
      defaultAmount: '1',
      defaultUnit: 'pot',
      storageCategory: 'proviandkast',
      averageIntervalDays: 21,
      lastPurchasedAtMs: now - 22 * DAY_MS,
      purchaseDatesMs: [now - 64 * DAY_MS, now - 43 * DAY_MS, now - 22 * DAY_MS],
      notes: 'Gaat gemiddeld 3 weken mee aan de ontbijttafel.',
    },
    {
      id: 'rec_item_koffie',
      ownerId,
      name: 'Koffiebonen',
      defaultAmount: '1',
      defaultUnit: 'kg',
      storageCategory: 'proviandkast',
      averageIntervalDays: 18,
      lastPurchasedAtMs: now - 16 * DAY_MS,
      purchaseDatesMs: [now - 52 * DAY_MS, now - 34 * DAY_MS, now - 16 * DAY_MS],
      notes: 'Bijna op het gemiddelde — best even de voorraadpot checken.',
    },
    {
      id: 'rec_item_olijfolie',
      ownerId,
      name: 'Olijfolie extra vierge',
      defaultAmount: '750',
      defaultUnit: 'ml',
      storageCategory: 'proviandkast',
      averageIntervalDays: 45,
      lastPurchasedAtMs: now - 41 * DAY_MS,
      purchaseDatesMs: [now - 86 * DAY_MS, now - 41 * DAY_MS],
      notes: 'Basisfles voor koken en dressings.',
    },
    {
      id: 'rec_item_melk',
      ownerId,
      name: 'Halfvolle melk',
      defaultAmount: '2',
      defaultUnit: 'l',
      storageCategory: 'vers',
      averageIntervalDays: 7,
      lastPurchasedAtMs: now - 6 * DAY_MS,
      purchaseDatesMs: [now - 20 * DAY_MS, now - 13 * DAY_MS, now - 6 * DAY_MS],
      notes: 'Wekelijkse basis.',
    },
    {
      id: 'rec_item_havermout',
      ownerId,
      name: 'Havermout',
      defaultAmount: '500',
      defaultUnit: 'g',
      storageCategory: 'proviandkast',
      averageIntervalDays: 28,
      lastPurchasedAtMs: now - 10 * DAY_MS,
      purchaseDatesMs: [now - 38 * DAY_MS, now - 10 * DAY_MS],
      notes: 'Nog voldoende voorraad.',
    },
  ];
}
