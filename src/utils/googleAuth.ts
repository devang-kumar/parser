import type { TransactionRow } from '../types';

declare global {
  interface Window {
    google?: any;
  }
}

const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '636125238631-ogb8gfuglqji2u9gn6tj5hmkhb39pcb5.apps.googleusercontent.com';

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file email profile openid';

export const PERSISTENT_SHEET_ID_KEY = 'statement_importer_primary_sheet_id';
export const GOOGLE_TOKEN_KEY = 'google_access_token';
export const GOOGLE_EXPIRY_KEY = 'google_token_expiry';
export const GOOGLE_CONNECTED_KEY = 'google_oauth_connected';
export const GOOGLE_EMAIL_KEY = 'google_user_email';
export const GOOGLE_NAME_KEY = 'google_user_name';
export const GOOGLE_PICTURE_KEY = 'google_user_picture';

let tokenClient: any = null;
let accessToken: string | null = null;

/**
 * Check if the user has connected their Google account once in configuration
 */
export function isGoogleConnected(): boolean {
  return localStorage.getItem(GOOGLE_CONNECTED_KEY) === 'true';
}

/**
 * Get connected Google Account details
 */
export function getConnectedGoogleAccount(): { email: string | null; name: string | null; picture: string | null } | null {
  if (!isGoogleConnected()) return null;
  return {
    email: localStorage.getItem(GOOGLE_EMAIL_KEY),
    name: localStorage.getItem(GOOGLE_NAME_KEY),
    picture: localStorage.getItem(GOOGLE_PICTURE_KEY),
  };
}

/**
 * Get the persistent master sheet ID if one was created
 */
export function getMasterSheetId(): string | null {
  return localStorage.getItem(PERSISTENT_SHEET_ID_KEY);
}

/**
 * Disconnect Google Account & clear all cached tokens
 */
export function disconnectGoogleAccount(): void {
  const token = localStorage.getItem(GOOGLE_TOKEN_KEY) || accessToken;
  if (token && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch (e) {
      console.warn('Revoke token warning:', e);
    }
  }
  accessToken = null;
  localStorage.removeItem(GOOGLE_TOKEN_KEY);
  localStorage.removeItem(GOOGLE_EXPIRY_KEY);
  localStorage.removeItem(GOOGLE_CONNECTED_KEY);
  localStorage.removeItem(GOOGLE_EMAIL_KEY);
  localStorage.removeItem(GOOGLE_NAME_KEY);
  localStorage.removeItem(GOOGLE_PICTURE_KEY);
}

/**
 * Fetch Google User Profile using the access token
 */
export async function getGoogleUserProfile(token: string): Promise<{ id: string; email: string; name: string; picture?: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Failed to retrieve user profile from Google');
  }
  const data = await res.json();
  const profile = {
    id: data.sub,
    email: data.email,
    name: data.name || data.email?.split('@')[0],
    picture: data.picture,
  };

  if (profile.email) localStorage.setItem(GOOGLE_EMAIL_KEY, profile.email);
  if (profile.name) localStorage.setItem(GOOGLE_NAME_KEY, profile.name);
  if (profile.picture) localStorage.setItem(GOOGLE_PICTURE_KEY, profile.picture);

  return profile;
}

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
 * Retrieve active non-expired access token from storage or memory
 */
export function getStoredAccessToken(): string | null {
  if (accessToken) return accessToken;
  const token = localStorage.getItem(GOOGLE_TOKEN_KEY);
  const expiry = localStorage.getItem(GOOGLE_EXPIRY_KEY);
  if (token && expiry) {
    const expiryTime = Number(expiry);
    // Buffer: consider token expired 60 seconds before actual expiration
    if (Date.now() < expiryTime - 60000) {
      accessToken = token;
      return token;
    }
  }
  return null;
}

/**
 * Request Access Token. Uses silent prompt ('') when forcePrompt=false
 */
export function requestGoogleAccessToken(forcePrompt: boolean = false): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      return reject(new Error('Google Identity Services script not yet loaded. Please refresh page.'));
    }

    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: () => {},
      });
    }

    tokenClient.callback = async (resp: any) => {
      if (resp.error) {
        // If silent request failed because consent or interaction is required, retry with interactive prompt
        if (!forcePrompt && (resp.error === 'interaction_required' || resp.error === 'consent_required' || resp.error === 'immediate_failed')) {
          try {
            const promptedToken = await requestGoogleAccessToken(true);
            return resolve(promptedToken);
          } catch (retryErr) {
            return reject(retryErr);
          }
        }
        return reject(new Error(resp.error_description || resp.error));
      }

      const token = resp.access_token;
      accessToken = token;
      const expiresInSec = Number(resp.expires_in) || 3599;
      const expiryTimestamp = Date.now() + expiresInSec * 1000;

      localStorage.setItem(GOOGLE_TOKEN_KEY, token);
      localStorage.setItem(GOOGLE_EXPIRY_KEY, expiryTimestamp.toString());
      localStorage.setItem(GOOGLE_CONNECTED_KEY, 'true');

      // Fetch user profile in background
      try {
        await getGoogleUserProfile(token);
      } catch (e) {
        console.warn('User profile fetch error:', e);
      }

      resolve(token);
    };

    // If forcePrompt is false, use prompt: '' to avoid intrusive popup if session is valid
    tokenClient.requestAccessToken({ prompt: forcePrompt ? 'select_account' : '' });
  });
}

/**
 * Get valid access token without opening account chooser if already authorized
 */
export async function getValidAccessToken(): Promise<string> {
  const cached = getStoredAccessToken();
  if (cached) return cached;

  // If user linked their account previously, attempt silent refresh first
  if (isGoogleConnected()) {
    try {
      return await requestGoogleAccessToken(false);
    } catch (silentErr) {
      console.warn('Silent refresh failed, requesting user interaction:', silentErr);
    }
  }

  // Otherwise prompt
  return requestGoogleAccessToken(true);
}

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

    let sheetTab = tabName || 'Transactions';

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
    } else {
      // If attaching to an existing spreadsheet:
      // Verify and resolve the sheet tab name to avoid "Unable to parse range" error
      try {
        const metaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (metaRes.ok) {
          const metaData = await metaRes.json();
          const titles: string[] = (metaData.sheets || []).map((s: any) => s.properties.title);
          if (!titles.includes(sheetTab) && titles.length > 0) {
            // Tab does not exist; use the first tab from the user's existing spreadsheet
            sheetTab = titles[0];
          }
        }
      } catch (err) {
        console.warn('Could not inspect sheet tab metadata:', err);
      }
    }

    // 3. Format rows with the separation field for Timestamp
    const rows = transactions.map((t) => [
      t.date,
      t.pricePaid,
      t.chargeInformation,
      currentTimestamp,
    ]);

    // Check if the target sheet tab is completely empty to add header row
    let rowsToAppend = rows;
    try {
      const checkRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTab)}!A1:D1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (!checkData.values || checkData.values.length === 0) {
          rowsToAppend = [['Date', 'Price Paid', 'Charge Information', 'Imported At'], ...rows];
        }
      }
    } catch {
      // If check fails, proceed with standard append
    }

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
          values: rowsToAppend,
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
      message: `Successfully synced ${transactions.length} rows to "${sheetTab}" tab!`,
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
