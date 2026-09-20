import type { TransactionRow } from '../types';

declare global {
  interface Window {
    google?: any;
  }
}

const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '636125238631-ogb8gfuglqji2u9gn6tj5hmkhb39pcb5.apps.googleusercontent.com';

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

let tokenClient: any = null;
let accessToken: string | null = null;

/**
 * Initialize Google Token Client if Google script is loaded
 */
export function initGoogleAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);

    const checkInterval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(checkInterval);
        try {
          tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: () => {}, // overridden per request
          });
          resolve(true);
        } catch (err) {
          console.error('Failed to init Google OAuth client', err);
          resolve(false);
        }
      }
    }, 100);

    // Timeout after 5s
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve(!!window.google?.accounts?.oauth2);
    }, 5000);
  });
}

/**
 * Request Access Token via 1-click popup
 */
export function requestGoogleAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      return reject(new Error('Google Identity Services script not yet loaded. Please refresh.'));
    }

    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: () => {},
      });
    }

    tokenClient.callback = (resp: any) => {
      if (resp.error) {
        return reject(new Error(resp.error_description || resp.error));
      }
      accessToken = resp.access_token;
      resolve(resp.access_token);
    };

    // Prompt user
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'select_account' });
  });
}

/**
 * Get cached access token or request one with 1-click popup
 */
export async function getValidAccessToken(): Promise<string> {
  if (accessToken) return accessToken;
  return requestGoogleAccessToken();
}

const PERSISTENT_SHEET_ID_KEY = 'statement_importer_primary_sheet_id';

/**
 * Sync transactions to a single Master Google Sheet with an "Imported At" timestamp separator.
 * Reuses the existing Google Sheet across multiple imports instead of creating a new one each time.
 */
export async function syncToMasterSheet(
  transactions: TransactionRow[],
  targetSpreadsheetIdOrUrl?: string,
  tabName: string = 'Transactions'
): Promise<{ success: boolean; spreadsheetUrl?: string; message: string; rowsAdded?: number }> {
  try {
    const token = await getValidAccessToken();

    // 1. Determine spreadsheet ID:
    // Priority 1: User explicitly provided URL/ID
    // Priority 2: Stored Master Sheet ID from previous sync
    let spreadsheetId: string | null = null;

    if (targetSpreadsheetIdOrUrl && targetSpreadsheetIdOrUrl.trim()) {
      const match = targetSpreadsheetIdOrUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      spreadsheetId = match ? match[1] : targetSpreadsheetIdOrUrl.trim();
    }

    if (!spreadsheetId) {
      spreadsheetId = localStorage.getItem(PERSISTENT_SHEET_ID_KEY);
    }

    const currentTimestamp = new Date().toLocaleString('en-US', {
      dateStyle: 'short',
      timeStyle: 'medium',
    });

    const sheetTab = tabName || 'Transactions';

    // 2. If no sheet exists yet, create the Master Sheet once
    if (!spreadsheetId) {
      const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            title: 'Bank Statement Imports (Master)',
          },
          sheets: [
            {
              properties: {
                title: sheetTab,
              },
            },
          ],
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err?.error?.message || 'Failed to create Master Google Sheet');
      }

      const sheetData = await createRes.json();
      spreadsheetId = sheetData.spreadsheetId;

      if (spreadsheetId) {
        localStorage.setItem(PERSISTENT_SHEET_ID_KEY, spreadsheetId);
      }

      // Add Headers to new sheet
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTab)}!A1:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            range: `${sheetTab}!A1`,
            majorDimension: 'ROWS',
            values: [['Date', 'Price Paid', 'Charge Information', 'Imported At']],
          }),
        }
      );
    }

    // 3. Format rows with the separation field for Timestamp
    const rows = transactions.map((t) => [
      t.date,
      t.pricePaid,
      t.chargeInformation,
      currentTimestamp,
    ]);

    // 4. Append transactions to the persistent master sheet
    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTab)}!A1:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: `${sheetTab}!A1`,
          majorDimension: 'ROWS',
          values: rows,
        }),
      }
    );

    if (!appendRes.ok) {
      const err = await appendRes.json();
      // If sheet ID was stale or deleted, clear cached ID so next click recreates cleanly
      if (err?.error?.code === 404) {
        localStorage.removeItem(PERSISTENT_SHEET_ID_KEY);
      }
      throw new Error(err?.error?.message || 'Failed to append rows to master sheet');
    }

    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    return {
      success: true,
      spreadsheetUrl,
      rowsAdded: transactions.length,
      message: `Appended ${transactions.length} rows with timestamp (${currentTimestamp}) into your Master Sheet!`,
    };
  } catch (error: any) {
    console.error('syncToMasterSheet error:', error);
    return {
      success: false,
      message: error.message || 'Failed to sync with Google Sheet.',
    };
  }
}

/**
 * Sync to an existing Google Spreadsheet by ID or Link (legacy helper)
 */
export async function syncToExistingSheet(
  spreadsheetIdOrUrl: string,
  tabName: string,
  transactions: TransactionRow[]
): Promise<{ success: boolean; message: string; rowsAdded?: number; spreadsheetUrl?: string }> {
  return syncToMasterSheet(transactions, spreadsheetIdOrUrl, tabName);
}

/**
 * 1-Click: Create or append to master sheet
 */
export async function createAndSyncNewSheet(
  _title: string,
  transactions: TransactionRow[]
): Promise<{ success: boolean; spreadsheetUrl?: string; message: string; rowsAdded?: number }> {
  return syncToMasterSheet(transactions);
}
