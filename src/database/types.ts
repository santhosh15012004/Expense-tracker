export type TransactionType = 'expense' | 'income';
export type PaymentMethod = 'cash' | 'upi';

export interface Transaction {
  id: number;
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  categoryIcon?: string;
  categoryColor?: string;
  paymentMethod: PaymentMethod; // 'cash' | 'upi'
  date: string; // YYYY-MM-DD
  notes?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
}

export interface WalletSummary {
  // Cash Wallet
  cashBalance: number;
  cashIncome: number;
  cashExpense: number;

  // UPI Wallet
  upiBalance: number;
  upiIncome: number;
  upiExpense: number;

  // Overall
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  transactionCount: number;
}

export interface CategorySpend {
  category: string;
  total: number;
  cashTotal: number;
  upiTotal: number;
  color: string;
  icon: string;
  percentage: number;
  count: number;
}

export interface MonthlySpend {
  month: string; // YYYY-MM
  label: string; // Jan 2026
  expense: number;
  income: number;
  cashExpense: number;
  upiExpense: number;
}

export interface AppSettings {
  currency: string; // strictly '₹'
  monthlyBudget: number; // 0 means not set
}

export interface DailySpend {
  day: number;
  date: string;
  total: number;
  cash: number;
  upi: number;
}
