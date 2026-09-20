import type { TransactionRow } from '../types';

declare global {
  interface Window {
    google?: any;
  }
}

const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '636125238631-u5armdp3pd15nr6tiaq1tonvjbu2mkpe.apps.googleusercontent.com';

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

/**
 * 1-Click: Create a brand new Google Sheet in the user's Google Drive and append transactions
 */
export async function createAndSyncNewSheet(
  title: string,
  transactions: TransactionRow[]
): Promise<{ success: boolean; spreadsheetUrl?: string; message: string; rowsAdded?: number }> {
  try {
    const token = await getValidAccessToken();

    // 1. Create Spreadsheet
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: title || `Statement Import - ${new Date().toLocaleDateString()}`,
        },
        sheets: [
          {
            properties: {
              title: 'Transactions',
            },
          },
        ],
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      console.error('Google Sheets create error:', err);
      const detail = err?.error?.message || JSON.stringify(err);
      throw new Error(`Google Sheets creation failed: ${detail}`);
    }

    const spreadsheet = await createRes.json();
    const spreadsheetId = spreadsheet.spreadsheetId;
    const spreadsheetUrl = spreadsheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // 2. Format headers & data rows
    const rows = [
      ['Date', 'Price Paid', 'Charge Information'],
      ...transactions.map((t) => [t.date, t.pricePaid, t.chargeInformation]),
    ];

    // 3. Append to created sheet (use encodeURIComponent for sheet title)
    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transactions!A1:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: 'Transactions!A1',
          majorDimension: 'ROWS',
          values: rows,
        }),
      }
    );

    if (!appendRes.ok) {
      const err = await appendRes.json();
      console.error('Google Sheets append error:', err);
      const detail = err?.error?.message || JSON.stringify(err);
      throw new Error(`Writing data to sheet failed: ${detail}`);
    }

    return {
      success: true,
      spreadsheetUrl,
      rowsAdded: transactions.length,
      message: `Created new spreadsheet and synced ${transactions.length} rows!`,
    };
  } catch (error: any) {
    console.error('createAndSyncNewSheet error:', error);
    return {
      success: false,
      message: error.message || 'Google OAuth sync failed.',
    };
  }
}

/**
 * Sync to an existing Google Spreadsheet by ID or Link
 */
export async function syncToExistingSheet(
  spreadsheetIdOrUrl: string,
  tabName: string,
  transactions: TransactionRow[]
): Promise<{ success: boolean; message: string; rowsAdded?: number; spreadsheetUrl?: string }> {
  try {
    const token = await getValidAccessToken();

    // Extract ID if full URL passed
    const match = spreadsheetIdOrUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const spreadsheetId = match ? match[1] : spreadsheetIdOrUrl.trim();

    if (!spreadsheetId) {
      throw new Error('Please provide a valid Google Sheet URL or ID.');
    }

    const sheetTab = tabName || 'Sheet1';
    const rows = transactions.map((t) => [t.date, t.pricePaid, t.chargeInformation]);

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
      throw new Error(err?.error?.message || 'Failed to append rows to existing sheet');
    }

    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    return {
      success: true,
      spreadsheetUrl,
      rowsAdded: transactions.length,
      message: `Successfully added ${transactions.length} rows to sheet!`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Failed to sync with Google Sheet.',
    };
  }
}
