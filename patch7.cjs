const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /  \/\/ Update seconds based on high precision math reference, auto-saving every 5 seconds[\s\S]*?(?=      if \(changed\) \{)/,
  `  // Update seconds based on high precision math reference, auto-saving every 5 seconds
  useEffect(() => {
    if (!dbReady) return;
    setTimerState(prev => {
      let changed = false;
      const updated = { ...prev };
      
      if (prev.cronometro.ativo) {
        const secs = Math.floor((Date.now() - prev.cronometro.inicio) / 1000);
        if (secs !== prev.cronometro.segundos) {
          updated.cronometro = { ...prev.cronometro, segundos: secs };
          changed = true;
        }
      }
      
      // Secure background Auto-Save draft state to DB every 5 seconds
      if (ticks > 0 && ticks % 5 === 0) {
        saveState('timerStateDual', prev);
      }
`
);

fs.writeFileSync('src/App.tsx', content);
