import { useCallback, useEffect, useRef, useState } from 'react';
import { getState, saveState } from '../dbLocal';
import { AppTimerState, StopwatchState } from '../types';

const EMPTY_STOPWATCH: StopwatchState = { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' };
const INITIAL_STATE: AppTimerState = { cronometro: EMPTY_STOPWATCH, rascunhoColab: '', rascunhoVol: '' };

function normalizeSavedTimer(saved: unknown): AppTimerState {
  if (!saved || typeof saved !== 'object') return INITIAL_STATE;
  const state = saved as Partial<AppTimerState> & { direta?: StopwatchState; indireta?: StopwatchState; rascunhoColabDir?: string; rascunhoVolDir?: string };
  const cronometro = state.cronometro ?? (state.direta?.ativo ? state.direta : state.indireta?.ativo ? { ...state.indireta, tipo: 'indireta' as const } : EMPTY_STOPWATCH);
  return { cronometro: { ...EMPTY_STOPWATCH, ...cronometro }, rascunhoColab: state.rascunhoColabDir ?? state.rascunhoColab ?? '', rascunhoVol: state.rascunhoVolDir ?? state.rascunhoVol ?? '' };
}

/** Owns elapsed-time calculation, draft recovery and periodic persistence. */
export function useTimer(dbReady: boolean) {
  const [state, setState] = useState<AppTimerState>(INITIAL_STATE);
  const [inputOpen, setInputOpen] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!dbReady) return;
    let alive = true;
    getState<unknown>('timerStateDual').then(saved => {
      if (!alive || !saved) return;
      const recovered = normalizeSavedTimer(saved);
      setState(recovered);
      setInputOpen(Boolean(recovered.rascunhoVol));
    }).catch(error => console.warn('Não foi possível recuperar o rascunho do cronômetro.', error));
    return () => { alive = false; };
  }, [dbReady]);

  useEffect(() => {
    if (!dbReady) return;
    const interval = window.setInterval(() => {
      const current = stateRef.current;
      if (current.cronometro.ativo) {
        const seconds = Math.floor((Date.now() - current.cronometro.inicio) / 1000);
        if (seconds !== current.cronometro.segundos) setState(previous => ({ ...previous, cronometro: { ...previous.cronometro, segundos: seconds } }));
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [dbReady]);

  useEffect(() => {
    if (!dbReady) return;
    const interval = window.setInterval(() => { void saveState('timerStateDual', stateRef.current); }, 5000);
    return () => window.clearInterval(interval);
  }, [dbReady]);

  const start = useCallback((activity: string, buttonId: string, tipo: StopwatchState['tipo']) => {
    setState(previous => ({ ...previous, cronometro: { ...previous.cronometro, ativo: true, atividade: activity, botaoId: buttonId, tipo, inicio: Date.now() - previous.cronometro.segundos * 1000 } }));
    setInputOpen(false);
  }, []);
  const pause = useCallback(() => setState(previous => ({ ...previous, cronometro: { ...previous.cronometro, ativo: false } })), []);
  const stop = useCallback(() => { pause(); if (stateRef.current.cronometro.segundos > 0) setInputOpen(true); }, [pause]);
  const reset = useCallback(() => { setState({ ...INITIAL_STATE, cronometro: { ...EMPTY_STOPWATCH } }); setInputOpen(false); }, []);
  const clearAfterSave = reset;

  return { timerState: state, elapsed: state.cronometro.segundos, state: state.cronometro, inputOpen, setInputOpen, start, pause, stop, reset, clearAfterSave, save: () => saveState('timerStateDual', stateRef.current) };
}
