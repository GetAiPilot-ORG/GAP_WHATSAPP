const fs = require('fs');
let content = fs.readFileSync('src/services/baileys.service.ts', 'utf8');

const marker = "// ====== Broadcast APIs ======";
const index = content.indexOf(marker);

if (index !== -1) {
    content = content.substring(0, index).trim() + '\n';
    fs.writeFileSync('src/services/baileys.service.ts', content);
    console.log('Cleaned baileys.service.ts');
} else {
    console.log('Marker not found');
}
