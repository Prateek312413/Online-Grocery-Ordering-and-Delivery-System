const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/authenticateToken');
require('dotenv').config();

const pool = require('../config/db');

// Register a new user
router.post('/register', async (req, res) => {
  const { name, email, password, street_address, city, state, postal_code, country, is_admin } = req.body;
  if (!name || !email || !password || !street_address || !city || !state || !postal_code || !country) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Check if user already exists
    const [existingUsers] = await connection.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const [userResult] = await connection.query(
      'INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, is_admin === 'on' ? true : false]
    );
    const userId = userResult.insertId;

    // Insert address
    const [addressResult] = await connection.query(
      'INSERT INTO addresses (user_id, street_address, city, state, postal_code, country) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, street_address, city, state, postal_code, country]
    );

    // Update user with address_id
    await connection.query(
      'UPDATE users SET address_id = ? WHERE id = ?',
      [addressResult.insertId, userId]
    );

    // Do not generate token here to force login
    await connection.commit();
    res.status(201).json({ success: true, message: 'User registered successfully. Please log in.' });
  } catch (error) {
    await connection.rollback();
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  } finally {
    connection.release();
  }
});

// User login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE email = ? AND is_admin = FALSE', [email]);
    if (users.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, is_admin: false }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin login
router.post('/admin-login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE email = ? AND is_admin = TRUE', [email]);
    if (users.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid admin credentials' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid admin credentials' });
    }

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, is_admin: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, token });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get user/admin profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT name, email, is_admin FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = users[0];
    res.json({ success: true, name: user.name, email: user.email, is_admin: user.is_admin });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Name and email are required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let query = 'UPDATE users SET name = ?, email = ?';
    const params = [name, email];

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = ?';
      params.push(hashedPassword);
    }

    query += ' WHERE id = ?';
    params.push(req.user.id);

    const [result] = await connection.query(query, params);
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check for email conflicts (if email changed)
    if (email !== req.user.email) {
      const [existingUsers] = await connection.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id]);
      if (existingUsers.length > 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }
    }

    await connection.commit();
    // Update token with new details
    const token = jwt.sign({ id: req.user.id, name, email, is_admin: req.user.is_admin }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, message: 'Profile updated successfully', token });
  } catch (error) {
    await connection.rollback();
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  } finally {
    connection.release();
  }
});

module.exports = router;