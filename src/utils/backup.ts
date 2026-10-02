import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { exportBackupData, exportToCSV, importBackupData } from '../database/db';

const IS_WEB = Platform.OS === 'web';

function downloadFileInBrowser(filename: string, content: string, mimeType: string) {
  if (typeof window === 'undefined' || !window.document) return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportBackupToFile(): Promise<{ success: boolean; message: string }> {
  try {
    const jsonData = exportBackupData();
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `expense_tracker_backup_${timestamp}.json`;

    if (IS_WEB) {
      downloadFileInBrowser(filename, jsonData, 'application/json');
      return { success: true, message: 'Backup file downloaded to your laptop!' };
    }

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, message: 'Sharing is not available on this device' };
    }

    const filePath = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(filePath, jsonData, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    await Sharing.shareAsync(filePath, {
      mimeType: 'application/json',
      dialogTitle: 'Export Expense Tracker JSON Backup',
      UTI: 'public.json',
    });

    return { success: true, message: 'Backup exported successfully!' };
  } catch (err: any) {
    return { success: false, message: `Export failed: ${err.message}` };
  }
}

export async function exportToSpreadsheetCSV(): Promise<{ success: boolean; message: string }> {
  try {
    const csvData = exportToCSV();
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `expenses_${timestamp}.csv`;

    if (IS_WEB) {
      downloadFileInBrowser(filename, csvData, 'text/csv');
      return { success: true, message: 'CSV file downloaded to your laptop!' };
    }

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, message: 'Sharing is not available on this device' };
    }

    const filePath = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(filePath, csvData, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    await Sharing.shareAsync(filePath, {
      mimeType: 'text/csv',
      dialogTitle: 'Export Expenses as CSV / Excel',
      UTI: 'public.comma-separated-values-text',
    });

    return { success: true, message: 'CSV exported successfully!' };
  } catch (err: any) {
    return { success: false, message: `CSV export failed: ${err.message}` };
  }
}

export function restoreBackup(jsonString: string) {
  return importBackupData(jsonString);
}
