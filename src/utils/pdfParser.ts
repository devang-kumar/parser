import * as pdfjsLib from 'pdfjs-dist';
import Papa from 'papaparse';
import type { TransactionRow, GroupType, TransactionType } from '../types';

// Configure pdfjs worker for Vite browser execution
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpatialLine {
  y: number;
  items: TextItem[];
  fullText: string;
}

/**
 * Main parser function supporting PDF, CSV, and Text files
 */
export async function parseStatementFile(
  file: File,
  fileId: string,
  group: GroupType
): Promise<TransactionRow[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'pdf') {
    return await parsePDFStatement(file, fileId, group);
  } else if (extension === 'csv' || extension === 'txt') {
    return await parseCSVStatement(file, fileId, group);
  } else {
    throw new Error(`Unsupported file type: .${extension}. Please upload a PDF or CSV statement.`);
  }
}

/**
 * High-Precision Spatial PDF Parser for Bank Statements
 * Groups text elements by exact physical vertical Y-coordinate line to eliminate row mixing
 */
async function parsePDFStatement(
  file: File,
  fileId: string,
  group: GroupType
): Promise<TransactionRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const allTransactions: TransactionRow[] = [];
  let globalLineCounter = 1;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // 1. Convert items into spatial elements
    const rawItems: TextItem[] = textContent.items
      .filter((item: any) => item.str && item.str.trim().length > 0)
      .map((item: any) => ({
        str: item.str,
        x: Math.round(item.transform[4] * 100) / 100,
        y: Math.round(item.transform[5] * 100) / 100, // Y coordinate in PDF space
        width: item.width || 0,
        height: item.height || 0,
      }));

    // 2. Group items into physical vertical lines (tolerance of 2.5 units)
    const lines: SpatialLine[] = [];
    const TOLERANCE = 2.5;

    // Sort items vertically (top to bottom: in PDF coordinates Y decreases downward)
    const sortedItems = [...rawItems].sort((a, b) => b.y - a.y);

    for (const item of sortedItems) {
      let matchedLine = lines.find((l) => Math.abs(l.y - item.y) <= TOLERANCE);
      if (matchedLine) {
        matchedLine.items.push(item);
      } else {
        lines.push({
          y: item.y,
          items: [item],
          fullText: '',
        });
      }
    }

    // Sort lines top to bottom strictly
    lines.sort((a, b) => b.y - a.y);

    // 3. For each line, sort horizontally left to right and construct full line text
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      line.fullText = line.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    }

    // 4. Parse transaction rows from reconstructed physical lines
    let currentSection: 'PAYMENTS' | 'PURCHASES' | 'FEE' | 'UNKNOWN' = 'UNKNOWN';

    for (const line of lines) {
      const text = line.fullText;

      // Section headers check
      if (/PAYMENTS AND OTHER CREDITS/i.test(text)) {
        currentSection = 'PAYMENTS';
        continue;
      } else if (/PURCHASE|TRANSACTIONS|CHARGES/i.test(text) && !/TOTAL|SUBTOTAL|YEAR-TO-DATE|SUMMARY/i.test(text)) {
        currentSection = 'PURCHASES';
        continue;
      } else if (/FEES AND INTEREST/i.test(text)) {
        currentSection = 'FEE';
        continue;
      }

      // Try extracting transaction from this specific line
      const parsed = extractTransactionFromLine(line, fileId, file.name, globalLineCounter, group, currentSection);
      if (parsed) {
        allTransactions.push(parsed);
        globalLineCounter++;
      }
    }
  }

  // Final check for duplicates within the same statement file
  markDuplicates(allTransactions);

  return allTransactions;
}

/**
 * Validates whether string components form a valid date (month 1-12, day 1-31)
 */
function isValidDateParts(monthStr: string, dayStr: string): boolean {
  const m = parseInt(monthStr, 10);
  const d = parseInt(dayStr, 10);
  return !isNaN(m) && !isNaN(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

const MONTH_NAME_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

/**
 * Extracts date, description, and price paid from a single spatial PDF line
 */
function extractTransactionFromLine(
  line: SpatialLine,
  fileId: string,
  fileName: string,
  lineNum: number,
  group: GroupType,
  sectionHint: 'PAYMENTS' | 'PURCHASES' | 'FEE' | 'UNKNOWN'
): TransactionRow | null {
  const text = line.fullText;

  // 1. Ignore summary lines, page headers, footers, address lines, phone numbers, interest schedules
  if (
    /TOTAL|SUBTOTAL|BALANCE|PAGE \d+|ACCOUNT SUMMARY|ANNUAL PERCENTAGE|MINIMUM PAYMENT|DUE DATE|POINTS/i.test(text) ||
    /PREVIOUS|NEW BALANCE|CREDIT LIMIT|AVAILABLE CREDIT|DELIVER TO|CARDMEMBER SERVICE|PO BOX|CAROL STREAM/i.test(text) ||
    /YEAR-TO-DATE|TOTAL FEES CHARGED|TOTAL INTEREST CHARGED|BALANCE SUBJECT TO|INTEREST CHARGES|AUTOPAY IS ON/i.test(text) ||
    /CUSTOMER SERVICE|MANAGE YOUR ACCOUNT|DOWNLOAD THE|CHASE MOBILE|LATE PAYMENT WARNING|MINIMUM PAYMENT WARNING/i.test(text)
  ) {
    return null;
  }

  // 2. Reject phone numbers at the start of line (e.g. 1-800-493-3319)
  if (/^1-\d{3}-\d{3}-\d{4}/.test(text)) {
    return null;
  }

  // 3. Regex patterns for Date:
  // Numeric: MM/DD or MM/DD/YY or MM/DD/YYYY or M/D
  // Textual: JAN 21, JUL 04, etc.
  let rawDate = '';
  let textAfterDate = '';

  const numericDateMatch = text.match(/^(\d{1,2})[\/\.-](\d{1,2})(?:[\/\.-](\d{2,4}))?\b/);
  const monthNameMatch = text.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:,?\s+(\d{2,4}))?\b/i);

  if (numericDateMatch) {
    const [, m, d] = numericDateMatch;
    if (!isValidDateParts(m, d)) return null;
    rawDate = numericDateMatch[0];
    textAfterDate = text.slice(numericDateMatch[0].length).trim();
  } else if (monthNameMatch) {
    const [, monthName, d, yearStr] = monthNameMatch;
    const mStr = MONTH_NAME_MAP[monthName.toLowerCase().slice(0, 3)];
    if (!mStr || !isValidDateParts(mStr, d)) return null;
    rawDate = yearStr ? `${mStr}/${d}/${yearStr}` : `${mStr}/${d}`;
    textAfterDate = text.slice(monthNameMatch[0].length).trim();
  } else {
    return null;
  }

  // 4. Find price amount at the end of the line
  // Handles: -32.76, -1,199.71, $50.00, 19.99, 118.52, -$50.00, 50.00 CR, 21.30-
  const amountRegex = /(-?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}(?:\s?CR)?-?)$/i;
  const amountMatch = textAfterDate.match(amountRegex);

  if (!amountMatch) {
    return null;
  }

  const rawAmountStr = amountMatch[1];
  const description = textAfterDate.slice(0, textAfterDate.lastIndexOf(rawAmountStr)).trim();

  if (!description || description.length < 2) {
    return null;
  }

  // Re-verify description doesn't contain non-transaction header phrases
  if (/opening\/closing date|payment due date|minimum payment due|new balance/i.test(description)) {
    return null;
  }

  // 5. Parse numerical amount cleanly
  let cleanAmountStr = rawAmountStr.replace(/[\$,\s]/g, '');
  let isCredit = false;

  if (cleanAmountStr.endsWith('CR')) {
    isCredit = true;
    cleanAmountStr = cleanAmountStr.replace('CR', '');
  } else if (cleanAmountStr.endsWith('-')) {
    isCredit = true;
    cleanAmountStr = '-' + cleanAmountStr.replace('-', '');
  }

  let pricePaid = parseFloat(cleanAmountStr);
  if (isNaN(pricePaid)) return null;

  if (isCredit || sectionHint === 'PAYMENTS') {
    if (pricePaid > 0) pricePaid = -pricePaid;
  }

  const pricePaidFormatted = pricePaid < 0 
    ? `-$${Math.abs(pricePaid).toFixed(2)}` 
    : `$${pricePaid.toFixed(2)}`;

  let txType: TransactionType = 'PURCHASE';
  if (pricePaid < 0 || sectionHint === 'PAYMENTS' || /PAYMENT|CREDIT|THANK YOU|REFUND/i.test(description)) {
    txType = 'CREDIT';
  } else if (/FEE|INTEREST|CHARGE/i.test(description)) {
    txType = 'FEE';
  }

  return {
    id: `${fileId}-row-${lineNum}-${Math.random().toString(36).substr(2, 5)}`,
    fileId,
    fileName,
    lineNum,
    date: formatDate(rawDate),
    pricePaid,
    pricePaidFormatted,
    chargeInformation: cleanDescription(description),
    type: txType,
    rawLine: text,
    confidenceScore: 100, // 100% Line sequence lock
    group,
  };
}

/**
 * CSV Statement Parser fallback
 */
async function parseCSVStatement(
  file: File,
  fileId: string,
  group: GroupType
): Promise<TransactionRow[]> {
  const text = await file.text();
  
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: TransactionRow[] = [];
        let lineCounter = 1;

        for (const rawRow of results.data as any[]) {
          const keys = Object.keys(rawRow);
          const dateKey = keys.find((k) => /date|time/i.test(k)) || keys[0];
          const amountKey = keys.find((k) => /price|amount|paid|value|cost/i.test(k)) || keys[1];
          const descKey = keys.find((k) => /desc|merchant|info|payee|name|details/i.test(k)) || keys[2];

          const dateVal = rawRow[dateKey];
          const amountVal = rawRow[amountKey];
          const descVal = rawRow[descKey];

          if (dateVal && amountVal && descVal) {
            const cleanAmtStr = String(amountVal).replace(/[\$,]/g, '').trim();
            const numAmt = parseFloat(cleanAmtStr);

            if (!isNaN(numAmt)) {
              rows.push({
                id: `${fileId}-csv-${lineCounter}-${Math.random().toString(36).substr(2, 5)}`,
                fileId,
                fileName: file.name,
                lineNum: lineCounter,
                date: formatDate(String(dateVal).trim()),
                pricePaid: numAmt,
                pricePaidFormatted: numAmt < 0 ? `-$${Math.abs(numAmt).toFixed(2)}` : `$${numAmt.toFixed(2)}`,
                chargeInformation: cleanDescription(String(descVal).trim()),
                type: numAmt < 0 ? 'CREDIT' : 'PURCHASE',
                rawLine: JSON.stringify(rawRow),
                confidenceScore: 100,
                group,
              });
              lineCounter++;
            }
          }
        }
        markDuplicates(rows);
        resolve(rows);
      },
      error: (err: any) => reject(err),
    });
  });
}

/**
 * Format raw date string into standard MM/DD/YYYY
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split(/[\/\.-]/);
  if (parts.length >= 2) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    let year = parts[2] || new Date().getFullYear().toString();
    if (year.length === 2) year = `20${year}`;
    return `${month}/${day}/${year}`;
  }
  return dateStr;
}

/**
 * Clean description text
 */
function cleanDescription(desc: string): string {
  return desc
    .replace(/^[\*\:\-\#\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mark duplicates based on exact date, price, and merchant match
 */
function markDuplicates(rows: TransactionRow[]) {
  const map = new Map<string, number>();

  for (const row of rows) {
    const key = `${row.date}|${row.pricePaid.toFixed(2)}|${row.chargeInformation.toLowerCase()}`;
    const count = (map.get(key) || 0) + 1;
    map.set(key, count);
    if (count > 1) {
      row.isDuplicate = true;
    }
  }
}

