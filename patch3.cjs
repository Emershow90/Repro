const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace all handle(Start/Pause/Stop/Cancel/Save)(Direct/Indirect) with the new consolidated timer functions
content = content.replace(
  /const handleStartDirect = [\s\S]*?(?=const addToast =)/,
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
  };

  `
);

fs.writeFileSync('src/App.tsx', content);
