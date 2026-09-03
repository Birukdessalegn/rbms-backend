const fs = require('fs');
const path = require('path');

const adminPath = path.resolve('../rbms-frontend/src/modules/dashboard/pages/AdminDashboardPage.jsx');
const lines = fs.readFileSync(adminPath, 'utf8').split('\n');

console.log("=== Lines 1315-1365 ===");
console.log(lines.slice(1314, 1365).join('\n'));
