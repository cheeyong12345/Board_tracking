const express = require('express');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, item } = req.query;
    const query = {};

    if (item) query.item = item;

    const transactions = await Transaction.find(query)
      .populate('item', 'name sku')
      .populate('performedBy', 'username')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(query);

    res.json({
      transactions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/item/:itemId', protect, async (req, res) => {
  try {
    const transactions = await Transaction.find({ item: req.params.itemId })
      .populate('performedBy', 'username')
      .sort({ createdAt: -1 });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;