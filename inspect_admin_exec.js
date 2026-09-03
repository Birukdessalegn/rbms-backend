const fs = require('fs');
const path = require('path');

const adminPath = path.resolve('../rbms-frontend/src/modules/dashboard/pages/AdminDashboardPage.jsx');
const lines = fs.readFileSync(adminPath, 'utf8').split('\n');

console.log("=== Lines 1070-1120 ===");
console.log(lines.slice(1069, 1120).join('\n'));
