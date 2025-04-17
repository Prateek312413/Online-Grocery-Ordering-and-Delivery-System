const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken, checkAdmin } = require('../middleware/authenticateToken');

// Get all products (available to all authenticated users)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [products] = await pool.query('SELECT product_id, name, price, stock FROM products');
    res.json({ success: true, products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: `Failed to fetch products: ${error.message}` });
  }
});

// Add a new product (admin only)
router.post('/', authenticateToken, checkAdmin, async (req, res) => {
  const { name, price, stock } = req.body;
  if (!name || typeof price !== 'number' || price < 0 || !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ success: false, message: 'Invalid product details' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO products (name, price, stock) VALUES (?, ?, ?)',
      [name, price, stock]
    );
    res.status(201).json({ 
      success: true, 
      message: 'Product added successfully', 
      product_id: result.insertId 
    });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ success: false, message: `Failed to add product: ${error.message}` });
  }
});

// Delete a product (admin only)
router.delete('/:productId', authenticateToken, checkAdmin, async (req, res) => {
  const productId = req.params.productId;
  try {
    const [result] = await pool.query(
      'DELETE FROM products WHERE product_id = ?',
      [productId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: `Failed to delete product: ${error.message}` });
  }
});

module.exports = router;