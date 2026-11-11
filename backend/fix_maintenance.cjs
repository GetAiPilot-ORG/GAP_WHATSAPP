const fs = require('fs');
const files = [
  'C:/Users/HP/Desktop/getaipilot/bot-dashboard/getaipilot.in/src/components/MaintenanceGuard.tsx',
  'C:/Users/HP/Desktop/getaipilot/bot-dashboard/getaipilot.online/src/components/MaintenanceGuard.tsx',
  'C:/Users/HP/Desktop/getaipilot/GAP_VoicePilot/apps/web/components/MaintenanceGuard.tsx',
  'C:/Users/HP/Desktop/getaipilot/GAP_WHATSAPP/frontend/src/components/MaintenanceGuard.tsx',
  'C:/Users/HP/Desktop/getaipilot/QuickPost/client/src/components/MaintenanceGuard.tsx'
];

files.forEach(f => {
  try {
    if (fs.existsSync(f)) {
      let c = fs.readFileSync(f, 'utf8');
      c = c.replace(/setTimeout\(\(\) => controller\.abort\(\), 2000\)/g, 'setTimeout(() => controller.abort(), 5000)');
      c = c.replace(/console\.error\("Maintenance check failed:", error\);/g, 'if (error.name !== "AbortError") console.error("Maintenance check failed:", error); else console.warn("Maintenance check timeout");');
      fs.writeFileSync(f, c);
      console.log('Updated ' + f);
    }
  } catch(e) {
    console.error('Error on ' + f + ': ' + e.message);
  }
});
