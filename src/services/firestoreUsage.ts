/**
 * Estimativa local de leituras/escritas no Firestore (plano Spark).
 * Não é medição oficial do Google — só alerta preventivo no app.
 */

export const SPARK_DAILY_READS = 50_000;
export const SPARK_DAILY_WRITES = 20_000;

const USAGE_KEY = 'unisuam_fs_ops_v1';
export const SPARK_QUOTA_WARNING_EVENT = 'unisuam-spark-quota-warning';

export type FirestoreDayUsage = {
  day: string;
  reads: number;
  writes: number;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getFirestoreDayUsage(): FirestoreDayUsage {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return { day: todayKey(), reads: 0, writes: 0 };
    const parsed = JSON.parse(raw) as FirestoreDayUsage;
    if (parsed.day !== todayKey()) {
      return { day: todayKey(), reads: 0, writes: 0 };
    }
    return {
      day: parsed.day,
      reads: Number(parsed.reads) || 0,
      writes: Number(parsed.writes) || 0,
    };
  } catch {
    return { day: todayKey(), reads: 0, writes: 0 };
  }
}

export function trackFirestoreOp(kind: 'read' | 'write', count = 1): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = getFirestoreDayUsage();
    const next: FirestoreDayUsage = {
      day: todayKey(),
      reads: current.day === todayKey() ? current.reads : 0,
      writes: current.day === todayKey() ? current.writes : 0,
    };
    if (kind === 'read') next.reads += count;
    else next.writes += count;
    localStorage.setItem(USAGE_KEY, JSON.stringify(next));

    const readPct = next.reads / SPARK_DAILY_READS;
    const writePct = next.writes / SPARK_DAILY_WRITES;
    if (readPct >= 0.7 || writePct >= 0.7) {
      window.dispatchEvent(new CustomEvent(SPARK_QUOTA_WARNING_EVENT, { detail: next }));
    }
  } catch {
    /* quota localStorage cheia — ignore */
  }
}

/** Link direto para criar orçamento/alerta no Google Cloud Billing. */
export function billingBudgetsUrl(projectId?: string): string {
  if (projectId) {
    return `https://console.cloud.google.com/billing/budgets?project=${encodeURIComponent(projectId)}`;
  }
  return 'https://console.cloud.google.com/billing/budgets';
}

export const BILLING_ALERT_ACK_KEY = 'unisuam_billing_alert_ack_v1';

export function hasAcknowledgedBillingAlert(): boolean {
  try {
    return localStorage.getItem(BILLING_ALERT_ACK_KEY) === '1';
  } catch {
    return false;
  }
}

export function acknowledgeBillingAlert(): void {
  try {
    localStorage.setItem(BILLING_ALERT_ACK_KEY, '1');
  } catch {
    /* ignore */
  }
}
