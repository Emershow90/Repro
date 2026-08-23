import React, { useState } from 'react';
import { 
  LogIn, 
  UserPlus, 
  Key, 
  ShieldCheck, 
  Lock, 
  Clock, 
  MapPin, 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Mail,
  User,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  signInWithGoogle, 
  signInWithEmailPassword, 
  signUpWithEmailPassword 
} from '../utils/supabase/client';

interface AuthLoginCardProps {
  requestedTabName?: string;
  onNavigateToTab: (tab: 'cronometro' | 'ruas') => void;
  onGuestAccess: () => void;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}

export default function AuthLoginCard({
  requestedTabName = 'Painel Gerencial',
  onNavigateToTab,
  onGuestAccess,
  onSuccessToast,
  onErrorToast
}: AuthLoginCardProps) {
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'pin'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
      onSuccessToast('Redirecionando para autenticação Google...');
    } catch (err: any) {
      console.error('Google Auth Error:', err);
      onErrorToast(err.message || 'Falha ao autenticar com Google');
      setIsSubmitting(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      onErrorToast('Preencha o e-mail e a palavra-passe.');
      return;
    }
    if (authMode === 'signup' && !fullName.trim()) {
      onErrorToast('Por favor, informe seu nome completo.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (authMode === 'signup') {
        await signUpWithEmailPassword(email.trim(), password, fullName.trim());
        onSuccessToast('Conta criada com sucesso! Verifique o seu e-mail ou inicie sessão.');
        setAuthMode('login');
      } else {
        await signInWithEmailPassword(email.trim(), password);
        onSuccessToast('Sessão iniciada com sucesso!');
      }
    } catch (err: any) {
      console.error('Email Auth Error:', err);
      onErrorToast(err.message || 'Erro ao autenticar. Verifique suas credenciais.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSupervisorPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supervisorPin.trim()) {
      onErrorToast('Digite o código ou PIN de supervisor.');
      return;
    }
    // Standard supervisor quick PIN access or custom codes
    if (['1234', '8789', '2026', 'ADMIN', 'SUPER'].includes(supervisorPin.trim().toUpperCase())) {
      onSuccessToast(`Acesso supervisor autorizado [PIN: ${supervisorPin.toUpperCase()}]`);
      onGuestAccess();
    } else {
      onErrorToast('PIN de autorização incorreto. Tente novamente ou use Google/Email.');
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto my-6 px-4">
      {/* CARD PRINCIPAL COM HIERARQUIA, PADDING E ELEVAÇÃO CONSISTENTES */}
      <div 
        id="auth-login-card"
        className="rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/98 p-6 md:p-8 shadow-2xl shadow-black/80 relative overflow-hidden backdrop-blur-xl"
      >
        {/* DECORAÇÃO DE LUZ SUTIL NO TOPO */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

        {/* 1. CABEÇALHO COM HIERARQUIA TIPOGRÁFICA DEFINIDA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Lock size={10} />
                <span>Acesso Protegido</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                Área Restrita
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white font-sans">
              Autenticação de Acesso
            </h2>
            <p className="text-xs text-slate-400 font-normal">
              A aba <strong className="text-white font-semibold">{requestedTabName}</strong> requer autenticação para consulta e gestão estratégica.
            </p>
          </div>

          {/* TAGS DE ACESSO LIVRE RÁPIDO PARA COLETORES PDT / MOBILE */}
          <div className="flex flex-col gap-1.5 sm:items-end">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Uso sem login disponível:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onNavigateToTab('cronometro')}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500 hover:text-black text-emerald-400 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                title="Acessar Cronômetro sem necessidade de login"
              >
                <Clock size={12} />
                <span>Cronômetro</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateToTab('ruas')}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500 hover:text-black text-emerald-400 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                title="Acessar Reabastecimento por Rua sem necessidade de login"
              >
                <MapPin size={12} />
                <span>Reabastecimento</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. ALTERNADOR DE MODO DE LOGIN (TABS INTERNAS) */}
        <div className="grid grid-cols-3 gap-1.5 p-1 my-5 bg-black/40 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setAuthMode('login')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              authMode === 'login'
                ? 'bg-white/10 text-white shadow-sm border border-white/15'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <LogIn size={13} className={authMode === 'login' ? 'text-emerald-400' : ''} />
            <span>Entrar</span>
          </button>
          
          <button
            type="button"
            onClick={() => setAuthMode('signup')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              authMode === 'signup'
                ? 'bg-white/10 text-white shadow-sm border border-white/15'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <UserPlus size={13} className={authMode === 'signup' ? 'text-emerald-400' : ''} />
            <span>Criar Conta</span>
          </button>

          <button
            type="button"
            onClick={() => setAuthMode('pin')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              authMode === 'pin'
                ? 'bg-white/10 text-white shadow-sm border border-white/15'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Key size={13} className={authMode === 'pin' ? 'text-emerald-400' : ''} />
            <span>PIN Supervisor</span>
          </button>
        </div>

        {/* 3. BOTÃO DE LOGIN COM GOOGLE / SUPABASE EM DESTAQUE */}
        {authMode !== 'pin' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 rounded-xl bg-white text-slate-900 hover:bg-slate-100 active:scale-[0.99] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all shadow-lg cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 size={16} className="animate-spin text-slate-900" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>Entrar com Conta Google</span>
            </button>

            {/* SEPARADOR SUAVE */}
            <div className="relative flex items-center justify-center my-4">
              <div className="w-full border-t border-white/10" />
              <span className="absolute bg-slate-900 px-3 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                ou com e-mail corporativo
              </span>
            </div>

            {/* FORMULÁRIO DE EMAIL E SENHA */}
            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              {authMode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <User size={12} className="text-emerald-400" />
                    <span>Nome Completo</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex: Emerson Gonçalves"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 focus:border-emerald-400 text-sm text-white placeholder:text-slate-600 outline-none transition-all"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Mail size={12} className="text-emerald-400" />
                  <span>E-mail</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 focus:border-emerald-400 text-sm text-white placeholder:text-slate-600 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Lock size={12} className="text-emerald-400" />
                    <span>Palavra-passe</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">Mínimo 6 caracteres</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-black/50 border border-white/15 focus:border-emerald-400 text-sm text-white placeholder:text-slate-600 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black active:scale-[0.99] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50 mt-4"
              >
                {isSubmitting ? (
                  <Loader2 size={16} className="animate-spin text-black" />
                ) : authMode === 'signup' ? (
                  <>
                    <UserPlus size={15} />
                    <span>Registar Nova Conta</span>
                  </>
                ) : (
                  <>
                    <LogIn size={15} />
                    <span>Entrar no Sistema</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* 4. MODO PIN SUPERVISOR RÁPIDO */}
        {authMode === 'pin' && (
          <form onSubmit={handleSupervisorPin} className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-slate-300 space-y-1.5">
              <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck size={14} />
                <span>Liberação Rápida para Liderança</span>
              </p>
              <p className="text-[11px] text-slate-400">
                Insira o código de autorização do supervisor ou gestor para liberar visualização nesta sessão.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Key size={12} className="text-emerald-400" />
                <span>Código PIN / Senha de Liberação</span>
              </label>
              <input
                type="password"
                required
                autoFocus
                value={supervisorPin}
                onChange={(e) => setSupervisorPin(e.target.value)}
                placeholder="Ex: 8789 ou 2026"
                className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/20 focus:border-emerald-400 text-lg font-mono text-center tracking-widest text-emerald-400 placeholder:text-slate-600 outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black active:scale-[0.99] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>Autorizar Visualização</span>
            </button>
          </form>
        )}

        {/* 5. SEÇÃO INFORMATIVA COM BENEFÍCIOS (METADADOS E HIERARQUIA TERCIÁRIA) */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-slate-400">
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-200 font-bold block">Segurança & Criptografia:</strong>
              <span>Acesso restrito a métricas gerenciais e logs em nuvem.</span>
            </div>
          </div>
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-200 font-bold block">Operação PDT Contínua:</strong>
              <span>Cronômetro e Ruas permanecem 100% livres e sem bloqueios.</span>
            </div>
          </div>
        </div>

        {/* 6. BOTÃO DE ACESSO CONVIDADO LOCAL (RODAPÉ) */}
        <div className="mt-4 pt-3 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={onGuestAccess}
            className="text-slate-400 hover:text-slate-200 underline font-mono text-[11px] cursor-pointer"
          >
            Continuar em Modo Convidado Local
          </button>

          <span className="text-[10px] font-mono text-slate-500">
            PostgreSQL • Supabase Auth
          </span>
        </div>
      </div>
    </div>
  );
}
