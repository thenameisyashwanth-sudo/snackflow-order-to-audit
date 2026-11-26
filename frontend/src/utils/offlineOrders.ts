import { CachedSalesCatalog, QueuedOfflineOrder } from '../types/orders';

const QUEUE_KEY_PREFIX = 'snackflow_offline_orders_';
const CATALOG_CACHE_KEY = 'snackflow_sales_catalog_v1';
const SIMULATE_OFFLINE_KEY = 'snackflow_simulate_offline';

export function getOfflineQueue(userId: string): QueuedOfflineOrder[] {
  try {
    const raw = localStorage.getItem(`${QUEUE_KEY_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(userId: string, queue: QueuedOfflineOrder[]): void {
  localStorage.setItem(`${QUEUE_KEY_PREFIX}${userId}`, JSON.stringify(queue));
}

export function enqueueOfflineOrder(
  userId: string,
  order: QueuedOfflineOrder
): QueuedOfflineOrder[] {
  const current = getOfflineQueue(userId);
  const updated = [order, ...current];
  saveOfflineQueue(userId, updated);
  return updated;
}

export function removeQueuedOrder(userId: string, clientOrderId: string): QueuedOfflineOrder[] {
  const current = getOfflineQueue(userId);
  const updated = current.filter((q) => q.clientOrderId !== clientOrderId);
  saveOfflineQueue(userId, updated);
  return updated;
}

export function saveCachedSalesCatalog(catalog: CachedSalesCatalog): void {
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadCachedSalesCatalog(): CachedSalesCatalog | null {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedSalesCatalog;
  } catch {
    return null;
  }
}

export function getSimulatedOfflineFlag(): boolean {
  return localStorage.getItem(SIMULATE_OFFLINE_KEY) === 'true';
}

export function setSimulatedOfflineFlag(value: boolean): void {
  localStorage.setItem(SIMULATE_OFFLINE_KEY, value ? 'true' : 'false');
}

export function generateClientOrderId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `off-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const ORDER_STATUS_BADGE: Record<string, string> = {
  SUBMITTED: 'bg-sky-100 text-sky-800 border-sky-200',
  APPROVED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  INVOICED: 'bg-amber-100 text-amber-900 border-amber-200',
  PARTIALLY_DISPATCHED: 'bg-orange-100 text-orange-800 border-orange-200',
  DISPATCHED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-800 border-rose-200',
  CANCELLED: 'bg-stone-200 text-stone-700 border-stone-300',
};
