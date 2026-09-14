import fs from 'fs';
import path from 'path';

const fileMap = {
  'StopwatchPanel.tsx': 'features/timer',
  'DashboardMetrics.tsx': 'features/dashboard',
  'VphChart.tsx': 'features/dashboard',
  'RankingTable.tsx': 'features/dashboard',
  'RecentLogsTable.tsx': 'features/dashboard',
  'BreakdownPanel.tsx': 'features/dashboard',
  'TemporalFilterBar.tsx': 'features/dashboard',
  'ManagementModule.tsx': 'features/management',
  'HistoryTab.tsx': 'features/management',
  'WeeklyFollowupTab.tsx': 'features/management',
  'StreetReplenishmentModule.tsx': 'features/streets',
  'OfflineReplenishmentAssistant.tsx': 'features/streets',
  'ReabastecimentoGuiado.tsx': 'features/streets',
  'AuthLoginCard.tsx': 'features/auth',
  'ErrorBoundary.tsx': 'ui',
  'Screensaver.tsx': 'ui',
  'HelpSupportModal.tsx': 'ui',
  'TabBarBead.tsx': 'ui',
  'FormModalFloatingButton.tsx': 'ui',
  'OdbcQueryBridge.tsx': 'ui'
};

const componentsDir = path.join(process.cwd(), 'src', 'components');
const srcDir = path.join(process.cwd(), 'src');

// Move files
for (const [file, folder] of Object.entries(fileMap)) {
  const oldPath = path.join(componentsDir, file);
  const newDir = path.join(srcDir, folder);
  const newPath = path.join(newDir, file);
  
  if (fs.existsSync(oldPath)) {
    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
    fs.renameSync(oldPath, newPath);
    console.log(`Moved ${file} to ${folder}`);
  }
}

// Update imports in App.tsx
const appPath = path.join(srcDir, 'App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

for (const [file, folder] of Object.entries(fileMap)) {
  const componentName = file.replace('.tsx', '');
  const oldImport = `./components/${componentName}`;
  const newImport = `./${folder}/${componentName}`;
  
  appContent = appContent.replace(
    new RegExp(`from ['"]${oldImport}['"]`, 'g'),
    `from '${newImport}'`
  );
}

fs.writeFileSync(appPath, appContent);
console.log('App.tsx imports updated.');
