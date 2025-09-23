const express = require('express');
const Item = require('../models/Item');
const Transaction = require('../models/Transaction');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, category, status } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) query.category = category;
    if (status) query.status = status;

    const items = await Item.find(query)
      .populate('category', 'name')
      .populate('updatedBy', 'username')
      .sort({ updatedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Item.countDocuments(query);

    res.json({
      items,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const itemData = { ...req.body, updatedBy: req.user._id };
    const item = new Item(itemData);
    const savedItem = await item.save();

    const populatedItem = await Item.findById(savedItem._id)
      .populate('category', 'name')
      .populate('updatedBy', 'username');

    res.status(201).json(populatedItem);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/low-stock', protect, async (req, res) => {
  try {
    const items = await Item.find({
      $expr: { $lte: ['$quantity', '$minQuantity'] },
      status: 'active'
    }).populate('category', 'name');

    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate('category', 'name')
      .populate('updatedBy', 'username');

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const itemData = { ...req.body, updatedBy: req.user._id, lastUpdated: Date.now() };
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      itemData,
      { new: true, runValidators: true }
    ).populate('category', 'name').populate('updatedBy', 'username');

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/:id/quantity', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { quantity, type, reason, reference } = req.body;
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const previousQuantity = item.quantity;
    const newQuantity = type === 'adjustment' ? quantity :
                       type === 'in' ? previousQuantity + quantity :
                       previousQuantity - quantity;

    if (newQuantity < 0) {
      return res.status(400).json({ message: 'Insufficient quantity' });
    }

    item.quantity = newQuantity;
    item.lastUpdated = Date.now();
    item.updatedBy = req.user._id;
    await item.save();

    const transaction = new Transaction({
      item: item._id,
      type,
      quantity: Math.abs(quantity),
      previousQuantity,
      newQuantity,
      reason,
      reference,
      performedBy: req.user._id
    });
    await transaction.save();

    const updatedItem = await Item.findById(item._id)
      .populate('category', 'name')
      .populate('updatedBy', 'username');

    res.json(updatedItem);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;