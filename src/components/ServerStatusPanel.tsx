/**
 * Painel de status do servidor MySQL interno (sem Firebase).
 */
import React, { useState } from 'react';
import { CheckCircle2, Database, Loader2, RefreshCw } from 'lucide-react';
import { getApiBaseUrl } from '../services/apiClient';

interface ServerStatusPanelProps {
  serverOnline: boolean;
  connecting?: boolean;
  onRetry?: () => Promise<void>;
}

export const ServerStatusPanel: React.FC<ServerStatusPanelProps> = ({
  serverOnline,
  connecting = false,
  onRetry,
}) => {
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    if (!onRetry || busy) return;
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-[#002B49] flex items-center gap-2">
            <Database className="w-4 h-4 text-[#FF6B00]" />
            Servidor interno (MySQL)
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Dados em <code className="text-[10px] bg-slate-100 px-1 rounded">{getApiBaseUrl()}</code>
          </p>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-1 rounded-full ${
            serverOnline
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-900'
          }`}
        >
          {serverOnline ? 'Conectado' : 'Offline / local'}
        </span>
      </div>

      {serverOnline ? (
        <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Cadastros sincronizam com o MySQL da instituição. Colegas no mesmo servidor veem as mesmas estruturas.
        </p>
      ) : (
        <div className="text-[11px] text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-2">
          <p>
            Sem API no ar: tudo fica só neste navegador. Depois do deploy no Apache da UNISUAM, rode{' '}
            <code className="text-[10px]">api/install.php?token=…</code> uma vez e teste{' '}
            <code className="text-[10px]">api/health.php</code>.
          </p>
          {onRetry && (
            <button
              type="button"
              disabled={busy || connecting}
              onClick={() => void retry()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#002B49] text-white text-[11px] font-bold disabled:opacity-60"
            >
              {busy || connecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Testar conexão
            </button>
          )}
        </div>
      )}
    </div>
  );
};
