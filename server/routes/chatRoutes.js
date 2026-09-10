import express from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  try {
    const { message, transactions } = req.body;
    
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ success: false, message: 'Groq API Key is not configured on the server.' });
    }

    const summaryData = transactions.map((t) => 
      `${t.date} | ${t.type} | ${t.pricePaidFormatted} | ${t.chargeInformation}`
    ).join('\n');

    const systemPrompt = `You are a helpful financial assistant. The user has uploaded their bank statement. Here is the data:
${summaryData}

Answer the user's questions about this financial data concisely and accurately. If they ask about something not in the data, let them know.`;

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
