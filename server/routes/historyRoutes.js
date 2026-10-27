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
      name: h.fileName,
      uploadDate: h.uploadDate,
      createdAt: h.uploadDate,
      transactionCount: h.transactionCount,
      totalAmount: h.totalAmount || 0,
      files: h.files || [],
      fileCount: (h.files && h.files.length) || 1,
      transactions: h.transactions,
    }));
    res.json({ success: true, data: formattedHistory });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { fileName, name, transactions, files, totalAmount } = req.body;
    
    const newHistory = new History({
      userId: req.user.id,
      fileName: name || fileName || 'Import Session',
      uploadDate: new Date().toISOString(),
      transactionCount: transactions ? transactions.length : 0,
      totalAmount: totalAmount || 0,
      files: files || [],
      transactions: transactions || [],
    });

    await newHistory.save();
    res.json({ success: true, message: 'Session saved successfully', id: newHistory._id });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    await History.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { fileName: name } }
    );
    res.json({ success: true, message: 'Session renamed successfully' });
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

router.delete('/', requireAuth, async (req, res) => {
  try {
    await History.deleteMany({ userId: req.user.id });
    res.json({ success: true, message: 'All history removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
