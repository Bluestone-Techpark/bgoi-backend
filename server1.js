const express = require('express');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const app = express();
const PORT = 5002;
const SECRET_KEY = "bluestone_secret_key";
const API_BASE_URL = "https://bluestoneinternationalpreschool.com/bgoi_api";

/* ===============================
    MIDDLEWARE & DIRECTORIES
================================ */
app.use(cors());
app.use(express.json());

const uploadDir = 'uploads/';
const imageDir = 'uploads/images/';
[uploadDir, imageDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Static File Access (Crucial for viewing resumes and images)
app.use('/bgoi_api/uploads', express.static(path.join(__dirname, 'uploads')));

/* ===============================
    DATABASE & EMAIL CONFIG
================================ */
const db = mysql.createPool({
    host: 'auth-db1278.hstgr.io',
    user: 'u287260207_bgoi_user',
    password: '4g@LMW2026',
    database: 'u287260207_bgoi_bg',
    waitForConnections: true,
    connectionLimit: 10
});

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'bluestonesoftwaredeveloper@gmail.com',
        pass: 'pffc oagp umot lssz'
    },
    tls: { rejectUnauthorized: false }
});

/* ===============================
    MULTER SETUP
================================ */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, file.fieldname === 'resume' ? uploadDir : imageDir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

/* ===============================
    ROUTER DEFINITION (Mounts at /bgoi_api)
================================ */
const router = express.Router();

// --- 1. ADMIN AUTH ---
router.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM admins WHERE username=? AND password=?", [username, password], (err, rows) => {
        if (rows?.length > 0) {
            const token = jwt.sign({ id: rows[0].id }, SECRET_KEY, { expiresIn: '1h' });
            res.json({ success: true, token });
        } else res.status(401).json({ success: false });
    });
});

router.post('/api/admin/update-settings', (req, res) => {
    const { newUsername, newPassword } = req.body;
    db.query("UPDATE admins SET username = ?, password = ? WHERE id = 1", [newUsername, newPassword], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

// --- 2. BUSINESS LEADS (INBOX, APPROVE, REVOKE, DELETE) ---
router.post('/api/contact', (req, res) => {
    const { name, email, phone, message, businessFocus } = req.body;
    const focus = Array.isArray(businessFocus) ? businessFocus.join(", ") : businessFocus;
    db.query("INSERT INTO contact_inquiries (name, email, phone, business_focus, message) VALUES (?,?,?,?,?)",
    [name, email, phone, focus, message], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true });
    });
});

router.get('/api/admin/leads', (req, res) => {
    db.query("SELECT * FROM contact_inquiries ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

router.get('/api/admin/approved-leads', (req, res) => {
    db.query("SELECT * FROM approved_leads ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

// Transactional Approval (Move Inbox -> Approved)
router.post('/api/admin/leads/approve/:id', (req, res) => {
    const { id } = req.params;
    const { name, email, phone, business_focus, message } = req.body;
    db.getConnection((err, conn) => {
        conn.beginTransaction(() => {
            conn.query("INSERT INTO approved_leads (name,email,phone,business_focus,message) VALUES (?,?,?,?,?)", [name,email,phone,business_focus,message], (e1) => {
                if(e1) return conn.rollback(() => res.status(500).json(e1));
                conn.query("DELETE FROM contact_inquiries WHERE id=?", [id], (e2) => {
                    if(e2) return conn.rollback(() => res.status(500).json(e2));
                    conn.commit(() => { conn.release(); res.send("Approved"); });
                });
            });
        });
    });
});

// Transactional Revoke (Move Approved -> Inbox)
router.post('/api/admin/approved-leads/revoke/:id', (req, res) => {
    const { id } = req.params;
    const { name, email, phone, business_focus, message } = req.body;
    db.getConnection((err, conn) => {
        conn.beginTransaction(() => {
            conn.query("INSERT INTO contact_inquiries (name,email,phone,business_focus,message) VALUES (?,?,?,?,?)", [name,email,phone,business_focus,message], (e1) => {
                if(e1) return conn.rollback(() => res.status(500).json(e1));
                conn.query("DELETE FROM approved_leads WHERE id=?", [id], (e2) => {
                    if(e2) return conn.rollback(() => res.status(500).json(e2));
                    conn.commit(() => { conn.release(); res.send("Revoked"); });
                });
            });
        });
    });
});

router.delete('/api/admin/leads/:id', (req, res) => {
    db.query("DELETE FROM contact_inquiries WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).send(err);
        res.send("Lead Deleted");
    });
});

// --- 3. CAREERS & JOBS ---
router.post('/api/admin/jobs', (req, res) => {
    const { title, category, location, type, salary, skills, description } = req.body;
    db.query("INSERT INTO job_listings (title,category,location,type,salary,skills,description) VALUES (?,?,?,?,?,?,?)",
    [title, category, location, type, salary, skills, description], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true });
    });
});

router.get('/api/jobs', (req, res) => {
    db.query("SELECT * FROM job_listings ORDER BY created_at DESC", (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

router.delete('/api/admin/jobs/:id', (req, res) => {
    db.query("DELETE FROM job_listings WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.send("Job Deleted");
    });
});

router.post('/api/jobs/apply', upload.single('resume'), (req, res) => {
    const { job_title, fullName, email, phone, message } = req.body;
    const resumePath = req.file ? req.file.path.replace(/\\/g, "/") : null;
    db.query("INSERT INTO job_applications (job_title, full_name, email, phone, message, resume_path) VALUES (?,?,?,?,?,?)",
    [job_title, fullName, email, phone, message, resumePath], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true });
    });
});

router.get('/api/admin/applications', (req, res) => {
    db.query("SELECT * FROM job_applications ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

// --- 4. MEDIA & GALLERY (FETCH, UPLOAD, CROP, DELETE) ---
router.get('/api/media', (req, res) => {
    const { category } = req.query;
    const sql = category && category !== 'All' 
        ? "SELECT * FROM media WHERE category = ? ORDER BY id DESC" 
        : "SELECT * FROM media ORDER BY id DESC";
    db.query(sql, [category], (err, results) => {
        if (err) return res.status(500).json(err);
        const data = results.map(row => ({
            ...row,
            url: row.url.startsWith('http') ? row.url : `${API_BASE_URL}/${row.url}`
        }));
        res.json(data);
    });
});

router.post('/api/media/upload', upload.single('image'), (req, res) => {
    const { category, alt_text } = req.body;
    const url = req.file.path.replace(/\\/g, "/");
    db.query("INSERT INTO media (url, category, alt_text) VALUES (?, ?, ?)", [url, category, alt_text], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true, url: `${API_BASE_URL}/${url}` });
    });
});

router.put('/api/media/edit/:id', async (req, res) => {
    const { id } = req.params;
    const { cropData } = req.body;
    db.query("SELECT url FROM media WHERE id = ?", [id], async (err, results) => {
        if (!results.length) return res.status(404).send("Not found");
        const fullPath = path.resolve(__dirname, results[0].url);
        try {
            const buffer = fs.readFileSync(fullPath);
            const meta = await sharp(buffer).metadata();
            const processed = await sharp(buffer).extract({
                left: Math.max(0, Math.floor(cropData.x)),
                top: Math.max(0, Math.floor(cropData.y)),
                width: Math.min(Math.floor(cropData.width), meta.width - Math.floor(cropData.x)),
                height: Math.min(Math.floor(cropData.height), meta.height - Math.floor(cropData.y))
            }).toBuffer();
            fs.writeFileSync(fullPath, processed);
            res.json({ success: true });
        } catch (e) { res.status(500).send(e.message); }
    });
});

router.delete('/api/media/:id', (req, res) => {
    db.query("SELECT url FROM media WHERE id = ?", [req.params.id], (err, results) => {
        if (results.length) {
            const relPath = results[0].url.includes('http') ? results[0].url.split('bgoi_api/')[1] : results[0].url;
            const fullPath = path.join(__dirname, relPath);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
        db.query("DELETE FROM media WHERE id = ?", [req.params.id], () => res.json({ success: true }));
    });
});

/* ===============================
    MOUNT & LISTEN
================================ */
app.use('/bgoi_api', router);

app.listen(PORT, () => {
    console.log(`✅ Production Server running on Port ${PORT}`);
});