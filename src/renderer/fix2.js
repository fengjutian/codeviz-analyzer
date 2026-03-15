const fs = require('fs');

let content = fs.readFileSync('app.view.js', 'utf8');

// Get the lines
const lines = content.split('\n');

// Check line 531 (index 530)
console.log('Line 531 BEFORE:', lines[530]);

// Fix line 531
lines[530] = lines[530].replace(
  /`数量: \$\{[^}]+\} 个符号`/,
  '"数量:" + ((ctx.understandingData.symbols || []).length)'
);

console.log('Line 531 AFTER:', lines[530]);

// Write back
fs.writeFileSync('app.view.js', lines.join('\n'), 'utf8');
console.log('File updated');
