const fs = require('fs');
const schema = fs.readFileSync('src/database/schema.sql', 'utf8');
const lines = schema.split('\n');

lines.forEach((l, i) => {
  if (l.toLowerCase().includes('create table') && l.toLowerCase().includes('table')) {
    console.log(`Line ${i+1}: ${l}`);
  }
});
