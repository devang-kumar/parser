import * as pdfjsLib from 'pdfjs-dist';
import type { TransactionRow, GroupType, TransactionType } from '../types';

export const AVAILABLE_FREE_MODELS = [
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'NVIDIA Nemotron 3.5 Lightning (Free - Fastest Text & Documents)',
    description: 'High-speed 1M context model for instant bank statement text extraction.',
  },
  {
    id: 'nvidia/nemotron-3.5-super-vl:free',
    name: 'NVIDIA Nemotron 3.5 Super VL (Free - Multimodal Vision & Images)',
    description: '1M context multimodal model for statement images, receipts, and scanned PDFs.',
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'NVIDIA Nemotron 3 Ultra 550B (Free - High Precision)',
    description: 'Flagship model for complex statements and multi-column tables.',
  },
];

const LOCAL_STORAGE_KEY_API_KEY = 'openrouter_api_key';
const LOCAL_STORAGE_KEY_MODEL = 'openrouter_model';
const DEFAULT_MODEL = 'nvidia/nemotron-3.5-lightning:free';

class OpenRouterService {
  getApiKey(): string {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY_API_KEY);
    if (stored && stored.trim().length > 0) return stored.trim();
    const envKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim().length > 0) return envKey.trim();
    return '';
  }

  setApiKey(key: string) {
    localStorage.setItem(LOCAL_STORAGE_KEY_API_KEY, key.trim());
  }

  getModel(): string {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY_MODEL);
    if (stored && stored !== 'openrouter/free' && !stored.includes('gemma')) return stored;
    return (
      import.meta.env.VITE_OPENROUTER_MODEL ||
      DEFAULT_MODEL
    );
  }

  setModel(model: string) {
    localStorage.setItem(LOCAL_STORAGE_KEY_MODEL, model);
  }

  hasApiKey(): boolean {
    return (
      this.getGeminiApiKey().length > 0 ||
      this.getGroqApiKey().length > 0 ||
      this.getApiKey().length > 0
    );
  }

  getGeminiApiKey(): string {
    const envKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim().length > 0) return envKey.trim();
    return '';
  }

  getGroqApiKey(): string {
    const envKey = import.meta.env.VITE_GROQ_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim().length > 0) return envKey.trim();
    return '';
  }

  /**
   * Resizes and compresses an image file to a lightweight base64 Data URL (under 500KB)
   */
  private async optimizeImageFile(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1400;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  /**
   * Extracts clean, structured text from PDF pages
   */
  private async extractPdfText(file: File): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      const relevantPages: string[] = [];
      const allPages: string[] = [];

      const maxPages = Math.min(pdf.numPages, 10);
      for (let p = 1; p <= maxPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        
        // Fast O(N) bucket grouping by Y coordinate
        const linesMap = new Map<number, string[]>();
        for (const item of textContent.items as any[]) {
          const str = item.str?.trim();
          if (!str) continue;
          const yBucket = Math.round(item.transform[5] / 4) * 4;
          if (!linesMap.has(yBucket)) {
            linesMap.set(yBucket, []);
          }
          linesMap.get(yBucket)!.push(str);
        }

        // Sort descending (top of page to bottom)
        const sortedY = [...linesMap.keys()].sort((a, b) => b - a);
        const pageText = sortedY.map((y) => linesMap.get(y)!.join(' ')).join('\n');
        allPages.push(`--- PAGE ${p} ---\n` + pageText);

        // Check if page contains transaction headers or at least 3 transaction dates
        const dateMatches = pageText.match(/\b\d{1,2}[\/\.-]\d{1,2}\b/g) || [];
        const hasTxHeaders = /\b(?:Trans\s*Date|Post\s*Date|Reference\s*Number|Credits\s*Charges|Purchases,\s*Balance|Withdrawals|Deposits)\b/i.test(pageText);
        if (hasTxHeaders || dateMatches.length >= 3) {
          relevantPages.push(`--- PAGE ${p} ---\n` + pageText);
        }
      }

      // If relevant pages were found, use them to avoid sending disclaimers/news; otherwise send all
      return (relevantPages.length > 0 ? relevantPages : allPages).join('\n\n').trim();
    } catch (e) {
      console.warn('PDF text extraction error:', e);
      return '';
    }
  }

  /**
   * Renders PDF pages to compressed images only if PDF has no text (scanned PDF)
   */
  private async renderPdfPagesIfScanned(file: File, maxPages = 3): Promise<string[]> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const images: string[] = [];

      const pagesToRender = Math.min(pdf.numPages, maxPages);
      for (let p = 1; p <= pagesToRender; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 1.2 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        if (!context) continue;

        await (page.render as any)({
          canvasContext: context,
          viewport,
          canvas,
        }).promise;

        images.push(canvas.toDataURL('image/jpeg', 0.75));
      }
      return images;
    } catch (e) {
      console.warn('PDF image rendering error:', e);
      return [];
    }
  }

  /**
   * Main statement parsing function
   */
  async parseStatementWithAI(
    file: File,
    fileId: string,
    group: GroupType = 'default'
  ): Promise<TransactionRow[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'OpenRouter API Key is missing. Please add VITE_OPENROUTER_API_KEY to your .env file.'
      );
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'].includes(extension);
    const isPdf = extension === 'pdf';
    const isCsv = extension === 'csv' || extension === 'txt';

    const systemPrompt = `You are a financial statement parser. Extract ALL individual transactions.
Ignore headers, summary totals, and previous balances.

Respond ONLY with a minified JSON array of transaction objects:
[
  {
    "date": "MM/DD/YYYY",
    "desc": "Merchant or payee name",
    "amount": 24.50,
    "type": "debit" | "credit"
  }
]
Output ONLY valid JSON starting with [ and ending with ].`;

    const userContent: any[] = [];
    let textPayload = '';

    let isVisual = isImage;
    if (isImage) {
      const dataUrl = await this.optimizeImageFile(file);
      userContent.push({
        type: 'text',
        text: `Extract all transaction rows from this bank statement image into the JSON array:`,
      });
      userContent.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      });
    } else if (isPdf) {
      // 1. Try extracting text first (faster, reliable, fits in context)
      const pdfText = await this.extractPdfText(file);
      
      if (pdfText && pdfText.length > 50) {
        textPayload = `Extract all transactions from this bank statement text into the JSON array:\n\n${pdfText}`;
        userContent.push({
          type: 'text',
          text: textPayload,
        });
      } else {
        // Fallback for scanned image-only PDF
        isVisual = true;
        const images = await this.renderPdfPagesIfScanned(file);
        userContent.push({
          type: 'text',
          text: `Extract all transactions from these scanned statement pages into the JSON array:`,
        });
        for (const imgUrl of images) {
          userContent.push({
            type: 'image_url',
            image_url: { url: imgUrl },
          });
        }
      }
    } else if (isCsv) {
      const text = await file.text();
      textPayload = `Extract all transactions from this CSV into the JSON array:\n\n${text.slice(0, 30000)}`;
      userContent.push({
        type: 'text',
        text: textPayload,
      });
    }

    // 1. HIGH-SPEED GROQ ENGINE (Runs in 2-4 seconds!)
    const groqKey = this.getGroqApiKey();
    if (!isVisual && groqKey && textPayload) {
      const groqModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
      for (const gm of groqModels) {
        try {
          console.log(`Parsing statement at high-speed with Groq: ${gm}...`);
          const resultJson = await this.callGroq(groqKey, gm, systemPrompt, textPayload);
          const rows = this.normalizeExtractedRows(resultJson, fileId, file.name, group);
          if (rows.length > 0) {
            console.log(`Successfully extracted ${rows.length} transactions with Groq in seconds!`);
            return rows;
          }
        } catch (err: any) {
          console.warn(`Groq model ${gm} failed: ${err.message}. Trying next engine...`);
        }
      }
    }

    // 2. GOOGLE GEMINI ENGINE (High Capacity 1M TPM & 1,500 Daily Requests)
    const geminiKey = this.getGeminiApiKey();
    if (geminiKey) {
      const geminiModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];
      const geminiParts: any[] = [];

      if (textPayload) {
        geminiParts.push({ text: textPayload });
      } else {
        for (const item of userContent) {
          if (item.type === 'text') {
            geminiParts.push({ text: item.text });
          } else if (item.type === 'image_url' && item.image_url?.url) {
            const part = this.dataUrlToGeminiPart(item.image_url.url);
            if (part) geminiParts.push(part);
          }
        }
      }

      if (geminiParts.length > 0) {
        for (const gm of geminiModels) {
          try {
            console.log(`Parsing statement using Google Gemini: ${gm}...`);
            const resultJson = await this.callGemini(geminiKey, gm, systemPrompt, geminiParts);
            const rows = this.normalizeExtractedRows(resultJson, fileId, file.name, group);
            if (rows.length > 0) {
              console.log(`Successfully extracted ${rows.length} transactions with Google Gemini (${gm})!`);
              return rows;
            }
          } catch (err: any) {
            console.warn(`Gemini model ${gm} failed: ${err.message}. Trying next engine...`);
          }
        }
      }
    }

    // 3. OPENROUTER FREE MODELS FALLBACK
    const modelsToTry = (
      isVisual
        ? [
            'nvidia/nemotron-3.5-super-vl:free',
            this.getModel(),
            'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
          ]
        : [
            'nvidia/nemotron-3.5-lightning:free',
            'nvidia/nemotron-3.5-super-vl:free',
            this.getModel(),
            'nvidia/nemotron-3-ultra-550b-a55b:free',
          ]
    ).filter((m, idx, self) => m && self.indexOf(m) === idx);

    let lastError: Error | null = null;

    for (const modelId of modelsToTry) {
      try {
        console.log(`Parsing statement using model: ${modelId}...`);
        const resultJson = await this.callOpenRouter(apiKey, modelId, systemPrompt, userContent);
        const rows = this.normalizeExtractedRows(resultJson, fileId, file.name, group);
        if (rows.length > 0) {
          console.log(`Successfully extracted ${rows.length} transactions with ${modelId}`);
          return rows;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelId} failed: ${err.message}. Trying next available free model...`);
      }
    }

    throw lastError || new Error('Failed to extract transactions from statement.');
  }

  /**
   * Calls Groq completions API with optimized token budget & auto-cooldown
   */
  private async callGroq(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userText: string
  ): Promise<any[]> {
    const doRequest = async () => {
      return await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
          temperature: 0.1,
          max_tokens: 1500, // Reduced from 4000 to keep within 8000 TPM limit
        }),
        signal: AbortSignal.timeout(30000),
      });
    };

    let response = await doRequest();

    // Auto-cooldown: if hit TPM limit with a short cooldown, wait and retry once
    if (response.status === 429) {
      const errData = await response.json().catch(() => null);
      const errMsg = errData?.error?.message || '';
      const waitMatch = errMsg.match(/try again in ([\d\.]+)s/i);
      const waitSec = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) : 0;

      if (waitSec > 0 && waitSec <= 15) {
        console.warn(`Groq rate limit cooldown: waiting ${waitSec}s for token bucket reset...`);
        await new Promise((resolve) => setTimeout(resolve, (waitSec + 1) * 1000));
        response = await doRequest();
      } else {
        throw new Error(`Groq rate limit (${model}): ${errMsg || 'Rate limit reached'}`);
      }
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const errMsg = errData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(`Groq error (${model}): ${errMsg}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '';
    return this.cleanAndParseJson(rawContent);
  }

  /**
   * Calls OpenRouter completions API with 90s timeout and reasoning disabled for speed
   */
  private async callOpenRouter(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userContent: any[]
  ): Promise<any[]> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Statement Importer',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        reasoning: { effort: 'none' },
        max_tokens: 4000,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const errMsg = errData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(`OpenRouter error (${model}): ${errMsg}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';

    return this.cleanAndParseJson(rawContent);
  }

  /**
   * Helper to format base64 Data URLs for Google Gemini API parts
   */
  private dataUrlToGeminiPart(dataUrl: string): { inlineData: { mimeType: string; data: string } } | null {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return {
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      };
    }
    return null;
  }

  /**
   * Calls Google Gemini generateContent API with guaranteed JSON output and 60s timeout
   */
  private async callGemini(
    apiKey: string,
    model: string,
    systemPrompt: string,
    parts: any[]
  ): Promise<any[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const errMsg = errData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(`Gemini error (${model}): ${errMsg}`);
    }

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return this.cleanAndParseJson(rawContent);
  }

  /**
   * Extracts and parses JSON array from model output
   * Strips reasoning tokens (<think>, <thought>), code blocks, handles wrapper objects,
   * and auto-heals truncated output if token limits were reached.
   */
  private cleanAndParseJson(rawText: string): any[] {
    let clean = rawText.trim();

    // 1. Remove reasoning / thought tags
    clean = clean.replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi, '').trim();

    // 2. Remove markdown code fences if present
    if (clean.includes('```')) {
      const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (match) {
        clean = match[1].trim();
      }
    }

    // 3. Try parsing full content directly
    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        for (const k of ['transactions', 'data', 'rows', 'items', 'records', 'statement']) {
          if (Array.isArray(parsed[k])) return parsed[k];
        }
      }
    } catch {}

    // 4. Extract outer bracketed array [ ... ]
    const firstBracket = clean.indexOf('[');
    const lastBracket = clean.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const arrayStr = clean.slice(firstBracket, lastBracket + 1);
      try {
        const parsed = JSON.parse(arrayStr);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fix trailing commas
        try {
          const fixed = arrayStr.replace(/,\s*([\]}])/g, '$1');
          const parsedFixed = JSON.parse(fixed);
          if (Array.isArray(parsedFixed)) return parsedFixed;
        } catch {}
      }
    }

    // 4b. SELF-HEALING: If output was truncated mid-stream by token limit,
    // find the last complete object '}' and close the array with ']'
    if (firstBracket !== -1) {
      const lastCloseBrace = clean.lastIndexOf('}');
      if (lastCloseBrace > firstBracket) {
        let partialArray = clean.slice(firstBracket, lastCloseBrace + 1) + ']';
        partialArray = partialArray.replace(/,\s*([\]}])/g, '$1');
        try {
          const parsed = JSON.parse(partialArray);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.warn(`Auto-recovered ${parsed.length} transactions from truncated AI output.`);
            return parsed;
          }
        } catch {}
      }
    }

    // 5. Extract outer bracketed object { ... }
    const firstObj = clean.indexOf('{');
    const lastObj = clean.lastIndexOf('}');
    if (firstObj !== -1 && lastObj > firstObj) {
      try {
        const objStr = clean.slice(firstObj, lastObj + 1);
        const obj = JSON.parse(objStr);
        for (const k of ['transactions', 'data', 'rows', 'items', 'records']) {
          if (Array.isArray(obj[k])) return obj[k];
        }
      } catch {}
    }

    console.error('Failed to parse AI output. Raw content:', rawText);
    throw new Error('AI response did not contain a valid transaction array.');
  }

  /**
   * Maps raw JSON objects to typed TransactionRow[]
   */
  private normalizeExtractedRows(
    rawRows: any[],
    fileId: string,
    fileName: string,
    group: GroupType
  ): TransactionRow[] {
    const rows: TransactionRow[] = [];
    const seen = new Set<string>();

    rawRows.forEach((item, idx) => {
      if (!item) return;

      const date = String(item.date || item.Date || item.transaction_date || item.post_date || item.time || '').trim();
      let pricePaid = parseFloat(String(item.pricePaid || item.amount || item.Price || item.cost || item.value || '0').replace(/[\$,]/g, ''));
      if (isNaN(pricePaid)) {
        const match = String(item.pricePaidFormatted || item.amountFormatted || item.amount || '').match(/[\d\.]+/);
        pricePaid = match ? parseFloat(match[0]) : 0;
      }

      const chargeInformation = String(
        item.desc || item.chargeInformation || item.description || item.Description || item.merchant || item.store || item.payee || item.name || item.details || 'Unknown'
      ).trim();
      
      const rawType = String(item.type || item.Type || 'PURCHASE').toUpperCase();
      const validTypes: TransactionType[] = ['PURCHASE', 'CREDIT', 'PAYMENT', 'FEE', 'INTEREST', 'OTHER'];
      const type: TransactionType = validTypes.includes(rawType as any) ? (rawType as TransactionType) : 'PURCHASE';

      const isCredit =
        type === 'CREDIT' ||
        type === 'PAYMENT' ||
        String(item.pricePaidFormatted || '').includes('-') ||
        parseFloat(String(item.amount || '0')) < 0;

      const pricePaidFormatted = isCredit
        ? `-$${Math.abs(pricePaid).toFixed(2)}`
        : `$${Math.abs(pricePaid).toFixed(2)}`;

      const signedPricePaid = isCredit ? -Math.abs(pricePaid) : Math.abs(pricePaid);

      const dupKey = `${date}|${signedPricePaid.toFixed(2)}|${chargeInformation.toLowerCase()}`;
      const isDuplicate = seen.has(dupKey);
      seen.add(dupKey);

      rows.push({
        id: `${fileId}-ai-${idx + 1}-${Math.random().toString(36).substr(2, 6)}`,
        fileId,
        fileName,
        lineNum: idx + 1,
        date: date || new Date().toLocaleDateString('en-US'),
        pricePaid: signedPricePaid,
        pricePaidFormatted,
        chargeInformation,
        type,
        rawLine: item.rawLine || `${date} ${chargeInformation} ${pricePaidFormatted}`,
        confidenceScore: 99,
        group,
        isDuplicate,
      });
    });

    return rows;
  }
}

export const openRouterService = new OpenRouterService();
