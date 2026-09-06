import React, { useState, useEffect } from 'react';
import { Database, CheckCircle2, AlertCircle, Key, Globe, Save, TestTube2 } from 'lucide-react';
import { saveState, getState } from '../dbLocal';
import { useUIStore } from '../stores/uiStore';

interface SupabaseConfig {
  url: string;
  anonKey: string;
  tableName?: string;
}

const DEFAULT_CONFIG: SupabaseConfig = {
  url: '',
  anonKey: '',
  tableName: 'operational_events',
};

export default function SupabaseConfigModule() {
  const [config, setConfig] = useState<SupabaseConfig>(DEFAULT_CONFIG);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { addToast } = useUIStore();

  // Carregar configuração salva
  useEffect(() => {
    (async () => {
      const saved = await getState<SupabaseConfig>('supabase_config');
      if (saved) setConfig(saved);
    })();
  }, []);

  const handleTestConnection = async () => {
    if (!config.url || !config.anonKey) {
      setTestResult('error');
      setTestMessage('Preencha URL e Chave Anônima para testar.');
      return;
    }
    setIsTesting(true);
    setTestResult('idle');
    try {
      // Teste simples: tentar acessar um endpoint público (ex: GET /rest/v1/ com apikey)
      const response = await fetch(`${config.url}/rest/v1/${config.tableName || 'operational_events'}?limit=1`, {
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${config.anonKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        setTestResult('success');
        setTestMessage('Conexão Supabase estabelecida com sucesso!');
      } else {
        const errText = await response.text();
        setTestResult('error');
        setTestMessage(`Falha na conexão: ${response.status} ${errText.substring(0, 80)}`);
      }
    } catch (err: any) {
      setTestResult('error');
      setTestMessage(`Erro de rede: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveState('supabase_config', config);
      localStorage.setItem('supabase_config', JSON.stringify(config));
      addToast('Configuração Supabase salva com sucesso!', 'var(--color-success)');
    } catch (err) {
      addToast('Erro ao salvar configuração Supabase.', 'var(--color-danger)');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 shadow-md space-y-4 font-mono">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <Database size={18} className="text-emerald-400" />
        <h2 className="text-sm font-black text-white uppercase tracking-wider">
          Configuração Supabase (Tempo Real)
        </h2>
      </div>

      {/* Campo URL */}
      <div className="space-y-1.5">
        <label className="text-[0.65rem] font-bold text-slate-300 uppercase flex items-center gap-1.5">
          <Globe size={12} className="text-emerald-400" />
          URL do Projeto Supabase
        </label>
        <input
          type="url"
          value={config.url}
          onChange={(e) => setConfig({ ...config, url: e.target.value.trim() })}
          placeholder="https://seuprojeto.supabase.co"
          className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Campo Chave Anônima */}
      <div className="space-y-1.5">
        <label className="text-[0.65rem] font-bold text-slate-300 uppercase flex items-center gap-1.5">
          <Key size={12} className="text-emerald-400" />
          Chave Anônima (Public Key)
        </label>
        <textarea
          value={config.anonKey}
          onChange={(e) => setConfig({ ...config, anonKey: e.target.value.trim() })}
          placeholder="Cole aqui a chave anônima do projeto..."
          rows={3}
          className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
        />
      </div>

      {/* Campo Nome da Tabela (opcional) */}
      <div className="space-y-1.5">
        <label className="text-[0.65rem] font-bold text-slate-300 uppercase flex items-center gap-1.5">
          <Database size={12} className="text-emerald-400" />
          Nome da Tabela de Eventos
        </label>
        <input
          type="text"
          value={config.tableName || ''}
          onChange={(e) => setConfig({ ...config, tableName: e.target.value.trim() })}
          placeholder="operational_events"
          className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Status do Teste */}
      {testResult !== 'idle' && (
        <div className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
          testResult === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          {testResult === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span>{testMessage}</span>
        </div>
      )}

      {/* Botões de Ação */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={isTesting}
          className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-black uppercase rounded-xl flex items-center gap-2 cursor-pointer transition-all"
        >
          <TestTube2 size={14} className={isTesting ? 'animate-spin' : ''} />
          <span>{isTesting ? 'Testando...' : 'Testar Conexão'}</span>
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-black text-xs font-black uppercase rounded-xl flex items-center gap-2 cursor-pointer transition-all"
        >
          <Save size={14} />
          <span>{isSaving ? 'Salvando...' : 'Salvar Configuração'}</span>
        </button>
      </div>
    </div>
  );
}
