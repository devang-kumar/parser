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

import { createWorker } from 'tesseract.js';

/**
 * Main parser function supporting PDF, CSV, Text, and Image files
 */
export async function parseStatementFile(
  file: File,
  fileId: string,
  group: GroupType
): Promise<TransactionRow[]> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (extension === 'pdf') {
    return await parsePDFStatement(file, fileId, group);
  } else if (extension === 'csv' || extension === 'txt') {
    return await parseCSVStatement(file, fileId, group);
  } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'gif'].includes(extension)) {
    return await parseImageStatement(file, fileId, group);
  } else {
    throw new Error(`Unsupported file type: .${extension}. Please upload a PDF, image (PNG/JPG), or CSV statement.`);
  }
}

/**
 * Parses image statements using Tesseract OCR
 */
async function parseImageStatement(
  file: File,
  fileId: string,
  group: GroupType
): Promise<TransactionRow[]> {
  const worker = await createWorker('eng');
  try {
    const ret = await worker.recognize(file);
    const text = ret.data.text || '';
    const rawLines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    const statementYear = detectStatementYear(text);
    const allTransactions: TransactionRow[] = [];
    let globalLineCounter = 1;
    let currentSection: 'PAYMENTS' | 'PURCHASES' | 'FEE' | 'UNKNOWN' = 'UNKNOWN';

    let i = 0;
    while (i < rawLines.length) {
      const rawLine = rawLines[i];
      const isTxDate = matchUniversalDate(rawLine, statementYear) !== null;

      if (!isTxDate) {
        const detected = detectSectionHeader(rawLine);
        if (detected) {
          currentSection = detected;
          i++;
          continue;
        }
      }

      const spatialLine: SpatialLine = {
        y: 0,
        items: [],
        fullText: rawLine,
      };

      let parsed = extractTransactionFromLine(spatialLine, fileId, file.name, globalLineCounter, group, currentSection, statementYear);

      if (!parsed && isTxDate) {
        let mergedText = rawLine;
        let nextIdx = i + 1;
        while (nextIdx < rawLines.length && nextIdx <= i + 2) {
          const nextText = rawLines[nextIdx];
          if (matchUniversalDate(nextText, statementYear) !== null) break;
          if (detectSectionHeader(nextText) !== null || /ACCOUNT SUMMARY|PREVIOUS BALANCE/i.test(nextText)) break;

          mergedText += ' ' + nextText;
          const mergedLine: SpatialLine = { y: 0, items: [], fullText: mergedText };
          parsed = extractTransactionFromLine(mergedLine, fileId, file.name, globalLineCounter, group, currentSection, statementYear);
          if (parsed) {
            i = nextIdx;
            break;
          }
          nextIdx++;
        }
      }

      if (parsed) {
        allTransactions.push(parsed);
        globalLineCounter++;
      }
      i++;
    }

    markDuplicates(allTransactions);
    return allTransactions;
  } finally {
    await worker.terminate();
  }
}

/**
 * Scans statement text for billing period dates or statement dates to detect context year
 */
function detectStatementYear(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ');

  // Look for Billing Period, Statement Period, Account Period, Opening/Closing Date
  const periodMatch = normalized.match(/(?:Billing|Statement|Account|Opening\/Closing|Opening)\s+(?:Period|Date)?[:\s]+(?:\d{1,2}[\/\.-]\d{1,2}[\/\.-](\d{2,4}))?[^\d\n]+(?:\d{1,2}[\/\.-]\d{1,2}[\/\.-](\d{2,4}))/i);
  if (periodMatch) {
    const yr = periodMatch[2] || periodMatch[1];
    if (yr) {
      return yr.length === 2 ? `20${yr}` : yr;
    }
  }

  // Check Closing Date / Statement Date / Payment Due Date / New Balance as of / Purchases Prior to
  const dateHeaderMatch = normalized.match(/(?:Closing\s+Date|Statement\s+Date|New\s+balance\s+as\s+of|Payment\s+due\s+date|Due\s+Date|Purchases\s+Prior\s+to|through|ending)[:\s]+\d{1,2}[\/\.-]\d{1,2}[\/\.-](\d{2,4})/i);
  if (dateHeaderMatch && dateHeaderMatch[1]) {
    const yr = dateHeaderMatch[1];
    return yr.length === 2 ? `20${yr}` : yr;
  }

  // Check Month + 4-digit year e.g. "August 2026"
  const monthYearMatch = normalized.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(202[0-9]|203[0-9])\b/i);
  if (monthYearMatch) {
    return monthYearMatch[1];
  }

  // Check "2025 totals year-to-date" or "Year-to-date totals (2025)"
  const ytdMatch = normalized.match(/\b(202[0-9]|203[0-9])\s+(?:totals\s+)?year-to-date/i);
  if (ytdMatch) {
    return ytdMatch[1];
  }

  // Scan all 4-digit years in dates
  const all4DigitYears = [...normalized.matchAll(/\b\d{1,2}[\/\.-]\d{1,2}[\/\.-](202[0-9]|203[0-9])\b/g)];
  if (all4DigitYears.length > 0) {
    const counts = new Map<string, number>();
    for (const m of all4DigitYears) {
      counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return sorted[0][0];
  }

  // Scan any dates with 2-digit years >= 20 (e.g. 10/01/25, 07/23/26)
  const all2DigitYears = [...normalized.matchAll(/\b\d{1,2}[\/\.-]\d{1,2}[\/\.-](2[0-9])\b/g)];
  if (all2DigitYears.length > 0) {
    const counts = new Map<string, number>();
    for (const m of all2DigitYears) {
      counts.set(`20${m[1]}`, (counts.get(`20${m[1]}`) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return sorted[0][0];
  }

  // Fallback to standalone year, excluding "Member Since" and copyright
  const textWithoutMemberSince = normalized.replace(/Member\s+Since\s+\d{4}|©\s*\d{4}/gi, '');
  const yearMatch = textWithoutMemberSince.match(/\b(202[0-9]|203[0-9])\b/);
  if (yearMatch) {
    return yearMatch[1];
  }
  return null;
}

/**
 * Detects whether a line represents a transaction section header
 * Supports Credit Card (Chase, Amex, Capital One, Citi, Discover, BofA, Wells Fargo, etc.)
 * and Bank Checking/Savings statements (Deposits, Withdrawals, Debits, Credits, Checks, etc.)
 */
function detectSectionHeader(text: string): 'PAYMENTS' | 'PURCHASES' | 'FEE' | null {
  const clean = text.trim();
  if (!clean || /TOTAL|SUBTOTAL|YEAR-TO-DATE|SUMMARY|WARNING|CALCULATION/i.test(clean)) {
    return null;
  }

  // 1. Payments, Credits, Deposits
  if (
    /\b(?:PAYMENTS?\s+(?:AND|&|\+)\s+(?:OTHER\s+)?CREDITS?|PAYMENTS?,?\s*CREDITS?\s+(?:AND|&|\+)\s+ADJUSTMENTS?|PAYMENTS?\s+(?:AND|&|\+)\s+CREDITS?|DEPOSITS?\s+(?:AND|&|\+)\s+ADDITIONS?|DEPOSITS?\s+(?:AND|&|\+)\s+(?:OTHER\s+)?CREDITS?|CREDIT\s+TRANSACTIONS?)\b/i.test(clean) ||
    /^\s*(?:PAYMENTS?|CREDITS?|DEPOSITS?)\s*$/i.test(clean)
  ) {
    return 'PAYMENTS';
  }

  // 2. Purchases, Debits, Withdrawals, Charges, Transactions
  if (
    /\b(?:STANDARD\s+)?PURCHASES?\b|\bPURCHASES?\s+(?:AND|&|\+)\s+OTHER\s+CHARGES?\b|\bPURCHASES?\s+(?:AND|&|\+)\s+(?:OTHER\s+)?DEBITS?\b|\bPURCHASES?\s+(?:AND|&|\+)\s+ADJUSTMENTS?\b|\bPURCHASES?\s+PRIOR\s+TO\b|\bNEW\s+CHARGES?\b|\bTRANSACTIONS?\b|\bCHARGES?\s+(?:AND|&|\+)\s+OTHER\s+DEBITS?\b|\bCHARGES?\s+(?:AND|&|\+)\s+OTHER\s+PURCHASES?\b|\bWITHDRAWALS?\s+(?:AND|&|\+)\s+DEDUCTIONS?\b|\bWITHDRAWALS?\s+(?:AND|&|\+)\s+OTHER\s+DEBITS?\b|\bATM\s+(?:&|AND|\+)\s+DEBIT\s+CARD\s+WITHDRAWALS?\b|\bCHECKS?\s+PAID\b|\bELECTRONIC\s+WITHDRAWALS?\b|\bDEBIT\s+CARD\s+PURCHASES?\b/i.test(clean) ||
    /^\s*(?:PURCHASES?|CHARGES?|WITHDRAWALS?|DEBITS?)\s*$/i.test(clean)
  ) {
    if (!/INTEREST|FEE|BALANCE/i.test(clean)) {
      return 'PURCHASES';
    }
  }

  // 3. Fees and Interest
  if (
    /\bFEES?\s+CHARGED\b|\bFEES?\s+(?:AND|&|\+)\s+INTEREST\b/i.test(clean) ||
    /^\s*FEES?\s*$/i.test(clean) ||
    /^\s*INTEREST\s+CHARGED\s*$/i.test(clean) ||
    (/\bINTEREST\s+CHARGED\b/i.test(clean) && !/\d+\.\d{2}/i.test(clean))
  ) {
    return 'FEE';
  }

  return null;
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
  let statementYear: string | null = null;

  // Pre-scan all pages for statement year
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items.map((it: any) => it.str).join(' ');
    const detected = detectStatementYear(pageText);
    if (detected) {
      statementYear = detected;
      break;
    }
  }

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

    // 4. Parse transaction rows from reconstructed physical lines with multi-line lookahead
    let currentSection: 'PAYMENTS' | 'PURCHASES' | 'FEE' | 'UNKNOWN' = 'UNKNOWN';
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const text = line.fullText;

      const isTxDate = matchUniversalDate(text, statementYear) !== null;

      // Section headers check ONLY when line does not start with a date
      if (!isTxDate) {
        const detected = detectSectionHeader(text);
        if (detected) {
          currentSection = detected;
          i++;
          continue;
        }
      }

      // Try extracting transaction from this specific line
      let parsed = extractTransactionFromLine(line, fileId, file.name, globalLineCounter, group, currentSection, statementYear);

      // Multi-line continuation: if this line has a date but no amount, check subsequent lines for the amount
      if (!parsed && isTxDate) {
        let mergedText = text;
        const mergedItems = [...line.items];
        let nextIdx = i + 1;
        while (nextIdx < lines.length && nextIdx <= i + 2) {
          const nextLine = lines[nextIdx];
          if (matchUniversalDate(nextLine.fullText, statementYear) !== null) break;
          if (detectSectionHeader(nextLine.fullText) !== null || /ACCOUNT SUMMARY|PREVIOUS BALANCE/i.test(nextLine.fullText)) break;

          mergedText += ' ' + nextLine.fullText;
          mergedItems.push(...nextLine.items);
          const combinedLine: SpatialLine = {
            y: line.y,
            items: mergedItems,
            fullText: mergedText,
          };
          parsed = extractTransactionFromLine(combinedLine, fileId, file.name, globalLineCounter, group, currentSection, statementYear);
          if (parsed) {
            i = nextIdx;
            break;
          }
          nextIdx++;
        }
      }

      if (parsed) {
        allTransactions.push(parsed);
        globalLineCounter++;
      }
      i++;
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

function matchUniversalDate(rawText: string, contextYear?: string | null): ParsedDateMatch | null {
  // Strip optional OCR margin artifacts, bullet points, row numbers or card identifiers (e.g. "o ", "= ", "w ", "#1 ", "6959 ", "| ")
  const prefixMatch = rawText.match(/^(?:(?:[=~_•\*\-\|\/\\oOwWcC»«\>\<\:\;]|\b#?\d{1,6}\b)\s+)+/);
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
      const yearToUse = y || contextYear || undefined;
      return {
        dateStr: formatDate(`${m}/${d}${yearToUse ? '/' + yearToUse : ''}`, contextYear),
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
      const yearToUse = y || contextYear || undefined;
      return {
        dateStr: formatDate(`${m}/${d}${yearToUse ? '/' + yearToUse : ''}`, contextYear),
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
      const yearToUse = y || contextYear || undefined;
      return {
        dateStr: formatDate(`${m}/${d}${yearToUse ? '/' + yearToUse : ''}`, contextYear),
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
  sectionHint: 'PAYMENTS' | 'PURCHASES' | 'FEE' | 'UNKNOWN',
  contextYear?: string | null
): TransactionRow | null {
  const text = line.fullText;

  // 1. Ignore headers, footers, summary lines, warnings, and informational blocks
  if (
    /^\s*TOTAL\b|^\s*SUBTOTAL\b|\bPAGE \d+|\bACCOUNT SUMMARY\b|\bANNUAL PERCENTAGE\b|\bMINIMUM PAYMENT\b|\bDUE DATE\b|\bREWARDS BALANCE\b/i.test(text) ||
    /\bPREVIOUS BALANCE\b|\bNEW BALANCE\b|\bCREDIT LIMIT\b|\bAVAILABLE CREDIT\b|\bDELIVER TO\b|\bCARDMEMBER SERVICE\b|\bPO BOX\b|\bCAROL STREAM\b/i.test(text) ||
    /\bYEAR-TO-DATE\b|\bTOTAL FEES CHARGED\b|\bTOTAL INTEREST CHARGED\b|\bBALANCE SUBJECT TO\b|\bINTEREST CHARGES\b|\bAUTOPAY IS ON\b/i.test(text) ||
    /\bCUSTOMER SERVICE\b|\bMANAGE YOUR ACCOUNT\b|\bDOWNLOAD THE\b|\bCHASE MOBILE\b|\bLATE PAYMENT WARNING\b|\bMINIMUM PAYMENT WARNING\b/i.test(text) ||
    /\bFEE SUMMARY\b|\bPROMOTIONAL RATE\b|\bAPR FOR\b|\bPURCHASES AND ADVANCES\b|\bSTATEMENT CLOSING\b|\bAMOUNT PAST DUE\b|\bFOR INQUIRIES\b/i.test(text) ||
    /\bBILLING PERIOD\b|\bSTATEMENT PERIOD\b|^\s*ACCOUNT NUMBER\b|\bACCOUNT NUMBER:\b|\bNOTICE: SEE REVERSE\b|\bTHIS PAGE INTENTIONALLY LEFT BLANK\b/i.test(text) ||
    /\bEXCLUSIONS APPLY\b|\bPROMO CODE\b|\bGREAT THINGS HAPPEN\b|\bIMPORTANT INFORMATION ABOUT\b/i.test(text)
  ) {
    return null;
  }

  // Reject standalone phone numbers or web addresses (ONLY if the entire line is just a phone or URL)
  if (/^\s*1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\s*$/.test(text) || /^\s*(https?:\/\/|www\.)\S+\s*$/i.test(text)) {
    return null;
  }

  // 2. Extract Primary Date
  const dateMatch = matchUniversalDate(text, contextYear);
  if (!dateMatch) {
    return null;
  }

  const rawDate = dateMatch.dateStr;
  let remaining = dateMatch.remainingText;

  // 3. Clean secondary date (Post Date / Process Date), Reference Numbers, Check Numbers
  // If next token is another date (e.g. "07/21 07/21"), consume it
  const postDateMatch = matchUniversalDate(remaining, contextYear);
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
  // - Standard positive / negative: $12.34, 1,234.56, -45.00, +50.00, - $45.00
  // - Accounting parentheses: (12.34), ($1,000.00), ( $12.34 )
  // - Credit indicators: 45.00 CR, 100.00-, 50.00-
  // - Dual column balance output: e.g. "DEPOSIT 500.00  BALANCE 1,200.00" -> captures transaction amount
  // - OCR dollar misrecognitions: S, s, § e.g. -S146.82
  const amountRegex = /(\(?[-+]?\s*[\$Ss§]?\s*\d{1,3}(?:,\d{3})*\.\d{2}(?:\s?CR)?-?\)?)(?:\s+[-+]?\s*[\$Ss§]?\s*\d{1,3}(?:,\d{3})*\.\d{2})?$/i;
  const amountMatch = remaining.match(amountRegex);

  if (!amountMatch) {
    return null;
  }

  const rawAmountStr = amountMatch[1];
  let description = remaining.slice(0, remaining.lastIndexOf(rawAmountStr)).trim();
  description = cleanDescription(description);

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
  let cleanAmountStr = rawAmountStr.replace(/[\$Ss§,\s]/g, '');
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

  // Handle leading minus: -50.00
  if (cleanAmountStr.startsWith('-')) {
    isCredit = true;
    cleanAmountStr = cleanAmountStr.slice(1);
  }

  let pricePaid = parseFloat(cleanAmountStr);
  if (isNaN(pricePaid)) return null;

  // Determine credit vs debit vs payment
  const isPaymentOrCreditText = /PAYMENT|CREDIT|THANK YOU|REFUND|REVERSAL|DEPOSIT|DIRECT DEP|PAYROLL|ACH CREDIT|CASHBACK|BONUS/i.test(description);

  let isNegative = false;
  if (isCredit || sectionHint === 'PAYMENTS') {
    isNegative = true;
  } else if (sectionHint !== 'PURCHASES' && isPaymentOrCreditText) {
    isNegative = true;
  }

  if (isNegative && pricePaid > 0) {
    pricePaid = -pricePaid;
  }

  const pricePaidFormatted = pricePaid < 0 
    ? `-$${Math.abs(pricePaid).toFixed(2)}` 
    : `$${pricePaid.toFixed(2)}`;

  let txType: TransactionType = 'PURCHASE';
  if (pricePaid < 0 || sectionHint === 'PAYMENTS') {
    txType = 'CREDIT';
  } else if (/INTEREST CHARGE|FINANCE CHARGE/i.test(description)) {
    txType = 'INTEREST';
  } else if (/FEE|SURCHARGE|LATE CHARGE|OVERDRAFT|ANNUAL FEE/i.test(description) || sectionHint === 'FEE') {
    txType = 'FEE';
  }

  return {
    id: `${fileId}-row-${lineNum}-${Math.random().toString(36).substr(2, 5)}`,
    fileId,
    fileName,
    lineNum,
    date: rawDate,
    pricePaid,
    pricePaidFormatted,
    chargeInformation: description,
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
function formatDate(dateStr: string, fallbackYear?: string | null): string {
  if (!dateStr) return '';
  const parts = dateStr.split(/[\/\.-]/);
  if (parts.length >= 2) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    let year = parts[2] || fallbackYear || new Date().getFullYear().toString();
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
    .replace(/^[\*\:\-\#~=_•\|\s]+/, '')
    .replace(/[\*\:\-\#~=_•\|\s]+$/, '')
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

