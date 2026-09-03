const fs = require('fs');
const path = require('path');

const adminPath = path.resolve('../rbms-frontend/src/modules/dashboard/pages/AdminDashboardPage.jsx');
const lines = fs.readFileSync(adminPath, 'utf8').split('\n');

console.log("=== Lines 490-535 ===");
console.log(lines.slice(489, 535).join('\n'));
