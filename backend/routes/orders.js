const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken, checkAdmin } = require('../middleware/authenticateToken');
const pool = require('../config/db');

// Get all orders (admin) or user-specific orders
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT 
        o.order_id,
        o.user_id,
        o.total_amount,
        o.status,
        o.order_date,
        u.email as user_email,
        MAX(a.street_address) as street_address,
        MAX(a.city) as city,
        MAX(a.state) as state,
        MAX(a.postal_code) as postal_code,
        MAX(a.country) as country,
        MAX(d.delivery_type) as delivery_type,
        MAX(d.status) as delivery_status,
        MAX(d.estimated_delivery_date) as estimated_delivery_date
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN addresses a ON u.address_id = a.address_id
      LEFT JOIN deliveries d ON o.order_id = d.order_id
    `;
    
    let params = [];
    
    if (!req.user.is_admin) {
      query += ' WHERE o.user_id = ?';
      params = [req.user.id];
    }

    query += `
      GROUP BY o.order_id, o.user_id, o.total_amount, o.status, o.order_date, u.email
      ORDER BY o.order_date DESC
    `;

    const [orders] = await pool.query(query, params);

    for (const order of orders) {
      const [items] = await pool.query(
        `SELECT 
          oi.quantity, 
          p.name, 
          p.price,
          p.product_id
         FROM order_items oi 
         JOIN products p ON oi.product_id = p.product_id 
         WHERE oi.order_id = ?`,
        [order.order_id]
      );

      order.items = items.map(item => ({
        ...item,
        price: parseFloat(item.price)
      }));
    }

    res.json({ 
      success: true, 
      orders: orders || []
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch orders',
      error: error.message 
    });
  }
});

// Update order status (Admin only)
router.patch('/:id/status', authenticateToken, checkAdmin, async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ 
      success: false, 
      message: 'Status is required' 
    });
  }

  const validStatuses = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      success: false, 
      message: `Invalid status value. Must be one of ${validStatuses.join(', ')}` 
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [orderResult] = await connection.query(
      'UPDATE orders SET status = ? WHERE order_id = ?',
      [status, orderId]
    );

    if (orderResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    if (['Shipped', 'Delivered', 'Cancelled'].includes(status)) {
      const deliveryStatus = status === 'Cancelled' ? 'cancelled' : status === 'Shipped' ? 'in_transit' : 'delivered';
      const [deliveryResult] = await connection.query(
        'UPDATE deliveries SET status = ? WHERE order_id = ?',
        [deliveryStatus, orderId]
      );
      if (deliveryResult.affectedRows === 0) {
        console.warn(`No delivery found for order ${orderId}`);
      }
    }

    await connection.commit();
    res.json({ 
      success: true, 
      message: 'Order status updated successfully'
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error updating order status:', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to update order status: ${error.message}`
    });
  } finally {
    if (connection) connection.release();
  }
});

// Get delivery status for an order (user or admin)
router.get('/:id/delivery', authenticateToken, async (req, res) => {
  const orderId = req.params.id;
  try {
    const [deliveries] = await pool.query(
      `SELECT 
        d.delivery_type,
        d.status,
        d.estimated_delivery_date,
        a.street_address,
        a.city,
        a.state,
        a.postal_code,
        a.country
       FROM deliveries d
       JOIN addresses a ON d.address_id = a.address_id
       JOIN orders o ON d.order_id = o.order_id
       WHERE d.order_id = ? AND (o.user_id = ? OR ? = TRUE)`,
      [orderId, req.user.id, req.user.is_admin]
    );

    if (deliveries.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Delivery not found or unauthorized'
      });
    }

    res.json({ 
      success: true, 
      delivery: deliveries[0]
    });
  } catch (error) {
    console.error('Error fetching delivery status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch delivery status',
      error: error.message 
    });
  }
});

// Create a new order (user only)
router.post('/', authenticateToken, async (req, res) => {
  if (req.user.is_admin) {
    return res.status(403).json({ 
      success: false, 
      message: 'Admins cannot place orders'
    });
  }

  const { cart, deliveryType } = req.body;
  if (!cart || !Array.isArray(cart) || cart.length === 0 || !['standard', 'express'].includes(deliveryType)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid cart or delivery type'
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let totalAmount = 0;
    const productIds = cart.map(item => item.product_id);
    
    const [products] = await connection.query(
      'SELECT product_id, name, price, stock FROM products WHERE product_id IN (?)',
      [productIds]
    );

    const productMap = new Map(products.map(p => [p.product_id, p]));
    const items = [];

    for (const item of cart) {
      const product = productMap.get(item.product_id);
      if (!product) {
        throw new Error(`Product ID ${item.product_id} not found`);
      }
      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
      totalAmount += product.price * item.quantity;
      items.push({
        product_id: item.product_id,
        quantity: item.quantity,
        price: product.price
      });
    }

    const [orderResult] = await connection.query(
      'INSERT INTO orders (user_id, total_amount, status) VALUES (?, ?, ?)',
      [req.user.id, totalAmount, 'Pending']
    );
    const orderId = orderResult.insertId;

    for (const item of items) {
      await connection.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price_at_time) VALUES (?, ?, ?, ?)',
        [orderId, item.product_id, item.quantity, item.price]
      );
      await connection.query(
        'UPDATE products SET stock = stock - ? WHERE product_id = ?',
        [item.quantity, item.product_id]
      );
    }

    const [users] = await connection.query(
      'SELECT address_id FROM users WHERE id = ?',
      [req.user.id]
    );
    if (users.length === 0 || !users[0].address_id) {
      throw new Error('User address not found');
    }
    const addressId = users[0].address_id;

    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + (deliveryType === 'standard' ? 5 : 2));

    await connection.query(
      'INSERT INTO deliveries (order_id, address_id, delivery_type, status, estimated_delivery_date) VALUES (?, ?, ?, ?, ?)',
      [orderId, addressId, deliveryType, 'pending', estimatedDelivery]
    );

    await connection.commit();
    res.status(201).json({ 
      success: true, 
      orderId,
      message: 'Order placed successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating order:', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to create order: ${error.message}`
    });
  } finally {
    connection.release();
  }
});

module.exports = router;