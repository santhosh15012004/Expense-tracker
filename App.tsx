import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  StatusBar,
  SafeAreaView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  initDatabase,
  getTransactions,
  getWalletSummary,
  getAllCategories,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getCategoryBreakdown,
  getMonthlyTrends,
  getAppSettings,
  saveAppSetting,
  resetAllData,
} from './src/database/db';
import {
  Transaction,
  Category,
  WalletSummary,
  CategorySpend,
  MonthlySpend,
  AppSettings,
  TransactionType,
  PaymentMethod,
} from './src/database/types';
import { exportBackupToFile, exportToSpreadsheetCSV, restoreBackup } from './src/utils/backup';

type TabType = 'home' | 'analytics' | 'history' | 'settings';

// Indian currency number formatter
function formatINR(val: number): string {
  const absVal = Math.abs(val);
  const formatted = absVal.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (val < 0 ? '-' : '') + '₹' + formatted;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');

  // App Data State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallet, setWallet] = useState<WalletSummary>({
    cashBalance: 0,
    cashIncome: 0,
    cashExpense: 0,
    upiBalance: 0,
    upiIncome: 0,
    upiExpense: 0,
    totalBalance: 0,
    totalIncome: 0,
    totalExpense: 0,
    transactionCount: 0,
  });
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategorySpend[]>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlySpend[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ currency: '₹', monthlyBudget: 0 });

  // Filters & Search
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [historyWalletFilter, setHistoryWalletFilter] = useState<'all' | 'cash' | 'upi'>('all');
  const [historySearch, setHistorySearch] = useState('');

  // Add / Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Settings State
  const [budgetInput, setBudgetInput] = useState('');
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [restoreJsonInput, setRestoreJsonInput] = useState('');

  // Load all SQLite/local data
  const loadAllData = useCallback(() => {
    try {
      const appSettings = getAppSettings();
      setSettings(appSettings);
      setBudgetInput(appSettings.monthlyBudget > 0 ? String(appSettings.monthlyBudget) : '');

      const cats = getAllCategories();
      setCategories(cats);

      const summ = getWalletSummary(selectedMonth);
      setWallet(summ);

      const breakdown = getCategoryBreakdown(selectedMonth);
      setCategoryBreakdown(breakdown);

      const trends = getMonthlyTrends(6);
      setMonthlyTrends(trends);

      const txs = getTransactions({
        month: selectedMonth,
        type: historyTypeFilter === 'all' ? undefined : historyTypeFilter,
        paymentMethod: historyWalletFilter === 'all' ? undefined : historyWalletFilter,
        search: historySearch,
      });
      setTransactions(txs);
    } catch (e: any) {
      Alert.alert('Database Error', e?.message || 'Failed to load local data');
    }
  }, [selectedMonth, historyTypeFilter, historyWalletFilter, historySearch]);

  useEffect(() => {
    initDatabase();
    loadAllData();
  }, [loadAllData]);

  // Open Add Modal with pre-configured wallet & type
  const openAddModal = (type: TransactionType = 'expense', method: PaymentMethod = 'upi') => {
    setEditingTransaction(null);
    setTxType(type);
    setPaymentMethod(method);
    setTitle('');
    setAmount('');
    setNotes('');
    setTxDate(new Date().toISOString().split('T')[0]);

    const matchingCat = categories.find((c) => c.type === type) || categories[0] || null;
    setSelectedCategory(matchingCat);
    setModalVisible(true);
  };

  // Open Edit Modal
  const openEditModal = (tx: Transaction) => {
    setEditingTransaction(tx);
    setTxType(tx.type);
    setPaymentMethod(tx.paymentMethod);
    setTitle(tx.title);
    setAmount(String(tx.amount));
    setNotes(tx.notes || '');
    setTxDate(tx.date);

    const match = categories.find((c) => c.name === tx.category) || null;
    setSelectedCategory(
      match || {
        id: 'temp',
        name: tx.category,
        icon: tx.categoryIcon || 'pricetag',
        color: tx.categoryColor || '#3B82F6',
        type: tx.type,
      }
    );
    setModalVisible(true);
  };

  const handleTypeChange = (newType: TransactionType) => {
    setTxType(newType);
    const firstMatchingCat = categories.find((c) => c.type === newType);
    if (firstMatchingCat) {
      setSelectedCategory(firstMatchingCat);
    }
  };

  // Save / Update
  const handleSaveTransaction = () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Missing Description', 'Please enter a title (e.g. Chai, Groceries, Salary).');
      return;
    }
    if (!selectedCategory) {
      Alert.alert('Select Category', 'Please select a category.');
      return;
    }

    try {
      if (editingTransaction) {
        updateTransaction(editingTransaction.id, {
          title: title.trim(),
          amount: parsedAmount,
          type: txType,
          category: selectedCategory.name,
          categoryIcon: selectedCategory.icon,
          categoryColor: selectedCategory.color,
          paymentMethod,
          date: txDate,
          notes: notes.trim(),
        });
      } else {
        addTransaction({
          title: title.trim(),
          amount: parsedAmount,
          type: txType,
          category: selectedCategory.name,
          categoryIcon: selectedCategory.icon,
          categoryColor: selectedCategory.color,
          paymentMethod,
          date: txDate,
          notes: notes.trim(),
        });
      }

      setModalVisible(false);
      loadAllData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save transaction');
    }
  };

  // Delete
  const handleDeleteTransaction = (id: number) => {
    Alert.alert('Delete Record', 'Are you sure you want to delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTransaction(id);
          loadAllData();
        },
      },
    ]);
  };

  // Save Budget
  const handleSaveBudget = () => {
    const val = parseFloat(budgetInput) || 0;
    saveAppSetting('monthlyBudget', String(val));
    setSettings((prev) => ({ ...prev, monthlyBudget: val }));
    Alert.alert(
      'Budget Saved',
      val > 0 ? `Monthly budget set to ${formatINR(val)}` : 'Monthly budget removed.'
    );
  };

  // Reset All
  const handleResetData = () => {
    Alert.alert(
      '⚠️ Clear All Transactions?',
      'This will erase all Cash and UPI records stored on this phone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase Everything',
          style: 'destructive',
          onPress: () => {
            resetAllData();
            loadAllData();
            Alert.alert('Cleared', 'All records wiped from local database.');
          },
        },
      ]
    );
  };

  // Restore
  const handleRestoreSubmit = () => {
    if (!restoreJsonInput.trim()) {
      Alert.alert('Empty Data', 'Please paste valid backup JSON data.');
      return;
    }
    const res = restoreBackup(restoreJsonInput);
    if (res.success) {
      Alert.alert('Success', res.message);
      setRestoreModalVisible(false);
      setRestoreJsonInput('');
      loadAllData();
    } else {
      Alert.alert('Restore Failed', res.message);
    }
  };

  const filteredCategories = categories.filter((c) => c.type === txType);
  const budget = settings.monthlyBudget;
  const budgetSpentPercent = budget > 0 ? Math.min(Math.round((wallet.totalExpense / budget) * 100), 100) : 0;
  const isBudgetExceeded = budget > 0 && wallet.totalExpense > budget;

  // Max for trend chart
  const maxTrendVal = useMemo(() => {
    let max = 1000;
    monthlyTrends.forEach((m) => {
      if (m.expense > max) max = m.expense;
      if (m.income > max) max = m.income;
    });
    return max;
  }, [monthlyTrends]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.appContainer}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <Image
              source={require('./assets/icon.png')}
              style={styles.headerLogo}
              resizeMode="cover"
            />
            <View>
              <Text style={styles.appTitle}>Expense Tracker</Text>
              <View style={styles.badgeRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.badgeText}>Local Mobile SQLite • 100% Offline</Text>
              </View>
            </View>
          </View>

          <View style={styles.headerRightActions}>
            <TouchableOpacity style={styles.headerIconButton} onPress={() => exportBackupToFile()}>
              <Ionicons name="share-outline" size={18} color="#334155" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Content */}
        <View style={styles.tabContentContainer}>
          {/* ==================== 1. DASHBOARD TAB ==================== */}
          {activeTab === 'home' && (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {/* Total Combined Net Balance */}
              <View style={styles.totalBalanceCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.totalBalanceLabel}>TOTAL NET BALANCE</Text>
                  <View style={styles.monthBadge}>
                    <Ionicons name="calendar-outline" size={12} color="#64748B" />
                    <Text style={styles.monthBadgeText}>{selectedMonth}</Text>
                  </View>
                </View>

                <Text
                  style={[
                    styles.totalBalanceValue,
                    { color: wallet.totalBalance >= 0 ? '#0F172A' : '#DC2626' },
                  ]}
                >
                  {formatINR(wallet.totalBalance)}
                </Text>

                <View style={styles.totalSummaryRow}>
                  <View style={styles.summaryMiniStat}>
                    <Text style={styles.miniStatLabel}>Total Received</Text>
                    <Text style={styles.miniStatIncome}>+{formatINR(wallet.totalIncome)}</Text>
                  </View>
                  <View style={styles.miniStatDivider} />
                  <View style={styles.summaryMiniStat}>
                    <Text style={styles.miniStatLabel}>Total Spent</Text>
                    <Text style={styles.miniStatExpense}>-{formatINR(wallet.totalExpense)}</Text>
                  </View>
                </View>
              </View>

              {/* SEPARATE WALLETS: CASH vs UPI (Requested Feature) */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>My Wallets & Accounts</Text>
                <Text style={styles.walletHint}>Tracked Separately</Text>
              </View>

              <View style={styles.walletsContainer}>
                {/* 1. UPI WALLET CARD */}
                <View style={[styles.walletCard, styles.upiCardBorder]}>
                  <View style={styles.walletCardHeader}>
                    <View style={styles.walletIconTitleWrap}>
                      <View style={[styles.walletIconCircle, { backgroundColor: '#EEF2FF' }]}>
                        <Ionicons name="qr-code-outline" size={20} color="#4F46E5" />
                      </View>
                      <View>
                        <Text style={styles.walletName}>UPI Balance</Text>
                        <Text style={styles.walletMeta}>GPay, PhonePe, Bank</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.walletQuickAddBtn}
                      onPress={() => openAddModal('expense', 'upi')}
                    >
                      <Ionicons name="add" size={16} color="#4F46E5" />
                      <Text style={styles.walletQuickAddText}>Spend</Text>
                    </TouchableOpacity>
                  </View>

                  <Text
                    style={[
                      styles.walletBalanceNumber,
                      { color: wallet.upiBalance >= 0 ? '#1E1B4B' : '#DC2626' },
                    ]}
                  >
                    {formatINR(wallet.upiBalance)}
                  </Text>

                  <View style={styles.walletDetailRow}>
                    <View style={styles.walletDetailItem}>
                      <Text style={styles.walletDetailLabel}>UPI Expense</Text>
                      <Text style={styles.walletDetailExpense}>
                        -{formatINR(wallet.upiExpense)}
                      </Text>
                    </View>
                    <View style={styles.walletDetailItem}>
                      <Text style={styles.walletDetailLabel}>UPI Received</Text>
                      <Text style={styles.walletDetailIncome}>
                        +{formatINR(wallet.upiIncome)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 2. CASH WALLET CARD */}
                <View style={[styles.walletCard, styles.cashCardBorder]}>
                  <View style={styles.walletCardHeader}>
                    <View style={styles.walletIconTitleWrap}>
                      <View style={[styles.walletIconCircle, { backgroundColor: '#ECFDF5' }]}>
                        <Ionicons name="cash-outline" size={20} color="#059669" />
                      </View>
                      <View>
                        <Text style={styles.walletName}>Cash in Hand</Text>
                        <Text style={styles.walletMeta}>Physical Currency</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[styles.walletQuickAddBtn, { backgroundColor: '#ECFDF5' }]}
                      onPress={() => openAddModal('expense', 'cash')}
                    >
                      <Ionicons name="add" size={16} color="#059669" />
                      <Text style={[styles.walletQuickAddText, { color: '#059669' }]}>Spend</Text>
                    </TouchableOpacity>
                  </View>

                  <Text
                    style={[
                      styles.walletBalanceNumber,
                      { color: wallet.cashBalance >= 0 ? '#064E3B' : '#DC2626' },
                    ]}
                  >
                    {formatINR(wallet.cashBalance)}
                  </Text>

                  <View style={styles.walletDetailRow}>
                    <View style={styles.walletDetailItem}>
                      <Text style={styles.walletDetailLabel}>Cash Expense</Text>
                      <Text style={styles.walletDetailExpense}>
                        -{formatINR(wallet.cashExpense)}
                      </Text>
                    </View>
                    <View style={styles.walletDetailItem}>
                      <Text style={styles.walletDetailLabel}>Cash Received</Text>
                      <Text style={styles.walletDetailIncome}>
                        +{formatINR(wallet.cashIncome)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Monthly Budget Tracker Bar (If configured) */}
              {budget > 0 ? (
                <View style={styles.budgetCard}>
                  <View style={styles.budgetHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="pie-chart-outline" size={16} color="#2563EB" style={{ marginRight: 6 }} />
                      <Text style={styles.budgetTitle}>Monthly Budget Limit</Text>
                    </View>
                    <Text
                      style={[
                        styles.budgetPercent,
                        isBudgetExceeded && { color: '#DC2626' },
                      ]}
                    >
                      {budgetSpentPercent}% used
                    </Text>
                  </View>

                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(budgetSpentPercent, 100)}%`,
                          backgroundColor: isBudgetExceeded
                            ? '#DC2626'
                            : budgetSpentPercent > 80
                            ? '#F59E0B'
                            : '#2563EB',
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.budgetFooter}>
                    <Text style={styles.budgetSubText}>
                      Spent: {formatINR(wallet.totalExpense)}
                    </Text>
                    <Text style={styles.budgetSubText}>
                      Limit: {formatINR(budget)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Quick Action Buttons */}
              <View style={styles.quickActionRow}>
                <TouchableOpacity
                  style={[styles.quickActionBtn, { borderColor: '#4F46E5', backgroundColor: '#EEF2FF' }]}
                  onPress={() => openAddModal('expense', 'upi')}
                >
                  <Ionicons name="qr-code-outline" size={18} color="#4F46E5" />
                  <Text style={[styles.quickActionText, { color: '#4F46E5' }]}>+ Add UPI</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickActionBtn, { borderColor: '#059669', backgroundColor: '#ECFDF5' }]}
                  onPress={() => openAddModal('expense', 'cash')}
                >
                  <Ionicons name="cash-outline" size={18} color="#059669" />
                  <Text style={[styles.quickActionText, { color: '#059669' }]}>+ Add Cash</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickActionBtn, { borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' }]}
                  onPress={() => openAddModal('income', 'upi')}
                >
                  <Ionicons name="arrow-down-circle-outline" size={18} color="#16A34A" />
                  <Text style={[styles.quickActionText, { color: '#16A34A' }]}>+ Income</Text>
                </TouchableOpacity>
              </View>

              {/* Recent Transactions */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Recent Transactions</Text>
                <TouchableOpacity onPress={() => setActiveTab('history')}>
                  <Text style={styles.seeAllText}>View All ({transactions.length})</Text>
                </TouchableOpacity>
              </View>

              {transactions.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="wallet-outline" size={44} color="#94A3B8" />
                  <Text style={styles.emptyTitle}>No transactions recorded</Text>
                  <Text style={styles.emptySubtitle}>
                    Tap "+ Add UPI" or "+ Add Cash" above to record your first transaction.
                  </Text>
                </View>
              ) : (
                transactions.slice(0, 5).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.transactionCard}
                    activeOpacity={0.7}
                    onPress={() => openEditModal(item)}
                  >
                    <View
                      style={[
                        styles.categoryIconWrap,
                        { backgroundColor: (item.categoryColor || '#3B82F6') + '1A' },
                      ]}
                    >
                      <Ionicons
                        name={(item.categoryIcon as any) || 'pricetag'}
                        size={20}
                        color={item.categoryColor || '#3B82F6'}
                      />
                    </View>

                    <View style={styles.transactionDetails}>
                      <Text style={styles.transactionTitle}>{item.title}</Text>
                      <View style={styles.txMetaRow}>
                        <View
                          style={[
                            styles.walletPillSmall,
                            item.paymentMethod === 'upi' ? styles.upiPill : styles.cashPill,
                          ]}
                        >
                          <Text
                            style={[
                              styles.walletPillSmallText,
                              item.paymentMethod === 'upi' ? styles.upiPillText : styles.cashPillText,
                            ]}
                          >
                            {item.paymentMethod.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.transactionMeta}>
                          {item.category} • {item.date}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.amountCol}>
                      <Text
                        style={[
                          styles.transactionAmount,
                          { color: item.type === 'income' ? '#16A34A' : '#DC2626' },
                        ]}
                      >
                        {item.type === 'income' ? '+' : '-'}
                        {formatINR(item.amount)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}

          {/* ==================== 2. ANALYTICS TAB ==================== */}
          {activeTab === 'analytics' && (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>Cash vs UPI Outflow</Text>
              <Text style={styles.sectionSubtitle}>
                How you spent money in {selectedMonth}
              </Text>

              {/* Cash vs UPI Outflow Split Card */}
              <View style={styles.splitCard}>
                <View style={styles.splitHeader}>
                  <View>
                    <Text style={styles.splitLabel}>Total Spent</Text>
                    <Text style={styles.splitTotalAmount}>
                      {formatINR(wallet.totalExpense)}
                    </Text>
                  </View>
                  <View style={styles.splitLegendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendBox, { backgroundColor: '#4F46E5' }]} />
                      <Text style={styles.legendText}>
                        UPI ({wallet.totalExpense > 0 ? Math.round((wallet.upiExpense / wallet.totalExpense) * 100) : 0}%)
                      </Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendBox, { backgroundColor: '#059669' }]} />
                      <Text style={styles.legendText}>
                        Cash ({wallet.totalExpense > 0 ? Math.round((wallet.cashExpense / wallet.totalExpense) * 100) : 0}%)
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Progress bar split */}
                <View style={styles.splitBarTrack}>
                  <View
                    style={[
                      styles.splitBarSegment,
                      {
                        width: `${wallet.totalExpense > 0 ? (wallet.upiExpense / wallet.totalExpense) * 100 : 0}%`,
                        backgroundColor: '#4F46E5',
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.splitBarSegment,
                      {
                        width: `${wallet.totalExpense > 0 ? (wallet.cashExpense / wallet.totalExpense) * 100 : 0}%`,
                        backgroundColor: '#059669',
                      },
                    ]}
                  />
                </View>

                <View style={styles.splitFooter}>
                  <Text style={[styles.splitAmountText, { color: '#4F46E5' }]}>
                    📱 UPI: {formatINR(wallet.upiExpense)}
                  </Text>
                  <Text style={[styles.splitAmountText, { color: '#059669' }]}>
                    💵 Cash: {formatINR(wallet.cashExpense)}
                  </Text>
                </View>
              </View>

              {/* Category Breakdown */}
              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Category Breakdown</Text>
              <Text style={styles.sectionSubtitle}>Shows how much was paid via UPI vs Cash</Text>

              {categoryBreakdown.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="pie-chart-outline" size={44} color="#94A3B8" />
                  <Text style={styles.emptyTitle}>No expense records in {selectedMonth}</Text>
                  <Text style={styles.emptySubtitle}>Log your expenses to view category breakdown.</Text>
                </View>
              ) : (
                categoryBreakdown.map((cat, idx) => (
                  <View key={idx} style={styles.breakdownCard}>
                    <View style={styles.breakdownHeader}>
                      <View style={styles.breakdownCategoryLeft}>
                        <View style={[styles.breakdownDot, { backgroundColor: cat.color }]} />
                        <Text style={styles.breakdownName}>{cat.category}</Text>
                        <Text style={styles.breakdownCount}>({cat.count} tx)</Text>
                      </View>
                      <View style={styles.breakdownRight}>
                        <Text style={styles.breakdownAmount}>{formatINR(cat.total)}</Text>
                        <Text style={styles.breakdownPercentage}>{cat.percentage}%</Text>
                      </View>
                    </View>

                    <View style={styles.breakdownProgressTrack}>
                      <View
                        style={[
                          styles.breakdownProgressFill,
                          { width: `${cat.percentage}%`, backgroundColor: cat.color },
                        ]}
                      />
                    </View>

                    <View style={styles.breakdownWalletsSubRow}>
                      <Text style={styles.breakdownSubWalletText}>
                        📱 UPI: {formatINR(cat.upiTotal)}
                      </Text>
                      <Text style={styles.breakdownSubWalletText}>
                        💵 Cash: {formatINR(cat.cashTotal)}
                      </Text>
                    </View>
                  </View>
                ))
              )}

              {/* 6-Month Trend */}
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>6-Month Outflow Trends</Text>
              <Text style={styles.sectionSubtitle}>Cash vs UPI expenditure history</Text>

              <View style={styles.trendChartCard}>
                <View style={styles.trendBarsRow}>
                  {monthlyTrends.map((trend, i) => {
                    const upiHeight = Math.max(6, Math.round((trend.upiExpense / maxTrendVal) * 110));
                    const cashHeight = Math.max(6, Math.round((trend.cashExpense / maxTrendVal) * 110));

                    return (
                      <View key={i} style={styles.trendCol}>
                        <View style={styles.barsContainer}>
                          {/* UPI Bar */}
                          <View style={[styles.trendBar, { height: upiHeight, backgroundColor: '#4F46E5' }]} />
                          {/* Cash Bar */}
                          <View style={[styles.trendBar, { height: cashHeight, backgroundColor: '#059669' }]} />
                        </View>
                        <Text style={styles.trendLabel}>{trend.label}</Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.trendLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendBox, { backgroundColor: '#4F46E5' }]} />
                    <Text style={styles.legendText}>UPI Expense</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendBox, { backgroundColor: '#059669' }]} />
                    <Text style={styles.legendText}>Cash Expense</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          )}

          {/* ==================== 3. TRANSACTIONS / HISTORY TAB ==================== */}
          {activeTab === 'history' && (
            <View style={{ flex: 1 }}>
              {/* Search & Wallet Filter Bar */}
              <View style={styles.historyFiltersWrap}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={18} color="#64748B" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search transactions..."
                    placeholderTextColor="#94A3B8"
                    value={historySearch}
                    onChangeText={setHistorySearch}
                  />
                  {historySearch ? (
                    <TouchableOpacity onPress={() => setHistorySearch('')}>
                      <Ionicons name="close-circle" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Filter Rows: Wallet Selector + Type Selector */}
                <View style={styles.filterPillsRow}>
                  {/* Wallet Filter (All / UPI / Cash) */}
                  <View style={styles.walletFilterGroup}>
                    {(['all', 'upi', 'cash'] as const).map((w) => (
                      <TouchableOpacity
                        key={w}
                        style={[
                          styles.walletFilterPill,
                          historyWalletFilter === w && styles.activeWalletFilterPill,
                        ]}
                        onPress={() => setHistoryWalletFilter(w)}
                      >
                        <Text
                          style={[
                            styles.walletFilterPillText,
                            historyWalletFilter === w && styles.activeWalletFilterPillText,
                          ]}
                        >
                          {w === 'all' ? 'All Wallets' : w === 'upi' ? '📱 UPI' : '💵 Cash'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Type Filter (All / Expense / Income) */}
                  <View style={styles.typeFilterGroup}>
                    {(['all', 'expense', 'income'] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.typeFilterPill,
                          historyTypeFilter === t && styles.activeTypeFilterPill,
                        ]}
                        onPress={() => setHistoryTypeFilter(t)}
                      >
                        <Text
                          style={[
                            styles.typeFilterPillText,
                            historyTypeFilter === t && styles.activeTypeFilterPillText,
                          ]}
                        >
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Transactions List */}
              <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.transactionsHeader}>
                  <Text style={styles.sectionTitle}>
                    {transactions.length} Record{transactions.length === 1 ? '' : 's'}
                  </Text>
                  <TouchableOpacity
                    style={styles.csvExportBtn}
                    onPress={() => exportToSpreadsheetCSV()}
                  >
                    <Ionicons name="document-text-outline" size={14} color="#2563EB" style={{ marginRight: 4 }} />
                    <Text style={styles.csvExportBtnText}>Export Excel/CSV</Text>
                  </TouchableOpacity>
                </View>

                {transactions.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="search-outline" size={44} color="#94A3B8" />
                    <Text style={styles.emptyTitle}>No matching transactions</Text>
                    <Text style={styles.emptySubtitle}>Try changing your search term or wallet filter.</Text>
                  </View>
                ) : (
                  transactions.map((item) => (
                    <View key={item.id} style={styles.transactionCard}>
                      <TouchableOpacity
                        style={styles.cardMainTouch}
                        activeOpacity={0.7}
                        onPress={() => openEditModal(item)}
                      >
                        <View
                          style={[
                            styles.categoryIconWrap,
                            { backgroundColor: (item.categoryColor || '#3B82F6') + '1A' },
                          ]}
                        >
                          <Ionicons
                            name={(item.categoryIcon as any) || 'pricetag'}
                            size={20}
                            color={item.categoryColor || '#3B82F6'}
                          />
                        </View>

                        <View style={styles.transactionDetails}>
                          <Text style={styles.transactionTitle}>{item.title}</Text>
                          <View style={styles.txMetaRow}>
                            <View
                              style={[
                                styles.walletPillSmall,
                                item.paymentMethod === 'upi' ? styles.upiPill : styles.cashPill,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.walletPillSmallText,
                                  item.paymentMethod === 'upi' ? styles.upiPillText : styles.cashPillText,
                                ]}
                              >
                                {item.paymentMethod.toUpperCase()}
                              </Text>
                            </View>
                            <Text style={styles.transactionMeta}>
                              {item.category} • {item.date}
                            </Text>
                          </View>
                          {item.notes ? (
                            <Text style={styles.transactionNotes} numberOfLines={1}>
                              {item.notes}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>

                      <View style={styles.amountCol}>
                        <Text
                          style={[
                            styles.transactionAmount,
                            { color: item.type === 'income' ? '#16A34A' : '#DC2626' },
                          ]}
                        >
                          {item.type === 'income' ? '+' : '-'}
                          {formatINR(item.amount)}
                        </Text>

                        <View style={styles.actionIconRow}>
                          <TouchableOpacity
                            onPress={() => openEditModal(item)}
                            style={styles.iconActionBtn}
                          >
                            <Ionicons name="pencil" size={15} color="#64748B" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteTransaction(item.id)}
                            style={[styles.iconActionBtn, { marginLeft: 8 }]}
                          >
                            <Ionicons name="trash-outline" size={15} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          )}

          {/* ==================== 4. SETTINGS TAB ==================== */}
          {activeTab === 'settings' && (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>App Preferences</Text>
              <Text style={styles.sectionSubtitle}>Currency is set to Indian Rupee (₹ INR)</Text>

              {/* Locked Indian Rupee Badge */}
              <View style={styles.inrCard}>
                <View style={styles.inrFlagRow}>
                  <Text style={styles.inrFlagText}>🇮🇳</Text>
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.inrTitle}>Indian Rupee (₹ INR)</Text>
                    <Text style={styles.inrSubtitle}>Standard Indian number formatting (Lakhs & Crores)</Text>
                  </View>
                </View>
                <View style={styles.inrBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                  <Text style={styles.inrBadgeText}>Active & Locked</Text>
                </View>
              </View>

              {/* Monthly Budget Setup */}
              <View style={styles.settingsSectionCard}>
                <Text style={styles.settingLabel}>Monthly Spending Limit</Text>
                <Text style={styles.settingSubLabel}>
                  Get progress tracking and warnings when spending reaches target.
                </Text>
                <View style={styles.budgetInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="e.g. 20000"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={budgetInput}
                    onChangeText={setBudgetInput}
                  />
                  <TouchableOpacity style={styles.budgetSaveBtn} onPress={handleSaveBudget}>
                    <Text style={styles.budgetSaveBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Data Portability Section */}
              <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Backup & Data Portability</Text>
              <Text style={styles.sectionSubtitle}>
                100% offline storage. Share your backup files to keep your data safe.
              </Text>

              <View style={styles.settingsSectionCard}>
                {/* Export JSON */}
                <TouchableOpacity style={styles.settingsActionRow} onPress={() => exportBackupToFile()}>
                  <View style={[styles.settingsActionIconWrap, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="cloud-upload-outline" size={20} color="#4F46E5" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.settingsActionTitle}>Export Full JSON Backup</Text>
                    <Text style={styles.settingsActionDesc}>Contains all Cash and UPI history</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>

                <View style={styles.settingsDivider} />

                {/* Export CSV */}
                <TouchableOpacity style={styles.settingsActionRow} onPress={() => exportToSpreadsheetCSV()}>
                  <View style={[styles.settingsActionIconWrap, { backgroundColor: '#ECFDF5' }]}>
                    <Ionicons name="grid-outline" size={20} color="#059669" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.settingsActionTitle}>Export to Excel / CSV</Text>
                    <Text style={styles.settingsActionDesc}>Spreadsheet with separate Cash/UPI columns</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>

                <View style={styles.settingsDivider} />

                {/* Restore Backup */}
                <TouchableOpacity
                  style={styles.settingsActionRow}
                  onPress={() => setRestoreModalVisible(true)}
                >
                  <View style={[styles.settingsActionIconWrap, { backgroundColor: '#FAF5FF' }]}>
                    <Ionicons name="cloud-download-outline" size={20} color="#9333EA" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.settingsActionTitle}>Restore Backup Data</Text>
                    <Text style={styles.settingsActionDesc}>Restore transactions from a saved backup</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Reset Data */}
              <View style={[styles.settingsSectionCard, { borderColor: '#FECACA' }]}>
                <TouchableOpacity style={styles.settingsActionRow} onPress={handleResetData}>
                  <View style={[styles.settingsActionIconWrap, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="trash-bin-outline" size={20} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.settingsActionTitle, { color: '#DC2626' }]}>Erase All Records</Text>
                    <Text style={styles.settingsActionDesc}>Permanently wipe SQLite records from this device</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#DC2626" />
                </TouchableOpacity>
              </View>

              {/* Privacy Footer */}
              <View style={styles.aboutCard}>
                <Ionicons name="shield-checkmark" size={20} color="#16A34A" />
                <Text style={styles.aboutText}>
                  100% Private Offline Mobile SQLite. No remote server, zero internet charges, no ads.
                </Text>
              </View>
            </ScrollView>
          )}
        </View>

        {/* Floating Add Action Button */}
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={() => openAddModal('expense', 'upi')}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
          <Text style={styles.fabText}>Add</Text>
        </TouchableOpacity>

        {/* Bottom Tab Bar Navigation */}
        <View style={styles.bottomTabBar}>
          <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('home')}>
            <Ionicons
              name={activeTab === 'home' ? 'wallet' : 'wallet-outline'}
              size={22}
              color={activeTab === 'home' ? '#2563EB' : '#94A3B8'}
            />
            <Text style={[styles.tabLabel, activeTab === 'home' && styles.activeTabLabel]}>
              Dashboard
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('analytics')}>
            <Ionicons
              name={activeTab === 'analytics' ? 'stats-chart' : 'stats-chart-outline'}
              size={22}
              color={activeTab === 'analytics' ? '#2563EB' : '#94A3B8'}
            />
            <Text style={[styles.tabLabel, activeTab === 'analytics' && styles.activeTabLabel]}>
              Analytics
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('history')}>
            <Ionicons
              name={activeTab === 'history' ? 'receipt' : 'receipt-outline'}
              size={22}
              color={activeTab === 'history' ? '#2563EB' : '#94A3B8'}
            />
            <Text style={[styles.tabLabel, activeTab === 'history' && styles.activeTabLabel]}>
              History
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('settings')}>
            <Ionicons
              name={activeTab === 'settings' ? 'settings' : 'settings-outline'}
              size={22}
              color={activeTab === 'settings' ? '#2563EB' : '#94A3B8'}
            />
            <Text style={[styles.tabLabel, activeTab === 'settings' && styles.activeTabLabel]}>
              Settings
            </Text>
          </TouchableOpacity>
        </View>

        {/* ==================== ADD / EDIT TRANSACTION MODAL ==================== */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingTransaction ? 'Edit Transaction' : 'New Transaction'}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 1. Transaction Type (Expense vs Income) */}
                <View style={styles.typeSelector}>
                  <TouchableOpacity
                    style={[styles.typeButton, txType === 'expense' && styles.typeButtonActiveExpense]}
                    onPress={() => handleTypeChange('expense')}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        txType === 'expense' && styles.typeButtonTextActive,
                      ]}
                    >
                      Expense
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.typeButton, txType === 'income' && styles.typeButtonActiveIncome]}
                    onPress={() => handleTypeChange('income')}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        txType === 'income' && styles.typeButtonTextActive,
                      ]}
                    >
                      Income
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 2. CHOOSE WALLET: CASH vs UPI (Crucial Feature) */}
                <Text style={styles.inputLabel}>Select Wallet / Account</Text>
                <View style={styles.walletPickRow}>
                  <TouchableOpacity
                    style={[
                      styles.walletPickBtn,
                      paymentMethod === 'upi' && styles.walletPickBtnActiveUpi,
                    ]}
                    onPress={() => setPaymentMethod('upi')}
                  >
                    <Ionicons
                      name="qr-code-outline"
                      size={18}
                      color={paymentMethod === 'upi' ? '#4F46E5' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.walletPickBtnText,
                        paymentMethod === 'upi' && styles.walletPickBtnTextActiveUpi,
                      ]}
                    >
                      📱 UPI (GPay/PhonePe)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.walletPickBtn,
                      paymentMethod === 'cash' && styles.walletPickBtnActiveCash,
                    ]}
                    onPress={() => setPaymentMethod('cash')}
                  >
                    <Ionicons
                      name="cash-outline"
                      size={18}
                      color={paymentMethod === 'cash' ? '#059669' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.walletPickBtnText,
                        paymentMethod === 'cash' && styles.walletPickBtnTextActiveCash,
                      ]}
                    >
                      💵 Cash in Hand
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 3. Amount Input in ₹ */}
                <Text style={styles.inputLabel}>Amount (₹)</Text>
                <TextInput
                  style={[styles.input, { fontSize: 22, fontWeight: '700', color: '#0F172A' }]}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                />

                {/* 4. Title / Description */}
                <Text style={styles.inputLabel}>Description / Title</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Chai, Auto, Groceries, Salary"
                  placeholderTextColor="#94A3B8"
                  value={title}
                  onChangeText={setTitle}
                />

                {/* 5. Category Horizontal Scroll */}
                <Text style={styles.inputLabel}>Category</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryScroll}
                >
                  {filteredCategories.map((cat) => {
                    const isSelected = selectedCategory?.name === cat.name;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.categoryChip,
                          isSelected && {
                            borderColor: cat.color,
                            backgroundColor: cat.color + '1A',
                          },
                        ]}
                        onPress={() => setSelectedCategory(cat)}
                      >
                        <Ionicons
                          name={cat.icon as any}
                          size={16}
                          color={isSelected ? cat.color : '#64748B'}
                        />
                        <Text
                          style={[
                            styles.categoryChipText,
                            isSelected && { color: cat.color, fontWeight: '700' },
                          ]}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* 6. Date */}
                <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
                <View style={styles.dateRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    value={txDate}
                    onChangeText={setTxDate}
                  />
                  <TouchableOpacity
                    style={styles.todayBtn}
                    onPress={() => setTxDate(new Date().toISOString().split('T')[0])}
                  >
                    <Text style={styles.todayBtnText}>Today</Text>
                  </TouchableOpacity>
                </View>

                {/* 7. Notes */}
                <Text style={styles.inputLabel}>Notes (Optional)</Text>
                <TextInput
                  style={[styles.input, { height: 60 }]}
                  placeholder="Any details to remember..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                />

                {/* Save Button */}
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveTransaction}>
                  <Text style={styles.saveButtonText}>
                    {editingTransaction ? 'Update Transaction' : 'Save to Offline SQLite'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Restore Backup Modal */}
        <Modal
          visible={restoreModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setRestoreModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { height: '80%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Restore Backup Data</Text>
                <TouchableOpacity onPress={() => setRestoreModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text style={styles.settingSubLabel}>
                Paste your previously exported JSON backup content below:
              </Text>

              <TextInput
                style={[styles.input, { flex: 1, textAlignVertical: 'top', marginVertical: 12 }]}
                placeholder="Paste JSON text here..."
                placeholderTextColor="#94A3B8"
                multiline
                value={restoreJsonInput}
                onChangeText={setRestoreJsonInput}
              />

              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: '#4F46E5' }]}
                onPress={handleRestoreSubmit}
              >
                <Text style={styles.saveButtonText}>Restore All Records</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const isWeb = Platform.OS === 'web';

const ANDROID_BOTTOM_NAV_HEIGHT = Platform.OS === 'android' ? 40 : 0;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingTop: Platform.OS === 'android' ? 34 : 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF', // Clean pure white mobile frame
    borderLeftWidth: isWeb ? 1 : 0,
    borderRightWidth: isWeb ? 1 : 0,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#0E4B3E',
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16A34A',
    marginRight: 6,
  },
  badgeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabContentContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 90,
  },
  totalBalanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalBalanceLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  monthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  monthBadgeText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  totalBalanceValue: {
    fontSize: 34,
    fontWeight: '800',
    marginVertical: 6,
  },
  totalSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  summaryMiniStat: {
    flex: 1,
  },
  miniStatDivider: {
    width: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 14,
  },
  miniStatLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  miniStatIncome: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16A34A',
    marginTop: 2,
  },
  miniStatExpense: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
  },
  walletHint: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '600',
  },
  walletsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  walletCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  upiCardBorder: {
    borderLeftWidth: 4,
    borderLeftColor: '#4F46E5',
  },
  cashCardBorder: {
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
  },
  walletCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletIconTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  walletName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  walletMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  walletQuickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  walletQuickAddText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
    marginLeft: 3,
  },
  walletBalanceNumber: {
    fontSize: 26,
    fontWeight: '800',
    marginVertical: 10,
  },
  walletDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  walletDetailItem: {
    flex: 1,
  },
  walletDetailLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  walletDetailExpense: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 2,
  },
  walletDetailIncome: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16A34A',
    marginTop: 2,
  },
  budgetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  budgetTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '600',
  },
  budgetPercent: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  budgetFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  budgetSubText: {
    color: '#64748B',
    fontSize: 11,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 5,
  },
  seeAllText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
  },
  emptySubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardMainTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  walletPillSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 6,
  },
  upiPill: {
    backgroundColor: '#EEF2FF',
  },
  cashPill: {
    backgroundColor: '#ECFDF5',
  },
  walletPillSmallText: {
    fontSize: 9,
    fontWeight: '800',
  },
  upiPillText: {
    color: '#4F46E5',
  },
  cashPillText: {
    color: '#059669',
  },
  transactionMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  transactionNotes: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  amountCol: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  actionIconRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  iconActionBtn: {
    padding: 4,
  },
  splitCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  splitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  splitLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  splitTotalAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  splitLegendRow: {
    alignItems: 'flex-end',
    gap: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendBox: {
    width: 8,
    height: 8,
    borderRadius: 2,
    marginRight: 5,
  },
  legendText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  splitBarTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F1F5F9',
    flexDirection: 'row',
    overflow: 'hidden',
    marginVertical: 10,
  },
  splitBarSegment: {
    height: '100%',
  },
  splitFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  splitAmountText: {
    fontSize: 12,
    fontWeight: '700',
  },
  breakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  breakdownCategoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  breakdownName: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  breakdownCount: {
    color: '#94A3B8',
    fontSize: 11,
    marginLeft: 4,
  },
  breakdownRight: {
    alignItems: 'flex-end',
  },
  breakdownAmount: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  breakdownPercentage: {
    color: '#64748B',
    fontSize: 10,
  },
  breakdownProgressTrack: {
    height: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  breakdownProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  breakdownWalletsSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  breakdownSubWalletText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  trendChartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
  },
  trendBarsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 130,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  trendCol: {
    alignItems: 'center',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginBottom: 6,
  },
  trendBar: {
    width: 10,
    borderRadius: 3,
  },
  trendLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  trendLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 12,
  },
  historyFiltersWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 13,
    padding: 0,
  },
  filterPillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletFilterGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  walletFilterPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  activeWalletFilterPill: {
    backgroundColor: '#2563EB',
  },
  walletFilterPillText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  activeWalletFilterPillText: {
    color: '#FFFFFF',
  },
  typeFilterGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  typeFilterPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  activeTypeFilterPill: {
    backgroundColor: '#0F172A',
  },
  typeFilterPillText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  activeTypeFilterPillText: {
    color: '#FFFFFF',
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  csvExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  csvExportBtnText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '700',
  },
  inrCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  inrFlagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inrFlagText: {
    fontSize: 26,
  },
  inrTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  inrSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  inrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  inrBadgeText: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '700',
    marginLeft: 4,
  },
  settingsSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  settingSubLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 10,
  },
  budgetInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  budgetSaveBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 10,
  },
  budgetSaveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  settingsActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingsActionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsActionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  settingsActionDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  aboutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    gap: 8,
  },
  aboutText: {
    flex: 1,
    color: '#475569',
    fontSize: 11,
    lineHeight: 16,
  },
  fab: {
    position: 'absolute',
    bottom: 74 + ANDROID_BOTTOM_NAV_HEIGHT,
    right: 18,
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 26,
    elevation: 4,
    shadowColor: '#2563EB',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 4,
  },
  bottomTabBar: {
    flexDirection: 'row',
    height: 58 + ANDROID_BOTTOM_NAV_HEIGHT,
    paddingBottom: ANDROID_BOTTOM_NAV_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  tabLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  activeTabLabel: {
    color: '#2563EB',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeButtonActiveExpense: {
    backgroundColor: '#DC2626',
  },
  typeButtonActiveIncome: {
    backgroundColor: '#16A34A',
  },
  typeButtonText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
  },
  walletPickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  walletPickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },
  walletPickBtnActiveUpi: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  walletPickBtnActiveCash: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  walletPickBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginLeft: 6,
  },
  walletPickBtnTextActiveUpi: {
    color: '#4F46E5',
  },
  walletPickBtnTextActiveCash: {
    color: '#059669',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#0F172A',
    fontSize: 14,
  },
  categoryScroll: {
    marginVertical: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 6,
  },
  categoryChipText: {
    color: '#64748B',
    fontSize: 12,
    marginLeft: 5,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  todayBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  todayBtnText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 12,
  },
  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
