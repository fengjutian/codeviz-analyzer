const fs = require('fs');
let content = fs.readFileSync('app.view.js', 'utf8');

// Fix line 531 - symbols.length
content = content.replace(
  /e\("span", \{ style: \{ marginRight: 12 \} \}, `数量: \$\{[^}]+\} 个符号`\)/g,
  'e("span", { style: { marginRight: 12 } }, "数量:" + ((ctx.understandingData.symbols || []).length))'
);

// Fix line 532 - key_concepts.slice
content = content.replace(
  /e\("span", \{ style: \{ marginRight: 12 \} \}, `概念: \$\{[^}]+\}\.join\(", "\)\)`\)/g,
  'e("span", { style: { marginRight: 12 } }, "概念:" + ((ctx.understandingData.key_concepts || []).slice(0, 2).join(", ")))'
);

fs.writeFileSync('app.view.js', content, 'utf8');
console.log('Done');
