/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * S-01: autenticação por perfil.
 * - User → sessão direta
 * - Admin → PIN via RPC Supabase
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  User as UserIcon,
  ArrowRight,
  Key,
  Loader2,
  Lock,
  Clock,
  MapPin,
  CheckCircle2,
} from 'lucide-react';
import { ROLES } from '../config/rolePermissions';
import {
  createUserSession,
  loginAdminWithPin,
  type AuthSession,
} from '../services/authService';

interface AuthLoginCardProps {
  requestedTabName?: string;
  onNavigateToTab: (tab: 'cronometro' | 'ruas') => void;
  onLoginSuccess: (session: AuthSession) => void;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}

type AuthStep = 'select' | 'admin_pin';

export default function AuthLoginCard({
  requestedTabName = 'Painel Gerencial',
  onNavigateToTab,
  onLoginSuccess,
  onSuccessToast,
  onErrorToast,
}: AuthLoginCardProps) {
  const [step, setStep] = useState<AuthStep>('select');
  const [adminPin, setAdminPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPin, setShowPin] = useState(false);

  /* ─── User: entrada direta ─── */
  const handleSelectUser = () => {
    try {
      const session = createUserSession();
      onSuccessToast('Sessão iniciada como Operador.');
      onLoginSuccess(session);
    } catch (err) {
      onErrorToast('Falha ao iniciar sessão.');
    }
  };

  /* ─── Admin: redireciona para PIN ─── */
  const handleSelectAdmin = () => {
    setStep('admin_pin');
    setAdminPin('');
  };

  /* ─── Admin: valida PIN ─── */
  const handleSubmitAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPin.trim()) {
      onErrorToast('Digite o PIN de supervisor.');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await loginAdminWithPin(adminPin);
      onSuccessToast('Acesso administrativo autorizado.');
      onLoginSuccess(session);
    } catch (err: any) {
      onErrorToast(err?.message || 'Falha na autenticação.');
      setAdminPin('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto my-6 px-4">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/98 p-6 md:p-8 shadow-2xl shadow-black/80 relative overflow-hidden backdrop-blur-xl">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Lock size={10} />
                <span>Acesso Protegido</span>
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white font-sans">
              Autenticação de Acesso
            </h2>
            <p className="text-xs text-slate-400 font-normal">
              A aba <strong className="text-white font-semibold">{requestedTabName}</strong> requer autenticação.
            </p>
          </div>

          {/* Atalhos de acesso livre */}
          <div className="flex flex-col gap-1.5 sm:items-end">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Uso sem login:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onNavigateToTab('cronometro')}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500 hover:text-black text-emerald-400 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
              >
                <Clock size={12} />
                <span>Cronômetro</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateToTab('ruas')}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500 hover:text-black text-emerald-400 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
              >
                <MapPin size={12} />
                <span>Reabastecimento</span>
              </button>
            </div>
          </div>
        </div>

        {/* STEP 1 — Seleção de perfil */}
        {step === 'select' && (
          <div className="grid grid-cols-1 gap-3 my-5">
            <button
              type="button"
              onClick={handleSelectUser}
              className="group p-4 rounded-xl border border-white/10 bg-slate-900/60 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left flex items-center gap-3 cursor-pointer"
            >
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <UserIcon size={20} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-white">
                  {ROLES.user.label}
                </div>
                <div className="text-[11px] text-slate-400">
                  {ROLES.user.description}
                </div>
              </div>
              <ArrowRight
                size={16}
                className="text-slate-500 group-hover:text-emerald-400 transition-colors"
              />
            </button>

            <button
              type="button"
              onClick={handleSelectAdmin}
              className="group p-4 rounded-xl border border-white/10 bg-slate-900/60 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all text-left flex items-center gap-3 cursor-pointer"
            >
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <ShieldCheck size={20} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  {ROLES.admin.label}
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                    PIN REQUERIDO
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {ROLES.admin.description}
                </div>
              </div>
              <ArrowRight
                size={16}
                className="text-slate-500 group-hover:text-cyan-400 transition-colors"
              />
            </button>
          </div>
        )}

        {/* STEP 2 — PIN do admin */}
        {step === 'admin_pin' && (
          <form onSubmit={handleSubmitAdminPin} className="space-y-4 my-5">
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[11px] text-cyan-300 flex items-start gap-2">
              <Key size={14} className="shrink-0 mt-0.5" />
              <span>
                Acesso administrativo requer PIN de supervisor validado pelo servidor.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                PIN de Supervisor
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  required
                  autoFocus
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-4 py-3 pr-12 rounded-xl bg-black/50 border border-white/20 focus:border-cyan-400 text-lg font-mono text-center tracking-widest text-cyan-400 placeholder:text-slate-600 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-[10px] uppercase font-bold"
                >
                  {showPin ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setStep('select');
                  setAdminPin('');
                }}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 font-bold uppercase cursor-pointer disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs uppercase flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Validando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Autorizar</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Footer informativo */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-slate-400">
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-200 font-bold block">Cliente Final:</strong>
              <span>Entrada direta sem credencial — foco operacional.</span>
            </div>
          </div>
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
            <CheckCircle2 size={13} className="text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-200 font-bold block">Administrador:</strong>
              <span>PIN validado server-side (Supabase RPC, bcrypt).</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
