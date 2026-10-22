import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Transaction, WalletSummary, CategorySpend } from '../database/types';
import { formatMonthDisplay, formatDateDisplay } from './dateUtils';

const IS_WEB = Platform.OS === 'web';

function escapeHtml(str: string = ''): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(val: number): string {
  const absVal = Math.abs(val);
  const formatted = absVal.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (val < 0 ? '-' : '') + '₹' + formatted;
}

export interface MonthlyPdfData {
  month: string; // YYYY-MM
  summary: WalletSummary;
  incomeTransactions: Transaction[];
  expenseTransactions: Transaction[];
  transferTransactions?: Transaction[];
  categoryBreakdown: CategorySpend[];
  profileName?: string;
  generatedAt?: Date;
}

/**
 * Generates an executive, print-perfect, multi-page HTML document for a monthly statement.
 * Supports automatic table pagination across pages with repeated table headers.
 */
export function generateMonthlyStatementHtml(data: MonthlyPdfData): string {
  const {
    month,
    summary,
    incomeTransactions,
    expenseTransactions,
    transferTransactions = [],
    categoryBreakdown,
    profileName,
    generatedAt = new Date(),
  } = data;

  const monthDisplay = formatMonthDisplay(month);
  const formattedGenDate = generatedAt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedGenTime = generatedAt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const totalIncome = summary.totalIncome;
  const totalExpense = summary.totalExpense;
  const netSavings = totalIncome - totalExpense;
  const isNetPositive = netSavings >= 0;
  const savingsRate =
    totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(1) : '0.0';

  // Sort chronologically for formal statement (oldest to newest in month)
  const sortedIncome = [...incomeTransactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id
  );
  const sortedExpenses = [...expenseTransactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id
  );

  // Income category breakdown
  const incomeCategoryMap: Record<string, { total: number; count: number }> = {};
  for (const inc of sortedIncome) {
    if (!incomeCategoryMap[inc.category]) {
      incomeCategoryMap[inc.category] = { total: 0, count: 0 };
    }
    incomeCategoryMap[inc.category].total += inc.amount;
    incomeCategoryMap[inc.category].count += 1;
  }

  // HTML rows for Payment Method Split
  const paymentMethodRows = `
    <tr>
      <td><span class="badge badge-cash">Cash (Wallet)</span></td>
      <td class="amount-cell text-green">${formatCurrency(summary.cashIncome)}</td>
      <td class="amount-cell text-red">${formatCurrency(summary.cashExpense)}</td>
      <td class="amount-cell ${summary.cashBalance >= 0 ? 'text-green' : 'text-red'} font-bold">
        ${formatCurrency(summary.cashBalance)}
      </td>
      <td class="text-center font-semibold text-muted">
        ${summary.cashBalance >= 0 ? 'Surplus' : 'Deficit'}
      </td>
    </tr>
    <tr>
      <td><span class="badge badge-upi">UPI / Online Bank</span></td>
      <td class="amount-cell text-green">${formatCurrency(summary.upiIncome)}</td>
      <td class="amount-cell text-red">${formatCurrency(summary.upiExpense)}</td>
      <td class="amount-cell ${summary.upiBalance >= 0 ? 'text-green' : 'text-red'} font-bold">
        ${formatCurrency(summary.upiBalance)}
      </td>
      <td class="text-center font-semibold text-muted">
        ${summary.upiBalance >= 0 ? 'Surplus' : 'Deficit'}
      </td>
    </tr>
    <tr class="table-total-row">
      <td><strong>Overall Combined Total</strong></td>
      <td class="amount-cell text-green font-bold">${formatCurrency(totalIncome)}</td>
      <td class="amount-cell text-red font-bold">${formatCurrency(totalExpense)}</td>
      <td class="amount-cell ${isNetPositive ? 'text-green' : 'text-red'} font-bold font-large">
        ${formatCurrency(netSavings)}
      </td>
      <td class="text-center font-bold ${isNetPositive ? 'text-green' : 'text-red'}">
        ${isNetPositive ? 'Net Positive' : 'Net Deficit'}
      </td>
    </tr>
  `;

  // HTML rows for Category Spending Summary
  const categoryRows =
    categoryBreakdown.length > 0
      ? categoryBreakdown
          .map((cat, idx) => {
            const pct =
              totalExpense > 0 ? ((cat.total / totalExpense) * 100).toFixed(1) : '0.0';
            return `
        <tr>
          <td class="text-center text-muted font-mono">${idx + 1}</td>
          <td><strong>${escapeHtml(cat.category)}</strong></td>
          <td class="text-center">${cat.count} txns</td>
          <td class="amount-cell font-bold text-red">${formatCurrency(cat.total)}</td>
          <td class="text-center">
            <span class="pct-pill">${pct}%</span>
          </td>
        </tr>
      `;
          })
          .join('')
      : `<tr><td colspan="5" class="empty-state">No category expenses recorded for this month.</td></tr>`;

  // HTML rows for Income Transactions
  const incomeRows =
    sortedIncome.length > 0
      ? sortedIncome
          .map((tx, idx) => {
            const isUpi = tx.paymentMethod === 'upi';
            return `
        <tr>
          <td class="text-center text-muted font-mono">${idx + 1}</td>
          <td class="nowrap">${formatDateDisplay(tx.date)}</td>
          <td><strong>${escapeHtml(tx.title)}</strong></td>
          <td><span class="category-tag">${escapeHtml(tx.category)}</span></td>
          <td class="text-center">
            <span class="badge ${isUpi ? 'badge-upi' : 'badge-cash'}">
              ${isUpi ? 'UPI' : 'Cash'}
            </span>
          </td>
          <td class="notes-cell">${escapeHtml(tx.notes || '-')}</td>
          <td class="amount-cell text-green font-bold">+${formatCurrency(tx.amount)}</td>
        </tr>
      `;
          })
          .join('')
      : `<tr><td colspan="7" class="empty-state">No income transactions recorded for ${escapeHtml(monthDisplay)}.</td></tr>`;

  // HTML rows for Expense Transactions
  const expenseRows =
    sortedExpenses.length > 0
      ? sortedExpenses
          .map((tx, idx) => {
            const isUpi = tx.paymentMethod === 'upi';
            return `
        <tr>
          <td class="text-center text-muted font-mono">${idx + 1}</td>
          <td class="nowrap">${formatDateDisplay(tx.date)}</td>
          <td><strong>${escapeHtml(tx.title)}</strong></td>
          <td><span class="category-tag category-tag-expense">${escapeHtml(tx.category)}</span></td>
          <td class="text-center">
            <span class="badge ${isUpi ? 'badge-upi' : 'badge-cash'}">
              ${isUpi ? 'UPI' : 'Cash'}
            </span>
          </td>
          <td class="notes-cell">${escapeHtml(tx.notes || '-')}</td>
          <td class="amount-cell text-red font-bold">-${formatCurrency(tx.amount)}</td>
        </tr>
      `;
          })
          .join('')
      : `<tr><td colspan="7" class="empty-state">No expense transactions recorded for ${escapeHtml(monthDisplay)}.</td></tr>`;

  // HTML rows for Transfer Transactions (Hand ⇄ UPI)
  const sortedTransfers = [...(transferTransactions || [])].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id
  );
  const transferRows =
    sortedTransfers.length > 0
      ? sortedTransfers
          .map((tx, idx) => {
            const isCashToUpi = tx.paymentMethod === 'cash';
            return `
        <tr>
          <td class="text-center text-muted font-mono">${idx + 1}</td>
          <td class="nowrap">${formatDateDisplay(tx.date)}</td>
          <td><strong>${escapeHtml(tx.title)}</strong></td>
          <td><span class="category-tag">${escapeHtml(tx.category)}</span></td>
          <td class="text-center">
            <span class="badge badge-transfer">
              ${isCashToUpi ? 'Hand ➔ UPI' : 'UPI ➔ Hand'}
            </span>
          </td>
          <td class="notes-cell">${escapeHtml(tx.notes || '-')}</td>
          <td class="amount-cell text-indigo font-bold">⇄ ${formatCurrency(tx.amount)}</td>
        </tr>
      `;
          })
          .join('')
      : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monthly Financial Statement - ${escapeHtml(monthDisplay)}</title>
  <style>
    /* Reset & Base Styles */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1E293B;
      background-color: #FFFFFF;
      font-size: 11px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Print & Page Setup */
    @page {
      size: A4 portrait;
      margin: 12mm 12mm 14mm 12mm;
    }

    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .page-break {
        page-break-before: always;
        break-before: page;
      }
      .avoid-break {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      table {
        page-break-inside: auto;
      }
      thead {
        display: table-header-group; /* Crucial: repeats table header on subsequent pages! */
      }
      tbody tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      tfoot {
        display: table-footer-group;
      }
      .no-print {
        display: none !important;
      }
    }

    .container {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      padding: 4px;
    }

    /* Document Header */
    .header-card {
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
      color: #FFFFFF;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1px solid #334155;
    }
    .header-title-wrap h1 {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #FFFFFF;
      margin-bottom: 4px;
    }
    .header-title-wrap .subtitle {
      font-size: 13px;
      color: #94A3B8;
      font-weight: 500;
    }
    .header-meta {
      text-align: right;
    }
    .month-badge {
      display: inline-block;
      background: #2563EB;
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 20px;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
      text-transform: uppercase;
    }
    .meta-date {
      font-size: 10.5px;
      color: #CBD5E1;
    }

    /* KPI Summary Cards Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 10px;
      padding: 12px 14px;
      position: relative;
      overflow: hidden;
    }
    .kpi-card.highlight-green {
      border-left: 4px solid #10B981;
      background: #F0FDF4;
    }
    .kpi-card.highlight-red {
      border-left: 4px solid #EF4444;
      background: #FEF2F2;
    }
    .kpi-card.highlight-blue {
      border-left: 4px solid #2563EB;
      background: #EFF6FF;
    }
    .kpi-card.highlight-purple {
      border-left: 4px solid #8B5CF6;
      background: #F5F3FF;
    }
    .kpi-label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #64748B;
      margin-bottom: 4px;
    }
    .kpi-value {
      font-size: 18px;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 4px;
    }
    .kpi-sub {
      font-size: 9.5px;
      color: #64748B;
      font-weight: 500;
    }

    /* Section Styling */
    .section-wrap {
      margin-bottom: 22px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid #E2E8F0;
      page-break-after: avoid;
      break-after: avoid;
    }
    .section-title {
      font-size: 13.5px;
      font-weight: 800;
      color: #0F172A;
      display: flex;
      align-items: center;
      gap: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .section-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 12px;
    }
    .pill-green {
      background: #DCFCE7;
      color: #15803D;
    }
    .pill-red {
      background: #FEE2E2;
      color: #B91C1C;
    }
    .pill-blue {
      background: #DBEAFE;
      color: #1D4ED8;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 10.5px;
    }
    th {
      background-color: #F1F5F9;
      color: #475569;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 9.5px;
      letter-spacing: 0.5px;
      padding: 8px 10px;
      border-top: 1px solid #CBD5E1;
      border-bottom: 2px solid #CBD5E1;
      text-align: left;
    }
    td {
      padding: 7px 10px;
      border-bottom: 1px solid #E2E8F0;
      vertical-align: middle;
      color: #334155;
    }
    tbody tr:nth-child(even) {
      background-color: #F8FAFC;
    }
    .table-total-row td {
      background-color: #F1F5F9 !important;
      border-top: 2px solid #94A3B8;
      border-bottom: 2px solid #94A3B8;
      font-size: 11px;
      padding: 9px 10px;
    }

    /* Cell Helpers */
    .amount-cell {
      text-align: right;
      font-family: inherit;
      white-space: nowrap;
    }
    .text-center {
      text-align: center;
    }
    .nowrap {
      white-space: nowrap;
    }
    .font-bold {
      font-weight: 700;
    }
    .font-large {
      font-size: 12.5px;
    }
    .font-mono {
      font-family: "Courier New", Courier, monospace;
    }
    .text-green {
      color: #059669;
    }
    .text-red {
      color: #DC2626;
    }
    .text-blue {
      color: #2563EB;
    }
    .text-muted {
      color: #64748B;
    }
    .notes-cell {
      max-width: 180px;
      color: #64748B;
      font-size: 10px;
      word-wrap: break-word;
    }
    .empty-state {
      text-align: center;
      padding: 18px !important;
      color: #94A3B8;
      font-style: italic;
    }

    /* Badges & Tags */
    .badge {
      display: inline-block;
      padding: 2.5px 7px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .badge-upi {
      background-color: #EEF2FF;
      color: #4F46E5;
      border: 1px solid #C7D2FE;
    }
    .badge-cash {
      background-color: #FEF3C7;
      color: #B45309;
      border: 1px solid #FDE68A;
    }
    .badge-transfer {
      background-color: #F5F3FF;
      color: #6366F1;
      border: 1px solid #DDD6FE;
    }
    .text-indigo {
      color: #4F46E5 !important;
    }
    .category-tag {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      background-color: #F1F5F9;
      color: #334155;
      font-size: 9.5px;
      font-weight: 600;
    }
    .category-tag-expense {
      background-color: #FEE2E2;
      color: #991B1B;
    }
    .pct-pill {
      display: inline-block;
      background: #F1F5F9;
      border: 1px solid #CBD5E1;
      padding: 2px 6px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 9px;
      color: #475569;
    }

    /* Reconciliation Box */
    .reconciliation-card {
      background: #F8FAFC;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      padding: 14px 18px;
      margin-top: 15px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .recon-col {
      display: flex;
      flex-direction: column;
    }
    .recon-title {
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
    }
    .recon-val {
      font-size: 15px;
      font-weight: 800;
      margin-top: 2px;
    }

    /* Document Footer */
    .doc-footer {
      border-top: 1px solid #CBD5E1;
      padding-top: 12px;
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #94A3B8;
      font-size: 9.5px;
    }
    .doc-footer strong {
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="container">

    <!-- Executive Document Header -->
    <div class="header-card avoid-break">
      <div class="header-title-wrap">
        <h1>Monthly Financial Statement</h1>
        <div class="subtitle">Complete Income, Expense &amp; Cash Flow Overview${profileName ? ` &bull; <strong>Profile: ${escapeHtml(profileName)}</strong>` : ''}</div>
      </div>
      <div class="header-meta">
        <div class="month-badge">${escapeHtml(monthDisplay)}</div>
        <div class="meta-date">Generated: ${formattedGenDate}, ${formattedGenTime}</div>
        <div class="meta-date">Total Records: ${sortedIncome.length + sortedExpenses.length} transactions</div>
      </div>
    </div>

    <!-- 1. OVERALL EXECUTIVE SUMMARY (CARDS) -->
    <div class="kpi-grid avoid-break">
      <div class="kpi-card highlight-green">
        <div class="kpi-label">Total Monthly Income</div>
        <div class="kpi-value text-green">${formatCurrency(totalIncome)}</div>
        <div class="kpi-sub">Cash: ${formatCurrency(summary.cashIncome)} &bull; UPI: ${formatCurrency(summary.upiIncome)}</div>
      </div>
      <div class="kpi-card highlight-red">
        <div class="kpi-label">Total Monthly Expenses</div>
        <div class="kpi-value text-red">${formatCurrency(totalExpense)}</div>
        <div class="kpi-sub">Cash: ${formatCurrency(summary.cashExpense)} &bull; UPI: ${formatCurrency(summary.upiExpense)}</div>
      </div>
      <div class="kpi-card ${isNetPositive ? 'highlight-blue' : 'highlight-red'}">
        <div class="kpi-label">Net Balance / Savings</div>
        <div class="kpi-value ${isNetPositive ? 'text-green' : 'text-red'}">
          ${isNetPositive ? '+' : ''}${formatCurrency(netSavings)}
        </div>
        <div class="kpi-sub">Savings Rate: ${savingsRate}% of Income</div>
      </div>
      <div class="kpi-card highlight-purple">
        <div class="kpi-label">Cash vs UPI Split</div>
        <div class="kpi-value text-blue" style="font-size: 15px;">
          ${summary.cashBalance >= 0 ? '+' : ''}${formatCurrency(summary.cashBalance)} <span style="font-size: 10px; color:#64748B;">Cash</span>
        </div>
        <div class="kpi-sub" style="font-size: 11px; font-weight:700; color: #4F46E5;">
          ${summary.upiBalance >= 0 ? '+' : ''}${formatCurrency(summary.upiBalance)} <span style="font-size: 9px; color:#64748B;">UPI</span>
        </div>
      </div>
    </div>

    <!-- 2. OVERALL PAYMENT METHOD BREAKDOWN TABLE -->
    <div class="section-wrap avoid-break">
      <div class="section-header">
        <div class="section-title">
          <span>Overall Payment Method Analysis</span>
        </div>
        <span class="section-pill pill-blue">Cash vs UPI</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 25%;">Wallet / Payment Channel</th>
            <th class="amount-cell" style="width: 20%;">Total Inflow (Income)</th>
            <th class="amount-cell" style="width: 20%;">Total Outflow (Expense)</th>
            <th class="amount-cell" style="width: 20%;">Net Monthly Balance</th>
            <th class="text-center" style="width: 15%;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${paymentMethodRows}
        </tbody>
      </table>
    </div>

    <!-- 3. OVERALL CATEGORY SPENDING BREAKDOWN -->
    ${
      categoryBreakdown.length > 0
        ? `
    <div class="section-wrap avoid-break">
      <div class="section-header">
        <div class="section-title">
          <span>Overall Expense Categories Breakdown</span>
        </div>
        <span class="section-pill pill-blue">${categoryBreakdown.length} Categories</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 8%;" class="text-center">#</th>
            <th style="width: 40%;">Expense Category</th>
            <th style="width: 16%;" class="text-center">Transactions</th>
            <th class="amount-cell" style="width: 20%;">Total Spent</th>
            <th class="text-center" style="width: 16%;">Share (%)</th>
          </tr>
        </thead>
        <tbody>
          ${categoryRows}
        </tbody>
      </table>
    </div>
    `
        : ''
    }

    <!-- 4. MONTHLY INCOME (SEPARATE SECTION) -->
    <div class="section-wrap" style="margin-top: 24px;">
      <div class="section-header">
        <div class="section-title">
          <span style="color: #059669;">Monthly Income Breakdown</span>
        </div>
        <span class="section-pill pill-green">${sortedIncome.length} Transactions &bull; ${formatCurrency(totalIncome)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 5%;" class="text-center">#</th>
            <th style="width: 13%;">Date</th>
            <th style="width: 28%;">Income Source / Title</th>
            <th style="width: 18%;">Category</th>
            <th style="width: 10%;" class="text-center">Method</th>
            <th style="width: 12%;">Notes</th>
            <th class="amount-cell" style="width: 14%;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${incomeRows}
        </tbody>
        ${
          sortedIncome.length > 0
            ? `
        <tfoot>
          <tr class="table-total-row">
            <td colspan="6" style="text-align: right;"><strong>Total Monthly Income:</strong></td>
            <td class="amount-cell text-green font-bold font-large">+${formatCurrency(totalIncome)}</td>
          </tr>
        </tfoot>
        `
            : ''
        }
      </table>
    </div>

    <!-- 5. MONTHLY EXPENSES (SEPARATE SECTION - AUTOMATICALLY SPANS MULTIPLE PAGES IF LARGE) -->
    <div class="section-wrap" style="margin-top: 24px;">
      <div class="section-header">
        <div class="section-title">
          <span style="color: #DC2626;">Monthly Expenses Breakdown</span>
        </div>
        <span class="section-pill pill-red">${sortedExpenses.length} Transactions &bull; ${formatCurrency(totalExpense)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 5%;" class="text-center">#</th>
            <th style="width: 13%;">Date</th>
            <th style="width: 28%;">Expense Description / Title</th>
            <th style="width: 18%;">Category</th>
            <th style="width: 10%;" class="text-center">Method</th>
            <th style="width: 12%;">Notes</th>
            <th class="amount-cell" style="width: 14%;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${expenseRows}
        </tbody>
        ${
          sortedExpenses.length > 0
            ? `
        <tfoot>
          <tr class="table-total-row">
            <td colspan="6" style="text-align: right;"><strong>Total Monthly Expenses:</strong></td>
            <td class="amount-cell text-red font-bold font-large">-${formatCurrency(totalExpense)}</td>
          </tr>
        </tfoot>
        `
            : ''
        }
      </table>
    </div>

    <!-- 5b. INTERNAL TRANSFERS (HAND ⇄ UPI) -->
    ${
      sortedTransfers.length > 0
        ? `
    <div class="section-container avoid-break">
      <div class="section-title">
        <span>5b. Internal Transfers (Hand ⇄ UPI)</span>
        <span class="section-subtitle">${sortedTransfers.length} transfer records (Zero Net Impact on Total Balance)</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 5%;" class="text-center">#</th>
            <th style="width: 13%;">Date</th>
            <th style="width: 28%;">Description / Title</th>
            <th style="width: 18%;">Category</th>
            <th style="width: 14%;" class="text-center">Direction</th>
            <th style="width: 8%;">Notes</th>
            <th class="amount-cell" style="width: 14%;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${transferRows}
        </tbody>
      </table>
    </div>
    `
        : ''
    }

    <!-- 6. FINAL SUMMARY RECONCILIATION -->
    <div class="reconciliation-card avoid-break">
      <div class="recon-col">
        <div class="recon-title">Statement Period</div>
        <div class="recon-val" style="color: #0F172A;">${escapeHtml(monthDisplay)}</div>
      </div>
      <div class="recon-col">
        <div class="recon-title">Total Inflows</div>
        <div class="recon-val text-green">+${formatCurrency(totalIncome)}</div>
      </div>
      <div class="recon-col">
        <div class="recon-title">Total Outflows</div>
        <div class="recon-val text-red">-${formatCurrency(totalExpense)}</div>
      </div>
      <div class="recon-col">
        <div class="recon-title">Net Savings Result</div>
        <div class="recon-val ${isNetPositive ? 'text-green' : 'text-red'}">
          ${isNetPositive ? '+' : ''}${formatCurrency(netSavings)}
        </div>
      </div>
    </div>

    <!-- Document Footer -->
    <div class="doc-footer avoid-break">
      <div>
        <strong>Expense Tracker</strong> &bull; 100% Private Offline Financial Statement
      </div>
      <div>
        Page generated for ${escapeHtml(monthDisplay)} &bull; Keep records safe
      </div>
    </div>

  </div>
</body>
</html>
  `;
}

/**
 * Executes PDF generation and triggers download/share.
 * On Native (Android & iOS): Uses expo-print to generate a true .pdf file and opens native share/save sheet.
 * On Web: Opens print dialog with pre-formatted A4 multi-page layout so user can directly save as PDF.
 */
export async function downloadMonthlyPdf(
  data: MonthlyPdfData
): Promise<{ success: boolean; message: string; uri?: string }> {
  try {
    const html = generateMonthlyStatementHtml(data);
    const monthDisplay = formatMonthDisplay(data.month);

    if (IS_WEB) {
      if (typeof window !== 'undefined') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();

          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
            } catch (err: any) {
              console.error('Print iframe error', err);
            }
            setTimeout(() => {
              try {
                document.body.removeChild(iframe);
              } catch {}
            }, 3000);
          }, 400);

          return {
            success: true,
            message: `Print dialog opened for ${monthDisplay}. Select "Save as PDF" to download!`,
          };
        }
      }
      return { success: false, message: 'Browser window document not available' };
    }

    // Native Android / iOS
    const printResult = await Print.printToFileAsync({
      html,
      base64: false,
    });

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return {
        success: true,
        uri: printResult.uri,
        message: `PDF generated at ${printResult.uri}`,
      };
    }

    await Sharing.shareAsync(printResult.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Monthly Statement - ${monthDisplay}`,
      UTI: '.pdf',
    });

    return {
      success: true,
      uri: printResult.uri,
      message: `PDF Statement for ${monthDisplay} generated successfully!`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to generate PDF: ${err?.message || 'Unknown error'}`,
    };
  }
}
