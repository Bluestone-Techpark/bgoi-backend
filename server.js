const express = require('express');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   CONSTANTS
================================ */
const PORT = 5002;
const SECRET_KEY = "bluestone_secret_key";
const uploadDir = "uploads/";

/* ===============================
   UPLOAD FOLDER
================================ */
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
app.use('/uploads', express.static(uploadDir));

/* ===============================
   MYSQL CONNECTION POOL (FIXED)
================================ */
const db = mysql.createPool({
    host: 'auth-db1278.hstgr.io',
    user: 'u287260207_bgoi_user',
    password: '4g@LMW2026',
    database: 'u287260207_bgoi_bg',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

db.getConnection((err, conn) => {
    if (err) console.error("❌ MySQL Pool Error:", err);
    else {
        console.log("✅ MySQL Pool Connected");
        conn.release();
    }
});

/* ===============================
   NODEMAILER
================================ */
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
   MULTER CONFIG
================================ */
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") cb(null, true);
        else cb(new Error("Only PDF files allowed"));
    }
});

/* ===============================
   BUSINESS LEADS
================================ */
app.post('/api/contact', (req, res) => {
    const { name, email, phone, message, businessFocus } = req.body;
    const focus = Array.isArray(businessFocus) ? businessFocus.join(", ") : businessFocus;

    db.query(
        "INSERT INTO contact_inquiries (name,email,phone,business_focus,message) VALUES (?,?,?,?,?)",
        [name, email, phone, focus, message],
        async (err) => {
            if (err) return res.status(500).json(err);

            try {
                await transporter.sendMail({
                    to: 'bluestonesoftwaredeveloper@gmail.com',
                    subject: `🚀 New Lead: ${name}`,
                     html: `<h3>New Business Inquiry</h3>

                   <p><b>Name:</b> ${name}</p>

                   <p><b>Phone Number:</b> ${phone}</p>

                   <p><b>Email ID:</b> ${email}</p>

                   <p><b>Focus:</b> ${focus}</p>

                   <p><b>Message:</b> ${message}</p>`
                });

                await transporter.sendMail({
                    to: email,
                    subject: `Inquiry Received - Bluestone Group`,

            html: `<h3>Hello ${name},</h3>

                   <p>Thank you for reaching out to Bluestone Group of Institutions.</p>

                   <p>We have received your inquiry regarding <b>${focus}</b>. Our strategic team will review your details and get back to you shortly.</p>

                   <br/>

                   <p>Best Regards,<br/><b>Bluestone Team</b></p>`  
                });
            } catch (e) {
                console.error("Mail Error:", e.message);
            }

            res.json({ success: true });
        }
    );
});

app.get('/api/admin/leads', (req, res) => {
    db.query("SELECT * FROM contact_inquiries ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

app.get('/api/admin/approved-leads', (req, res) => {
    db.query("SELECT * FROM approved_leads ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

app.post('/api/admin/leads/approve/:id', (req, res) => {
    const { id } = req.params;
    const { name, email, phone, business_focus, message } = req.body;

    db.getConnection((err, conn) => {
        if (err) return res.status(500).json(err);

        conn.beginTransaction(() => {
            conn.query(
                "INSERT INTO approved_leads (name,email,phone,business_focus,message) VALUES (?,?,?,?,?)",
                [name, email, phone, business_focus, message],
                (e1) => {
                    if (e1) return conn.rollback(() => res.status(500).json(e1));

                    conn.query(
                        "DELETE FROM contact_inquiries WHERE id=?",
                        [id],
                        (e2) => {
                            if (e2) return conn.rollback(() => res.status(500).json(e2));
                            conn.commit(() => {
                                conn.release();
                                res.send("Lead Approved");
                            });
                        }
                    );
                }
            );
        });
    });
});

app.post('/api/admin/approved-leads/revoke/:id', (req, res) => {
    const { id } = req.params;
    const { name, email, phone, business_focus, message } = req.body;

    db.getConnection((err, conn) => {
        conn.beginTransaction(() => {
            conn.query(
                "INSERT INTO contact_inquiries (name,email,phone,business_focus,message) VALUES (?,?,?,?,?)",
                [name, email, phone, business_focus, message],
                () => {
                    conn.query(
                        "DELETE FROM approved_leads WHERE id=?",
                        [id],
                        () => {
                            conn.commit(() => {
                                conn.release();
                                res.send("Lead Revoked");
                            });
                        }
                    );
                }
            );
        });
    });
});

app.delete('/api/admin/leads/:id', (req, res) => {
    db.query("DELETE FROM contact_inquiries WHERE id=?", [req.params.id], () => {
        res.send("Lead Deleted");
    });
});

/* ===============================
   JOBS & CAREERS
================================ */
app.post('/api/admin/jobs', (req, res) => {
    const { title, category, location, type } = req.body;
    db.query(
        "INSERT INTO job_listings (title,category,location,type) VALUES (?,?,?,?)",
        [title, category, location, type],
        (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ success: true, id: result.insertId });
        }
    );
});

app.delete('/api/admin/jobs/:id', (req, res) => {
    db.query("DELETE FROM job_listings WHERE id=?", [req.params.id], () => {
        res.send("Job Deleted");
    });
});

app.get('/api/jobs', (req, res) => {
    db.query("SELECT * FROM job_listings ORDER BY created_at DESC", (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

app.post('/api/jobs/apply', upload.single('resume'), (req, res) => {
    const { job_title, fullName, email, phone, message } = req.body;
    const resume = req.file ? req.file.path.replace(/\\/g, "/") : null;

    db.query(
        "INSERT INTO job_applications (job_title,full_name,email,phone,message,resume_path) VALUES (?,?,?,?,?,?)",
        [job_title, fullName, email, phone, message, resume],
        async () => {
            try {
                await transporter.sendMail({
                    to: 'bluestonesoftwaredeveloper@gmail.com',
                    subject: `💼 New Applicant: ${fullName} (${job_title})`,

            html: `<h3>New Job Application</h3>

                   <p><b>Candidate:</b> ${fullName}</p>

                                      <p><b>Phone Number:</b> ${phone}</p>

                   <p><b>Email ID:</b> ${email}</p>



                   <p><b>Position:</b> ${job_title}</p>

                   <p><b>Resume:</b> <a href="https://bluestoneinternationalpreschool.com/bgoi_api/${resume}">View Attached PDF</a></p>`


                });

                await transporter.sendMail({
                    to: email,
                    subject: `Application Received: ${job_title}`,

            html: `<h3>Dear ${fullName},</h3>

                   <p>Thank you for applying for the <b>${job_title}</b> position at Bluestone Group.</p>

                   <p>This email confirms that we have successfully received your application and resume. Our HR team will contact you if your profile matches our requirements.</p>

                   <br/>

                   <p>Good luck!<br/><b>Bluestone HR Team</b></p>`
                });
            } catch (e) {
                console.error("Mail Error:", e.message);
            }

            res.json({ success: true });
        }
    );
});

app.get('/api/admin/applications', (req, res) => {
    // Make sure the table name 'job_applications' matches exactly what you created in SQL
    db.query("SELECT * FROM job_applications ORDER BY id DESC", (err, results) => {
        if (err) {
            console.error("DB Error:", err.message);
            return res.status(500).json({ error: "Database query failed" });
        }
        res.json(results || []);
    });
});
/* ===============================
   ADMIN AUTH
================================ */
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;

    db.query(
        "SELECT * FROM admins WHERE username=? AND password=?",
        [username, password],
        (err, rows) => {
            if (rows && rows.length > 0) {
                const token = jwt.sign({ id: rows[0].id }, SECRET_KEY, { expiresIn: '1h' });
                res.json({ success: true, token });
            } else {
                res.status(401).json({ success: false });
            }
        }
    );
});

/* ===============================
   MULTER ERROR HANDLER
================================ */
app.use((err, req, res, next) => {
    if (err && err.message.includes("PDF")) {
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
    console.log(`🚀 BGOI Server running on http://localhost:${PORT}`);
});
