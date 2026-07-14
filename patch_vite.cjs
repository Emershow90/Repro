const fs = require('fs');
let content = fs.readFileSync('vite.config.ts', 'utf8');

content = content.replace(
  "hmr: process.env.DISABLE_HMR !== 'true',",
  "hmr: process.env.DISABLE_HMR !== 'true' ? { clientPort: 443 } : false,"
);

fs.writeFileSync('vite.config.ts', content);
