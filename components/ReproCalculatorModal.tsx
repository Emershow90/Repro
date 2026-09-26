import React, { useState } from 'react';
import { Calculator, X, ArrowRight, ArrowLeftRight, Check, Package, Layers, Sparkles, RefreshCw } from 'lucide-react';

interface ReproCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyBoxes?: (boxes: number, totalPieces: number, pcb: number) => void;
  initialUnit?: 'CAIXAS' | 'VOLUMES';
}

export default function ReproCalculatorModal({
  isOpen,
  onClose,
  onApplyBoxes,
  initialUnit = 'CAIXAS'
}: ReproCalculatorModalProps) {
  // Mode: 'MULTIPLICATION' (PCB * EU = Total) or 'DIVISION' (Total / PCB = EU)
  const [mode, setMode] = useState<'MULTIPLICATION' | 'DIVISION'>('MULTIPLICATION');

  // Multiplicação: PCB (unid/cx) * EU (qtd caixas) = Total
  const [pcb, setPcb] = useState<string>('12');
  const [eu, setEu] = useState<string>('10');

  // Divisão: Total de Peças / PCB = EU + Resto
  const [totalPiecesInput, setTotalPiecesInput] = useState<string>('120');
  const [pcbDivision, setPcbDivision] = useState<string>('12');

  if (!isOpen) return null;

  const numPcb = parseFloat(pcb) || 0;
  const numEu = parseFloat(eu) || 0;
  const calculatedTotalPieces = Math.round(numPcb * numEu * 100) / 100;

  const numTotalPieces = parseFloat(totalPiecesInput) || 0;
  const numPcbDiv = parseFloat(pcbDivision) || 0;
  const calculatedEu = numPcbDiv > 0 ? Math.floor(numTotalPieces / numPcbDiv) : 0;
  const calculatedRemainder = numPcbDiv > 0 ? Math.round((numTotalPieces % numPcbDiv) * 100) / 100 : 0;

  const pcbPresets = [4, 6, 8, 10, 12, 16, 20, 24, 30, 48, 50, 100];
  const euPresets = [1, 2, 5, 10, 15, 20, 50];

  const handleApply = () => {
    if (onApplyBoxes) {
      if (mode === 'MULTIPLICATION') {
        onApplyBoxes(numEu, calculatedTotalPieces, numPcb);
      } else {
        onApplyBoxes(calculatedEu, numTotalPieces, numPcbDiv);
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 font-mono animate-fade-in">
      <div className="bg-slate-950 border border-emerald-500/50 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between p-3.5 bg-slate-900 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/40">
              <Calculator size={18} />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                Calculadora REPRO
                <span className="text-[0.6rem] px-1.5 py-0.2 bg-emerald-500 text-black font-black rounded">
                  PCB × EU
                </span>
              </h3>
              <p className="text-[0.62rem] text-slate-400">
                {mode === 'MULTIPLICATION' ? 'PCB (Unid/Cx) × EU (Qtd Caixas)' : 'Peças Totais ÷ PCB = Caixas (EU)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg text-sm transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* MODO TOGGLE */}
        <div className="p-2.5 bg-slate-900/60 border-b border-white/5 flex gap-1.5">
          <button
            type="button"
            onClick={() => setMode('MULTIPLICATION')}
            className={`flex-1 py-1.5 px-2 rounded-xl text-[0.68rem] font-bold uppercase transition-all flex items-center justify-center gap-1.5 ${
              mode === 'MULTIPLICATION'
                ? 'bg-emerald-500 text-black shadow-md font-black'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <Package size={13} />
            <span>PCB × EU ➔ Total</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('DIVISION')}
            className={`flex-1 py-1.5 px-2 rounded-xl text-[0.68rem] font-bold uppercase transition-all flex items-center justify-center gap-1.5 ${
              mode === 'DIVISION'
                ? 'bg-cyan-500 text-black shadow-md font-black'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <Layers size={13} />
            <span>Total ÷ PCB ➔ Caixas</span>
          </button>
        </div>

        {/* CORPO DA CALCULADORA */}
        <div className="p-3.5 space-y-3 overflow-y-auto">
          
          {mode === 'MULTIPLICATION' ? (
            <>
              {/* CAMPO 1: PCB (Unidades dentro da caixa) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[0.65rem] text-slate-300">
                  <span className="font-bold text-emerald-400">PCB (Unidades por Caixa / Embalagem):</span>
                  <span className="text-[0.6rem] text-slate-400">peças / cx</span>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  value={pcb}
                  onChange={(e) => setPcb(e.target.value)}
                  placeholder="Ex: 12"
                  className="w-full min-h-[44px] bg-slate-900 border border-emerald-500/60 text-emerald-300 text-lg px-3 rounded-xl font-mono font-black focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                
                {/* PRESETS DE PCB */}
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  <span className="text-[0.58rem] text-slate-500 mr-1">Comuns:</span>
                  {pcbPresets.map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPcb(String(val))}
                      className={`px-1.5 py-0.5 rounded text-[0.62rem] font-bold border transition-all ${
                        pcb === String(val)
                          ? 'bg-emerald-500 text-black border-emerald-400'
                          : 'bg-slate-900 text-slate-300 border-white/10 hover:border-emerald-500/40'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* CAMPO 2: EU (Quantidade de Caixas) */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[0.65rem] text-slate-300">
                  <span className="font-bold text-cyan-400">EU (Quantidade de Caixas):</span>
                  <span className="text-[0.6rem] text-slate-400">caixas (cx)</span>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  value={eu}
                  onChange={(e) => setEu(e.target.value)}
                  placeholder="Ex: 10"
                  className="w-full min-h-[44px] bg-slate-900 border border-cyan-500/60 text-cyan-300 text-lg px-3 rounded-xl font-mono font-black focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />

                {/* PRESETS DE EU */}
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  <span className="text-[0.58rem] text-slate-500 mr-1">Ajuste rápido:</span>
                  {euPresets.map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setEu(String(val))}
                      className={`px-1.5 py-0.5 rounded text-[0.62rem] font-bold border transition-all ${
                        eu === String(val)
                          ? 'bg-cyan-500 text-black border-cyan-400'
                          : 'bg-slate-900 text-slate-300 border-white/10 hover:border-cyan-500/40'
                      }`}
                    >
                      +{val} cx
                    </button>
                  ))}
                </div>
              </div>

              {/* RESULTADO MULTIPLICAÇÃO */}
              <div className="p-3 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-cyan-950/80 border border-emerald-500/40 rounded-xl mt-2 space-y-1">
                <div className="flex items-center justify-between text-[0.65rem] text-slate-400">
                  <span>Fórmula aplicada:</span>
                  <span className="font-bold text-white">{numPcb} (unid/cx) × {numEu} (caixas)</span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-xs text-slate-300 uppercase font-bold">Total de Peças:</span>
                  <span className="text-2xl font-black text-emerald-300 font-mono">
                    {calculatedTotalPieces.toLocaleString('pt-BR')} <span className="text-xs text-emerald-400 font-normal">unidades</span>
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* MODO DIVISÃO: TOTAL DE PEÇAS / PCB */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[0.65rem] text-slate-300">
                  <span className="font-bold text-cyan-400">Total de Peças / Unidades:</span>
                  <span className="text-[0.6rem] text-slate-400">total avulso</span>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  value={totalPiecesInput}
                  onChange={(e) => setTotalPiecesInput(e.target.value)}
                  placeholder="Ex: 144"
                  className="w-full min-h-[44px] bg-slate-900 border border-cyan-500/60 text-cyan-300 text-lg px-3 rounded-xl font-mono font-black focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[0.65rem] text-slate-300">
                  <span className="font-bold text-emerald-400">PCB (Peças por Caixa):</span>
                  <span className="text-[0.6rem] text-slate-400">unid/cx</span>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  value={pcbDivision}
                  onChange={(e) => setPcbDivision(e.target.value)}
                  placeholder="Ex: 12"
                  className="w-full min-h-[44px] bg-slate-900 border border-emerald-500/60 text-emerald-300 text-lg px-3 rounded-xl font-mono font-black focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />

                {/* PRESETS DE PCB */}
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  <span className="text-[0.58rem] text-slate-500 mr-1">Comuns:</span>
                  {pcbPresets.map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPcbDivision(String(val))}
                      className={`px-1.5 py-0.5 rounded text-[0.62rem] font-bold border transition-all ${
                        pcbDivision === String(val)
                          ? 'bg-emerald-500 text-black border-emerald-400'
                          : 'bg-slate-900 text-slate-300 border-white/10 hover:border-emerald-500/40'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* RESULTADO DIVISÃO */}
              <div className="p-3 bg-gradient-to-r from-cyan-950/80 via-slate-900 to-emerald-950/80 border border-cyan-500/40 rounded-xl mt-2 space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-300 uppercase font-bold">Caixas Fechadas (EU):</span>
                  <span className="text-2xl font-black text-cyan-300 font-mono">
                    {calculatedEu} <span className="text-xs text-cyan-400 font-normal">cx</span>
                  </span>
                </div>
                {calculatedRemainder > 0 && (
                  <div className="flex items-center justify-between text-[0.68rem] text-amber-300 pt-1 border-t border-white/10">
                    <span>Sobra / Avulsos (Resto):</span>
                    <strong className="font-mono font-black">{calculatedRemainder} peças</strong>
                  </div>
                )}
              </div>
            </>
          )}

        </div>

        {/* RODAPÉ DE AÇÕES */}
        <div className="p-3 bg-slate-900 border-t border-white/10 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
          >
            Fechar
          </button>

          {onApplyBoxes && (
            <button
              type="button"
              onClick={handleApply}
              disabled={mode === 'MULTIPLICATION' ? numEu <= 0 : calculatedEu <= 0}
              className="flex-2 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-black rounded-xl text-xs uppercase shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Check size={15} className="stroke-[3]" />
              <span>
                Aplicar +{mode === 'MULTIPLICATION' ? numEu : calculatedEu} {initialUnit === 'CAIXAS' ? 'cx' : 'vol'}
              </span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
