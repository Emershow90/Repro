import fs from 'fs';
import path from 'path';

const fileMap = {
  'StopwatchPanel': 'features/timer',
  'DashboardMetrics': 'features/dashboard',
  'VphChart': 'features/dashboard',
  'RankingTable': 'features/dashboard',
  'RecentLogsTable': 'features/dashboard',
  'BreakdownPanel': 'features/dashboard',
  'TemporalFilterBar': 'features/dashboard',
  'ManagementModule': 'features/management',
  'HistoryTab': 'features/management',
  'WeeklyFollowupTab': 'features/management',
  'StreetReplenishmentModule': 'features/streets',
  'OfflineReplenishmentAssistant': 'features/streets',
  'ReabastecimentoGuiado': 'features/streets',
  'AuthLoginCard': 'features/auth',
  'ErrorBoundary': 'ui',
  'Screensaver': 'ui',
  'HelpSupportModal': 'ui',
  'TabBarBead': 'ui',
  'FormModalFloatingButton': 'ui',
  'OdbcQueryBridge': 'ui',
  'ReproCalculatorModal': 'features/streets',
  'DiagnosticsTelemetryView': 'features/management',
  'SupabaseConfigModule': 'features/management',
  'ProductivityFollowup': 'features/management',
  'As400ConfigModule': 'features/management'
};

const srcDir = path.join(process.cwd(), 'src');

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });
  return arrayOfFiles;
}

const allFiles = getAllFiles(srcDir);

allFiles.forEach(filePath => {
  // Skip files not in features or ui to avoid messing up root files unnecessarily, except maybe we want to fix everything
  if (!filePath.includes('features') && !filePath.includes('ui')) return;

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Fix standard sibling imports like '../utils/dateUtils' -> '../../utils/dateUtils'
  // Because they moved from `src/components/` (depth 1) to `src/features/xxx/` (depth 2)
  const replace1 = content.replace(/from ['"]\.\.\/([^'"]+)['"]/g, "from '../../$1'");
  if (replace1 !== content) { content = replace1; changed = true; }

  // 2. Fix inter-component imports. They used to be './VphChart'
  // Now we need to figure out where they are.
  for (const [comp, folder] of Object.entries(fileMap)) {
    // Look for `./Comp` or `../Comp` or `../../components/Comp`
    const regex1 = new RegExp(`from ['"]\\.\\/${comp}['"]`, 'g');
    if (regex1.test(content)) {
      // Find relative path from current file's folder to target folder
      const currentDir = path.dirname(filePath);
      const targetDir = path.join(srcDir, folder);
      let relativePath = path.relative(currentDir, targetDir).replace(/\\/g, '/');
      if (!relativePath.startsWith('.')) relativePath = './' + relativePath;
      const newImport = `from '${relativePath}/${comp}'`;
      content = content.replace(regex1, newImport);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log('Fixed imports in', filePath);
  }
});
