export type TransactionType = 'expense' | 'income' | 'transfer';
export type PaymentMethod = 'cash' | 'upi';
export type TransferDirection = 'cash_to_upi' | 'upi_to_cash';

export interface Profile {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
}

export interface Transaction {
  id: number;
  profileId?: string;
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
  cashTransferIn?: number;
  cashTransferOut?: number;

  // UPI Wallet
  upiBalance: number;
  upiIncome: number;
  upiExpense: number;
  upiTransferIn?: number;
  upiTransferOut?: number;

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
  categoryLimitsEnabled?: boolean;
  activeProfileId?: string;
}

export interface CategoryLimitStatus {
  category: string;
  limit: number;
  spent: number;
  remaining: number;
  percent: number;
  isOverLimit: boolean;
  color?: string;
  icon?: string;
}

export interface DailySpend {
  day: number;
  date: string;
  total: number;
  cash: number;
  upi: number;
}
