const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/import \{ Log, AppTimerState \} from '\.\/types';/, `import { Log, AppTimerState } from './types';`);

// Find the line where timerState is initialized
content = content.replace(
  /const \[timerState, setTimerState\] = useState<AppTimerState>\(\{[\s\S]*?rascunhoColabInd: ''\s*\}\);/,
  `const [timerState, setTimerState] = useState<AppTimerState>({
    cronometro: { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' },
    rascunhoColab: '',
    rascunhoVol: ''
  });
  const [activeOperator, setActiveOperator] = useState(localStorage.getItem('repro_active_operator') || '');
  const [inputOpen, setInputOpen] = useState(false);`
);

// Delete the old timer interval useEffects (from // Sync timer loop ... to just before `const startDirect = `)
content = content.replace(
  /\/\/ Sync timer loop[\s\S]*?(?=const startDirect =)/,
  `// Sync timer loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerState.cronometro.ativo) {
      interval = setInterval(() => {
        setTimerState(prev => {
          const updated = { ...prev };
          const secs = Math.floor((Date.now() - prev.cronometro.inicio) / 1000);
          if (secs !== prev.cronometro.segundos) {
            updated.cronometro = { ...prev.cronometro, segundos: secs };
          }
          return updated;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerState.cronometro.ativo, timerState.cronometro.inicio]);\n\n  `
);

// Replace all the old timer functions (startDirect through saveIndirect) with new functions
content = content.replace(
  /const startDirect = [\s\S]*?(?=const addToast =)/,
  `const startTimer = (activity: string, btnId: string, tipo: 'direta' | 'indireta') => {
    setTimerState(prev => {
      const updated = { ...prev };
      updated.cronometro.ativo = true;
      updated.cronometro.atividade = activity;
      updated.cronometro.botaoId = btnId;
      updated.cronometro.tipo = tipo;
      updated.cronometro.inicio = Date.now() - (prev.cronometro.segundos * 1000);
      return updated;
    });
    setInputOpen(false);
  };

  const pauseTimer = () => {
    setTimerState(prev => {
      const updated = { ...prev };
      updated.cronometro.ativo = false;
      return updated;
    });
    addToast("Registo suspenso.", 'var(--color-warning)');
  };

  const stopTimer = () => {
    pauseTimer();
    if (timerState.cronometro.segundos === 0) {
      addToast("Nenhum tempo registado.", 'var(--color-danger)');
      return;
    }
    setInputOpen(true);
  };

  const cancelTimer = () => {
    setTimerState(prev => {
      const updated = { ...prev };
      updated.cronometro = { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' };
      updated.rascunhoVol = '';
      return updated;
    });
    setInputOpen(false);
    addToast("Registo cancelado.", 'var(--color-danger)');
  };

  const saveTimer = async (colab: string, volumes: number) => {
    const decimalHours = timerState.cronometro.segundos / 3600;
    
    if (!colab.trim()) {
      addToast("Operador não definido.", 'var(--color-danger)');
      return;
    }

    const newLog: Log = {
      id: Date.now(),
      data: new Date().toLocaleDateString('pt-PT'),
      dia: getDiaDaSemana(),
      semana: getWeekNumber(new Date()),
      atividade: timerState.cronometro.tipo === 'indireta' ? \`IND: \${timerState.cronometro.atividade}\` : timerState.cronometro.atividade,
      colaborador: colab.toUpperCase(),
      volumes: volumes,
      horas: Number(decimalHours.toFixed(2)),
      vph: (decimalHours > 0 && volumes > 0 && timerState.cronometro.tipo === 'direta') ? (volumes / decimalHours).toFixed(2) : "0.00",
      timestamp: Date.now(),
      synced: false,
      tipo: timerState.cronometro.tipo,
      setor: activeSectorId
    };

    await saveLogAndSync(newLog);

    if (!colabHistory.includes(colab.toUpperCase())) {
      const newHistory = [colab.toUpperCase(), ...colabHistory].slice(0, 10);
      setColabHistory(newHistory);
      localStorage.setItem('repro_colab_history', JSON.stringify(newHistory));
    }

    setTimerState(prev => {
      const updated = { ...prev };
      updated.cronometro = { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' };
      updated.rascunhoVol = '';
      return updated;
    });
    setInputOpen(false);
    addToast("Registo gravado com sucesso!", 'var(--color-success)');
  };\n\n  `
);

// Also need to update the StopwatchPanel rendering and remove the duplicate active operator/spreadsheet config in the header/settings if possible, or just hook them up
content = content.replace(
  /<StopwatchPanel[\s\S]*?\/>/,
  `<StopwatchPanel
                  timerState={timerState}
                  colabHistory={colabHistory}
                  inputOpen={inputOpen}
                  onStartTimer={startTimer}
                  onPauseTimer={pauseTimer}
                  onStopTimer={stopTimer}
                  onCancelTimer={cancelTimer}
                  onSaveTimer={saveTimer}
                  activeOperator={activeOperator}
                  onActiveOperatorChange={(op) => {
                    setActiveOperator(op);
                    localStorage.setItem('repro_active_operator', op);
                  }}
                  apiUrl={apiUrl}
                  onApiUrlChange={handleApiUrlChange}
                />`
);

// Also update header indicator (where we were showing both timers before)
content = content.replace(
  /<span className=\{timerState.direta[\s\S]*?<\/span>/,
  `<span className={timerState.cronometro.ativo ? (timerState.cronometro.tipo === 'indireta' ? 'text-warning' : 'text-terminal-accent') : 'text-terminal-text/50'}>
                        {timerState.cronometro.ativo
                          ? \`\${timerState.cronometro.atividade} [\${Math.floor(timerState.cronometro.segundos / 3600)}h]\`
                          : timerState.cronometro.segundos > 0
                          ? \`PAUSADO [\${Math.floor(timerState.cronometro.segundos / 3600)}h]\`
                          : 'INATIVO'}
                      </span>`
);

// We had two spans in the header, one for direct one for indirect. We need to remove the indirect one.
content = content.replace(
  /\|/g,
  `|` // Need to make sure I am finding the second span
);
content = content.replace(
  /<span className=\{timerState.indireta[\s\S]*?<\/span>/,
  ``
);

// Also we should remove the 'LIGAÇÃO À PLANILHA' from the settings tab so it's not duplicated
content = content.replace(
  /<section className="border-panel p-6 rounded-sm space-y-4">[\s\S]*?\[LIGAÇÃO À PLANILHA\][\s\S]*?<\/section>/,
  ``
);

fs.writeFileSync('src/App.tsx', content);

