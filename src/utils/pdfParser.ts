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
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', may_: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
};

/**
 * Universal Regexes for Dates
 * Supports:
 * - MM/DD/YYYY, MM/DD/YY, MM-DD-YYYY, MM.DD.YYYY, M/D/YY, M/D
 * - YYYY-MM-DD (ISO)
 * - DD-MMM-YYYY, DD MMM YYYY, DD MMM (e.g. 15 Jan 2025 or 15-JAN)
 * - MMM DD, MMM DD YYYY, MMM DD, YYYY (e.g. JAN 15, Jan 15, 2025)
 */
interface ParsedDateMatch {
  dateStr: string;
  matchedText: string;
  remainingText: string;
}

function matchUniversalDate(rawText: string): ParsedDateMatch | null {
  // Strip optional row numbers or card identifiers up to 6 digits (e.g. "6959 ", "001 ", "#1 ")
  const prefixMatch = rawText.match(/^(?:#?\d{1,6}\s+)/);
  const offset = prefixMatch ? prefixMatch[0].length : 0;
  const text = rawText.slice(offset).trim();

  // Pattern 1: ISO date: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = text.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})\b/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    if (isValidDateParts(m, d)) {
      return {
        dateStr: `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`,
        matchedText: isoMatch[0],
        remainingText: text.slice(isoMatch[0].length).trim(),
      };
    }
  }

  // Pattern 2: Numeric MM/DD/YYYY or MM/DD/YY or MM/DD
  const numericMatch = text.match(/^(\d{1,2})[\/\.-](\d{1,2})(?:[\/\.-](\d{2,4}))?\b/);
  if (numericMatch) {
    const [, m, d, y] = numericMatch;
    if (isValidDateParts(m, d)) {
      return {
        dateStr: formatDate(`${m}/${d}${y ? '/' + y : ''}`),
        matchedText: numericMatch[0],
        remainingText: text.slice(numericMatch[0].length).trim(),
      };
    }
  }

  // Pattern 3: Textual month first: JAN 15 or Jan 15, 2025
  const monthFirstMatch = text.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{2,4}))?\b/i);
  if (monthFirstMatch) {
    const [, monthStr, d, y] = monthFirstMatch;
    const cleanMonth = monthStr.toLowerCase().slice(0, 3);
    const m = MONTH_NAME_MAP[cleanMonth];
    if (m && isValidDateParts(m, d)) {
      return {
        dateStr: formatDate(`${m}/${d}${y ? '/' + y : ''}`),
        matchedText: monthFirstMatch[0],
        remainingText: text.slice(monthFirstMatch[0].length).trim(),
      };
    }
  }

  // Pattern 4: Day first: 15 JAN 2025 or 15-JAN-2025 or 15 JAN
  const dayFirstMatch = text.match(/^(\d{1,2})[\s\.-]([A-Za-z]{3,9})(?:[\s\.-](\d{2,4}))?\b/i);
  if (dayFirstMatch) {
    const [, d, monthStr, y] = dayFirstMatch;
    const cleanMonth = monthStr.toLowerCase().slice(0, 3);
    const m = MONTH_NAME_MAP[cleanMonth];
    if (m && isValidDateParts(m, d)) {
      return {
        dateStr: formatDate(`${m}/${d}${y ? '/' + y : ''}`),
        matchedText: dayFirstMatch[0],
        remainingText: text.slice(dayFirstMatch[0].length).trim(),
      };
    }
  }

  return null;
}

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

  // 1. Ignore headers, footers, summary lines, warnings, and informational blocks
  if (
    /^\s*TOTAL\b|^\s*SUBTOTAL\b|\bPAGE \d+|\bACCOUNT SUMMARY\b|\bANNUAL PERCENTAGE\b|\bMINIMUM PAYMENT\b|\bDUE DATE\b|\bREWARDS BALANCE\b/i.test(text) ||
    /\bPREVIOUS BALANCE\b|\bNEW BALANCE\b|\bCREDIT LIMIT\b|\bAVAILABLE CREDIT\b|\bDELIVER TO\b|\bCARDMEMBER SERVICE\b|\bPO BOX\b|\bCAROL STREAM\b/i.test(text) ||
    /\bYEAR-TO-DATE\b|\bTOTAL FEES CHARGED\b|\bTOTAL INTEREST CHARGED\b|\bBALANCE SUBJECT TO\b|\bINTEREST CHARGES\b|\bAUTOPAY IS ON\b/i.test(text) ||
    /\bCUSTOMER SERVICE\b|\bMANAGE YOUR ACCOUNT\b|\bDOWNLOAD THE\b|\bCHASE MOBILE\b|\bLATE PAYMENT WARNING\b|\bMINIMUM PAYMENT WARNING\b/i.test(text) ||
    /\bFEE SUMMARY\b|\bPROMOTIONAL RATE\b|\bAPR FOR\b|\bPURCHASES AND ADVANCES\b|\bSTATEMENT CLOSING\b|\bAMOUNT PAST DUE\b|\bFOR INQUIRIES\b/i.test(text) ||
    /\bBILLING PERIOD\b|\bSTATEMENT PERIOD\b|\bACCOUNT NUMBER\b|\bNOTICE: SEE REVERSE\b|\bTHIS PAGE INTENTIONALLY LEFT BLANK\b/i.test(text) ||
    /\bEXCLUSIONS APPLY\b|\bPROMO CODE\b|\bGREAT THINGS HAPPEN\b|\bIMPORTANT INFORMATION ABOUT\b/i.test(text)
  ) {
    return null;
  }

  // Reject standalone phone numbers or web addresses
  if (/^1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(text) || /^(https?:\/\/|www\.)\S+$/i.test(text)) {
    return null;
  }

  // 2. Extract Primary Date
  const dateMatch = matchUniversalDate(text);
  if (!dateMatch) {
    return null;
  }

  const rawDate = dateMatch.dateStr;
  let remaining = dateMatch.remainingText;

  // 3. Clean secondary date (Post Date / Process Date), Reference Numbers, Check Numbers
  // If next token is another date (e.g. "07/21 07/21"), consume it
  const postDateMatch = matchUniversalDate(remaining);
  if (postDateMatch) {
    remaining = postDateMatch.remainingText;
  }

  // Strip Check Numbers (e.g. "CHECK #1024", "CHK 502", "#1023")
  const checkMatch = remaining.match(/^(?:CHECK\s*(?:NO\.?|#)?|CHK\.?\s*#?)\s*(\d+)\b/i);
  if (checkMatch) {
    remaining = remaining.slice(checkMatch[0].length).trim();
  }

  // Strip long transaction reference numbers (e.g. "2402762JS1YYJA57Y", "F353100KN000BU230", "REF# 948271048")
  remaining = remaining.replace(/^(?:REF\s*#?[:\s]*)?[A-Z0-9]{15,32}\b\s*/i, '').trim();

  // 4. Extract Amount at the end of the line
  // Supports:
  // - Standard positive / negative: $12.34, 1,234.56, -45.00, +50.00
  // - Accounting parentheses: (12.34), ($1,000.00)
  // - Credit indicators: 45.00 CR, 100.00-, 50.00-
  // - Dual column balance output: e.g. "DEPOSIT 500.00  BALANCE 1,200.00" -> captures transaction amount
  const amountRegex = /(\(?[-+]?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}(?:\s?CR)?-?\)?)(?:\s+[-+]?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2})?$/i;
  const amountMatch = remaining.match(amountRegex);

  if (!amountMatch) {
    return null;
  }

  const rawAmountStr = amountMatch[1];
  const description = remaining.slice(0, remaining.lastIndexOf(rawAmountStr)).trim();

  // Validate description is meaningful
  if (!description || description.length < 2) {
    return null;
  }

  // Check description against header titles
  if (
    /^(?:date|transaction|description|amount|balance|charges|credits|deposits|withdrawals|ref|card)$/i.test(description) ||
    /opening\/closing date|payment due date|minimum payment due|new balance/i.test(description)
  ) {
    return null;
  }

  // 5. Clean and parse amount
  let cleanAmountStr = rawAmountStr.replace(/[\$,\s]/g, '');
  let isCredit = false;

  // Handle accounting parentheses: (50.00) = credit / negative
  if (cleanAmountStr.startsWith('(') && cleanAmountStr.endsWith(')')) {
    isCredit = true;
    cleanAmountStr = cleanAmountStr.slice(1, -1);
  }

  // Handle CR suffix: 50.00CR
  if (cleanAmountStr.toUpperCase().endsWith('CR')) {
    isCredit = true;
    cleanAmountStr = cleanAmountStr.slice(0, -2);
  }

  // Handle trailing minus: 50.00-
  if (cleanAmountStr.endsWith('-')) {
    isCredit = true;
    cleanAmountStr = cleanAmountStr.slice(0, -1);
  }

  let pricePaid = parseFloat(cleanAmountStr);
  if (isNaN(pricePaid)) return null;

  // Determine credit vs debit vs payment
  const isPaymentOrCreditText = /PAYMENT|CREDIT|THANK YOU|REFUND|REVERSAL|DEPOSIT|DIRECT DEP|PAYROLL|ACH CREDIT|CASHBACK/i.test(description);

  if (isCredit || sectionHint === 'PAYMENTS' || isPaymentOrCreditText) {
    if (pricePaid > 0) pricePaid = -pricePaid;
  }

  const pricePaidFormatted = pricePaid < 0 
    ? `-$${Math.abs(pricePaid).toFixed(2)}` 
    : `$${pricePaid.toFixed(2)}`;

  let txType: TransactionType = 'PURCHASE';
  if (pricePaid < 0 || isPaymentOrCreditText || sectionHint === 'PAYMENTS') {
    txType = 'CREDIT';
  } else if (/FEE|SURCHARGE|LATE CHARGE|OVERDRAFT|ANNUAL FEE/i.test(description) || sectionHint === 'FEE') {
    txType = 'FEE';
  } else if (/INTEREST CHARGE|FINANCE CHARGE/i.test(description)) {
    txType = 'INTEREST';
  }

  return {
    id: `${fileId}-row-${lineNum}-${Math.random().toString(36).substr(2, 5)}`,
    fileId,
    fileName,
    lineNum,
    date: rawDate,
    pricePaid,
    pricePaidFormatted,
    chargeInformation: cleanDescription(description),
    type: txType,
    rawLine: text,
    confidenceScore: 100,
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
      complete: (results: Papa.ParseResult<any>) => {
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

