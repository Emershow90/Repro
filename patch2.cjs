const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Remove extra states
content = content.replace(/  const \[directInputOpen, setDirectInputOpen\] = useState\(false\);\n/, '');
content = content.replace(/  const \[indirectInputOpen, setIndirectInputOpen\] = useState\(false\);\n/, '');

// Fix recovery
content = content.replace(
  /          if \(saved.rascunhoColabDir \|\| saved.rascunhoVolDir\) \{\n            setDirectInputOpen\(true\);\n          \}\n          if \(saved.rascunhoColabInd\) \{\n            setIndirectInputOpen\(true\);\n          \}/,
  `          if (saved.rascunhoVol) {\n            setInputOpen(true);\n          }`
);

// Fix clear everything (if applicable, let's search for setDirectInputOpen)
content = content.replace(/setDirectInputOpen\(.*?\);/g, '');
content = content.replace(/setIndirectInputOpen\(.*?\);/g, '');

fs.writeFileSync('src/App.tsx', content);
