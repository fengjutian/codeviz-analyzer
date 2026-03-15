const fs = require('fs');

const lines = fs.readFileSync('app.view.js', 'utf8').split('\n');

// Replace lines 531 and 532 with safe versions (no emoji, using string concatenation)
// Line 531: ctx.understandingData.symbols.length -> (ctx.understandingData.symbols || []).length
// Line 532: ctx.understandingData.key_concepts.slice -> (ctx.understandingData.key_concepts || []).slice

lines[530] = '                            e("span", { style: { marginRight: 12 } }, "Symbols:" + ((ctx.understandingData.symbols || []).length)),';
lines[531] = '                            e("span", { style: { marginRight: 12 } }, "Concepts:" + ((ctx.understandingData.key_concepts || []).slice(0, 2).join(", ")))';

fs.writeFileSync('app.view.js', lines.join('\n'), 'utf8');
console.log('Fixed lines 531 and 532');
