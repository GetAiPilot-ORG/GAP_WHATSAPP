const fs = require('fs');

let content = fs.readFileSync('extract_flow_engine.ts', 'utf8');
content = content.replace('async function processFlowEngine', 'export async function processFlowEngine');

fs.appendFileSync('src/services/flows.service.ts', '\n\n' + content);
console.log('Appended processFlowEngine successfully.');
