const fs = require('fs');

let content = fs.readFileSync('app.view.js', 'utf8');

// Find and fix using a different approach - look for the exact problematic string
// The issue is line 531 with Chinese characters followed by template literal

// Use index-based replacement
const lines = content.split('\n');

// Print lines around 531 to see what we're dealing with
console.log('Lines around 531:');
for (let i = 528; i < 535; i++) {
  console.log(`Line ${i+1}:`, JSON.stringify(lines[i]));
}

// Replace manually for line 531 - need to change the template literal
// From: `数量: ${(ctx.understandingData.symbols || []).length} 个符号`
// To: "数量:" + ((ctx.understandingData.symbols || []).length)
lines[530] = '                            e("span", { style: { marginRight: 12 } }, "数量:" + ((ctx.understandingData.symbols || []).length))';

fs.writeFileSync('app.view.js', lines.join('\n'), 'utf8');
console.log('File updated');
