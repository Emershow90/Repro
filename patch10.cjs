const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /        const saved = await getState\('timerStateDual'\);\n        if \(saved\) \{\n          setTimerState\(saved as AppTimerState\);\n          if \(saved.rascunhoVol\) \{\n            setInputOpen\(true\);\n          \}\n        \}/,
  `        const saved = await getState('timerStateDual') as any;
        if (saved) {
          // Migration from old schema if needed
          if (saved.direta || saved.indireta) {
             const cronometro = saved.direta?.ativo ? saved.direta : (saved.indireta?.ativo ? { ...saved.indireta, tipo: 'indireta' } : { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' });
             setTimerState({
               cronometro: cronometro,
               rascunhoColab: '',
               rascunhoVol: saved.rascunhoVolDir || saved.rascunhoVol || ''
             });
             if (saved.rascunhoVolDir || saved.rascunhoVol) {
               setInputOpen(true);
             }
          } else {
            setTimerState(saved as AppTimerState);
            if (saved.rascunhoVol) {
              setInputOpen(true);
            }
          }
        }`
);

fs.writeFileSync('src/App.tsx', content);
