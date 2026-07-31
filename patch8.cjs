const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /      setTimerState\(\{\n        direta: \{ ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '' \},\n        indireta: \{ ativo: false, inicio: 0, segundos: 0, atividade: '' \},\n        rascunhoColabDir: '',\n        rascunhoVolDir: '',\n        rascunhoColabInd: ''\n      \}\);/,
  `      setTimerState({
        cronometro: { ativo: false, inicio: 0, segundos: 0, atividade: '', botaoId: '', tipo: 'direta' },
        rascunhoColab: '',
        rascunhoVol: ''
      });`
);

fs.writeFileSync('src/App.tsx', content);
