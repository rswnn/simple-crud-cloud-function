const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up multer for image uploading
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Save file with timestamp
  },
});

const upload = multer({ storage: storage });

// Set up MySQL connection
console.log(process.env.MYSQL_HOST)
const db = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,  // change according to your DB setup
  database: process.env.MYSQL_DB,
  port: process.env.MYSQL_PORT,
  ssl: {
    rejectUnauthorized: false,
  }
});

db.connect((err) => {
  if (err) {
    console.log('Error connecting to DB:', err);
  } else {
    console.log('Connected to MySQL DB');
  }
});

// Create a table if not exists
db.query(`
  CREATE TABLE IF NOT EXISTS contents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    image VARCHAR(255) NOT NULL,
    description TEXT NOT NULL
  )
`, (err, result) => {
  if (err) {
    console.log('Error creating table:', err);
  } else {
    console.log('Table created or exists.');
  }
});

// Route to get all contents (READ)
app.get('/contents', (req, res) => {
  db.query('SELECT * FROM contents', (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// Route to get a single content by ID (READ)
app.get('/contents/:id', (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM contents WHERE id = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (result.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }
    res.json(result[0]);
  });
});

// Route to create a new content (CREATE)
app.post('/contents', upload.single('image'), (req, res) => {
  const { name, description } = req.body;
  const image = req.file ? req.file.filename : null;

  if (!name || !description || !image) {
    return res.status(400).json({ error: 'Please provide all fields' });
  }

  const sql = 'INSERT INTO contents (name, image, description) VALUES (?, ?, ?)';
  db.query(sql, [name, image, description], (err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: result.insertId, name, image, description });
  });
});

// Route to update content by ID (UPDATE)
app.put('/contents/:id', upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  const image = req.file ? req.file.filename : null;

  const getSql = 'SELECT * FROM contents WHERE id = ?';
  db.query(getSql, [id], (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const existingImage = results[0].image;

    let updateFields = { name, description };
    if (image) {
      updateFields.image = image;

      // Delete old image
      if (existingImage) {
        const imagePath = path.join(__dirname, 'uploads', existingImage);
        fs.unlink(imagePath, (err) => {
          if (err) console.error(err);
        });
      }
    }

    const sql = `UPDATE contents SET name = ?, image = ?, description = ? WHERE id = ?`;
    db.query(sql, [name, image || existingImage, description, id], (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Content updated successfully' });
    });
  });
});

// Route to delete content by ID (DELETE)
app.delete('/contents/:id', (req, res) => {
  const { id } = req.params;

  const getSql = 'SELECT * FROM contents WHERE id = ?';
  db.query(getSql, [id], (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const existingImage = results[0].image;

    const sql = 'DELETE FROM contents WHERE id = ?';
    db.query(sql, [id], (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      // Delete image from server
      if (existingImage) {
        const imagePath = path.join(__dirname, 'uploads', existingImage);
        fs.unlink(imagePath, (err) => {
          if (err) console.error(err);
        });
      }

      res.json({ message: 'Content deleted successfully' });
    });
  });
});

// Serve the uploaded images
app.use('/uploads', express.static('uploads'));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
