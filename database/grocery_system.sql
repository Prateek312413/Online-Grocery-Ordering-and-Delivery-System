-- Create the database
CREATE DATABASE IF NOT EXISTS grocery_system;
USE grocery_system;

-- Table for addresses (created first to satisfy foreign key in users)
CREATE TABLE addresses (
  address_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  street_address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  country VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for users (now references addresses)
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  address_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (address_id) REFERENCES addresses(address_id) ON DELETE SET NULL
);

-- Add foreign key to addresses referencing users (after users is created)
ALTER TABLE addresses
ADD CONSTRAINT fk_addresses_user_id
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Table for products
CREATE TABLE products (
  product_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for orders (Updated status enum)
CREATE TABLE orders (
  order_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  status ENUM('Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled') DEFAULT 'Pending',
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table for order_items
CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  price_at_time DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
);

-- Table for deliveries
CREATE TABLE deliveries (
  delivery_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  address_id INT NOT NULL,
  delivery_type ENUM('standard', 'express') DEFAULT 'standard',
  status ENUM('pending', 'in_transit', 'delivered', 'cancelled') DEFAULT 'pending',
  estimated_delivery_date DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  FOREIGN KEY (address_id) REFERENCES addresses(address_id) ON DELETE RESTRICT
);

-- Insert sample data for testing
-- Sample users (passwords are hashed for bcrypt, example hash for 'password123')
INSERT INTO users (name, email, password, is_admin) VALUES
('John Doe', 'john@example.com', '$2a$10$z3g5Z7Y8X9W2V1Q4U6T8O.P9J5K3L2M7N4P6R8T0U2V4W6X8Y0Z2', FALSE),
('Admin User', 'admin@example.com', '$2a$10$z3g5Z7Y8X9W2V1Q4U6T8O.P9J5K3L2M7N4P6R8T0U2V4W6X8Y0Z2', TRUE);

-- Sample addresses
INSERT INTO addresses (user_id, street_address, city, state, postal_code, country) VALUES
(1, '123 Main St', 'Springfield', 'IL', '62701', 'USA'),
(2, '456 Admin Rd', 'Springfield', 'IL', '62702', 'USA');

-- Update users with address_id
UPDATE users SET address_id = 1 WHERE id = 1;
UPDATE users SET address_id = 2 WHERE id = 2;

-- Sample products
INSERT INTO products (name, price, stock) VALUES
('Milk', 2.99, 100),
('Bread', 1.99, 200),
('Eggs', 3.49, 150),
('Apples', 4.99, 80),
('Chicken', 7.99, 50);

-- Sample orders
INSERT INTO orders (user_id, total_amount, status) VALUES
(1, 8.47, 'Pending'),
(1, 6.48, 'Shipped');

-- Sample order_items
INSERT INTO order_items (order_id, product_id, quantity, price_at_time) VALUES
(1, 1, 1, 2.99), -- Milk
(1, 2, 1, 1.99), -- Bread
(1, 3, 1, 3.49), -- Eggs
(2, 2, 2, 1.99); -- Bread x2

-- Sample deliveries
INSERT INTO deliveries (order_id, address_id, delivery_type, status, estimated_delivery_date) VALUES
(1, 1, 'standard', 'pending', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 5 DAY)),
(2, 1, 'express', 'in_transit', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 2 DAY));

-- Create indexes for performance
CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_order_user_id ON orders(user_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_delivery_order_id ON deliveries(order_id);
CREATE INDEX idx_address_user_id ON addresses(user_id);