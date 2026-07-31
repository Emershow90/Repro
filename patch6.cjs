const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /    if \(!colabHistory.includes\(colab.toUpperCase\(\)\)\) \{\n      const newHistory = \[colab.toUpperCase\(\), \.\.\.colabHistory\]\.slice\(0, 10\);\n      setColabHistory\(newHistory\);\n      localStorage\.setItem\('repro_colab_history', JSON\.stringify\(newHistory\)\);\n    \}/,
  ``
);

fs.writeFileSync('src/App.tsx', content);
