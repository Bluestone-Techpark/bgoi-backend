const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp'); // npm install sharp

const app = express();
app.use(cors());
app.use(express.json());

const API_BASE_URL = "http://localhost:5000";

// Ensure directories exist
const uploadDir = 'uploads/';
const imageDir = 'uploads/images/';
[uploadDir, imageDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test'
});

// Multer Config for Media
const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, imageDir),
    filename: (req, file, cb) => cb(null, `media-${Date.now()}${path.extname(file.originalname)}`)
});
const uploadImage = multer({ storage: imageStorage });

app.use('/uploads', express.static('uploads'));

// --- MEDIA ROUTES ---

// 1. Upload
app.post('/api/media/upload', uploadImage.single('image'), (req, res) => {
    const { category, alt_text } = req.body;
    const url = req.file.path.replace(/\\/g, "/");
    const sql = "INSERT INTO media_library (url, category, alt_text) VALUES (?, ?, ?)";
    db.query(sql, [url, category, alt_text], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true, url: `${API_BASE_URL}/${url}` });
    });
});

// 2. Fetch by Category
app.get('/api/media', (req, res) => {
    const { category } = req.query;
    const sql = category && category !== 'All' 
        ? "SELECT * FROM media_library WHERE category = ? ORDER BY id DESC" 
        : "SELECT * FROM media_library ORDER BY id DESC";
    
    db.query(sql, [category], (err, results) => {
        if (err) return res.status(500).json(err);
        const data = results.map(row => ({ ...row, url: `${API_BASE_URL}/${row.url}` }));
        res.json(data);
    });
});

// 3. Edit (Crop)
app.put('/api/media/edit/:id', async (req, res) => {
    const { id } = req.params;
    const { cropData } = req.body; // { x, y, width, height }

    db.query("SELECT url FROM media_library WHERE id = ?", [id], async (err, results) => {
        if (err || !results.length) return res.status(404).json({ error: "Not found" });

        const relativePath = results[0].url;
        const fullPath = path.join(__dirname, relativePath);
        const tempPath = path.join(__dirname, imageDir, `temp-${Date.now()}.jpg`);

        try {
            await sharp(fullPath)
                .extract({ 
                    left: Math.round(cropData.x), 
                    top: Math.round(cropData.y), 
                    width: Math.round(cropData.width), 
                    height: Math.round(cropData.height) 
                })
                .toFile(tempPath);

            fs.unlinkSync(fullPath); // Delete old
            fs.renameSync(tempPath, fullPath); // Replace with cropped
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
});

// 4. Delete
app.delete('/api/media/:id', (req, res) => {
    db.query("SELECT url FROM media_library WHERE id = ?", [req.params.id], (err, results) => {
        if (results.length) {
            const fullPath = path.join(__dirname, results[0].url);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            db.query("DELETE FROM media_library WHERE id = ?", [req.params.id], () => {
                res.json({ success: true });
            });
        }
    });
});

app.listen(5000, () => console.log("Server running on port 5000"));