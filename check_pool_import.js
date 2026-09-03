const fs = require('fs');
const lines = fs.readFileSync('src/modules/products/products.service.js', 'utf8').split('\n');
console.log(lines.slice(0, 10).join('\n'));
