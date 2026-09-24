import React, { useState } from 'react';
import { AlertCircle, Loader2, Lock, LogIn } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { UNISUAM_EMAIL_DOMAIN } from '../auth/authService';

export const LoginScreen: React.FC = () => {
  const { signInGoogle, signInLocal, isLocalHost } = useAuth();
  const [email, setEmail] = useState(isLocalHost ? 'suam@unisuam.edu.br' : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#002B49] via-[#003a63] to-[#001a2e] p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-[#002B49] px-6 py-5 border-b-4 border-[#FF6B00]">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#FF6B00]">
            UNISUAM · Acesso restrito
          </p>
          <h1 className="text-xl font-black text-white mt-1">Estruturas Curriculares</h1>
          <p className="text-xs text-blue-200 mt-1">
            Entre com a conta corporativa Google (@{UNISUAM_EMAIL_DOMAIN}).
            Os dados sincronizam no Firebase (plano Spark, uso enxuto).
          </p>
        </div>

        <div className="p-6 space-y-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => signInGoogle())}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border-2 border-slate-200 hover:border-[#002B49] text-slate-800 text-sm font-bold transition disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4 text-[#FF6B00]" />}
            Entrar com Google UNISUAM
          </button>

          {isLocalHost && (
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
                <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Ambiente local: você pode entrar com e-mail @{UNISUAM_EMAIL_DOMAIN} e senha{' '}
                  <strong>123456</strong> (só em localhost).
                </span>
              </p>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Usuário / e-mail SUAM
                </label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="suam@unisuam.edu.br"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Senha local</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  autoComplete="current-password"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void run(() => signInLocal(email, password));
                    }
                  }}
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => signInLocal(email, password))}
                className="w-full px-4 py-2.5 rounded-xl bg-[#002B49] hover:bg-[#003a63] text-white text-sm font-bold disabled:opacity-60"
              >
                Entrar (desenvolvimento local)
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
