import express from 'express';
import History from '../models/History.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const history = await History.find({ userId: req.user.id }).sort({ createdAt: -1 });
    const formattedHistory = history.map(h => ({
      id: h._id,
      fileName: h.fileName,
      uploadDate: h.uploadDate,
      transactionCount: h.transactionCount,
      transactions: h.transactions,
    }));
    res.json({ success: true, data: formattedHistory });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { fileName, transactions } = req.body;
    
    const newHistory = new History({
      userId: req.user.id,
      fileName,
      uploadDate: new Date().toISOString(),
      transactionCount: transactions.length,
      transactions,
    });

    await newHistory.save();
    res.json({ success: true, message: 'Upload history saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await History.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ success: true, message: 'History item removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
