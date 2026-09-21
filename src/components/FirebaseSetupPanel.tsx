import React, { useState } from 'react';
import { CheckCircle2, Cloud, Copy, Database, ExternalLink, Link2Off } from 'lucide-react';
import {
  FIRESTORE_TEST_RULES,
  hasRuntimeFirebaseConfig,
  getFirebaseClientConfig,
} from '../firebase/config';

interface FirebaseSetupPanelProps {
  firebaseOnline: boolean;
  busy?: boolean;
  onConnect: (paste: string) => Promise<void>;
  onDisconnect?: () => void;
}

export const FirebaseSetupPanel: React.FC<FirebaseSetupPanelProps> = ({
  firebaseOnline,
  busy = false,
  onConnect,
  onDisconnect,
}) => {
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const projectId = getFirebaseClientConfig()?.projectId;

  const handleConnect = async () => {
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
            Sem isso, o que você cadastra fica preso neste computador e neste navegador.
            Colegas, outra sala, outro notebook — ninguém vê. Com o servidor ligado, todo mundo
            vê a mesma lista, sempre atualizada.
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
          {firebaseOnline ? 'Conectado' : 'Desligado'}
        </span>
      </div>

      {firebaseOnline ? (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 space-y-2">
          <p className="font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Os cadastros estão indo para a nuvem
            {projectId ? ` (${projectId})` : ''}.
          </p>
          <p>
            Qualquer pessoa que abrir este mesmo sistema com a mesma conexão vê o que você salvar,
            inclusive de outro lugar.
          </p>
          {hasRuntimeFirebaseConfig() && onDisconnect && (
            <button
              type="button"
              onClick={onDisconnect}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-900 text-xs font-bold"
            >
              <Link2Off className="w-3.5 h-3.5" />
              Desconectar neste navegador
            </button>
          )}
        </div>
      ) : (
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
            </a>{' '}
            e entre com sua conta Google (pode ser a da UNISUAM).
          </li>
          <li>
            Clique em <strong>Adicionar projeto</strong>, nomeie por exemplo{' '}
            <strong>unisuam-estruturas</strong> e crie. Pode desligar o Google Analytics.
          </li>
          <li>
            No projeto, clique no ícone de web <strong>&lt;/&gt;</strong>, apelido{' '}
            <strong>estruturas</strong>, e registre. Não precisa marcar Hosting.
          </li>
          <li>
            Copie o bloco <strong>firebaseConfig</strong> (apiKey, projectId, appId…) e cole no
            campo abaixo.
          </li>
          <li>
            No menu, abra <strong>Build → Firestore Database → Criar banco</strong>. Escolha{' '}
            <strong>começar em modo de teste</strong> e confirme.
          </li>
          <li>
            Em <strong>Firestore → Regras</strong>, cole as regras abaixo e clique em{' '}
            <strong>Publicar</strong>.
          </li>
          <li>
            Volte aqui e clique em <strong>Conectar servidor</strong>.
          </li>
        </ol>
      )}

      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
            Regras do Firestore (passo 6)
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

      {!firebaseOnline && (
        <>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'Cole aqui o firebaseConfig, por exemplo:\n{\n  apiKey: "AIza...",\n  projectId: "unisuam-estruturas",\n  appId: "1:..."\n}'}
            className="w-full h-32 p-2 border border-slate-300 rounded-lg font-mono text-[11px] bg-white"
          />
          <button
            type="button"
            disabled={busy || !paste.trim()}
            onClick={() => void handleConnect()}
            className="px-4 py-2 rounded-lg bg-[#002B49] text-white text-xs font-black disabled:opacity-50"
          >
            {busy ? 'Conectando…' : 'Conectar servidor'}
          </button>
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
