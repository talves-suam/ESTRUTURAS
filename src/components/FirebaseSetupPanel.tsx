import React, { useState } from 'react';
import { CheckCircle2, Cloud, CloudOff, Copy, Database, ExternalLink } from 'lucide-react';
import {
  FIRESTORE_TEST_RULES,
  getFirebaseClientConfig,
  usesBuiltInFirebase,
} from '../firebase/config';

interface FirebaseSetupPanelProps {
  firebaseOnline: boolean;
  busy?: boolean;
  /** Só usado se o servidor embutido ainda não estiver no código (setup único do time). */
  onConnect?: (paste: string) => Promise<void>;
}

/**
 * Status do servidor. Com config embutida, o usuário comum só vê "conectado".
 * O formulário de colar firebaseConfig só aparece se o projeto ainda não tiver servidor no código.
 */
export const FirebaseSetupPanel: React.FC<FirebaseSetupPanelProps> = ({
  firebaseOnline,
  busy = false,
  onConnect,
}) => {
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const projectId = getFirebaseClientConfig()?.projectId;
  const builtIn = usesBuiltInFirebase();
  const needsOneTimeSetup = !builtIn && !firebaseOnline && !!onConnect;

  const handleConnect = async () => {
    if (!onConnect) return;
    setError(null);
    try {
      await onConnect(paste);
      setPaste('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível conectar.');
    }
  };

  const handleCopyRules = async () => {
    try {
      await navigator.clipboard.writeText(FIRESTORE_TEST_RULES);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Não deu para copiar. Selecione o texto das regras e copie com Ctrl+C.');
    }
  };

  return (
    <div className="p-4 rounded-xl border border-[#002B49]/20 bg-white space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#002B49] uppercase tracking-wider flex items-center gap-2">
            <Cloud className="w-4 h-4 text-[#FF6B00]" />
            Servidor compartilhado
          </h3>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            {builtIn || firebaseOnline
              ? 'Os cadastros vão para a nuvem automaticamente. Qualquer usuário do sistema vê a mesma lista.'
              : 'O servidor ainda não está gravado neste projeto. O time técnico precisa embutir o firebaseConfig uma vez.'}
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
            firebaseOnline
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          {firebaseOnline ? 'Conectado' : 'Offline'}
        </span>
      </div>

      {firebaseOnline ? (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Conectado ao servidor
            {projectId ? ` (${projectId})` : ''}
          </p>
          <p>Pode cadastrar estruturas normalmente — tudo já é compartilhado.</p>
        </div>
      ) : (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950 flex items-start gap-2">
          <CloudOff className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Sem servidor, os cadastros ficam só neste navegador. Peça ao responsável técnico para
            gravar o <strong>firebaseConfig</strong> em <code className="text-[10px]">src/firebase/projectConfig.ts</code>.
          </p>
        </div>
      )}

      {needsOneTimeSetup && (
        <>
          <ol className="text-xs text-slate-700 space-y-2 list-decimal pl-4 leading-relaxed">
            <li>
              Abra o{' '}
              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noreferrer"
                className="text-[#002B49] font-bold underline inline-flex items-center gap-1"
              >
                Console do Firebase
                <ExternalLink className="w-3 h-3" />
              </a>
              .
            </li>
            <li>
              Copie o bloco <strong>firebaseConfig</strong> do app web e cole abaixo (setup único).
            </li>
            <li>
              Em <strong>Firestore → Regras</strong>, publique as regras abaixo se ainda não publicou.
            </li>
          </ol>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                Regras do Firestore
              </p>
              <button
                type="button"
                onClick={() => void handleCopyRules()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 bg-white text-[11px] font-bold text-slate-700"
              >
                <Copy className="w-3 h-3" />
                {copied ? 'Copiado' : 'Copiar regras'}
              </button>
            </div>
            <pre className="text-[10px] leading-snug font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap">
              {FIRESTORE_TEST_RULES}
            </pre>
          </div>

          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'Cole aqui o firebaseConfig…'}
            className="w-full h-28 p-2 border border-slate-300 rounded-lg font-mono text-[11px] bg-white"
          />
          <button
            type="button"
            disabled={busy || !paste.trim()}
            onClick={() => void handleConnect()}
            className="px-4 py-2 rounded-lg bg-[#002B49] text-white text-xs font-black disabled:opacity-50"
          >
            {busy ? 'Conectando…' : 'Ativar servidor neste navegador (temporário)'}
          </button>
          <p className="text-[10px] text-slate-500">
            Isso só resolve neste navegador. Para todos os usuários, a config precisa ir para{' '}
            <code>projectConfig.ts</code>.
          </p>
        </>
      )}

      {error && (
        <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
          {error}
        </p>
      )}
    </div>
  );
};
