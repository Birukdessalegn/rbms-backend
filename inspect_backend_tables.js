const fs = require('fs');
const files = [
  'src/modules/tables/tables.service.js',
  'src/modules/tables/tables.controller.js',
  'src/modules/pos/tables.service.js',
  'src/modules/pos/tables.controller.js',
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    console.log("=== " + f + " ===");
    console.log(fs.readFileSync(f, 'utf8'));
  }
});
