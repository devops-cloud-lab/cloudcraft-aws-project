const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// RDS connection - values come from environment variables set on the EC2 instance
// (see user-data.sh). Never hardcode credentials in code.
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false } // RDS requires SSL by default on newer instances
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint - the ALB target group polls this
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Increment and return a visit counter stored in RDS
app.get('/api/visits', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS visits (
        id SERIAL PRIMARY KEY,
        count INT NOT NULL DEFAULT 0
      )
    `);
    const existing = await pool.query('SELECT * FROM visits LIMIT 1');
    let count;
    if (existing.rows.length === 0) {
      const inserted = await pool.query('INSERT INTO visits (count) VALUES (1) RETURNING count');
      count = inserted.rows[0].count;
    } else {
      const updated = await pool.query(
        'UPDATE visits SET count = count + 1 WHERE id = $1 RETURNING count',
        [existing.rows[0].id]
      );
      count = updated.rows[0].count;
    }
    res.json({ count });
  } catch (err) {
    console.error('DB error on /api/visits:', err.message);
    res.status(500).json({ error: 'Database unavailable' });
  }
});

// Store contact form submissions in RDS
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(
      'INSERT INTO contacts (name, email, message) VALUES ($1, $2, $3)',
      [name, email, message]
    );
    res.status(201).json({ status: 'saved' });
  } catch (err) {
    console.error('DB error on /api/contact:', err.message);
    res.status(500).json({ error: 'Database unavailable' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
