import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  id: String,
  fileId: String,
  fileName: String,
  lineNum: Number,
  date: String,
  pricePaid: Number,
  pricePaidFormatted: String,
  chargeInformation: String,
  type: {
    type: String,
  },
  rawLine: String,
  confidenceScore: Number,
  group: String,
  isDuplicate: Boolean,
});

const HistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  uploadDate: {
    type: String,
    required: true,
  },
  transactionCount: {
    type: Number,
    required: true,
  },
  transactions: [TransactionSchema],
}, { timestamps: true });

export default mongoose.model('History', HistorySchema);
