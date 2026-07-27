const fs = require('fs');

// Restore original flows.service.ts
const content = fs.readFileSync('src/services/flows.service.ts', 'utf8');
const originalIndex = content.indexOf('export async function processFlowEngine');
if (originalIndex !== -1) {
    fs.writeFileSync('src/services/flows.service.ts', content.substring(0, originalIndex));
}

// Read from server.old.ts natively
const serverContent = fs.readFileSync('server.old.ts', 'utf8');
const lines = serverContent.split('\n');

const startIndex = lines.findIndex(l => l.includes('async function processFlowEngine('));
let endIndex = startIndex;
while (endIndex < lines.length && !lines[endIndex].startsWith('// ====== API Endpoints ======')) {
    endIndex++;
}

let flowCode = lines.slice(startIndex, endIndex).join('\n');
flowCode = flowCode.replace('async function processFlowEngine', 'export async function processFlowEngine');

fs.appendFileSync('src/services/flows.service.ts', '\n\n' + flowCode);
console.log('Fixed flows.service.ts natively!');
