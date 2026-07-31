const fs = require('fs');
const lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');

const startIndex = lines.findIndex(l => l.includes('Update seconds based on high precision math reference, auto-saving every 5 seconds'));
if (startIndex !== -1) {
  const endIndex = lines.findIndex((l, idx) => idx > startIndex && l.includes('if (changed) return updated;'));
  
  if (endIndex !== -1) {
    const newContent = `  // Update seconds based on high precision math reference, auto-saving every 5 seconds
  useEffect(() => {
    if (!dbReady) return;
    setTimerState(prev => {
      let changed = false;
      const updated = { ...prev };
      
      if (prev.cronometro?.ativo) {
        const secs = Math.floor((Date.now() - prev.cronometro.inicio) / 1000);
        if (secs !== prev.cronometro.segundos) {
          updated.cronometro = { ...prev.cronometro, segundos: secs };
          changed = true;
        }
      }
      
      // Secure background Auto-Save draft state to DB every 5 seconds
      if (ticks > 0 && ticks % 5 === 0) {
        saveState('timerStateDual', prev);
        // Visual cue of secure save
        const autoSaveVisual = document.getElementById('visual-cue-save');
        if (autoSaveVisual) {
          autoSaveVisual.style.opacity = '1';
          setTimeout(() => { autoSaveVisual.style.opacity = '0'; }, 800);
        }
      }
`;
    lines.splice(startIndex, endIndex - startIndex, newContent);
    fs.writeFileSync('src/App.tsx', lines.join('\n'));
    console.log('patched');
  } else {
    console.log('end index not found');
  }
} else {
  console.log('start index not found');
}
