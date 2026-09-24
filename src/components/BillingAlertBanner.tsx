import React, { useEffect, useState } from 'react';
import { BellRing, ExternalLink, X } from 'lucide-react';
import { getFirebaseClientConfig } from '../firebase/config';
import { useAuth } from '../auth/AuthProvider';
import {
  acknowledgeBillingAlert,
  billingBudgetsUrl,
  hasAcknowledgedBillingAlert,
  SPARK_QUOTA_WARNING_EVENT,
  type FirestoreDayUsage,
  SPARK_DAILY_READS,
  SPARK_DAILY_WRITES,
} from '../services/firestoreUsage';

/**
 * Só o perfil administrador vê alerta de faturamento / cota Spark.
 */
export const BillingAlertBanner: React.FC = () => {
  const { isAdmin } = useAuth();
  const [showBilling, setShowBilling] = useState(() => !hasAcknowledgedBillingAlert());
  const [quota, setQuota] = useState<FirestoreDayUsage | null>(null);
  const projectId = getFirebaseClientConfig()?.projectId;

  useEffect(() => {
    if (!isAdmin) return;
    const onQuota = (ev: Event) => {
      const detail = (ev as CustomEvent<FirestoreDayUsage>).detail;
      if (detail) setQuota(detail);
    };
    window.addEventListener(SPARK_QUOTA_WARNING_EVENT, onQuota);
    return () => window.removeEventListener(SPARK_QUOTA_WARNING_EVENT, onQuota);
  }, [isAdmin]);

  if (!isAdmin) return null;
  if (!showBilling && !quota) return null;

  return (
    <div className="space-y-0">
      {showBilling && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <BellRing className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-950 leading-relaxed">
                <p className="font-bold">Alerta de cobrança (somente admin)</p>
                <p className="mt-0.5 text-amber-900/90">
                  No Google Cloud Billing, crie um orçamento com limite baixo e alerta em{' '}
                  <strong>R$ 0,01</strong>. Assim o e-mail chega no primeiro centavo cobrado.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href={billingBudgetsUrl(projectId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700"
              >
                Abrir orçamentos
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={() => {
                  acknowledgeBillingAlert();
                  setShowBilling(false);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-[11px] font-bold text-amber-900 hover:bg-amber-100"
                title="Já configurei o alerta de R$ 0,01"
              >
                Já configurei
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {quota && (
        <div className="bg-rose-50 border-b border-rose-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-rose-900 font-semibold">
              Uso estimado do Firestore hoje: {quota.reads.toLocaleString('pt-BR')} leituras /{' '}
              {quota.writes.toLocaleString('pt-BR')} escritas (limite Spark ~
              {SPARK_DAILY_READS.toLocaleString('pt-BR')} / {SPARK_DAILY_WRITES.toLocaleString('pt-BR')}
              ).
            </p>
            <button
              type="button"
              onClick={() => setQuota(null)}
              className="text-[11px] font-bold text-rose-800 underline"
            >
              Dispensar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
