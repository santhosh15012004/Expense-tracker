import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  Platform,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Path, Circle, Rect, Text as SvgText } from 'react-native-svg';
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
  getDailySpendForMonth,
  addCustomCategory,
  getAppSettings,
  saveAppSetting,
  resetAllData,
  setCategoryLimit,
  deleteCategoryLimit,
  getAllCategoryLimitStatuses,
  getAllProfiles,
  getActiveProfile,
  getActiveProfileId,
  setActiveProfileId,
  createProfile,
  updateProfile,
  deleteProfile,
  getProfileStats,
  DEFAULT_PROFILE,
} from './src/database/db';
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
  Profile,
} from './src/database/types';
import { exportToSpreadsheetCSV, restoreBackup } from './src/utils/backup';
import { downloadMonthlyPdf } from './src/utils/pdfReport';
import {
  getLocalDateString,
  getLocalYearMonth,
  getTodayDateString,
  getYesterdayDateString,
  getDaysAgoDateString,
  normalizeDateString,
  formatDateDisplay,
  formatMonthDisplay,
  getShiftedMonth,
  pad2,
} from './src/utils/dateUtils';
import SplashScreen from './src/components/SplashScreen';

type TabType = 'home' | 'analytics' | 'history' | 'settings';
type ChartMode = 'pie' | 'categoryBars' | 'dailyHistogram';

// Indian currency number formatter
function formatINR(val: number): string {
  const absVal = Math.abs(val);
  const formatted = absVal.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (val < 0 ? '-' : '') + '₹' + formatted;
}

// Donut Pie SVG helper functions
function getCoordinatesForPercent(percent: number, radius: number, cx: number, cy: number) {
  const angle = 2 * Math.PI * percent - Math.PI / 2;
  const x = cx + radius * Math.cos(angle);
  const y = cy + radius * Math.sin(angle);
  return [x, y];
}

function createDonutPath(
  startPercent: number,
  endPercent: number,
  innerR: number,
  outerR: number,
  cx: number,
  cy: number
) {
  const [startX, startY] = getCoordinatesForPercent(startPercent, outerR, cx, cy);
  const [endX, endY] = getCoordinatesForPercent(endPercent, outerR, cx, cy);
  const [innerStartX, innerStartY] = getCoordinatesForPercent(endPercent, innerR, cx, cy);
  const [innerEndX, innerEndY] = getCoordinatesForPercent(startPercent, innerR, cx, cy);

  const isLargeArc = endPercent - startPercent > 0.5 ? 1 : 0;

  return `M ${startX.toFixed(2)} ${startY.toFixed(2)} A ${outerR} ${outerR} 0 ${isLargeArc} 1 ${endX.toFixed(2)} ${endY.toFixed(2)} L ${innerStartX.toFixed(2)} ${innerStartY.toFixed(2)} A ${innerR} ${innerR} 0 ${isLargeArc} 0 ${innerEndX.toFixed(2)} ${innerEndY.toFixed(2)} Z`;
}

// ==================== 1. PIE / DONUT CHART COMPONENT ====================
function PieChartComponent({
  data,
  totalAmount,
  selectedIndex,
  onSelectIndex,
}: {
  data: CategorySpend[];
  totalAmount: number;
  selectedIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
}) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 92;
  const innerR = 54;

  const validData = useMemo(() => data.filter((d) => d && d.total > 0), [data]);

  if (validData.length === 0 || totalAmount <= 0) {
    return (
      <View style={styles.chartEmptyCard}>
        <Ionicons name="pie-chart-outline" size={44} color="#94A3B8" />
        <Text style={styles.chartEmptyTitle}>No expenses recorded for this month</Text>
        <Text style={styles.chartEmptySub}>Tap "+ Add UPI" or "+ Add Cash" to log expenses.</Text>
      </View>
    );
  }

  let cumulative = 0;
  const slices = validData.map((item, index) => {
    const fraction = totalAmount > 0 ? item.total / totalAmount : 0;
    const startPercent = cumulative;
    cumulative += fraction;
    const endPercent = cumulative;
    return {
      item,
      index,
      startPercent,
      endPercent,
      fraction,
    };
  });

  const selectedItem = selectedIndex !== null ? validData[selectedIndex] : null;

  return (
    <View style={styles.pieContainer}>
      <View style={styles.svgRelativeWrap}>
        <Svg width={size} height={size}>
          <G>
            {slices.map((slice) => {
              const isSelected = selectedIndex === slice.index;
              const isSingle = slice.fraction >= 0.999;
              const sliceR = isSelected ? outerR + 5 : outerR;
              const sliceColor = slice.item.color || '#3B82F6';
              const handleSelect = () => onSelectIndex(isSelected ? null : slice.index);
              const interactiveProps =
                Platform.OS === 'web'
                  ? { onClick: handleSelect, cursor: 'pointer' as any }
                  : { onPress: handleSelect };

              if (isSingle) {
                return (
                  <Circle
                    key={slice.index}
                    cx={cx}
                    cy={cy}
                    r={(outerR + innerR) / 2}
                    stroke={sliceColor}
                    strokeWidth={outerR - innerR + (isSelected ? 6 : 0)}
                    fill="none"
                    {...interactiveProps}
                  />
                );
              }

              const pathData = createDonutPath(
                slice.startPercent,
                slice.endPercent,
                innerR,
                sliceR,
                cx,
                cy
              );

              return (
                <Path
                  key={slice.index}
                  d={pathData}
                  fill={sliceColor}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  {...interactiveProps}
                />
              );
            })}
          </G>
        </Svg>

        {/* Center Donut Hole info */}
        <View style={styles.donutCenterHole} pointerEvents="none">
          <Text style={styles.donutCenterCategory} numberOfLines={1}>
            {selectedItem ? selectedItem.category : 'Total Spent'}
          </Text>
          <Text style={styles.donutCenterAmount} numberOfLines={1}>
            {formatINR(selectedItem ? selectedItem.total : totalAmount)}
          </Text>
          {selectedItem ? (
            <Text style={styles.donutCenterPercent}>{selectedItem.percentage}%</Text>
          ) : (
            <Text style={styles.donutCenterSub}>{validData.length} categories</Text>
          )}
        </View>
      </View>

      {/* Selected Item Spotlight Card */}
      {selectedItem && (
        <View style={[styles.spotlightCard, { borderColor: selectedItem.color || '#3B82F6' }]}>
          <View style={styles.spotlightHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.spotlightDot, { backgroundColor: selectedItem.color || '#3B82F6' }]} />
              <Text style={styles.spotlightCategoryName}>{selectedItem.category}</Text>
            </View>
            <TouchableOpacity onPress={() => onSelectIndex(null)}>
              <Ionicons name="close-circle" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
          <View style={styles.spotlightDetailsRow}>
            <Text style={styles.spotlightTotal}>
              {formatINR(selectedItem.total)} ({selectedItem.percentage}%)
            </Text>
            <View style={styles.spotlightWallets}>
              <Text style={styles.spotlightWalletText}>
                📱 UPI: {formatINR(selectedItem.upiTotal)}
              </Text>
              <Text style={styles.spotlightWalletText}>
                💵 Cash: {formatINR(selectedItem.cashTotal)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Legend Chips Grid */}
      <View style={styles.pieLegendRow}>
        {validData.map((cat, idx) => {
          const isSelected = selectedIndex === idx;
          const chipColor = cat.color || '#3B82F6';
          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.pieLegendChip,
                isSelected && { backgroundColor: chipColor + '22', borderColor: chipColor },
              ]}
              onPress={() => onSelectIndex(isSelected ? null : idx)}
            >
              <View style={[styles.pieLegendDot, { backgroundColor: chipColor }]} />
              <Text style={styles.pieLegendLabel} numberOfLines={1}>
                {cat.category}
              </Text>
              <Text style={styles.pieLegendPercent}>{cat.percentage}%</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ==================== 2. CATEGORY HISTOGRAM COMPONENT ====================
function CategoryHistogramComponent({
  data,
  totalAmount,
}: {
  data: CategorySpend[];
  totalAmount: number;
}) {
  if (data.length === 0 || totalAmount <= 0) {
    return (
      <View style={styles.chartEmptyCard}>
        <Ionicons name="bar-chart-outline" size={44} color="#94A3B8" />
        <Text style={styles.chartEmptyTitle}>No expenses recorded for this month</Text>
        <Text style={styles.chartEmptySub}>Tap "+ Add UPI" or "+ Add Cash" to log expenses.</Text>
      </View>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.total), 1);

  return (
    <View style={styles.histogramCardContainer}>
      <Text style={styles.histogramSubHeader}>Category Spend Comparison (UPI vs Cash)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 12 }}>
        <View style={styles.catHistogramRow}>
          {data.map((cat, idx) => {
            const barH = Math.max(16, Math.round((cat.total / maxVal) * 130));
            const upiH = cat.total > 0 ? (cat.upiTotal / cat.total) * barH : 0;
            const cashH = barH - upiH;

            return (
              <View key={idx} style={styles.catHistCol}>
                <Text style={styles.catHistValText}>{formatINR(cat.total)}</Text>
                <View style={[styles.catHistBarWrapper, { height: barH }]}>
                  {upiH > 0 && (
                    <View style={{ height: upiH, backgroundColor: '#4F46E5', width: '100%' }} />
                  )}
                  {cashH > 0 && (
                    <View style={{ height: cashH, backgroundColor: '#059669', width: '100%' }} />
                  )}
                </View>

                <View style={[styles.catHistIconBadge, { backgroundColor: cat.color + '22' }]}>
                  <Ionicons name={(cat.icon as any) || 'pricetag'} size={14} color={cat.color} />
                </View>
                <Text style={styles.catHistNameText} numberOfLines={1}>
                  {cat.category}
                </Text>
                <Text style={styles.catHistPercentText}>{cat.percentage}%</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.chartLegendFoot}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#4F46E5' }]} />
          <Text style={styles.legendText}>UPI Spent</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#059669' }]} />
          <Text style={styles.legendText}>Cash Spent</Text>
        </View>
      </View>
    </View>
  );
}

// ==================== 3. DAILY HISTOGRAM COMPONENT (1st to 31st) ====================
function DailyHistogramComponent({ data }: { data: DailySpend[] }) {
  const maxDayVal = Math.max(...data.map((d) => d.total), 1);
  const activeDays = data.filter((d) => d.total > 0);
  const totalMonthSpent = data.reduce((acc, d) => acc + d.total, 0);

  if (activeDays.length === 0 || totalMonthSpent <= 0) {
    return (
      <View style={styles.chartEmptyCard}>
        <Ionicons name="calendar-outline" size={44} color="#94A3B8" />
        <Text style={styles.chartEmptyTitle}>No daily expenses recorded for this month</Text>
        <Text style={styles.chartEmptySub}>Expenses you log will show on their day of the month.</Text>
      </View>
    );
  }

  return (
    <View style={styles.histogramCardContainer}>
      <View style={styles.dailyHeaderMeta}>
        <Text style={styles.histogramSubHeader}>Day-by-Day Spend Pattern (1st - 31st)</Text>
        <Text style={styles.dailyActiveCount}>{activeDays.length} spending days</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
        <View style={styles.dailyHistBarsRow}>
          {data.map((item) => {
            const hasSpent = item.total > 0;
            const barH = hasSpent ? Math.max(10, Math.round((item.total / maxDayVal) * 120)) : 4;
            const upiH = hasSpent && item.total > 0 ? (item.upi / item.total) * barH : 0;
            const cashH = barH - upiH;

            return (
              <View key={item.day} style={styles.dailyHistCol}>
                {hasSpent ? (
                  <Text style={styles.dailyHistVal}>₹{Math.round(item.total)}</Text>
                ) : (
                  <View style={{ height: 11 }} />
                )}
                <View
                  style={[
                    styles.dailyHistBarTrack,
                    {
                      height: barH,
                      backgroundColor: hasSpent ? 'transparent' : '#E2E8F0',
                    },
                  ]}
                >
                  {hasSpent && (
                    <>
                      {upiH > 0 && (
                        <View style={{ height: upiH, backgroundColor: '#4F46E5', width: '100%' }} />
                      )}
                      {cashH > 0 && (
                        <View style={{ height: cashH, backgroundColor: '#059669', width: '100%' }} />
                      )}
                    </>
                  )}
                </View>
                <Text
                  style={[
                    styles.dailyHistDayLabel,
                    hasSpent && { color: '#0F172A', fontWeight: '800' },
                  ]}
                >
                  {item.day}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.chartLegendFoot}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#4F46E5' }]} />
          <Text style={styles.legendText}>UPI</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#059669' }]} />
          <Text style={styles.legendText}>Cash</Text>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [showSplash, setShowSplash] = useState(true);
  const [splashKey, setSplashKey] = useState(0);
  const appState = useRef(AppState.currentState);

  // Trigger splash screen on launch AND every time the user opens/reopens the app
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        setSplashKey((k) => k + 1);
        setShowSplash(true);
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Multi-Profile State (Like Instagram Account Switcher)
  const [profiles, setProfiles] = useState<Profile[]>([DEFAULT_PROFILE]);
  const [activeProfile, setActiveProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [profileSwitcherVisible, setProfileSwitcherVisible] = useState(false);
  const [addProfileModalVisible, setAddProfileModalVisible] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [selectedProfileColor, setSelectedProfileColor] = useState('#2563EB');
  const [selectedProfileIcon, setSelectedProfileIcon] = useState('person');
  const [profileStats, setProfileStats] = useState<{
    profile: Profile;
    balance: number;
    income: number;
    expense: number;
    txCount: number;
  }[]>([]);

  // App Data State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
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
  const [allTimeWallet, setAllTimeWallet] = useState<WalletSummary>({
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
  const currentMonthStr = useMemo(() => getLocalYearMonth(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [dashboardView, setDashboardView] = useState<'all' | 'month'>('all');
  const [historyPeriodFilter, setHistoryPeriodFilter] = useState<'all' | 'month'>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'expense' | 'income' | 'transfer'>('all');
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
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [txDate, setTxDate] = useState(getTodayDateString());
  const [notes, setNotes] = useState('');

  // Calendar Date Picker Modal State
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(getLocalYearMonth());

  // Monthly Analytics Chart State
  const [dailySpends, setDailySpends] = useState<DailySpend[]>([]);
  const [chartMode, setChartMode] = useState<ChartMode>('pie');
  const [selectedSliceIndex, setSelectedSliceIndex] = useState<number | null>(null);

  // Settings State
  const [budgetInput, setBudgetInput] = useState('');
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [restoreJsonInput, setRestoreJsonInput] = useState('');

  // PDF Statement State
  const [pdfModalVisible, setPdfModalVisible] = useState(false);
  const [pdfExportMonth, setPdfExportMonth] = useState(currentMonthStr);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const openPdfModal = (monthToOpen?: string) => {
    setPdfExportMonth(monthToOpen || selectedMonth || currentMonthStr);
    setPdfModalVisible(true);
  };

  const handleDownloadMonthlyPdf = async (targetMonth?: string) => {
    const monthToUse = targetMonth || pdfExportMonth || selectedMonth;
    try {
      setIsGeneratingPdf(true);
      const monthSummary = getWalletSummary(monthToUse, activeProfile.id);
      const monthTransactions = getTransactions({ month: monthToUse, profileId: activeProfile.id });
      const incTxs = monthTransactions.filter((t) => t.type === 'income');
      const expTxs = monthTransactions.filter((t) => t.type === 'expense');
      const trfTxs = monthTransactions.filter((t) => t.type === 'transfer');
      const catBreakdown = getCategoryBreakdown(monthToUse, activeProfile.id);

      const result = await downloadMonthlyPdf({
        month: monthToUse,
        profileName: activeProfile.name,
        summary: monthSummary,
        incomeTransactions: incTxs,
        expenseTransactions: expTxs,
        transferTransactions: trfTxs,
        categoryBreakdown: catBreakdown,
      });

      if (result.success) {
        if (Platform.OS === 'web') {
          Alert.alert('PDF Ready', result.message);
        }
      } else {
        Alert.alert('Notice', result.message);
      }
    } catch (err: any) {
      Alert.alert('PDF Generation Failed', err?.message || 'Could not generate monthly PDF statement.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Category Monthly Limits State
  const [categoryLimitsEnabled, setCategoryLimitsEnabled] = useState(false);
  const [categoryLimitStatuses, setCategoryLimitStatuses] = useState<CategoryLimitStatus[]>([]);
  const [limitModalVisible, setLimitModalVisible] = useState(false);
  const [limitCategoryName, setLimitCategoryName] = useState('');
  const [limitAmountInput, setLimitAmountInput] = useState('');

  const handleToggleCategoryLimits = () => {
    const nextVal = !categoryLimitsEnabled;
    setCategoryLimitsEnabled(nextVal);
    saveAppSetting('categoryLimitsEnabled', String(nextVal));
  };

  const handleSaveCategoryLimit = (catName?: string, limitAmount?: number) => {
    const nameToSave = (catName || limitCategoryName).trim();
    const amtToSave = limitAmount !== undefined ? limitAmount : parseFloat(limitAmountInput);

    if (!nameToSave) {
      Alert.alert('Category Name Required', 'Please choose or type a category name.');
      return;
    }
    if (isNaN(amtToSave) || amtToSave <= 0) {
      Alert.alert('Invalid Limit', 'Please enter a valid monthly limit amount greater than ₹0.');
      return;
    }

    setCategoryLimit(nameToSave, amtToSave);
    setLimitModalVisible(false);
    setLimitCategoryName('');
    setLimitAmountInput('');
    loadAllData();
  };

  const handleDeleteCategoryLimit = (catName: string) => {
    Alert.alert(
      'Remove Category Limit',
      `Are you sure you want to remove the monthly limit for ${catName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            deleteCategoryLimit(catName);
            loadAllData();
          },
        },
      ]
    );
  };

  // Month Navigation (Timezone-safe)
  const handlePrevMonth = () => {
    setSelectedMonth((prev) => getShiftedMonth(prev, -1));
    setSelectedSliceIndex(null);
  };

  const handleNextMonth = () => {
    setSelectedMonth((prev) => getShiftedMonth(prev, 1));
    setSelectedSliceIndex(null);
  };

  const handleCurrentMonth = () => {
    setSelectedMonth(currentMonthStr);
    setSelectedSliceIndex(null);
  };

  // Profile Action Handlers
  const openProfileSwitcher = () => {
    try {
      const stats = getProfileStats();
      setProfileStats(stats);
    } catch {}
    setProfileSwitcherVisible(true);
  };

  const handleSwitchProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    const all = getAllProfiles();
    const target = all.find((p) => p.id === profileId) || all[0] || DEFAULT_PROFILE;
    setActiveProfile(target);
    setProfileSwitcherVisible(false);
  };

  const openAddProfileModal = () => {
    setEditingProfile(null);
    setProfileNameInput('');
    setSelectedProfileColor('#EC4899');
    setSelectedProfileIcon('heart');
    setProfileSwitcherVisible(false);
    setAddProfileModalVisible(true);
  };

  const openEditProfileModal = (p: Profile) => {
    setEditingProfile(p);
    setProfileNameInput(p.name);
    setSelectedProfileColor(p.color || '#2563EB');
    setSelectedProfileIcon(p.icon || 'person');
    setProfileSwitcherVisible(false);
    setAddProfileModalVisible(true);
  };

  const handleSaveProfile = () => {
    const trimmed = profileNameInput.trim();
    if (!trimmed) {
      Alert.alert('Profile Name Required', 'Please enter a name (e.g. Mother, Friend, Santhosh).');
      return;
    }

    if (editingProfile) {
      updateProfile(editingProfile.id, trimmed, selectedProfileColor, selectedProfileIcon);
      const all = getAllProfiles();
      const updated = all.find((p) => p.id === editingProfile.id) || editingProfile;
      if (activeProfile.id === editingProfile.id) {
        setActiveProfile(updated);
      }
      setProfiles(all);
    } else {
      const created = createProfile(trimmed, selectedProfileColor, selectedProfileIcon);
      setActiveProfileId(created.id);
      setActiveProfile(created);
    }

    setAddProfileModalVisible(false);
    setProfileNameInput('');
    setEditingProfile(null);
  };

  const handleDeleteProfile = (profileId: string, profileName: string) => {
    Alert.alert(
      'Delete Profile',
      `Are you sure you want to delete "${profileName}" and all its records? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const res = deleteProfile(profileId);
            if (!res.success) {
              Alert.alert('Cannot Delete', res.message);
            } else {
              const all = getAllProfiles();
              setProfiles(all);
              const cur = getActiveProfile();
              setActiveProfile(cur);
              try {
                setProfileStats(getProfileStats());
              } catch {}
            }
          },
        },
      ]
    );
  };

  // Load all SQLite/local data for active profile
  const loadAllData = useCallback(() => {
    try {
      const allProfs = getAllProfiles();
      setProfiles(allProfs);
      const curProfile = getActiveProfile();
      setActiveProfile(curProfile);
      try {
        setProfileStats(getProfileStats());
      } catch {}

      const appSettings = getAppSettings(curProfile.id);
      setSettings(appSettings);
      setBudgetInput(appSettings.monthlyBudget > 0 ? String(appSettings.monthlyBudget) : '');
      setCategoryLimitsEnabled(!!appSettings.categoryLimitsEnabled);
      const catStatuses = getAllCategoryLimitStatuses(selectedMonth, curProfile.id);
      setCategoryLimitStatuses(catStatuses);

      const cats = getAllCategories();
      setCategories(cats);

      // 1. All-time wallet summary for active profile
      const allSumm = getWalletSummary(undefined, curProfile.id);
      setAllTimeWallet(allSumm);

      // 2. Selected month wallet summary for active profile
      const summ = getWalletSummary(selectedMonth, curProfile.id);
      setWallet(summ);

      // 3. Category breakdown
      const breakdown = getCategoryBreakdown(selectedMonth, curProfile.id);
      setCategoryBreakdown(breakdown);

      // 4. Daily histogram
      const daily = getDailySpendForMonth(selectedMonth, curProfile.id);
      setDailySpends(daily);

      // 5. 6-month trends
      const trends = getMonthlyTrends(6, curProfile.id);
      setMonthlyTrends(trends);

      // 6. 5 most recent transactions for active profile
      const recent = getTransactions({ limit: 5, profileId: curProfile.id });
      setRecentTransactions(recent);

      // 7. Transactions list for History tab
      const txs = getTransactions({
        profileId: curProfile.id,
        month: historyPeriodFilter === 'month' ? selectedMonth : undefined,
        type: historyTypeFilter === 'all' ? undefined : historyTypeFilter,
        paymentMethod: historyWalletFilter === 'all' ? undefined : historyWalletFilter,
        search: historySearch,
      });
      setTransactions(txs);
    } catch (e: any) {
      Alert.alert('Database Error', e?.message || 'Failed to load local data');
    }
  }, [selectedMonth, historyPeriodFilter, historyTypeFilter, historyWalletFilter, historySearch, activeProfile.id]);

  useEffect(() => {
    initDatabase();
    loadAllData();
  }, [loadAllData, activeProfile.id]);

  // Open Add Modal with pre-configured wallet & type
  const openAddModal = (type: TransactionType = 'expense', method: PaymentMethod = 'upi') => {
    setEditingTransaction(null);
    setTxType(type);
    setPaymentMethod(method);
    setTitle(type === 'transfer' ? (method === 'cash' ? 'Hand to UPI Deposit' : 'ATM Cash Withdrawal') : '');
    setAmount('');
    setNotes('');
    setCustomCategoryInput('');
    setTxDate(getTodayDateString());

    const matchingCat = categories.find((c) => c.type === type) || categories[0] || null;
    setSelectedCategory(type === 'transfer' ? null : matchingCat);
    setModalVisible(true);
  };

  // Open Transfer Modal specifically (Hand ➔ UPI or UPI ➔ Hand)
  const openTransferModal = (direction: 'cash_to_upi' | 'upi_to_cash' = 'cash_to_upi') => {
    setEditingTransaction(null);
    setTxType('transfer');
    setPaymentMethod(direction === 'cash_to_upi' ? 'cash' : 'upi');
    setTitle(direction === 'cash_to_upi' ? 'Hand to UPI Deposit' : 'ATM Cash Withdrawal');
    setAmount('');
    setNotes('');
    setCustomCategoryInput('');
    setTxDate(getTodayDateString());
    setSelectedCategory(null);
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

    if (tx.type === 'transfer') {
      setSelectedCategory(null);
      setCustomCategoryInput('');
      setModalVisible(true);
      return;
    }

    const match = categories.find((c) => c.name.toLowerCase() === tx.category.toLowerCase()) || null;
    const isOtherCat = tx.category.toLowerCase().includes('other');
    const isStandard = categories.some(
      (c) => c.name.toLowerCase() === tx.category.toLowerCase() && !c.name.toLowerCase().includes('other')
    );

    if (!isStandard) {
      // It's a custom category or 'other'
      setCustomCategoryInput(isOtherCat ? '' : tx.category);
      const otherCat = categories.find(
        (c) => c.type === tx.type && c.name.toLowerCase().includes('other')
      );
      setSelectedCategory(otherCat || match);
    } else {
      setCustomCategoryInput('');
      setSelectedCategory(match);
    }

    setModalVisible(true);
  };

  // Active category limit status for the selected category in Add Modal
  const activeLimitStatus = useMemo(() => {
    if (!categoryLimitsEnabled || txType !== 'expense') return null;
    const catName =
      selectedCategory?.name?.toLowerCase().includes('other') && customCategoryInput.trim()
        ? customCategoryInput.trim()
        : selectedCategory?.name || '';
    if (!catName) return null;

    const lower = catName.toLowerCase();
    return (
      categoryLimitStatuses.find(
        (s) =>
          s.category.toLowerCase() === lower ||
          (lower === 'food' && s.category.toLowerCase().includes('food')) ||
          (lower.includes('food') && s.category.toLowerCase() === 'food') ||
          (lower === 'petrol' && s.category.toLowerCase().includes('petrol')) ||
          (lower.includes('petrol') && s.category.toLowerCase() === 'petrol') ||
          (lower === 'service' && s.category.toLowerCase().includes('service')) ||
          (lower.includes('service') && s.category.toLowerCase() === 'service')
      ) || null
    );
  }, [categoryLimitsEnabled, txType, selectedCategory, customCategoryInput, categoryLimitStatuses]);

  const enteredAmountNum = parseFloat(amount) || 0;
  const editingAdjustment =
    editingTransaction &&
    editingTransaction.type === 'expense' &&
    activeLimitStatus &&
    editingTransaction.category.toLowerCase() === activeLimitStatus.category.toLowerCase()
      ? editingTransaction.amount
      : 0;

  const currentSpentAdjusted = activeLimitStatus
    ? Math.max(0, activeLimitStatus.spent - editingAdjustment)
    : 0;
  const remainingAfterAmount = activeLimitStatus
    ? activeLimitStatus.limit - currentSpentAdjusted - enteredAmountNum
    : 0;
  const calculatedUsedPercent = activeLimitStatus
    ? Math.round(((currentSpentAdjusted + enteredAmountNum) / activeLimitStatus.limit) * 100)
    : 0;

  const handleTypeChange = (newType: TransactionType) => {
    setTxType(newType);
    setCustomCategoryInput('');
    if (newType === 'transfer') {
      setSelectedCategory(null);
      if (!title || title === 'Hand to UPI Deposit' || title === 'ATM Cash Withdrawal' || title.startsWith('Transfer')) {
        setTitle(paymentMethod === 'cash' ? 'Hand to UPI Deposit' : 'ATM Cash Withdrawal');
      }
    } else {
      const firstMatchingCat = categories.find((c) => c.type === newType);
      if (firstMatchingCat) {
        setSelectedCategory(firstMatchingCat);
      }
      if (title === 'Hand to UPI Deposit' || title === 'ATM Cash Withdrawal') {
        setTitle('');
      }
    }
  };

  // Save / Update
  const handleSaveTransaction = () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }

    const normDate = normalizeDateString(txDate);
    if (!normDate) {
      Alert.alert(
        'Invalid Date',
        'Please enter a valid date.\nAccepted formats:\n• YYYY-MM-DD (e.g. 2026-10-02)\n• DD-MM-YYYY (e.g. 02-10-2026)\n• Or tap Yesterday / Calendar button'
      );
      return;
    }

    // Special Transfer Logic
    if (txType === 'transfer') {
      const defaultTransferTitle = paymentMethod === 'cash' ? 'Hand to UPI Deposit' : 'ATM Cash Withdrawal';
      const finalTitle = title.trim() || defaultTransferTitle;
      const catName = paymentMethod === 'cash' ? 'Hand ➔ UPI' : 'UPI ➔ Hand';
      const catColor = paymentMethod === 'cash' ? '#6366F1' : '#0EA5E9';

      try {
        if (editingTransaction) {
          updateTransaction(editingTransaction.id, {
            title: finalTitle,
            amount: parsedAmount,
            type: 'transfer',
            category: catName,
            categoryIcon: 'swap-horizontal',
            categoryColor: catColor,
            paymentMethod,
            date: normDate,
            notes: notes.trim(),
            profileId: editingTransaction.profileId || activeProfile.id,
          });
        } else {
          addTransaction({
            title: finalTitle,
            amount: parsedAmount,
            type: 'transfer',
            category: catName,
            categoryIcon: 'swap-horizontal',
            categoryColor: catColor,
            paymentMethod,
            date: normDate,
            notes: notes.trim(),
            profileId: activeProfile.id,
          });
        }

        const txMonth = normDate.slice(0, 7);
        if (selectedMonth !== txMonth) {
          setSelectedMonth(txMonth);
        }

        setModalVisible(false);
        setCustomCategoryInput('');
        loadAllData();
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to save transfer');
      }
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
      const isOther =
        selectedCategory.name.toLowerCase().includes('other') ||
        selectedCategory.id.includes('other');
      let finalCategory = selectedCategory;

      if (isOther && customCategoryInput.trim()) {
        const customCat = addCustomCategory(customCategoryInput.trim(), txType);
        finalCategory = customCat;
      }

      if (editingTransaction) {
        updateTransaction(editingTransaction.id, {
          title: title.trim(),
          amount: parsedAmount,
          type: txType,
          category: finalCategory.name,
          categoryIcon: finalCategory.icon,
          categoryColor: finalCategory.color,
          paymentMethod,
          date: normDate,
          notes: notes.trim(),
          profileId: editingTransaction.profileId || activeProfile.id,
        });
      } else {
        addTransaction({
          title: title.trim(),
          amount: parsedAmount,
          type: txType,
          category: finalCategory.name,
          categoryIcon: finalCategory.icon,
          categoryColor: finalCategory.color,
          paymentMethod,
          date: normDate,
          notes: notes.trim(),
          profileId: activeProfile.id,
        });
      }

      // Automatically sync selectedMonth if user logged an entry for another month
      const txMonth = normDate.slice(0, 7);
      if (selectedMonth !== txMonth) {
        setSelectedMonth(txMonth);
      }

      setModalVisible(false);
      setCustomCategoryInput('');
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
    saveAppSetting('monthlyBudget', String(val), activeProfile.id);
    setSettings((prev) => ({ ...prev, monthlyBudget: val }));
    Alert.alert(
      'Budget Saved',
      val > 0 ? `Monthly budget for ${activeProfile.name} set to ${formatINR(val)}` : `Monthly budget for ${activeProfile.name} removed.`
    );
  };

  // Reset All
  const handleResetData = () => {
    Alert.alert(
      `⚠️ Clear Transactions for ${activeProfile.name}?`,
      `This will erase only the records belonging to "${activeProfile.name}". Other profiles will NOT be deleted. Are you sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: () => {
            resetAllData(activeProfile.id);
            loadAllData();
            Alert.alert('Cleared', `Records for ${activeProfile.name} have been reset.`);
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

  // Calendar Grid Days Builder for Date Picker
  const renderCalendarDays = (
    monthStr: string,
    currentSelectedDate: string,
    onSelectDate: (d: string) => void
  ) => {
    const parts = monthStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month, 0).getDate();
    const todayStr = getTodayDateString();
    const normSelected = normalizeDateString(currentSelectedDate);

    const cells = [];
    // Blank slots for days before 1st of month
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(<View key={`blank-${i}`} style={styles.calendarDayCell} />);
    }

    // Days 1..daysInMonth
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${pad2(month)}-${pad2(day)}`;
      const isSelected = normSelected === dateStr;
      const isToday = todayStr === dateStr;

      cells.push(
        <TouchableOpacity
          key={`day-${day}`}
          style={[
            styles.calendarDayCell,
            styles.calendarDayCellActiveBtn,
            isSelected && styles.calendarDaySelected,
            isToday && !isSelected && styles.calendarDayToday,
          ]}
          onPress={() => onSelectDate(dateStr)}
        >
          <Text
            style={[
              styles.calendarDayText,
              isSelected && styles.calendarDaySelectedText,
              isToday && !isSelected && styles.calendarDayTodayText,
            ]}
          >
            {day}
          </Text>
        </TouchableOpacity>
      );
    }

    return cells;
  };

  return (
    <View style={styles.rootWrapper}>
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
              {/* Instagram-style profile switcher pill */}
              <TouchableOpacity
                style={styles.profileHeaderSwitcherPill}
                onPress={openProfileSwitcher}
                activeOpacity={0.7}
              >
                <View style={[styles.profileAvatarMini, { backgroundColor: activeProfile.color || '#2563EB' }]}>
                  <Ionicons name={(activeProfile.icon || 'person') as any} size={10} color="#FFFFFF" />
                </View>
                <Text style={styles.profileHeaderSwitcherName} numberOfLines={1}>
                  {activeProfile.name}
                </Text>
                <Ionicons name="chevron-down" size={12} color="#2563EB" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => openPdfModal(selectedMonth)}
              accessibilityLabel="Download Monthly Statement PDF"
            >
              <Ionicons name="document-text-outline" size={20} color="#2563EB" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerProfileButton, { borderColor: activeProfile.color || '#2563EB' }]}
              onPress={openProfileSwitcher}
              accessibilityLabel="Switch Account Profile"
            >
              <View style={[styles.headerProfileInnerAvatar, { backgroundColor: activeProfile.color || '#2563EB' }]}>
                <Ionicons name={(activeProfile.icon || 'person') as any} size={14} color="#FFFFFF" />
              </View>
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
                  <Text style={styles.totalBalanceLabel} numberOfLines={1}>
                    {dashboardView === 'all' ? 'TOTAL BALANCE' : 'NET CASHFLOW'}
                  </Text>
                  
                  {/* Period Switcher: All Time vs Selected Month */}
                  <View style={styles.dashboardViewToggle}>
                    <TouchableOpacity
                      style={[
                        styles.dashboardTogglePill,
                        dashboardView === 'all' && styles.dashboardTogglePillActive,
                      ]}
                      onPress={() => setDashboardView('all')}
                    >
                      <Text
                        style={[
                          styles.dashboardToggleText,
                          dashboardView === 'all' && styles.dashboardToggleTextActive,
                        ]}
                      >
                        All Time
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.dashboardTogglePill,
                        dashboardView === 'month' && styles.dashboardTogglePillActive,
                      ]}
                      onPress={() => setDashboardView('month')}
                    >
                      <Text
                        style={[
                          styles.dashboardToggleText,
                          dashboardView === 'month' && styles.dashboardToggleTextActive,
                        ]}
                      >
                        Monthly
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Amount */}
                <Text
                  style={[
                    styles.totalBalanceValue,
                    {
                      color:
                        (dashboardView === 'all' ? allTimeWallet.totalBalance : wallet.totalBalance) >= 0
                          ? '#0F172A'
                          : '#DC2626',
                    },
                  ]}
                >
                  {formatINR(dashboardView === 'all' ? allTimeWallet.totalBalance : wallet.totalBalance)}
                </Text>

                {/* Month Navigator if Monthly View is selected */}
                {dashboardView === 'month' && (
                  <View style={styles.homeMonthNavRow}>
                    <TouchableOpacity style={styles.monthNavMiniBtn} onPress={handlePrevMonth}>
                      <Ionicons name="chevron-back" size={14} color="#475569" />
                      <Text style={styles.monthNavMiniText}>Prev</Text>
                    </TouchableOpacity>

                    <Text style={styles.homeMonthNavLabel}>{formatMonthDisplay(selectedMonth)}</Text>

                    <TouchableOpacity style={styles.monthNavMiniBtn} onPress={handleNextMonth}>
                      <Text style={styles.monthNavMiniText}>Next</Text>
                      <Ionicons name="chevron-forward" size={14} color="#475569" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.homeMonthPdfBadgeBtn}
                      onPress={() => openPdfModal(selectedMonth)}
                    >
                      <Ionicons name="document-text-outline" size={13} color="#2563EB" />
                      <Text style={styles.homeMonthPdfBadgeText}>PDF</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.totalSummaryRow}>
                  <View style={styles.summaryMiniStat}>
                    <Text style={styles.miniStatLabel}>
                      {dashboardView === 'all' ? 'All-Time Income' : 'Received This Month'}
                    </Text>
                    <Text style={styles.miniStatIncome}>
                      +{formatINR(dashboardView === 'all' ? allTimeWallet.totalIncome : wallet.totalIncome)}
                    </Text>
                  </View>
                  <View style={styles.miniStatDivider} />
                  <View style={styles.summaryMiniStat}>
                    <Text style={styles.miniStatLabel}>
                      {dashboardView === 'all' ? 'All-Time Expense' : 'Spent This Month'}
                    </Text>
                    <Text style={styles.miniStatExpense}>
                      -{formatINR(dashboardView === 'all' ? allTimeWallet.totalExpense : wallet.totalExpense)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* SEPARATE WALLETS: CASH vs UPI (Real Cumulative Accounts) */}
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>My Wallets & Accounts</Text>
                  <Text style={styles.walletHint}>Real All-Time Balances</Text>
                </View>
                <TouchableOpacity
                  style={styles.headerTransferBtn}
                  onPress={() => openTransferModal('cash_to_upi')}
                >
                  <Ionicons name="swap-horizontal" size={15} color="#4F46E5" />
                  <Text style={styles.headerTransferBtnText}>⇄ Transfer</Text>
                </TouchableOpacity>
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
                      { color: allTimeWallet.upiBalance >= 0 ? '#1E1B4B' : '#DC2626' },
                    ]}
                  >
                    {formatINR(allTimeWallet.upiBalance)}
                  </Text>

                  <View style={styles.walletDetailRow}>
                    <View style={styles.walletDetailItem}>
                      <Text style={styles.walletDetailLabel}>
                        {dashboardView === 'all' ? 'UPI Spent (All)' : 'UPI Spent (Month)'}
                      </Text>
                      <Text style={styles.walletDetailExpense}>
                        -{formatINR(dashboardView === 'all' ? allTimeWallet.upiExpense : wallet.upiExpense)}
                      </Text>
                    </View>
                    <View style={styles.walletDetailItem}>
                      <Text style={styles.walletDetailLabel}>
                        {dashboardView === 'all' ? 'UPI Received' : 'UPI In (Month)'}
                      </Text>
                      <Text style={styles.walletDetailIncome}>
                        +{formatINR(dashboardView === 'all' ? allTimeWallet.upiIncome : wallet.upiIncome)}
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
                      { color: allTimeWallet.cashBalance >= 0 ? '#064E3B' : '#DC2626' },
                    ]}
                  >
                    {formatINR(allTimeWallet.cashBalance)}
                  </Text>

                  <View style={styles.walletDetailRow}>
                    <View style={styles.walletDetailItem}>
                      <Text style={styles.walletDetailLabel}>
                        {dashboardView === 'all' ? 'Cash Spent (All)' : 'Cash Spent (Month)'}
                      </Text>
                      <Text style={styles.walletDetailExpense}>
                        -{formatINR(dashboardView === 'all' ? allTimeWallet.cashExpense : wallet.cashExpense)}
                      </Text>
                    </View>
                    <View style={styles.walletDetailItem}>
                      <Text style={styles.walletDetailLabel}>
                        {dashboardView === 'all' ? 'Cash Received' : 'Cash In (Month)'}
                      </Text>
                      <Text style={styles.walletDetailIncome}>
                        +{formatINR(dashboardView === 'all' ? allTimeWallet.cashIncome : wallet.cashIncome)}
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
                  <Ionicons name="qr-code-outline" size={16} color="#4F46E5" />
                  <Text style={[styles.quickActionText, { color: '#4F46E5' }]}>+ UPI</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickActionBtn, { borderColor: '#059669', backgroundColor: '#ECFDF5' }]}
                  onPress={() => openAddModal('expense', 'cash')}
                >
                  <Ionicons name="cash-outline" size={16} color="#059669" />
                  <Text style={[styles.quickActionText, { color: '#059669' }]}>+ Cash</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickActionBtn, { borderColor: '#6366F1', backgroundColor: '#F5F3FF' }]}
                  onPress={() => openTransferModal('cash_to_upi')}
                >
                  <Ionicons name="swap-horizontal" size={16} color="#4F46E5" />
                  <Text style={[styles.quickActionText, { color: '#4F46E5' }]}>⇄ Transfer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickActionBtn, { borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' }]}
                  onPress={() => openAddModal('income', 'upi')}
                >
                  <Ionicons name="arrow-down-circle-outline" size={16} color="#16A34A" />
                  <Text style={[styles.quickActionText, { color: '#16A34A' }]}>+ Income</Text>
                </TouchableOpacity>
              </View>

              {/* Recent Transactions (Latest 5 across all dates) */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Recent Transactions</Text>
                <TouchableOpacity onPress={() => setActiveTab('history')}>
                  <Text style={styles.seeAllText}>View All History</Text>
                </TouchableOpacity>
              </View>

              {recentTransactions.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="wallet-outline" size={44} color="#94A3B8" />
                  <Text style={styles.emptyTitle}>No transactions recorded</Text>
                  <Text style={styles.emptySubtitle}>
                    Tap "+ Add UPI" or "+ Add Cash" above to record your first transaction.
                  </Text>
                </View>
              ) : (
                recentTransactions.map((item) => (
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
                      <Text style={styles.transactionTitle} numberOfLines={1} ellipsizeMode="tail">
                        {item.title}
                      </Text>
                      <View style={styles.txMetaRow}>
                        <View
                          style={[
                            styles.walletPillSmall,
                            item.type === 'transfer'
                              ? styles.transferPill
                              : item.paymentMethod === 'upi'
                              ? styles.upiPill
                              : styles.cashPill,
                          ]}
                        >
                          <Text
                            style={[
                              styles.walletPillSmallText,
                              item.type === 'transfer'
                                ? styles.transferPillText
                                : item.paymentMethod === 'upi'
                                ? styles.upiPillText
                                : styles.cashPillText,
                            ]}
                          >
                            {item.type === 'transfer'
                              ? item.paymentMethod === 'cash'
                                ? 'HAND ➔ UPI'
                                : 'UPI ➔ HAND'
                              : item.paymentMethod.toUpperCase()}
                          </Text>
                        </View>
                        <Text
                          style={styles.transactionMeta}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {item.category} • {formatDateDisplay(item.date)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.amountCol}>
                      <Text
                        style={[
                          styles.transactionAmount,
                          {
                            color:
                              item.type === 'income'
                                ? '#16A34A'
                                : item.type === 'transfer'
                                ? '#4F46E5'
                                : '#DC2626',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {item.type === 'income' ? '+' : item.type === 'transfer' ? '⇄ ' : '-'}
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
              {/* Interactive Month Selector Bar */}
              <View style={styles.monthSelectorBar}>
                <TouchableOpacity style={styles.monthArrowBtn} onPress={handlePrevMonth}>
                  <Ionicons name="chevron-back" size={18} color="#0F172A" />
                </TouchableOpacity>

                <View style={styles.monthCenterInfo}>
                  <Ionicons name="calendar" size={15} color="#4F46E5" style={{ marginRight: 6 }} />
                  <Text style={styles.monthCenterTitle}>{formatMonthDisplay(selectedMonth)}</Text>
                  {selectedMonth !== currentMonthStr && (
                    <TouchableOpacity style={styles.currentBadgeBtn} onPress={handleCurrentMonth}>
                      <Text style={styles.currentBadgeText}>Current Month</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity style={styles.monthArrowBtn} onPress={handleNextMonth}>
                  <Ionicons name="chevron-forward" size={18} color="#0F172A" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.analyticsPdfBtn}
                  onPress={() => openPdfModal(selectedMonth)}
                >
                  <Ionicons name="document-text-outline" size={14} color="#2563EB" />
                  <Text style={styles.analyticsPdfBtnText}>PDF</Text>
                </TouchableOpacity>
              </View>

              {/* Monthly Visual Charts Card */}
              <View style={styles.chartsCard}>
                <View style={styles.chartsCardTopRow}>
                  <View>
                    <Text style={styles.chartsCardTitle}>Monthly Spending Charts</Text>
                    <Text style={styles.chartsCardSub}>
                      {formatMonthDisplay(selectedMonth)} • {formatINR(wallet.totalExpense)} Spent
                    </Text>
                  </View>
                </View>

                {/* 3-Way Chart Switcher */}
                <View style={styles.chartSwitcherRow}>
                  <TouchableOpacity
                    style={[
                      styles.chartSwitchBtn,
                      chartMode === 'pie' && styles.chartSwitchBtnActive,
                    ]}
                    onPress={() => setChartMode('pie')}
                  >
                    <Ionicons
                      name="pie-chart"
                      size={14}
                      color={chartMode === 'pie' ? '#FFFFFF' : '#64748B'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.chartSwitchBtnText,
                        chartMode === 'pie' && styles.chartSwitchBtnTextActive,
                      ]}
                    >
                      Pie Chart
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.chartSwitchBtn,
                      chartMode === 'categoryBars' && styles.chartSwitchBtnActive,
                    ]}
                    onPress={() => setChartMode('categoryBars')}
                  >
                    <Ionicons
                      name="stats-chart"
                      size={14}
                      color={chartMode === 'categoryBars' ? '#FFFFFF' : '#64748B'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.chartSwitchBtnText,
                        chartMode === 'categoryBars' && styles.chartSwitchBtnTextActive,
                      ]}
                    >
                      Categories
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.chartSwitchBtn,
                      chartMode === 'dailyHistogram' && styles.chartSwitchBtnActive,
                    ]}
                    onPress={() => setChartMode('dailyHistogram')}
                  >
                    <Ionicons
                      name="bar-chart"
                      size={14}
                      color={chartMode === 'dailyHistogram' ? '#FFFFFF' : '#64748B'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.chartSwitchBtnText,
                        chartMode === 'dailyHistogram' && styles.chartSwitchBtnTextActive,
                      ]}
                    >
                      Daily Trend
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Render Selected Visualizer */}
                {chartMode === 'pie' && (
                  <PieChartComponent
                    data={categoryBreakdown}
                    totalAmount={wallet.totalExpense}
                    selectedIndex={selectedSliceIndex}
                    onSelectIndex={setSelectedSliceIndex}
                  />
                )}

                {chartMode === 'categoryBars' && (
                  <CategoryHistogramComponent
                    data={categoryBreakdown}
                    totalAmount={wallet.totalExpense}
                  />
                )}

                {chartMode === 'dailyHistogram' && (
                  <DailyHistogramComponent data={dailySpends} />
                )}
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Cash vs UPI Outflow</Text>
              <Text style={styles.sectionSubtitle}>
                How you spent money in {formatMonthDisplay(selectedMonth)}
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
                {/* Period Filter (All Time / Selected Month) */}
                <View style={styles.historyPeriodRow}>
                  <TouchableOpacity
                    style={[
                      styles.historyPeriodPill,
                      historyPeriodFilter === 'all' && styles.activeHistoryPeriodPill,
                    ]}
                    onPress={() => setHistoryPeriodFilter('all')}
                  >
                    <Ionicons
                      name="infinite-outline"
                      size={14}
                      color={historyPeriodFilter === 'all' ? '#2563EB' : '#64748B'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.historyPeriodPillText,
                        historyPeriodFilter === 'all' && styles.activeHistoryPeriodPillText,
                      ]}
                    >
                      All Time (All Dates)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.historyPeriodPill,
                      historyPeriodFilter === 'month' && styles.activeHistoryPeriodPill,
                    ]}
                    onPress={() => setHistoryPeriodFilter('month')}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color={historyPeriodFilter === 'month' ? '#2563EB' : '#64748B'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.historyPeriodPillText,
                        historyPeriodFilter === 'month' && styles.activeHistoryPeriodPillText,
                      ]}
                    >
                      {formatMonthDisplay(selectedMonth)}
                    </Text>
                  </TouchableOpacity>
                </View>

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

                {/* Type Filter (All / Expense / Income / Transfer) */}
                <View style={styles.typeFilterGroup}>
                  {(['all', 'expense', 'income', 'transfer'] as const).map((t) => (
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
                        {t === 'transfer' ? '⇄ Transfer' : t.charAt(0).toUpperCase() + t.slice(1)}
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      style={styles.pdfExportBtn}
                      onPress={() => openPdfModal(selectedMonth)}
                    >
                      <Ionicons name="document-text-outline" size={14} color="#DC2626" style={{ marginRight: 4 }} />
                      <Text style={styles.pdfExportBtnText}>PDF Statement</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.csvExportBtn}
                      onPress={() => exportToSpreadsheetCSV()}
                    >
                      <Ionicons name="grid-outline" size={14} color="#2563EB" style={{ marginRight: 4 }} />
                      <Text style={styles.csvExportBtnText}>Excel/CSV</Text>
                    </TouchableOpacity>
                  </View>
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
                          <Text style={styles.transactionTitle} numberOfLines={1} ellipsizeMode="tail">
                            {item.title}
                          </Text>
                          <View style={styles.txMetaRow}>
                            <View
                              style={[
                                styles.walletPillSmall,
                                item.type === 'transfer'
                                  ? styles.transferPill
                                  : item.paymentMethod === 'upi'
                                  ? styles.upiPill
                                  : styles.cashPill,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.walletPillSmallText,
                                  item.type === 'transfer'
                                    ? styles.transferPillText
                                    : item.paymentMethod === 'upi'
                                    ? styles.upiPillText
                                    : styles.cashPillText,
                                ]}
                              >
                                {item.type === 'transfer'
                                  ? item.paymentMethod === 'cash'
                                    ? 'HAND ➔ UPI'
                                    : 'UPI ➔ HAND'
                                  : item.paymentMethod.toUpperCase()}
                              </Text>
                            </View>
                            <Text
                              style={styles.transactionMeta}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {item.category} • {formatDateDisplay(item.date)}
                            </Text>
                          </View>
                          {item.notes ? (
                            <Text style={styles.transactionNotes} numberOfLines={1} ellipsizeMode="tail">
                              {item.notes}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>

                      <View style={styles.amountCol}>
                        <Text
                          style={[
                            styles.transactionAmount,
                            {
                              color:
                                item.type === 'income'
                                  ? '#16A34A'
                                  : item.type === 'transfer'
                                  ? '#4F46E5'
                                  : '#DC2626',
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {item.type === 'income' ? '+' : item.type === 'transfer' ? '⇄ ' : '-'}
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
              <Text style={styles.sectionSubtitle}>Separate money tracking &amp; preferences</Text>

              {/* Profiles & Accounts Management Card */}
              <View style={styles.settingsSectionCard}>
                <View style={styles.profileSectionHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Profiles &amp; Accounts</Text>
                    <Text style={styles.settingSubLabel}>
                      Track personal, mother &amp; friends money separately like Instagram
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.addProfileHeaderBtn}
                    onPress={openAddProfileModal}
                  >
                    <Ionicons name="add" size={16} color="#FFFFFF" />
                    <Text style={styles.addProfileHeaderBtnText}>Add Profile</Text>
                  </TouchableOpacity>
                </View>

                {/* Active Profile Highlight Card */}
                <TouchableOpacity
                  style={[styles.profileActiveCard, { borderColor: (activeProfile.color || '#2563EB') + '66' }]}
                  onPress={openProfileSwitcher}
                  activeOpacity={0.8}
                >
                  <View style={[styles.profileAvatarLarge, { backgroundColor: activeProfile.color || '#2563EB' }]}>
                    <Ionicons name={(activeProfile.icon || 'person') as any} size={22} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.profileActiveName}>{activeProfile.name}</Text>
                      <View style={styles.activeProfileBadge}>
                        <Text style={styles.activeProfileBadgeText}>Active</Text>
                      </View>
                    </View>
                    <Text style={styles.profileActiveSub}>
                      Tap to switch • Net Balance: {formatINR(allTimeWallet.totalBalance)}
                    </Text>
                  </View>
                  <Ionicons name="swap-horizontal" size={20} color="#2563EB" />
                </TouchableOpacity>

                {/* Profiles List */}
                <View style={styles.profileListWrap}>
                  {profiles.map((p) => {
                    const isActive = p.id === activeProfile.id;
                    return (
                      <View key={p.id} style={[styles.profileRowItem, isActive && styles.profileRowItemActive]}>
                        <TouchableOpacity
                          style={styles.profileRowLeftTouch}
                          onPress={() => handleSwitchProfile(p.id)}
                        >
                          <View style={[styles.profileAvatarMedium, { backgroundColor: p.color || '#2563EB' }]}>
                            <Ionicons name={(p.icon || 'person') as any} size={16} color="#FFFFFF" />
                          </View>
                          <View style={{ marginLeft: 10, flex: 1 }}>
                            <Text style={[styles.profileRowName, isActive && styles.profileRowNameActive]}>
                              {p.name}
                            </Text>
                            <Text style={styles.profileRowStatus}>
                              {isActive ? 'Currently Active' : 'Tap to switch'}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        <View style={styles.profileRowActions}>
                          <TouchableOpacity
                            style={styles.profileRowActionBtn}
                            onPress={() => openEditProfileModal(p)}
                            accessibilityLabel={`Edit ${p.name}`}
                          >
                            <Ionicons name="pencil-outline" size={16} color="#64748B" />
                          </TouchableOpacity>
                          {profiles.length > 1 && (
                            <TouchableOpacity
                              style={styles.profileRowActionBtn}
                              onPress={() => handleDeleteProfile(p.id, p.name)}
                              accessibilityLabel={`Delete ${p.name}`}
                            >
                              <Ionicons name="trash-outline" size={16} color="#EF4444" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

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

              {/* Category Monthly Limits Section */}
              <View style={styles.settingsSectionCard}>
                <View style={styles.categoryLimitToggleRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Ionicons name="pricetags-outline" size={18} color="#2563EB" />
                      <Text style={styles.settingLabel}>Category Monthly Limits</Text>
                    </View>
                    <Text style={styles.settingSubLabel}>
                      Set monthly budgets for Food, Petrol, Service &amp; custom categories
                    </Text>
                  </View>

                  {/* Switch Button */}
                  <TouchableOpacity
                    style={[
                      styles.limitSwitchTrack,
                      categoryLimitsEnabled && styles.limitSwitchTrackActive,
                    ]}
                    onPress={handleToggleCategoryLimits}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.limitSwitchThumb,
                        categoryLimitsEnabled && styles.limitSwitchThumbActive,
                      ]}
                    />
                  </TouchableOpacity>
                </View>

                {/* When ON: Show Category Limits Menu */}
                {categoryLimitsEnabled && (
                  <View style={styles.categoryLimitsMenuBox}>
                    <View style={styles.catLimitsMenuHeader}>
                      {/* Top Row: Title & Month on Left, Set Limit Button on Right */}
                      <View style={styles.catLimitsTopRow}>
                        <View style={styles.catLimitsTitleGroup}>
                          <Text style={styles.catLimitsMenuTitle}>Category Budgets</Text>
                          <View style={styles.monthBadgeMini}>
                            <Text style={styles.monthBadgeMiniText}>
                              {formatMonthDisplay(selectedMonth)}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.addCategoryLimitBtn}
                          onPress={() => {
                            setLimitCategoryName('');
                            setLimitAmountInput('');
                            setLimitModalVisible(true);
                          }}
                        >
                          <Ionicons name="add-circle" size={14} color="#FFFFFF" />
                          <Text style={styles.addCategoryLimitBtnText}>Set Limit</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Full-width Subtitle Description */}
                      <Text style={styles.catLimitsMenuSub}>
                        Limits reduce automatically as you spend in each category.
                      </Text>
                    </View>

                    {/* Quick Presets if empty or available */}
                    {categoryLimitStatuses.length === 0 && (
                      <View style={styles.presetBox}>
                        <Text style={styles.presetTitle}>Quick Setup Suggestions:</Text>
                        <View style={styles.presetChipsRow}>
                          <TouchableOpacity
                            style={styles.presetChip}
                            onPress={() => handleSaveCategoryLimit('Food', 2000)}
                          >
                            <Ionicons name="restaurant-outline" size={13} color="#F97316" />
                            <Text style={styles.presetChipText}>+ Food (₹2,000)</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.presetChip}
                            onPress={() => handleSaveCategoryLimit('Petrol', 1000)}
                          >
                            <Ionicons name="car-outline" size={13} color="#3B82F6" />
                            <Text style={styles.presetChipText}>+ Petrol (₹1,000)</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.presetChip}
                            onPress={() => handleSaveCategoryLimit('Service', 2000)}
                          >
                            <Ionicons name="construct-outline" size={13} color="#8B5CF6" />
                            <Text style={styles.presetChipText}>+ Service (₹2,000)</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* List of Category Limits */}
                    {categoryLimitStatuses.map((st) => (
                      <View key={st.category} style={styles.catLimitCard}>
                        <View style={styles.catLimitCardTop}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View
                              style={[
                                styles.catLimitIconWrap,
                                { backgroundColor: (st.color || '#3B82F6') + '1A' },
                              ]}
                            >
                              <Ionicons
                                name={(st.icon as any) || 'pricetag'}
                                size={18}
                                color={st.color || '#3B82F6'}
                              />
                            </View>
                            <View>
                              <Text style={styles.catLimitCardName}>{st.category}</Text>
                              <Text style={styles.catLimitCardSub}>
                                Limit: {formatINR(st.limit)} &bull; Spent: {formatINR(st.spent)}
                              </Text>
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity
                              style={styles.catLimitActionBtn}
                              onPress={() => {
                                setLimitCategoryName(st.category);
                                setLimitAmountInput(String(st.limit));
                                setLimitModalVisible(true);
                              }}
                            >
                              <Ionicons name="pencil-outline" size={15} color="#475569" />
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.catLimitActionBtn}
                              onPress={() => handleDeleteCategoryLimit(st.category)}
                            >
                              <Ionicons name="trash-outline" size={15} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Progress Bar & Remaining */}
                        <View style={styles.catLimitProgressRow}>
                          <View style={[styles.progressBarBg, { flex: 1 }]}>
                            <View
                              style={[
                                styles.progressBarFill,
                                {
                                  width: `${Math.min(st.percent, 100)}%`,
                                  backgroundColor: st.isOverLimit
                                    ? '#DC2626'
                                    : st.percent > 80
                                    ? '#F59E0B'
                                    : '#10B981',
                                },
                              ]}
                            />
                          </View>
                          <Text
                            style={[
                              styles.catLimitRemainingText,
                              st.isOverLimit && { color: '#DC2626' },
                            ]}
                          >
                            {st.isOverLimit
                              ? `Over by ${formatINR(Math.abs(st.remaining))}`
                              : `${formatINR(st.remaining)} left`}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Data Portability Section */}
              <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Monthly Reports &amp; Statements</Text>
              <Text style={styles.sectionSubtitle}>
                Download official monthly statements or export data for accounting.
              </Text>

              <View style={styles.settingsSectionCard}>
                {/* Download Monthly PDF Statement */}
                <TouchableOpacity
                  style={styles.settingsActionRow}
                  onPress={() => openPdfModal(selectedMonth)}
                >
                  <View style={[styles.settingsActionIconWrap, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="document-text" size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.settingsActionTitle}>Download Monthly PDF Statement</Text>
                    <Text style={styles.settingsActionDesc}>
                      Separate Income &amp; Expense tables + overall summary (Multi-page PDF)
                    </Text>
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

              {/* Preview Splash Screen */}
              <TouchableOpacity
                style={styles.splashPreviewBtn}
                onPress={() => {
                  setSplashKey((k) => k + 1);
                  setShowSplash(true);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.splashPreviewIconBg}>
                  <Ionicons name="sparkles" size={18} color="#D97706" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.splashPreviewTitle}>Preview Splash Screen</Text>
                  <Text style={styles.splashPreviewDesc}>Replay 4-second gold luxury introduction</Text>
                </View>
                <Ionicons name="play-circle" size={22} color="#D97706" />
              </TouchableOpacity>

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
              More
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
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity
              style={styles.modalBackdropDismiss}
              activeOpacity={1}
              onPress={() => Keyboard.dismiss()}
            />
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingTransaction ? 'Edit Transaction' : 'New Transaction'}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Profile Context Pill */}
              <View style={styles.modalProfilePillWrap}>
                <View style={[styles.profileAvatarMini, { backgroundColor: activeProfile.color || '#2563EB' }]}>
                  <Ionicons name={(activeProfile.icon || 'person') as any} size={10} color="#FFFFFF" />
                </View>
                <Text style={styles.modalProfilePillText}>
                  Recording for: <Text style={{ fontWeight: '700', color: activeProfile.color || '#2563EB' }}>{activeProfile.name}</Text>
                </Text>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={styles.modalScrollContent}
              >
                {/* 1. Transaction Type (Expense vs Income vs Transfer) */}
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

                  <TouchableOpacity
                    style={[styles.typeButton, txType === 'transfer' && styles.typeButtonActiveTransfer]}
                    onPress={() => handleTypeChange('transfer')}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        txType === 'transfer' && styles.typeButtonTextActive,
                      ]}
                    >
                      ⇄ Transfer
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 2. CHOOSE TRANSFER DIRECTION OR WALLET */}
                {txType === 'transfer' ? (
                  <View style={styles.transferDirectionSection}>
                    <Text style={styles.inputLabel}>Choose Transfer Direction</Text>
                    <View style={styles.transferOptionsRow}>
                      {/* Option A: Hand to UPI */}
                      <TouchableOpacity
                        style={[
                          styles.transferOptionCard,
                          paymentMethod === 'cash' && styles.transferOptionCardActiveCashToUpi,
                        ]}
                        onPress={() => {
                          setPaymentMethod('cash');
                          if (!title || title === 'ATM Cash Withdrawal' || title === 'Hand to UPI Deposit' || title.startsWith('Transfer:')) {
                            setTitle('Hand to UPI Deposit');
                          }
                        }}
                      >
                        <View style={styles.transferOptionHeader}>
                          <Text style={styles.transferOptionEmoji}>💵 ➔ 📱</Text>
                          <View style={[styles.transferBadgeMini, paymentMethod === 'cash' && styles.transferBadgeMiniActiveCash]}>
                            <Text style={[styles.transferBadgeMiniText, paymentMethod === 'cash' && styles.transferBadgeMiniTextActive]}>
                              Deposit
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.transferOptionTitle, paymentMethod === 'cash' && styles.transferOptionTitleActive]}>
                          Hand to UPI
                        </Text>
                        <Text style={styles.transferOptionSub}>
                          Deposit cash into bank / GPay / PhonePe
                        </Text>
                        <Text style={styles.transferAvailText}>
                          In Hand: {formatINR(allTimeWallet.cashBalance)}
                        </Text>
                      </TouchableOpacity>

                      {/* Option B: UPI to Hand */}
                      <TouchableOpacity
                        style={[
                          styles.transferOptionCard,
                          paymentMethod === 'upi' && styles.transferOptionCardActiveUpiToCash,
                        ]}
                        onPress={() => {
                          setPaymentMethod('upi');
                          if (!title || title === 'Hand to UPI Deposit' || title === 'ATM Cash Withdrawal' || title.startsWith('Transfer:')) {
                            setTitle('ATM Cash Withdrawal');
                          }
                        }}
                      >
                        <View style={styles.transferOptionHeader}>
                          <Text style={styles.transferOptionEmoji}>📱 ➔ 💵</Text>
                          <View style={[styles.transferBadgeMini, paymentMethod === 'upi' && styles.transferBadgeMiniActiveUpi]}>
                            <Text style={[styles.transferBadgeMiniText, paymentMethod === 'upi' && styles.transferBadgeMiniTextActive]}>
                              Withdraw
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.transferOptionTitle, paymentMethod === 'upi' && styles.transferOptionTitleActive]}>
                          UPI to Hand
                        </Text>
                        <Text style={styles.transferOptionSub}>
                          ATM cash withdrawal / Cash out
                        </Text>
                        <Text style={styles.transferAvailText}>
                          UPI Bal: {formatINR(allTimeWallet.upiBalance)}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Explanatory summary card */}
                    <View style={styles.transferInfoBox}>
                      <Ionicons name="information-circle-outline" size={16} color="#4F46E5" style={{ marginRight: 6 }} />
                      <Text style={styles.transferInfoText}>
                        {paymentMethod === 'cash'
                          ? '💵 Cash in Hand will decrease & 📱 UPI Balance will increase. Overall Net Balance remains unchanged.'
                          : '📱 UPI Balance will decrease & 💵 Cash in Hand will increase. Overall Net Balance remains unchanged.'}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <>
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
                  </>
                )}

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
                {txType === 'transfer' && (
                  <View style={styles.transferAmountPresetsRow}>
                    {[500, 1000, 2000, 5000].map((amt) => (
                      <TouchableOpacity
                        key={amt}
                        style={styles.transferAmountPresetChip}
                        onPress={() => setAmount(String(amt))}
                      >
                        <Text style={styles.transferAmountPresetChipText}>+₹{amt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* 4. Title / Description */}
                <Text style={styles.inputLabel}>
                  {txType === 'transfer' ? 'Transfer Description' : 'Description / Title'}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={
                    txType === 'transfer'
                      ? paymentMethod === 'cash'
                        ? 'e.g. Hand to UPI Deposit, Bank CDM'
                        : 'e.g. ATM Cash Withdrawal'
                      : 'e.g. Chai, Auto, Groceries, Salary'
                  }
                  placeholderTextColor="#94A3B8"
                  value={title}
                  onChangeText={setTitle}
                />
                {txType === 'transfer' && (
                  <View style={styles.transferPresetChipsRow}>
                    {(paymentMethod === 'cash'
                      ? ['Hand to UPI Deposit', 'Deposited at CDM/Branch', 'Gave cash, friend UPI-ed', 'Self Deposit']
                      : ['ATM Cash Withdrawal', 'Self Withdrawal', 'Friend gave cash for UPI', 'Branch Cash Out']
                    ).map((preset) => (
                      <TouchableOpacity
                        key={preset}
                        style={styles.transferPresetChip}
                        onPress={() => setTitle(preset)}
                      >
                        <Text style={styles.transferPresetChipText}>{preset}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* 5. Category Horizontal Scroll (Expenses & Income Only) */}
                {txType !== 'transfer' && (
                  <>
                    <Text style={styles.inputLabel}>Category</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.categoryScroll}
                    >
                      {filteredCategories.map((cat) => {
                        const isSelected = selectedCategory?.name === cat.name;
                        const catStatus =
                          categoryLimitsEnabled && txType === 'expense'
                            ? categoryLimitStatuses.find(
                                (s) =>
                                  s.category.toLowerCase() === cat.name.toLowerCase() ||
                                  (s.category.toLowerCase() === 'food' && cat.name.toLowerCase().includes('food')) ||
                                  (cat.name.toLowerCase() === 'food' && s.category.toLowerCase().includes('food')) ||
                                  (s.category.toLowerCase() === 'petrol' && cat.name.toLowerCase().includes('petrol')) ||
                                  (cat.name.toLowerCase() === 'petrol' && s.category.toLowerCase().includes('petrol')) ||
                                  (s.category.toLowerCase() === 'service' && cat.name.toLowerCase().includes('service')) ||
                                  (cat.name.toLowerCase() === 'service' && s.category.toLowerCase().includes('service'))
                              )
                            : null;

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
                            <View style={{ alignItems: 'flex-start' }}>
                              <Text
                                style={[
                                  styles.categoryChipText,
                                  isSelected && { color: cat.color, fontWeight: '700' },
                                ]}
                              >
                                {cat.name}
                              </Text>
                              {catStatus && (
                                <Text
                                  style={[
                                    styles.categoryChipLimitBadge,
                                    catStatus.isOverLimit && { color: '#DC2626', backgroundColor: '#FEE2E2' },
                                  ]}
                                >
                                  ₹{catStatus.remaining > 0 ? `${catStatus.remaining}` : '0'} left
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {/* Live Category Budget Info Banner */}
                    {categoryLimitsEnabled && txType === 'expense' && activeLimitStatus && (
                      <View style={styles.catBudgetBanner}>
                        <View style={styles.catBudgetTopRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="speedometer-outline" size={16} color="#2563EB" />
                            <Text style={styles.catBudgetTitle}>
                              {activeLimitStatus.category} Monthly Budget
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.catRemainingBadge,
                              remainingAfterAmount < 0
                                ? styles.catRemainingBadgeDanger
                                : remainingAfterAmount < activeLimitStatus.limit * 0.2
                                ? styles.catRemainingBadgeWarning
                                : styles.catRemainingBadgeSuccess,
                            ]}
                          >
                            <Text
                              style={[
                                styles.catRemainingBadgeText,
                                remainingAfterAmount < 0
                                ? styles.catRemainingBadgeTextDanger
                                : remainingAfterAmount < activeLimitStatus.limit * 0.2
                                ? styles.catRemainingBadgeTextWarning
                                : styles.catRemainingBadgeTextSuccess,
                              ]}
                            >
                              {remainingAfterAmount >= 0
                                ? `${formatINR(remainingAfterAmount)} left`
                                : `Over by ${formatINR(Math.abs(remainingAfterAmount))}`}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.catBudgetDetailsRow}>
                          <Text style={styles.catBudgetSubText}>
                            Limit: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{formatINR(activeLimitStatus.limit)}</Text>
                          </Text>
                          <Text style={styles.catBudgetSubText}>
                            Spent so far: <Text style={{ fontWeight: '700', color: '#DC2626' }}>{formatINR(currentSpentAdjusted)}</Text>
                          </Text>
                          {enteredAmountNum > 0 && (
                            <Text style={styles.catBudgetSubText}>
                              This bill: <Text style={{ fontWeight: '700', color: '#2563EB' }}>-{formatINR(enteredAmountNum)}</Text>
                            </Text>
                          )}
                        </View>

                        {/* Progress Bar */}
                        <View style={styles.progressBarBg}>
                          <View
                            style={[
                              styles.progressBarFill,
                              {
                                width: `${Math.min(calculatedUsedPercent, 100)}%`,
                                backgroundColor:
                                  remainingAfterAmount < 0
                                    ? '#DC2626'
                                    : calculatedUsedPercent > 80
                                    ? '#F59E0B'
                                    : '#10B981',
                              },
                            ]}
                          />
                        </View>

                        {remainingAfterAmount < 0 && (
                          <Text style={styles.catBudgetWarningText}>
                            ⚠️ This expense will exceed your monthly limit for {activeLimitStatus.category} by {formatINR(Math.abs(remainingAfterAmount))}!
                          </Text>
                        )}
                      </View>
                    )}

                    {/* 5.1 Custom Category Input (When 'Other' category is selected) */}
                    {selectedCategory &&
                      (selectedCategory.name.toLowerCase().includes('other') ||
                        selectedCategory.id.includes('other')) && (
                        <View style={styles.customCatBox}>
                          <View style={styles.customCatHeader}>
                            <Ionicons name="sparkles" size={15} color="#4F46E5" />
                            <Text style={styles.customCatTitle}>Specify Custom Category Name</Text>
                          </View>
                          <TextInput
                            style={styles.customCatInput}
                            placeholder="e.g. Gym, Books, Petrol, Maintenance, Pet Care..."
                            placeholderTextColor="#94A3B8"
                            value={customCategoryInput}
                            onChangeText={setCustomCategoryInput}
                            autoCapitalize="words"
                          />
                          <Text style={styles.customCatHint}>
                            ⚡ This custom category will be tracked in your monthly pie chart & histogram!
                          </Text>
                        </View>
                      )}
                  </>
                )}

                {/* 6. Date Selection */}
                <View style={styles.dateLabelRow}>
                  <Text style={styles.inputLabel}>Transaction Date</Text>
                  <TouchableOpacity
                    style={styles.calendarPickerTrigger}
                    onPress={() => {
                      setCalendarMonth(normalizeDateString(txDate)?.slice(0, 7) || getLocalYearMonth());
                      setCalendarModalVisible(true);
                    }}
                  >
                    <Ionicons name="calendar" size={15} color="#4F46E5" />
                    <Text style={styles.calendarPickerTriggerText}>Calendar</Text>
                  </TouchableOpacity>
                </View>

                {/* Quick Date Presets */}
                <View style={styles.quickDateChipsRow}>
                  <TouchableOpacity
                    style={[
                      styles.quickDateChip,
                      txDate === getTodayDateString() && styles.quickDateChipActive,
                    ]}
                    onPress={() => setTxDate(getTodayDateString())}
                  >
                    <Ionicons
                      name="today-outline"
                      size={13}
                      color={txDate === getTodayDateString() ? '#FFFFFF' : '#475569'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.quickDateChipText,
                        txDate === getTodayDateString() && styles.quickDateChipTextActive,
                      ]}
                    >
                      Today
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.quickDateChip,
                      txDate === getYesterdayDateString() && styles.quickDateChipActive,
                    ]}
                    onPress={() => setTxDate(getYesterdayDateString())}
                  >
                    <Ionicons
                      name="time-outline"
                      size={13}
                      color={txDate === getYesterdayDateString() ? '#FFFFFF' : '#475569'}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.quickDateChipText,
                        txDate === getYesterdayDateString() && styles.quickDateChipTextActive,
                      ]}
                    >
                      Yesterday
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.quickDateChip,
                      txDate === getDaysAgoDateString(2) && styles.quickDateChipActive,
                    ]}
                    onPress={() => setTxDate(getDaysAgoDateString(2))}
                  >
                    <Text
                      style={[
                        styles.quickDateChipText,
                        txDate === getDaysAgoDateString(2) && styles.quickDateChipTextActive,
                      ]}
                    >
                      2 Days Ago
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.quickDateChip,
                      txDate === getDaysAgoDateString(7) && styles.quickDateChipActive,
                    ]}
                    onPress={() => setTxDate(getDaysAgoDateString(7))}
                  >
                    <Text
                      style={[
                        styles.quickDateChipText,
                        txDate === getDaysAgoDateString(7) && styles.quickDateChipTextActive,
                      ]}
                    >
                      1 Week Ago
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Date Input with Live Preview */}
                <View style={styles.dateRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="YYYY-MM-DD or DD-MM-YYYY"
                    placeholderTextColor="#94A3B8"
                    value={txDate}
                    onChangeText={setTxDate}
                  />
                  <TouchableOpacity
                    style={styles.openCalendarBtn}
                    onPress={() => {
                      setCalendarMonth(normalizeDateString(txDate)?.slice(0, 7) || getLocalYearMonth());
                      setCalendarModalVisible(true);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#4F46E5" />
                  </TouchableOpacity>
                </View>

                {/* Live Date Preview */}
                <View style={styles.datePreviewBadge}>
                  <Ionicons
                    name={normalizeDateString(txDate) ? 'checkmark-circle' : 'alert-circle'}
                    size={14}
                    color={normalizeDateString(txDate) ? '#16A34A' : '#F59E0B'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.datePreviewText,
                      !normalizeDateString(txDate) && { color: '#B45309' },
                    ]}
                  >
                    {normalizeDateString(txDate)
                      ? formatDateDisplay(txDate)
                      : 'Please type date as YYYY-MM-DD or DD-MM-YYYY'}
                  </Text>
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
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    txType === 'transfer' && { backgroundColor: '#4F46E5' },
                    txType === 'income' && { backgroundColor: '#16A34A' },
                  ]}
                  onPress={handleSaveTransaction}
                >
                  <Text style={styles.saveButtonText}>
                    {editingTransaction
                      ? txType === 'transfer'
                        ? 'Update Transfer'
                        : 'Update Transaction'
                      : txType === 'transfer'
                      ? 'Confirm Wallet Transfer'
                      : 'Save to Offline SQLite'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Interactive Calendar Date Picker Modal */}
        <Modal
          visible={calendarModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setCalendarModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.calendarModalCard}>
              <View style={styles.calendarHeaderRow}>
                <TouchableOpacity
                  style={styles.calendarArrowBtn}
                  onPress={() => setCalendarMonth(getShiftedMonth(calendarMonth, -1))}
                >
                  <Ionicons name="chevron-back" size={20} color="#1E293B" />
                </TouchableOpacity>

                <Text style={styles.calendarMonthTitle}>
                  {formatMonthDisplay(calendarMonth)}
                </Text>

                <TouchableOpacity
                  style={styles.calendarArrowBtn}
                  onPress={() => setCalendarMonth(getShiftedMonth(calendarMonth, 1))}
                >
                  <Ionicons name="chevron-forward" size={20} color="#1E293B" />
                </TouchableOpacity>
              </View>

              {/* Day of Week Header */}
              <View style={styles.calendarDaysHeader}>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                  <Text key={d} style={styles.calendarDayHeaderCell}>
                    {d}
                  </Text>
                ))}
              </View>

              {/* Calendar Grid */}
              <View style={styles.calendarGrid}>
                {renderCalendarDays(calendarMonth, txDate, (pickedDate) => {
                  setTxDate(pickedDate);
                  setCalendarModalVisible(false);
                })}
              </View>

              <TouchableOpacity
                style={styles.calendarCancelBtn}
                onPress={() => setCalendarModalVisible(false)}
              >
                <Text style={styles.calendarCancelText}>Close</Text>
              </TouchableOpacity>
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
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity
              style={styles.modalBackdropDismiss}
              activeOpacity={1}
              onPress={() => Keyboard.dismiss()}
            />
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
          </KeyboardAvoidingView>
        </Modal>

        {/* ==================== 5. MONTHLY PDF STATEMENT MODAL ==================== */}
        <Modal
          visible={pdfModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setPdfModalVisible(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity
              style={styles.modalBackdropDismiss}
              activeOpacity={1}
              onPress={() => setPdfModalVisible(false)}
            />
            <View style={[styles.modalCard, { maxHeight: '90%' }]}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.settingsActionIconWrap, { backgroundColor: '#EFF6FF', width: 34, height: 34 }]}>
                    <Ionicons name="document-text" size={18} color="#2563EB" />
                  </View>
                  <View>
                    <Text style={styles.modalTitle}>Monthly Statement PDF</Text>
                    <Text style={styles.settingSubLabel}>Download multi-page PDF report</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setPdfModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
                {/* Month Selector */}
                <View style={styles.pdfMonthSelectorCard}>
                  <Text style={styles.pdfCardSectionLabel}>SELECT STATEMENT MONTH</Text>
                  <View style={styles.pdfMonthPickerRow}>
                    <TouchableOpacity
                      style={styles.pdfMonthArrowBtn}
                      onPress={() => setPdfExportMonth((m) => getShiftedMonth(m, -1))}
                    >
                      <Ionicons name="chevron-back" size={18} color="#0F172A" />
                    </TouchableOpacity>

                    <View style={{ alignItems: 'center' }}>
                      <Text style={styles.pdfSelectedMonthText}>{formatMonthDisplay(pdfExportMonth)}</Text>
                      {pdfExportMonth !== currentMonthStr && (
                        <TouchableOpacity
                          style={{ marginTop: 2 }}
                          onPress={() => setPdfExportMonth(currentMonthStr)}
                        >
                          <Text style={{ fontSize: 11, color: '#2563EB', fontWeight: '700' }}>
                            Reset to Current Month
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <TouchableOpacity
                      style={styles.pdfMonthArrowBtn}
                      onPress={() => setPdfExportMonth((m) => getShiftedMonth(m, 1))}
                    >
                      <Ionicons name="chevron-forward" size={18} color="#0F172A" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Live Month Stats Preview */}
                {(() => {
                  const previewSummary = getWalletSummary(pdfExportMonth);
                  const previewTxs = getTransactions({ month: pdfExportMonth });
                  const previewIncomeCount = previewTxs.filter((t) => t.type === 'income').length;
                  const previewExpenseCount = previewTxs.filter((t) => t.type === 'expense').length;
                  const netVal = previewSummary.totalIncome - previewSummary.totalExpense;

                  return (
                    <View style={styles.pdfPreviewCard}>
                      <Text style={styles.pdfCardSectionLabel}>MONTH PREVIEW &amp; SNAPSHOT</Text>
                      
                      <View style={styles.pdfStatsGrid}>
                        <View style={[styles.pdfStatItem, { borderLeftColor: '#10B981' }]}>
                          <Text style={styles.pdfStatLabel}>Total Income</Text>
                          <Text style={[styles.pdfStatVal, { color: '#059669' }]}>
                            +{formatINR(previewSummary.totalIncome)}
                          </Text>
                          <Text style={styles.pdfStatSub}>
                            {previewIncomeCount} income record{previewIncomeCount === 1 ? '' : 's'}
                          </Text>
                        </View>

                        <View style={[styles.pdfStatItem, { borderLeftColor: '#EF4444' }]}>
                          <Text style={styles.pdfStatLabel}>Total Expenses</Text>
                          <Text style={[styles.pdfStatVal, { color: '#DC2626' }]}>
                            -{formatINR(previewSummary.totalExpense)}
                          </Text>
                          <Text style={styles.pdfStatSub}>
                            {previewExpenseCount} expense record{previewExpenseCount === 1 ? '' : 's'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.pdfNetRow}>
                        <Text style={styles.pdfNetLabel}>Net Monthly Savings:</Text>
                        <Text
                          style={[
                            styles.pdfNetVal,
                            { color: netVal >= 0 ? '#059669' : '#DC2626' },
                          ]}
                        >
                          {netVal >= 0 ? '+' : ''}{formatINR(netVal)}
                        </Text>
                      </View>
                    </View>
                  );
                })()}

                {/* Feature Highlights */}
                <View style={styles.pdfFeaturesBox}>
                  <Text style={styles.pdfFeaturesTitle}>Included in this PDF Statement:</Text>
                  <View style={styles.pdfFeatureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                    <Text style={styles.pdfFeatureText}>
                      Overall Financial Summary: KPI cards, Cash vs UPI net split &amp; category distribution
                    </Text>
                  </View>
                  <View style={styles.pdfFeatureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                    <Text style={styles.pdfFeatureText}>
                      Monthly Income Table: Separate section with date, category, UPI/cash mode, notes &amp; subtotals
                    </Text>
                  </View>
                  <View style={styles.pdfFeatureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                    <Text style={styles.pdfFeatureText}>
                      Monthly Expense Table: Separate section with automatic multi-page layout &amp; repeated headers
                    </Text>
                  </View>
                  <View style={styles.pdfFeatureItem}>
                    <Ionicons name="layers-outline" size={16} color="#2563EB" />
                    <Text style={styles.pdfFeatureText}>
                      Multi-Page Smart Pagination: Additional pages generated cleanly if expenses are numerous
                    </Text>
                  </View>
                </View>

                {/* Action Button */}
                <TouchableOpacity
                  style={[styles.pdfDownloadBtn, isGeneratingPdf && { opacity: 0.7 }]}
                  disabled={isGeneratingPdf}
                  onPress={() => handleDownloadMonthlyPdf(pdfExportMonth)}
                >
                  <Ionicons
                    name={isGeneratingPdf ? 'hourglass-outline' : 'download-outline'}
                    size={20}
                    color="#FFFFFF"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.pdfDownloadBtnText}>
                    {isGeneratingPdf
                      ? 'Generating Multi-Page PDF...'
                      : `Download ${formatMonthDisplay(pdfExportMonth)} PDF`}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ==================== 6. SET CATEGORY LIMIT MODAL ==================== */}
        <Modal
          visible={limitModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setLimitModalVisible(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity
              style={styles.modalBackdropDismiss}
              activeOpacity={1}
              onPress={() => setLimitModalVisible(false)}
            />
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.settingsActionIconWrap, { backgroundColor: '#EFF6FF', width: 34, height: 34 }]}>
                    <Ionicons name="pricetags" size={18} color="#2563EB" />
                  </View>
                  <View>
                    <Text style={styles.modalTitle}>Set Category Monthly Limit</Text>
                    <Text style={styles.settingSubLabel}>Budget will auto-reduce with expenses</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setLimitModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
                {/* Category Selection / Input */}
                <Text style={styles.inputLabel}>Select or Type Category Name</Text>
                
                {/* Quick category chips to pick from */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  {['Food', 'Petrol', 'Service', 'Kirana & Groceries', 'Shopping & Clothes', 'Chai & Snacks', 'Mobile, Electricity & Bills'].map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.categoryChip,
                        limitCategoryName.toLowerCase() === c.toLowerCase() && {
                          backgroundColor: '#EFF6FF',
                          borderColor: '#2563EB',
                        },
                      ]}
                      onPress={() => setLimitCategoryName(c)}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          limitCategoryName.toLowerCase() === c.toLowerCase() && {
                            color: '#2563EB',
                            fontWeight: '700',
                          },
                        ]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TextInput
                  style={styles.input}
                  placeholder="e.g. Food, Petrol, Service, Groceries..."
                  placeholderTextColor="#94A3B8"
                  value={limitCategoryName}
                  onChangeText={setLimitCategoryName}
                />

                {/* Monthly Limit Amount */}
                <Text style={styles.inputLabel}>Monthly Limit Amount (₹)</Text>
                <TextInput
                  style={[styles.input, { fontSize: 20, fontWeight: '700', color: '#0F172A' }]}
                  placeholder="e.g. 2000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={limitAmountInput}
                  onChangeText={setLimitAmountInput}
                />

                {/* Quick Amount Suggestion Buttons */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {[500, 1000, 2000, 3000, 5000].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={styles.quickAmountBtn}
                      onPress={() => setLimitAmountInput(String(val))}
                    >
                      <Text style={styles.quickAmountBtnText}>₹{val}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Save Button */}
                <TouchableOpacity
                  style={[styles.saveButton, { backgroundColor: '#2563EB' }]}
                  onPress={() => handleSaveCategoryLimit()}
                >
                  <Text style={styles.saveButtonText}>Save Category Limit</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ==================== 1. INSTAGRAM-STYLE ACCOUNT SWITCHER BOTTOM SHEET ==================== */}
        <Modal
          visible={profileSwitcherVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setProfileSwitcherVisible(false)}
        >
          <View style={styles.sheetOverlay}>
            <TouchableOpacity
              style={styles.sheetBackdropDismiss}
              activeOpacity={1}
              onPress={() => setProfileSwitcherVisible(false)}
            />
            <View style={styles.sheetContainer}>
              {/* Instagram-style drag indicator handle */}
              <View style={styles.sheetHandleBar} />

              <View style={styles.sheetHeaderRow}>
                <View>
                  <Text style={styles.sheetTitle}>Switch Account</Text>
                  <Text style={styles.sheetSubtitle}>
                    Separate money for yourself, mother &amp; friends
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.sheetCloseBtn}
                  onPress={() => setProfileSwitcherVisible(false)}
                >
                  <Ionicons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ maxHeight: 380 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 16 }}
              >
                {profiles.map((p) => {
                  const isActive = p.id === activeProfile.id;
                  const stat = profileStats.find((s) => s.profile.id === p.id);
                  const pBalance = stat ? stat.balance : (isActive ? allTimeWallet.totalBalance : 0);
                  const pCount = stat ? stat.txCount : (isActive ? allTimeWallet.transactionCount : 0);

                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.instagramProfileItem,
                        isActive && styles.instagramProfileItemActive,
                      ]}
                      onPress={() => handleSwitchProfile(p.id)}
                      activeOpacity={0.7}
                    >
                      {/* Avatar with Story-like border when active */}
                      <View
                        style={[
                          styles.instagramAvatarRing,
                          { borderColor: isActive ? p.color || '#2563EB' : '#E2E8F0' },
                        ]}
                      >
                        <View style={[styles.instagramAvatarInner, { backgroundColor: p.color || '#2563EB' }]}>
                          <Ionicons name={(p.icon || 'person') as any} size={20} color="#FFFFFF" />
                        </View>
                      </View>

                      {/* Profile Details */}
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.instagramProfileName, isActive && { color: '#0F172A', fontWeight: '800' }]}>
                            {p.name}
                          </Text>
                          {isActive && (
                            <View style={styles.currentActiveBadge}>
                              <Text style={styles.currentActiveBadgeText}>Active</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.instagramProfileStats}>
                          Net: <Text style={{ fontWeight: '700', color: pBalance >= 0 ? '#16A34A' : '#DC2626' }}>{formatINR(pBalance)}</Text> • {pCount} records
                        </Text>
                      </View>

                      {/* Instagram-style Radio Checkmark */}
                      <View style={styles.instagramRadioWrap}>
                        {isActive ? (
                          <View style={[styles.instagramRadioSelected, { backgroundColor: p.color || '#2563EB' }]}>
                            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                          </View>
                        ) : (
                          <View style={styles.instagramRadioUnselected} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* + Add Profile Button (Like Instagram '+ Add Account') */}
                <TouchableOpacity
                  style={styles.instagramAddAccountBtn}
                  onPress={openAddProfileModal}
                  activeOpacity={0.7}
                >
                  <View style={styles.instagramAddAccountIconWrap}>
                    <Ionicons name="add" size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={styles.instagramAddAccountText}>Add Profile / Person</Text>
                    <Text style={styles.instagramAddAccountSub}>
                      e.g. Mother, Friend, Santhosh, Roommates
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ==================== 2. CREATE / EDIT PROFILE MODAL ==================== */}
        <Modal
          visible={addProfileModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setAddProfileModalVisible(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity
              style={styles.modalBackdropDismiss}
              activeOpacity={1}
              onPress={() => Keyboard.dismiss()}
            />
            <View style={styles.profileModalCard}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    {editingProfile ? 'Edit Profile' : 'New Profile'}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    Separate money for individual people
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setAddProfileModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Live Preview Avatar */}
                <View style={styles.profilePreviewWrap}>
                  <View style={[styles.profilePreviewAvatar, { backgroundColor: selectedProfileColor }]}>
                    <Ionicons name={selectedProfileIcon as any} size={36} color="#FFFFFF" />
                  </View>
                  <Text style={styles.profilePreviewName}>
                    {profileNameInput.trim() || 'Profile Name'}
                  </Text>
                  <Text style={styles.profilePreviewSub}>
                    Expenses &amp; Wallets will be isolated
                  </Text>
                </View>

                {/* Profile Name Input */}
                <Text style={styles.inputLabel}>Profile Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Mother, Friend, Karthik, Family"
                  placeholderTextColor="#94A3B8"
                  value={profileNameInput}
                  onChangeText={setProfileNameInput}
                  maxLength={30}
                />

                {/* Quick Name Presets */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {['My Money', 'Mother', 'Father', 'Friend', 'Roommates', 'Office'].map((preset) => (
                    <TouchableOpacity
                      key={preset}
                      style={[
                        styles.quickPresetPill,
                        profileNameInput === preset && styles.quickPresetPillActive,
                      ]}
                      onPress={() => {
                        setProfileNameInput(preset);
                        if (preset === 'Mother') {
                          setSelectedProfileColor('#EC4899');
                          setSelectedProfileIcon('heart');
                        } else if (preset === 'Friend' || preset === 'Roommates') {
                          setSelectedProfileColor('#10B981');
                          setSelectedProfileIcon('people');
                        } else if (preset === 'Office') {
                          setSelectedProfileColor('#8B5CF6');
                          setSelectedProfileIcon('briefcase');
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.quickPresetText,
                          profileNameInput === preset && styles.quickPresetTextActive,
                        ]}
                      >
                        {preset}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Color Selector */}
                <Text style={styles.inputLabel}>Avatar Color</Text>
                <View style={styles.colorPaletteRow}>
                  {[
                    '#2563EB', // Blue
                    '#EC4899', // Pink (Mom)
                    '#10B981', // Emerald (Friend)
                    '#F59E0B', // Amber
                    '#8B5CF6', // Purple
                    '#06B6D4', // Cyan
                    '#EF4444', // Red
                    '#059669', // Teal
                  ].map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: c },
                        selectedProfileColor === c && styles.colorCircleSelected,
                      ]}
                      onPress={() => setSelectedProfileColor(c)}
                    >
                      {selectedProfileColor === c && (
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Icon Selector */}
                <Text style={styles.inputLabel}>Avatar Icon</Text>
                <View style={styles.iconPaletteRow}>
                  {[
                    { id: 'person', label: 'Person' },
                    { id: 'heart', label: 'Heart' },
                    { id: 'people', label: 'Friends' },
                    { id: 'home', label: 'Home' },
                    { id: 'briefcase', label: 'Work' },
                    { id: 'wallet', label: 'Savings' },
                    { id: 'card', label: 'Card' },
                    { id: 'school', label: 'Study' },
                  ].map((ic) => (
                    <TouchableOpacity
                      key={ic.id}
                      style={[
                        styles.iconCircle,
                        selectedProfileIcon === ic.id && {
                          backgroundColor: selectedProfileColor + '20',
                          borderColor: selectedProfileColor,
                        },
                      ]}
                      onPress={() => setSelectedProfileIcon(ic.id)}
                    >
                      <Ionicons
                        name={ic.id as any}
                        size={20}
                        color={selectedProfileIcon === ic.id ? selectedProfileColor : '#64748B'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Save Button */}
                <TouchableOpacity
                  style={[styles.saveButton, { backgroundColor: selectedProfileColor, marginTop: 12 }]}
                  onPress={handleSaveProfile}
                >
                  <Text style={styles.saveButtonText}>
                    {editingProfile ? 'Save Changes' : 'Create & Switch to Profile'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </SafeAreaView>
    {showSplash && (
      <View style={styles.splashOverlayContainer}>
        <SplashScreen key={splashKey} onFinish={() => setShowSplash(false)} />
      </View>
    )}
  </View>
  );
}

const isWeb = Platform.OS === 'web';

const ANDROID_BOTTOM_NAV_HEIGHT = Platform.OS === 'android' ? 40 : 0;

const styles = StyleSheet.create({
  rootWrapper: {
    flex: 1,
    backgroundColor: '#040814',
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  splashOverlayContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 999999,
    elevation: 999999,
  },
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3B82F633',
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
    paddingBottom: 110,
  },
  totalBalanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
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
    flexWrap: 'wrap',
    gap: 8,
  },
  totalBalanceLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    letterSpacing: 0.6,
    flexShrink: 1,
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
    minWidth: 0,
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
    flexShrink: 0,
  },
  transactionDetails: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
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
    flexShrink: 1,
  },
  walletPillSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 6,
    flexShrink: 0,
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
  transferPill: {
    backgroundColor: '#F5F3FF',
    borderWidth: 0.5,
    borderColor: '#C7D2FE',
  },
  transferPillText: {
    color: '#4F46E5',
  },
  transactionMeta: {
    fontSize: 11,
    color: '#64748B',
    flexShrink: 1,
  },
  transactionNotes: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  amountCol: {
    alignItems: 'flex-end',
    marginLeft: 8,
    flexShrink: 0,
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
  splashPreviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    marginBottom: 4,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  splashPreviewIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashPreviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  splashPreviewDesc: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
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
  modalBackdropDismiss: {
    flex: 1,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    width: '100%',
  },
  modalScrollContent: {
    paddingBottom: 160, // Extra space so all inputs (Date, Notes, Save button) can scroll comfortably above mobile keyboard
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
  modalSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
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
  typeButtonActiveTransfer: {
    backgroundColor: '#4F46E5',
  },
  headerTransferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 4,
  },
  headerTransferBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  transferDirectionSection: {
    marginBottom: 14,
  },
  transferOptionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  transferOptionCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
  },
  transferOptionCardActiveCashToUpi: {
    backgroundColor: '#F5F3FF',
    borderColor: '#6366F1',
  },
  transferOptionCardActiveUpiToCash: {
    backgroundColor: '#F0F9FF',
    borderColor: '#0EA5E9',
  },
  transferOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  transferOptionEmoji: {
    fontSize: 16,
  },
  transferBadgeMini: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  transferBadgeMiniActiveCash: {
    backgroundColor: '#EEF2FF',
  },
  transferBadgeMiniActiveUpi: {
    backgroundColor: '#E0F2FE',
  },
  transferBadgeMiniText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  transferBadgeMiniTextActive: {
    color: '#4F46E5',
  },
  transferOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  transferOptionTitleActive: {
    color: '#1E1B4B',
  },
  transferOptionSub: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 13,
    marginBottom: 6,
  },
  transferAvailText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  transferInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 2,
  },
  transferInfoText: {
    fontSize: 11,
    color: '#3730A3',
    lineHeight: 15,
    flex: 1,
  },
  transferPresetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 8,
  },
  transferPresetChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  transferPresetChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  transferAmountPresetsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  transferAmountPresetChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  transferAmountPresetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
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
  dateLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  calendarPickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  calendarPickerTriggerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  quickDateChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  quickDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickDateChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  quickDateChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  quickDateChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  openCalendarBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePreviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  datePreviewText: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
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

  // Custom Category Box in Modal
  customCatBox: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    marginTop: 10,
    marginBottom: 6,
  },
  customCatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  customCatTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3730A3',
  },
  customCatInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A5B4FC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  customCatHint: {
    fontSize: 11,
    color: '#4F46E5',
    marginTop: 6,
    fontWeight: '500',
  },

  // Month Selector Bar
  monthSelectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  monthArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCenterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthCenterTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  currentBadgeBtn: {
    marginLeft: 8,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },

  // Monthly Charts Container Card
  chartsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  chartsCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartsCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  chartsCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },

  // Chart Switcher Tabs
  chartSwitcherRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  chartSwitchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  chartSwitchBtnActive: {
    backgroundColor: '#2563EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  chartSwitchBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  chartSwitchBtnTextActive: {
    color: '#FFFFFF',
  },

  // Empty Chart
  chartEmptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
  },
  chartEmptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 8,
  },
  chartEmptySub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },

  // Pie Chart Styles
  pieContainer: {
    alignItems: 'center',
    width: '100%',
  },
  svgRelativeWrap: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 4,
  },
  donutCenterHole: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterCategory: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    textAlign: 'center',
    maxWidth: 90,
  },
  donutCenterAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    maxWidth: 95,
  },
  donutCenterPercent: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '800',
  },
  donutCenterSub: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },

  // Spotlight card
  spotlightCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1.5,
    marginTop: 10,
  },
  spotlightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spotlightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  spotlightCategoryName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  spotlightDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  spotlightTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  spotlightWallets: {
    flexDirection: 'row',
    gap: 10,
  },
  spotlightWalletText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },

  // Pie Legend Chips
  pieLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginTop: 14,
    width: '100%',
  },
  pieLegendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: '48%',
  },
  pieLegendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 5,
  },
  pieLegendLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    flexShrink: 1,
    marginRight: 4,
  },
  pieLegendPercent: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },

  // Category Histogram Styles
  histogramCardContainer: {
    width: '100%',
    paddingVertical: 4,
  },
  histogramSubHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  catHistogramRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  catHistCol: {
    alignItems: 'center',
    width: 64,
  },
  catHistValText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  catHistBarWrapper: {
    width: 24,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  catHistIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  catHistNameText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2,
    textAlign: 'center',
    maxWidth: 60,
  },
  catHistPercentText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748B',
  },
  chartLegendFoot: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },

  // Daily Histogram Styles
  dailyHeaderMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dailyActiveCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dailyHistBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  dailyHistCol: {
    alignItems: 'center',
    width: 22,
  },
  dailyHistVal: {
    fontSize: 8,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  dailyHistBarTrack: {
    width: 14,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  dailyHistDayLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 4,
  },

  // Dashboard Period View Toggle
  dashboardViewToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    padding: 2,
    flexShrink: 0,
  },
  dashboardTogglePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  dashboardTogglePillActive: {
    backgroundColor: '#2563EB',
  },
  dashboardToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  dashboardToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  homeMonthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 4,
  },
  monthNavMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  monthNavMiniText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  homeMonthNavLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },

  // History Period Filter
  historyPeriodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    width: '100%',
  },
  historyPeriodPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  activeHistoryPeriodPill: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  historyPeriodPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  activeHistoryPeriodPillText: {
    color: '#2563EB',
    fontWeight: '700',
  },

  // Calendar Modal Styles
  calendarModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 20,
    marginVertical: 'auto',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  calendarDaysHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  calendarDayHeaderCell: {
    width: 38,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  calendarDayCell: {
    width: `${100 / 7}%`,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  calendarDayCellActiveBtn: {
    borderRadius: 19,
  },
  calendarDaySelected: {
    backgroundColor: '#2563EB',
  },
  calendarDayToday: {
    borderWidth: 1.5,
    borderColor: '#2563EB',
  },
  calendarDayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  calendarDaySelectedText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  calendarDayTodayText: {
    color: '#2563EB',
    fontWeight: '800',
  },
  calendarCancelBtn: {
    marginTop: 14,
    paddingVertical: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
  },
  calendarCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },

  // PDF Statement Styles
  homeMonthPdfBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  homeMonthPdfBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  analyticsPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  analyticsPdfBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  pdfExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pdfExportBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  pdfMonthSelectorCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  pdfCardSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  pdfMonthPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pdfMonthArrowBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfSelectedMonthText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  pdfPreviewCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  pdfStatsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  pdfStatItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
  },
  pdfStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  pdfStatVal: {
    fontSize: 14,
    fontWeight: '800',
    marginVertical: 2,
  },
  pdfStatSub: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
  pdfNetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  pdfNetLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  pdfNetVal: {
    fontSize: 14,
    fontWeight: '800',
  },
  pdfFeaturesBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 16,
  },
  pdfFeaturesTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pdfFeatureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  pdfFeatureText: {
    flex: 1,
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
  },
  pdfDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#2563EB',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  pdfDownloadBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Category Limit Toggle & Menu Styles
  categoryLimitToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  limitSwitchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    padding: 2,
    justifyContent: 'center',
  },
  limitSwitchTrackActive: {
    backgroundColor: '#2563EB',
  },
  limitSwitchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  limitSwitchThumbActive: {
    alignSelf: 'flex-end',
  },
  categoryLimitsMenuBox: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  catLimitsMenuHeader: {
    marginBottom: 12,
  },
  catLimitsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  catLimitsTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  catLimitsMenuTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  monthBadgeMini: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  monthBadgeMiniText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  catLimitsMenuSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 15,
  },
  addCategoryLimitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexShrink: 0,
  },
  addCategoryLimitBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  presetBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  presetTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  presetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
  },
  catLimitCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  catLimitCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  catLimitIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLimitCardName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  catLimitCardSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  catLimitActionBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catLimitProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catLimitRemainingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
    minWidth: 85,
    textAlign: 'right',
  },

  // Category Budget Live Card inside Add Modal
  catBudgetBanner: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginBottom: 6,
  },
  catBudgetTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  catBudgetTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  catRemainingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  catRemainingBadgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  catRemainingBadgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  catRemainingBadgeDanger: {
    backgroundColor: '#FEE2E2',
  },
  catRemainingBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  catRemainingBadgeTextSuccess: {
    color: '#15803D',
  },
  catRemainingBadgeTextWarning: {
    color: '#B45309',
  },
  catRemainingBadgeTextDanger: {
    color: '#B91C1C',
  },
  catBudgetDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  catBudgetSubText: {
    fontSize: 10.5,
    color: '#64748B',
  },
  catBudgetWarningText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 6,
  },
  categoryChipLimitBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2563EB',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  quickAmountBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  quickAmountBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },

  // ==================== PROFILE SWITCHER & ACCOUNTS STYLES ====================
  profileHeaderSwitcherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 14,
    marginTop: 3,
    alignSelf: 'flex-start',
    gap: 5,
  },
  profileHeaderSwitcherName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    maxWidth: 120,
  },
  profileAvatarMini: {
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerProfileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 2,
  },
  headerProfileInnerAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalProfilePillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginHorizontal: 18,
    marginBottom: 10,
    gap: 6,
  },
  modalProfilePillText: {
    fontSize: 11.5,
    color: '#475569',
  },

  // Bottom Sheet Switcher (Instagram Style)
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetBackdropDismiss: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHandleBar: {
    width: 40,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sheetCloseBtn: {
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },

  // Instagram Profile Item in Sheet
  instagramProfileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  instagramProfileItemActive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  instagramAvatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instagramAvatarInner: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instagramProfileName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#334155',
  },
  instagramProfileStats: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  currentActiveBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  currentActiveBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  instagramRadioWrap: {
    marginLeft: 8,
  },
  instagramRadioSelected: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instagramRadioUnselected: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
  },
  instagramAddAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    backgroundColor: '#FAFAFA',
  },
  instagramAddAccountIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instagramAddAccountText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  instagramAddAccountSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },

  // Profile Modal (Create / Edit)
  profileModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '92%',
    maxWidth: 420,
    maxHeight: '85%',
  },
  profilePreviewWrap: {
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  profilePreviewAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  profilePreviewName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  profilePreviewSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  quickPresetPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickPresetPillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  quickPresetText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  quickPresetTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  colorPaletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#0F172A',
  },
  iconPaletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Settings Screen Profiles Management Section
  profileSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addProfileHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addProfileHeaderBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileActiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  profileAvatarLarge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileActiveName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  profileActiveSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  activeProfileBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  activeProfileBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#15803D',
  },
  profileListWrap: {
    gap: 6,
  },
  profileRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  profileRowItemActive: {
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FAFC',
  },
  profileRowLeftTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileAvatarMedium: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileRowName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  profileRowNameActive: {
    color: '#2563EB',
  },
  profileRowStatus: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  profileRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profileRowActionBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
});
