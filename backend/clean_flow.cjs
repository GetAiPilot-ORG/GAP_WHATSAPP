const fs = require('fs');

// Read the currently messed up file
let content = fs.readFileSync('src/services/flows.service.ts', 'utf8');

// Find where the clean original code ends
const endMarker = "return { valid: errors.length === 0, errors };\n}";
const endIndex = content.indexOf(endMarker);
if (endIndex !== -1) {
    // Keep only the clean part
    content = content.substring(0, endIndex + endMarker.length);
}

// Read from server.old.ts natively (which is clean UTF-8)
const serverContent = fs.readFileSync('server.old.ts', 'utf8');
const lines = serverContent.split('\n');

const startIndex = lines.findIndex(l => l.includes('async function processFlowEngine('));
let processEndIndex = startIndex;
while (processEndIndex < lines.length && !lines[processEndIndex].startsWith('// ====== API Endpoints ======')) {
    processEndIndex++;
}

let flowCode = lines.slice(startIndex, processEndIndex).join('\n');
flowCode = flowCode.replace('async function processFlowEngine', 'export async function processFlowEngine');

// Write the perfectly clean file
fs.writeFileSync('src/services/flows.service.ts', content + '\n\n' + flowCode);
console.log('Cleaned and fixed flows.service.ts!');
