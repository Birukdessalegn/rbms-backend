/**
 * Ethiopian Payroll Tax & Pension Calculator
 * Based on Ethiopian Federal Income Tax Proclamation (No. 979/2016)
 * and Public/Private Employees Pension Proclamation (No. 715/2011 & 716/2011)
 */

/**
 * Calculate progressive employment income tax in Ethiopian Birr (ETB)
 * @param {number} taxableIncome - Monthly taxable income (Gross Salary minus 7% Employee Pension)
 * @returns {number} Tax amount in ETB
 */
function calculateEthiopianIncomeTax(taxableIncome) {
  const income = Math.max(0, Number(taxableIncome || 0));

  if (income <= 600) {
    return 0;
  } else if (income <= 1650) {
    return Number((income * 0.10 - 60).toFixed(2));
  } else if (income <= 3200) {
    return Number((income * 0.15 - 142.50).toFixed(2));
  } else if (income <= 5250) {
    return Number((income * 0.20 - 302.50).toFixed(2));
  } else if (income <= 7800) {
    return Number((income * 0.25 - 565.00).toFixed(2));
  } else if (income <= 10900) {
    return Number((income * 0.30 - 955.00).toFixed(2));
  } else {
    return Number((income * 0.35 - 1500.00).toFixed(2));
  }
}

/**
 * Calculate 7% Employee Pension and 11% Employer Pension
 * @param {number} baseSalary - Base salary in ETB
 */
function calculatePension(baseSalary) {
  const base = Math.max(0, Number(baseSalary || 0));
  const employeePension = Number((base * 0.07).toFixed(2));
  const employerPension = Number((base * 0.11).toFixed(2));

  return {
    employeePension,
    employerPension,
  };
}

/**
 * Full Ethiopian Payslip Calculation for an employee
 */
function calculateEmployeePayroll({
  baseSalary = 0,
  daysWorked = 30,
  daysAbsent = 0,
  allowances = 0,
  overtime = 0,
  bonuses = 0,
  otherDeductions = 0,
}) {
  const base = Math.max(0, Number(baseSalary || 0));
  const absent = Math.max(0, Number(daysAbsent || 0));
  const allow = Math.max(0, Number(allowances || 0));
  const ot = Math.max(0, Number(overtime || 0));
  const bns = Math.max(0, Number(bonuses || 0));
  const otherDed = Math.max(0, Number(otherDeductions || 0));

  // Absence deduction (based on 30 calendar days or actual working days)
  const dailyRate = base > 0 ? base / 30 : 0;
  const absenceDeduction = Number((absent * dailyRate).toFixed(2));

  // Earned base salary after absence deduction
  const earnedBase = Math.max(0, base - absenceDeduction);

  // Gross salary
  const grossSalary = Number((earnedBase + allow + ot + bns).toFixed(2));

  // Pension (7% employee on earned base)
  const { employeePension, employerPension } = calculatePension(earnedBase);

  // Taxable income = Gross Salary minus Employee Pension
  const taxableIncome = Math.max(0, grossSalary - employeePension);

  // Progressive Income Tax
  const incomeTax = calculateEthiopianIncomeTax(taxableIncome);

  // Total deductions
  const totalDeductions = Number((absenceDeduction + employeePension + incomeTax + otherDed).toFixed(2));

  // Net salary
  const netSalary = Number(Math.max(0, (base + allow + ot + bns) - totalDeductions).toFixed(2));

  return {
    baseSalary: base,
    daysWorked: Number(daysWorked),
    daysAbsent: absent,
    absenceDeduction,
    allowances: allow,
    overtime: ot,
    bonuses: bns,
    grossSalary,
    pensionEmployee: employeePension,
    pensionEmployer: employerPension,
    taxableIncome: Number(taxableIncome.toFixed(2)),
    incomeTax,
    otherDeductions: otherDed,
    totalDeductions,
    netSalary,
  };
}

module.exports = {
  calculateEthiopianIncomeTax,
  calculatePension,
  calculateEmployeePayroll,
};
