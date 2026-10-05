import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import {
  Transaction,
  Category,
  WalletSummary,
  CategorySpend,
  MonthlySpend,
  DailySpend,
  AppSettings,
  CategoryLimitStatus,
  TransactionType,
  PaymentMethod,
} from './types';
import {
  normalizeDateString,
  getLocalDateString,
  getLocalYearMonth,
  pad2,
} from '../utils/dateUtils';

let dbInstance: SQLite.SQLiteDatabase | null = null;
const IS_WEB = Platform.OS === 'web';

export const DEFAULT_CATEGORIES: Category[] = [
  // Expenses
  { id: 'cat_food', name: 'Food & Dining', icon: 'restaurant', color: '#F97316', type: 'expense' },
  { id: 'cat_groceries', name: 'Kirana & Groceries', icon: 'cart', color: '#10B981', type: 'expense' },
  { id: 'cat_chai', name: 'Chai & Snacks', icon: 'cafe', color: '#854D0E', type: 'expense' },
  { id: 'cat_transport', name: 'Auto, Cab & Petrol', icon: 'car', color: '#3B82F6', type: 'expense' },
  { id: 'cat_bills', name: 'Mobile, Electricity & Bills', icon: 'flash', color: '#EF4444', type: 'expense' },
  { id: 'cat_shopping', name: 'Shopping & Clothes', icon: 'bag-handle', color: '#EC4899', type: 'expense' },
  { id: 'cat_health', name: 'Medical & Pharmacy', icon: 'medkit', color: '#06B6D4', type: 'expense' },
  { id: 'cat_entertainment', name: 'Movies & Outing', icon: 'film', color: '#8B5CF6', type: 'expense' },
  { id: 'cat_other_exp', name: 'Other Expense', icon: 'ellipsis-horizontal-circle', color: '#64748B', type: 'expense' },

  // Income
  { id: 'cat_salary', name: 'Salary', icon: 'cash', color: '#22C55E', type: 'income' },
  { id: 'cat_freelance', name: 'Business / Freelance', icon: 'laptop', color: '#0EA5E9', type: 'income' },
  { id: 'cat_cashback', name: 'UPI Cashback & Reward', icon: 'gift', color: '#F59E0B', type: 'income' },
  { id: 'cat_transfer', name: 'Received from Friend', icon: 'person', color: '#A855F7', type: 'income' },
  { id: 'cat_other_inc', name: 'Other Income', icon: 'wallet', color: '#14B8A6', type: 'income' },
];

// Web Storage Helper
function getWebStorage<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const data = window.localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    }
  } catch {
    // fallback
  }
  return defaultValue;
}

function setWebStorage<T>(key: string, value: T): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // fallback
  }
}

export function getDatabase(): SQLite.SQLiteDatabase | null {
  if (IS_WEB) return null;
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('expenses.db');
  }
  return dbInstance;
}

export function initDatabase(): void {
  if (IS_WEB) {
    const cats = getWebStorage<Category[]>('exp_categories', []);
    if (cats.length === 0) {
      setWebStorage('exp_categories', DEFAULT_CATEGORIES);
    }
    const settings = getWebStorage<Record<string, string>>('exp_settings', {});
    settings.currency = '₹';
    if (!settings.monthlyBudget) settings.monthlyBudget = '0';
    setWebStorage('exp_settings', settings);
    return;
  }

  const db = getDatabase()!;

  db.execSync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      categoryIcon TEXT,
      categoryColor TEXT,
      paymentMethod TEXT NOT NULL DEFAULT 'upi',
      date TEXT NOT NULL,
      notes TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Ensure settings
  db.runSync("INSERT OR REPLACE INTO settings (key, value) VALUES ('currency', '₹');");
  const budget = db.getFirstSync<{ value: string }>("SELECT value FROM settings WHERE key = 'monthlyBudget';");
  if (!budget) {
    db.runSync("INSERT INTO settings (key, value) VALUES ('monthlyBudget', '0');");
  }

  // Seed default categories
  const countRow = db.getFirstSync<{ count: number }>('SELECT count(*) as count FROM categories;');
  if (!countRow || countRow.count === 0) {
    const insertCat = db.prepareSync(
      'INSERT INTO categories (id, name, icon, color, type) VALUES ($id, $name, $icon, $color, $type);'
    );
    try {
      for (const cat of DEFAULT_CATEGORIES) {
        insertCat.executeSync({
          $id: cat.id,
          $name: cat.name,
          $icon: cat.icon,
          $color: cat.color,
          $type: cat.type,
        });
      }
    } finally {
      insertCat.finalizeSync();
    }
  }

  // Repair & sanitize any previously entered non-standard dates (e.g. DD-MM-YYYY)
  sanitizeAllTransactionDates();
}

/**
 * Sanitizes any existing transaction dates in database or web storage
 * to strict YYYY-MM-DD format so they reflect in all monthly views and queries.
 */
export function sanitizeAllTransactionDates(): void {
  try {
    if (IS_WEB) {
      const list = getWebStorage<Transaction[]>('exp_transactions', []);
      let changed = false;
      for (const t of list) {
        const norm = normalizeDateString(t.date);
        if (norm && norm !== t.date) {
          t.date = norm;
          changed = true;
        }
      }
      if (changed) {
        setWebStorage('exp_transactions', list);
      }
      return;
    }

    const db = getDatabase();
    if (!db) return;
    const rows = db.getAllSync<{ id: number; date: string }>('SELECT id, date FROM transactions;');
    for (const r of rows) {
      const norm = normalizeDateString(r.date);
      if (norm && norm !== r.date) {
        db.runSync('UPDATE transactions SET date = ? WHERE id = ?;', [norm, r.id]);
      }
    }
  } catch (e) {
    console.error('Failed to sanitize transaction dates:', e);
  }
}

// ----------------- Settings -----------------
export function getAppSettings(): AppSettings {
  if (IS_WEB) {
    const s = getWebStorage<Record<string, string>>('exp_settings', {});
    return {
      currency: '₹',
      monthlyBudget: s.monthlyBudget ? parseFloat(s.monthlyBudget) || 0 : 0,
      categoryLimitsEnabled: s.categoryLimitsEnabled === 'true',
    };
  }

  const db = getDatabase()!;
  const budgetRow = db.getFirstSync<{ value: string }>("SELECT value FROM settings WHERE key = 'monthlyBudget';");
  const limitsRow = db.getFirstSync<{ value: string }>("SELECT value FROM settings WHERE key = 'categoryLimitsEnabled';");

  return {
    currency: '₹',
    monthlyBudget: budgetRow ? parseFloat(budgetRow.value) || 0 : 0,
    categoryLimitsEnabled: limitsRow?.value === 'true',
  };
}

export function saveAppSetting(key: 'monthlyBudget' | 'categoryLimitsEnabled', value: string): void {
  if (IS_WEB) {
    const s = getWebStorage<Record<string, string>>('exp_settings', {});
    s[key] = value;
    setWebStorage('exp_settings', s);
    return;
  }

  const db = getDatabase()!;
  db.runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
    [key, value]
  );
}

// ----------------- Category Limits -----------------
export function getCategoryLimits(): Record<string, number> {
  if (IS_WEB) {
    const s = getWebStorage<Record<string, string>>('exp_settings', {});
    try {
      return s.category_limits ? JSON.parse(s.category_limits) : {};
    } catch {
      return {};
    }
  }

  const db = getDatabase()!;
  const row = db.getFirstSync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'category_limits';"
  );
  if (!row || !row.value) return {};
  try {
    return JSON.parse(row.value);
  } catch {
    return {};
  }
}

export function saveCategoryLimits(limits: Record<string, number>): void {
  const jsonStr = JSON.stringify(limits);
  if (IS_WEB) {
    const s = getWebStorage<Record<string, string>>('exp_settings', {});
    s.category_limits = jsonStr;
    setWebStorage('exp_settings', s);
    return;
  }

  const db = getDatabase()!;
  db.runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
    ['category_limits', jsonStr]
  );
}

export function setCategoryLimit(categoryName: string, limit: number): void {
  const trimmed = categoryName.trim();
  if (!trimmed) return;

  // Ensure category exists in categories table so it shows up in expense categories
  const allCats = getAllCategories();
  const existing = allCats.find((c) => c.name.toLowerCase() === trimmed.toLowerCase() && c.type === 'expense');
  if (!existing) {
    let icon = 'pricetag';
    let color = '#3B82F6';
    const lower = trimmed.toLowerCase();
    if (lower.includes('food') || lower.includes('dining') || lower.includes('snack') || lower.includes('eat')) {
      icon = 'restaurant';
      color = '#F97316';
    } else if (lower.includes('petrol') || lower.includes('fuel') || lower.includes('cab') || lower.includes('auto') || lower.includes('diesel')) {
      icon = 'car';
      color = '#2563EB';
    } else if (lower.includes('service') || lower.includes('repair') || lower.includes('maintenance')) {
      icon = 'construct';
      color = '#8B5CF6';
    } else if (lower.includes('grocery') || lower.includes('kirana') || lower.includes('market')) {
      icon = 'cart';
      color = '#10B981';
    } else if (lower.includes('bill') || lower.includes('electric') || lower.includes('recharge')) {
      icon = 'flash';
      color = '#EF4444';
    }
    addCustomCategory(trimmed, 'expense', icon, color);
  }

  const currentLimits = getCategoryLimits();
  currentLimits[trimmed] = limit;
  saveCategoryLimits(currentLimits);
}

export function deleteCategoryLimit(categoryName: string): void {
  const trimmed = categoryName.trim();
  const currentLimits = getCategoryLimits();
  const targetKey = Object.keys(currentLimits).find(
    (k) => k.toLowerCase() === trimmed.toLowerCase()
  );
  if (targetKey) {
    delete currentLimits[targetKey];
  } else {
    delete currentLimits[trimmed];
  }
  saveCategoryLimits(currentLimits);
}

export function getCategoryMonthlySpend(categoryName: string, month?: string): number {
  const targetMonth = month || getLocalYearMonth();
  const catLower = categoryName.trim().toLowerCase();

  if (IS_WEB) {
    const list = getWebStorage<Transaction[]>('exp_transactions', []);
    return list
      .filter((t) => {
        if (t.type !== 'expense' || !t.date.startsWith(targetMonth)) return false;
        const tCat = t.category.toLowerCase();
        return (
          tCat === catLower ||
          (catLower === 'food' && tCat.includes('food')) ||
          (catLower === 'petrol' && tCat.includes('petrol')) ||
          (catLower === 'service' && tCat.includes('service')) ||
          (catLower.includes('food') && tCat === 'food') ||
          (catLower.includes('petrol') && tCat === 'petrol') ||
          (catLower.includes('service') && tCat === 'service')
        );
      })
      .reduce((sum, t) => sum + t.amount, 0);
  }

  const db = getDatabase()!;
  const row = db.getFirstSync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
     WHERE type = 'expense' 
       AND date LIKE $month 
       AND (
         LOWER(category) = $cat 
         OR ($cat = 'food' AND LOWER(category) LIKE '%food%')
         OR ($cat = 'petrol' AND LOWER(category) LIKE '%petrol%')
         OR ($cat = 'service' AND LOWER(category) LIKE '%service%')
         OR ($cat LIKE '%food%' AND LOWER(category) = 'food')
         OR ($cat LIKE '%petrol%' AND LOWER(category) = 'petrol')
         OR ($cat LIKE '%service%' AND LOWER(category) = 'service')
       );`,
    {
      $month: `${targetMonth}%`,
      $cat: catLower,
    }
  );
  return row ? row.total : 0;
}

export function getAllCategoryLimitStatuses(month?: string): CategoryLimitStatus[] {
  const limits = getCategoryLimits();
  const categories = getAllCategories();
  const targetMonth = month || getLocalYearMonth();

  const result: CategoryLimitStatus[] = [];
  for (const [catName, limit] of Object.entries(limits)) {
    if (limit <= 0) continue;
    const spent = getCategoryMonthlySpend(catName, targetMonth);
    const remaining = limit - spent;
    const percent = Math.min(Math.round((spent / limit) * 100), 999);
    const matchCat = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());

    result.push({
      category: catName,
      limit,
      spent,
      remaining,
      percent,
      isOverLimit: remaining < 0,
      color: matchCat?.color || '#2563EB',
      icon: matchCat?.icon || 'pricetag',
    });
  }

  return result.sort((a, b) => b.percent - a.percent);
}

// ----------------- Categories -----------------
export function getAllCategories(): Category[] {
  if (IS_WEB) {
    const cats = getWebStorage<Category[]>('exp_categories', DEFAULT_CATEGORIES);
    return [...cats].sort((a, b) => a.name.localeCompare(b.name));
  }

  const db = getDatabase()!;
  return db.getAllSync<Category>('SELECT * FROM categories ORDER BY type ASC, name ASC;');
}

export function addCustomCategory(
  name: string,
  type: TransactionType,
  icon = 'pricetag',
  color?: string
): Category {
  const trimmed = name.trim();
  const id = 'cat_custom_' + trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const customColors = ['#6366F1', '#EC4899', '#14B8A6', '#F59E0B', '#8B5CF6', '#06B6D4', '#10B981', '#F43F5E', '#D97706'];
  const assignedColor =
    color ||
    customColors[
      Math.abs(trimmed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % customColors.length
    ];

  if (IS_WEB) {
    const cats = getWebStorage<Category[]>('exp_categories', DEFAULT_CATEGORIES);
    const existing = cats.find((c) => c.name.toLowerCase() === trimmed.toLowerCase() && c.type === type);
    if (existing) return existing;
    const newCat: Category = { id, name: trimmed, icon, color: assignedColor, type };
    cats.push(newCat);
    setWebStorage('exp_categories', cats);
    return newCat;
  }

  const db = getDatabase()!;
  const existing = db.getFirstSync<Category>(
    'SELECT * FROM categories WHERE LOWER(name) = LOWER(?) AND type = ?;',
    [trimmed, type]
  );
  if (existing) return existing;

  const newCat: Category = { id, name: trimmed, icon, color: assignedColor, type };
  db.runSync(
    'INSERT OR REPLACE INTO categories (id, name, icon, color, type) VALUES (?, ?, ?, ?, ?);',
    [newCat.id, newCat.name, newCat.icon, newCat.color, newCat.type]
  );
  return newCat;
}

// ----------------- Transactions CRUD -----------------
export function getTransactions(options?: {
  month?: string; // YYYY-MM or 'all'
  type?: TransactionType;
  category?: string;
  paymentMethod?: PaymentMethod;
  search?: string;
  limit?: number;
}): Transaction[] {
  if (IS_WEB) {
    let list = getWebStorage<Transaction[]>('exp_transactions', []);

    if (options?.month && options.month !== 'all') {
      list = list.filter((t) => t.date.startsWith(options.month!));
    }
    if (options?.type) {
      list = list.filter((t) => t.type === options.type);
    }
    if (options?.category) {
      list = list.filter((t) => t.category === options.category);
    }
    if (options?.paymentMethod) {
      list = list.filter((t) => t.paymentMethod === options.paymentMethod);
    }
    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(
        (t) => t.title.toLowerCase().includes(q) || (t.notes && t.notes.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    if (options?.limit) {
      list = list.slice(0, options.limit);
    }
    return list;
  }

  const db = getDatabase()!;
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const params: Record<string, string | number> = {};

  if (options?.month && options.month !== 'all') {
    query += ' AND date LIKE $month';
    params.$month = `${options.month}%`;
  }

  if (options?.type) {
    query += ' AND type = $type';
    params.$type = options.type;
  }

  if (options?.category) {
    query += ' AND category = $category';
    params.$category = options.category;
  }

  if (options?.paymentMethod) {
    query += ' AND paymentMethod = $pm';
    params.$pm = options.paymentMethod;
  }

  if (options?.search && options.search.trim()) {
    query += ' AND (title LIKE $search OR notes LIKE $search)';
    params.$search = `%${options.search.trim()}%`;
  }

  query += ' ORDER BY date DESC, id DESC';

  if (options?.limit) {
    query += ' LIMIT $limit';
    params.$limit = options.limit;
  }

  return db.getAllSync<Transaction>(query, params);
}

export function addTransaction(data: {
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  categoryIcon?: string;
  categoryColor?: string;
  paymentMethod: PaymentMethod;
  date: string;
  notes?: string;
}): Transaction {
  const createdAt = new Date().toISOString();
  const method: PaymentMethod = data.paymentMethod === 'cash' ? 'cash' : 'upi';
  const normDate = normalizeDateString(data.date) || getLocalDateString();

  if (IS_WEB) {
    const list = getWebStorage<Transaction[]>('exp_transactions', []);
    const newId = list.length > 0 ? Math.max(...list.map((t) => t.id)) + 1 : 1;
    const newTx: Transaction = {
      id: newId,
      title: data.title.trim(),
      amount: data.amount,
      type: data.type,
      category: data.category,
      categoryIcon: data.categoryIcon || 'pricetag',
      categoryColor: data.categoryColor || '#64748B',
      paymentMethod: method,
      date: normDate,
      notes: data.notes ? data.notes.trim() : '',
      createdAt,
    };
    list.unshift(newTx);
    setWebStorage('exp_transactions', list);
    return newTx;
  }

  const db = getDatabase()!;
  const result = db.runSync(
    `INSERT INTO transactions (title, amount, type, category, categoryIcon, categoryColor, paymentMethod, date, notes, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      data.title.trim(),
      data.amount,
      data.type,
      data.category,
      data.categoryIcon || 'pricetag',
      data.categoryColor || '#64748B',
      method,
      normDate,
      data.notes ? data.notes.trim() : '',
      createdAt,
    ]
  );

  return {
    id: result.lastInsertRowId,
    title: data.title.trim(),
    amount: data.amount,
    type: data.type,
    category: data.category,
    categoryIcon: data.categoryIcon,
    categoryColor: data.categoryColor,
    paymentMethod: method,
    date: normDate,
    notes: data.notes,
    createdAt,
  };
}

export function updateTransaction(
  id: number,
  data: {
    title: string;
    amount: number;
    type: TransactionType;
    category: string;
    categoryIcon?: string;
    categoryColor?: string;
    paymentMethod: PaymentMethod;
    date: string;
    notes?: string;
  }
): void {
  const method: PaymentMethod = data.paymentMethod === 'cash' ? 'cash' : 'upi';
  const normDate = normalizeDateString(data.date) || getLocalDateString();

  if (IS_WEB) {
    const list = getWebStorage<Transaction[]>('exp_transactions', []);
    const idx = list.findIndex((t) => t.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        title: data.title.trim(),
        amount: data.amount,
        type: data.type,
        category: data.category,
        categoryIcon: data.categoryIcon || 'pricetag',
        categoryColor: data.categoryColor || '#64748B',
        paymentMethod: method,
        date: normDate,
        notes: data.notes ? data.notes.trim() : '',
      };
      setWebStorage('exp_transactions', list);
    }
    return;
  }

  const db = getDatabase()!;
  db.runSync(
    `UPDATE transactions
     SET title = ?, amount = ?, type = ?, category = ?, categoryIcon = ?, categoryColor = ?, paymentMethod = ?, date = ?, notes = ?
     WHERE id = ?;`,
    [
      data.title.trim(),
      data.amount,
      data.type,
      data.category,
      data.categoryIcon || 'pricetag',
      data.categoryColor || '#64748B',
      method,
      normDate,
      data.notes ? data.notes.trim() : '',
      id,
    ]
  );
}

export function deleteTransaction(id: number): void {
  if (IS_WEB) {
    const list = getWebStorage<Transaction[]>('exp_transactions', []);
    setWebStorage(
      'exp_transactions',
      list.filter((t) => t.id !== id)
    );
    return;
  }

  const db = getDatabase()!;
  db.runSync('DELETE FROM transactions WHERE id = ?;', [id]);
}

// ----------------- Dual Wallet Summary (Cash vs UPI) -----------------
export function getWalletSummary(month?: string): WalletSummary {
  let transactions: Transaction[] = [];

  if (IS_WEB) {
    transactions = getWebStorage<Transaction[]>('exp_transactions', []);
    if (month && month !== 'all') {
      transactions = transactions.filter((t) => t.date.startsWith(month));
    }
  } else {
    const db = getDatabase()!;
    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params: Record<string, string> = {};
    if (month && month !== 'all') {
      query += ' AND date LIKE $month';
      params.$month = `${month}%`;
    }
    transactions = db.getAllSync<Transaction>(query, params);
  }

  let cashIncome = 0;
  let cashExpense = 0;
  let upiIncome = 0;
  let upiExpense = 0;

  for (const t of transactions) {
    const isUpi = t.paymentMethod === 'upi';
    if (t.type === 'income') {
      if (isUpi) upiIncome += t.amount;
      else cashIncome += t.amount;
    } else {
      if (isUpi) upiExpense += t.amount;
      else cashExpense += t.amount;
    }
  }

  const cashBalance = cashIncome - cashExpense;
  const upiBalance = upiIncome - upiExpense;
  const totalIncome = cashIncome + upiIncome;
  const totalExpense = cashExpense + upiExpense;
  const totalBalance = cashBalance + upiBalance;

  return {
    cashBalance,
    cashIncome,
    cashExpense,

    upiBalance,
    upiIncome,
    upiExpense,

    totalBalance,
    totalIncome,
    totalExpense,
    transactionCount: transactions.length,
  };
}

// ----------------- Category Breakdown with Cash & UPI -----------------
export function getCategoryBreakdown(month?: string): CategorySpend[] {
  let list: Transaction[] = [];

  if (IS_WEB) {
    list = getWebStorage<Transaction[]>('exp_transactions', []);
  } else {
    const db = getDatabase()!;
    list = db.getAllSync<Transaction>('SELECT * FROM transactions;');
  }

  list = list.filter((t) => t.type === 'expense');
  if (month && month !== 'all') {
    list = list.filter((t) => t.date.startsWith(month));
  }

  const map = new Map<
    string,
    { total: number; cashTotal: number; upiTotal: number; count: number; icon: string; color: string }
  >();
  let grandTotal = 0;

  for (const t of list) {
    grandTotal += t.amount;
    const existing = map.get(t.category) || {
      total: 0,
      cashTotal: 0,
      upiTotal: 0,
      count: 0,
      icon: t.categoryIcon || 'pricetag',
      color: t.categoryColor || '#3B82F6',
    };
    existing.total += t.amount;
    existing.count += 1;
    if (t.paymentMethod === 'cash') {
      existing.cashTotal += t.amount;
    } else {
      existing.upiTotal += t.amount;
    }
    map.set(t.category, existing);
  }

  const result: CategorySpend[] = [];
  map.forEach((val, cat) => {
    result.push({
      category: cat,
      total: val.total,
      cashTotal: val.cashTotal,
      upiTotal: val.upiTotal,
      count: val.count,
      icon: val.icon,
      color: val.color,
      percentage: grandTotal > 0 ? Math.round((val.total / grandTotal) * 100) : 0,
    });
  });

  return result.sort((a, b) => b.total - a.total);
}

// ----------------- Monthly Trends (Cash & UPI separate) -----------------
export function getMonthlyTrends(monthsCount = 6): MonthlySpend[] {
  const result: MonthlySpend[] = [];
  const now = new Date();

  let allTx: Transaction[] = [];
  if (IS_WEB) {
    allTx = getWebStorage<Transaction[]>('exp_transactions', []);
  } else {
    const db = getDatabase()!;
    allTx = db.getAllSync<Transaction>('SELECT * FROM transactions;');
  }

  for (let i = monthsCount - 1; i >= 0; i--) {
    const y = now.getFullYear();
    const m = now.getMonth() - i;
    const d = new Date(y, m, 1);
    const yearMonth = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const label = d.toLocaleString('en-IN', { month: 'short' });

    let expense = 0;
    let income = 0;
    let cashExpense = 0;
    let upiExpense = 0;

    for (const t of allTx) {
      if (t.date.startsWith(yearMonth)) {
        if (t.type === 'expense') {
          expense += t.amount;
          if (t.paymentMethod === 'cash') cashExpense += t.amount;
          else upiExpense += t.amount;
        } else {
          income += t.amount;
        }
      }
    }

    result.push({ month: yearMonth, label, expense, income, cashExpense, upiExpense });
  }

  return result;
}

// ----------------- Daily Spend Histogram for Selected Month -----------------
export function getDailySpendForMonth(month: string): DailySpend[] {
  let allTx: Transaction[] = [];
  if (IS_WEB) {
    allTx = getWebStorage<Transaction[]>('exp_transactions', []);
  } else {
    const db = getDatabase()!;
    allTx = db.getAllSync<Transaction>('SELECT * FROM transactions;');
  }

  const effectiveMonth = month === 'all' ? getLocalYearMonth() : month;
  const parts = effectiveMonth.split('-');
  const year = parseInt(parts[0], 10) || new Date().getFullYear();
  const monthNum = parseInt(parts[1], 10) || new Date().getMonth() + 1;
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const dailyMap = new Map<number, { total: number; cash: number; upi: number }>();
  for (let i = 1; i <= daysInMonth; i++) {
    dailyMap.set(i, { total: 0, cash: 0, upi: 0 });
  }

  for (const t of allTx) {
    if (t.type === 'expense' && t.date && t.date.startsWith(effectiveMonth)) {
      const day = parseInt(t.date.split('-')[2], 10);
      if (day >= 1 && day <= daysInMonth) {
        const cur = dailyMap.get(day) || { total: 0, cash: 0, upi: 0 };
        cur.total += t.amount;
        if (t.paymentMethod === 'cash') cur.cash += t.amount;
        else cur.upi += t.amount;
        dailyMap.set(day, cur);
      }
    }
  }

  const result: DailySpend[] = [];
  dailyMap.forEach((val, day) => {
    const padDay = String(day).padStart(2, '0');
    result.push({
      day,
      date: `${effectiveMonth}-${padDay}`,
      total: val.total,
      cash: val.cash,
      upi: val.upi,
    });
  });

  return result;
}

// ----------------- Export & Import -----------------
export function exportBackupData(): string {
  let transactions: Transaction[] = [];
  let categories: Category[] = [];

  if (IS_WEB) {
    transactions = getWebStorage<Transaction[]>('exp_transactions', []);
    categories = getWebStorage<Category[]>('exp_categories', DEFAULT_CATEGORIES);
  } else {
    const db = getDatabase()!;
    transactions = db.getAllSync<Transaction>('SELECT * FROM transactions ORDER BY date DESC;');
    categories = db.getAllSync<Category>('SELECT * FROM categories;');
  }

  return JSON.stringify(
    {
      version: 3,
      currency: '₹',
      appName: 'Offline Cash & UPI Expense Tracker',
      exportedAt: new Date().toISOString(),
      transactions,
      categories,
    },
    null,
    2
  );
}

export function exportToCSV(): string {
  const transactions = getTransactions();
  const headers = ['ID', 'Date', 'Type', 'Wallet (Method)', 'Category', 'Title', 'Amount (INR)', 'Notes'];
  const rows = transactions.map((t) => [
    t.id,
    `"${t.date}"`,
    `"${t.type.toUpperCase()}"`,
    `"${t.paymentMethod.toUpperCase()}"`,
    `"${t.category}"`,
    `"${(t.title || '').replace(/"/g, '""')}"`,
    t.amount,
    `"${(t.notes || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function importBackupData(jsonString: string): { success: boolean; message: string } {
  try {
    const data = JSON.parse(jsonString);
    if (!data.transactions || !Array.isArray(data.transactions)) {
      return { success: false, message: 'Invalid backup file format' };
    }

    if (IS_WEB) {
      setWebStorage('exp_transactions', data.transactions);
      if (data.categories) setWebStorage('exp_categories', data.categories);
      return { success: true, message: `Successfully restored ${data.transactions.length} transactions!` };
    }

    const db = getDatabase()!;
    db.runSync('DELETE FROM transactions;');

    const insertTx = db.prepareSync(
      `INSERT INTO transactions (id, title, amount, type, category, categoryIcon, categoryColor, paymentMethod, date, notes, createdAt)
       VALUES ($id, $title, $amount, $type, $category, $categoryIcon, $categoryColor, $paymentMethod, $date, $notes, $createdAt);`
    );

    try {
      for (const tx of data.transactions) {
        insertTx.executeSync({
          $id: tx.id,
          $title: tx.title,
          $amount: tx.amount,
          $type: tx.type,
          $category: tx.category,
          $categoryIcon: tx.categoryIcon || 'pricetag',
          $categoryColor: tx.categoryColor || '#64748B',
          $paymentMethod: tx.paymentMethod === 'cash' ? 'cash' : 'upi',
          $date: tx.date,
          $notes: tx.notes || '',
          $createdAt: tx.createdAt || new Date().toISOString(),
        });
      }
    } finally {
      insertTx.finalizeSync();
    }

    return { success: true, message: `Successfully restored ${data.transactions.length} transactions!` };
  } catch (err: any) {
    return { success: false, message: `Import failed: ${err.message}` };
  }
}

export function resetAllData(): void {
  if (IS_WEB) {
    setWebStorage('exp_transactions', []);
    saveAppSetting('monthlyBudget', '0');
    return;
  }

  const db = getDatabase()!;
  db.runSync('DELETE FROM transactions;');
  db.runSync("UPDATE settings SET value = '0' WHERE key = 'monthlyBudget';");
}
