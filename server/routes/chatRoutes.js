import express from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  try {
    const { message, transactions } = req.body;
    
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ success: false, message: 'Groq API Key is not configured on the server.' });
    }

    if (!transactions || transactions.length === 0) {
      return res.json({
        success: true,
        message: 'No transaction data is currently available. Please upload a bank statement first.'
      });
    }

    const summaryData = transactions.map((t, idx) => 
      `${idx + 1}. Date: ${t.date || 'N/A'} | Type: ${t.type || 'N/A'} | Amount: ${t.pricePaidFormatted || t.pricePaid || 'N/A'} | Description: ${t.chargeInformation || 'N/A'}`
    ).join('\n');

    const systemPrompt = `You are a strict financial analysis assistant for our Statement Importer application.

You are given the following extracted transaction rows from the user's uploaded statement(s):
"""
${summaryData}
"""

CRITICAL INSTRUCTIONS & BOUNDARIES:
1. STRICT DATA SCOPE:
   - You MUST ONLY answer questions using the exact transaction rows provided above.
   - Do NOT answer general knowledge, external trivia, coding questions, chit-chat, or any topic outside of these extracted rows.
   - If the user asks about anything unrelated to these transactions (or asks about data not present in the rows), strictly respond with:
     "I can only assist with questions regarding your extracted statement transactions."

2. STRUCTURE & FORMATTING:
   - Always present your response in a clean, structured, and readable format.
   - Use Markdown tables or organized bullet points with bold metrics (e.g., Merchant / Description, Date, Type, Amount).
   - When giving totals or summaries, always clearly display:
     • **Total Amount**
     • **Count of Transactions**
     • **Itemized Breakdown** (grouped by merchant, category, or date)
     • **Notes** (e.g., whether credits/refunds were excluded or included)
   - Do NOT output wall-of-text or long unformatted single paragraphs. Keep it professional, neatly spaced, and easy to scan.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.2,
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('Groq Error:', data.error);
      return res.status(500).json({ success: false, message: data.error.message || 'Failed to fetch AI response from Groq.' });
    }

    const aiMessage = data.choices[0].message.content;
    res.json({ success: true, message: aiMessage });

  } catch (error) {
    console.error('ChatRoute Error:', error);
    res.status(500).json({ success: false, message: 'Server error processing chat.' });
  }
});

export default router;
