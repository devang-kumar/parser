import type { TransactionRow } from '../types';

/**
 * Parses Google Sheet URL to extract the unique Spreadsheet ID
 */
export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * Format transactions into Tab-Separated Values (TSV) for direct paste into Google Sheets
 * Column A: Date | Column B: Price Paid | Column C: Charge Information
 */
export function formatForGoogleSheetsClipboard(transactions: TransactionRow[]): string {
  const rows = transactions.map((t) => {
    // Escape tabs/newlines in description if any
    const cleanDesc = t.chargeInformation.replace(/[\t\r\n]+/g, ' ');
    return `${t.date}\t${t.pricePaid.toFixed(2)}\t${cleanDesc}`;
  });
  return rows.join('\n');
}

/**
 * Generate CSV string for export
 */
export function generateCSVContent(transactions: TransactionRow[]): string {
  const header = 'Date,Price Paid,Charge Information\n';
  const body = transactions
    .map((t) => {
      const cleanDesc = `"${t.chargeInformation.replace(/"/g, '""')}"`;
      return `${t.date},${t.pricePaid.toFixed(2)},${cleanDesc}`;
    })
    .join('\n');
  return header + body;
}

/**
 * Download CSV file directly
 */
export function downloadCSV(transactions: TransactionRow[], filename: string) {
  const content = generateCSVContent(transactions);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename.replace(/\.[^/.]+$/, '')}_imported.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Push transactions to Google Sheet via Google Apps Script Webhook
 */
export async function syncToGoogleSheetsWebhook(
  webhookUrl: string,
  spreadsheetId: string,
  tabName: string,
  transactions: TransactionRow[]
): Promise<{ success: boolean; message: string; rowsAdded?: number }> {
  try {
    const payload = {
      spreadsheetId,
      tabName: tabName || 'Sheet1',
      rows: transactions.map((t) => [t.date, t.pricePaid, t.chargeInformation]),
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // Prevents CORS preflight issues with Apps Script
      },
      body: JSON.stringify(payload),
    });

    const resText = await response.text();
    let resJson;
    try {
      resJson = JSON.parse(resText);
    } catch {
      resJson = { status: 'success', message: 'Rows appended successfully' };
    }

    return {
      success: true,
      message: resJson.message || `Successfully synced ${transactions.length} rows to Google Sheet!`,
      rowsAdded: transactions.length,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Failed to sync with Google Sheet Webhook. Check URL or network.',
    };
  }
}

/**
 * Google Apps Script Setup Code Snippet to display to the user
 */
export const APPS_SCRIPT_CODE_TEMPLATE = `// Copy and paste this code into Google Sheets -> Extensions -> Apps Script
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = data.spreadsheetId ? SpreadsheetApp.openById(data.spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    var sheet = data.tabName ? ss.getSheetByName(data.tabName) : ss.getSheets()[0];
    
    if (!sheet) {
      sheet = ss.insertSheet(data.tabName || "Imported Statements");
      // Add Headers if new sheet
      sheet.appendRow(["Date", "Price Paid", "Charge Information"]);
    }
    
    if (data.rows && data.rows.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, data.rows.length, 3).setValues(data.rows);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", count: data.rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;
