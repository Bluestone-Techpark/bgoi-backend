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
//app.use(express.json());

/* ===============================
    MIDDLEWARE & DIRECTORIES
================================ */
// Set payload limits to 5MB to match your requirement
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

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

// 2. Nodemailer Transporter

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",

  port: 465,

  secure: true,

  auth: {
    user: "bluestonesoftwaredeveloper@gmail.com",

    pass: "pffc oagp umot lssz",
  },

  tls: { rejectUnauthorized: false },
});

// 3. Multer Config for Resumes

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),

  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({
  storage: storage,

  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed!"), false);
  },
});

// Static folder to access resumes via URL

app.use("/uploads", express.static("uploads"));

// --- 💼 BUSINESS LEAD ROUTES ---

// Submit Contact Form (Public)

app.post("/api/contact", (req, res) => {
  const { name, email, phone, message, businessFocus } = req.body;

  const focusString = Array.isArray(businessFocus)
    ? businessFocus.join(", ")
    : businessFocus;

  const sql =
    "INSERT INTO contact_inquiries (name, email, phone, business_focus, message) VALUES (?, ?, ?, ?, ?)";

  db.query(sql, [name, email, phone, focusString, message], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    // 1. Mail to ADMIN

    const adminMail = {
      from: '"Bluestone System" <bluestonesoftwaredeveloper@gmail.com>',

      to: "bluestonesoftwaredeveloper@gmail.com",

      subject: `🚀 New Lead: ${name}`,

      html: `<h3>New Business Inquiry</h3>

                   <p><b>Name:</b> ${name}</p>

                   <p><b>Phone Number:</b> ${phone}</p>

                   <p><b>Email ID:</b> ${email}</p>

                   <p><b>Focus:</b> ${focusString}</p>

                   <p><b>Message:</b> ${message}</p>`,
    };

    // 2. Mail to USER (Confirmation)

    const userMail = {
      from: '"Bluestone Group" <bluestonesoftwaredeveloper@gmail.com>',

      to: email, // Sends to the person who filled the form

      subject: `Inquiry Received - Bluestone Group`,

      html: `<h3>Hello ${name},</h3>

                   <p>Thank you for reaching out to Bluestone Group of Institutions.</p>

                   <p>We have received your inquiry regarding <b>${focusString}</b>. Our strategic team will review your details and get back to you shortly.</p>

                   <br/>

                   <p>Best Regards,<br/><b>Bluestone Team</b></p>`,
    };

    // Send both

    transporter.sendMail(adminMail);

    transporter.sendMail(userMail);

    res
      .status(200)
      .json({ success: true, message: "Lead captured and emails sent" });
  });
});

// Fetch Pending Leads

app.get("/api/admin/leads", (req, res) => {
  db.query(
    "SELECT * FROM contact_inquiries ORDER BY id DESC",
    (err, results) => {
      if (err) return res.status(500).json(err);

      res.json(results);
    },
  );
});

// Fetch Approved Leads

app.get("/api/admin/approved-leads", (req, res) => {
  db.query("SELECT * FROM approved_leads ORDER BY id DESC", (err, results) => {
    if (err) return res.status(500).json(err);

    res.json(results);
  });
});

app.post("/api/admin/leads/approve/:id", (req, res) => {
    const { id } = req.params;
    const { name, email, phone, business_focus, message } = req.body;

    db.getConnection((err, conn) => {
        if (err) return res.status(500).json({ error: "DB Connection failed" });

        conn.beginTransaction((err) => {
            if (err) { conn.release(); return res.status(500).json(err); }

            const insSql = "INSERT INTO approved_leads (name, email, phone, business_focus, message) VALUES (?, ?, ?, ?, ?)";
            conn.query(insSql, [name, email, phone, business_focus, message], (err1) => {
                if (err1) return conn.rollback(() => { conn.release(); res.status(500).json({ error: "Insert failed" }); });

                conn.query("DELETE FROM contact_inquiries WHERE id = ?", [id], (err2) => {
                    if (err2) return conn.rollback(() => { conn.release(); res.status(500).json({ error: "Delete failed" }); });

                    conn.commit((err3) => {
                        if (err3) return conn.rollback(() => { conn.release(); res.status(500).json(err3); });
                        conn.release();
                        res.status(200).json({ success: true, message: "Lead Approved" });
                    });
                });
            });
        });
    });
});

// Fix: Revoke Lead (Uses transactions + release)
app.post("/api/admin/approved-leads/revoke/:id", (req, res) => {
    const { id } = req.params;
    const { name, email, phone, business_focus, message } = req.body;

    db.getConnection((err, conn) => {
        if (err) return res.status(500).json({ error: "DB Connection failed" });

        conn.beginTransaction((err) => {
            const insSql = "INSERT INTO contact_inquiries (name, email, phone, business_focus, message) VALUES (?, ?, ?, ?, ?)";
            conn.query(insSql, [name, email, phone, business_focus, message], (err1) => {
                if (err1) return conn.rollback(() => { conn.release(); res.status(500).send(err1); });

                conn.query("DELETE FROM approved_leads WHERE id = ?", [id], (err2) => {
                    if (err2) return conn.rollback(() => { conn.release(); res.status(500).send(err2); });

                    conn.commit((err3) => {
                        conn.release();
                        res.status(200).send("Lead Revoked");
                    });
                });
            });
        });
    });
});

// Fix: Delete from Approved (The 404 you were seeing)
app.delete("/api/admin/approved-leads/:id", (req, res) => {
    db.query("DELETE FROM approved_leads WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).send(err);
        res.send("Lead Deleted");
    });
});

// --- 💼 CAREER & JOB ROUTES ---

// Post Job Listing (Admin)

// Example of what your backend POST logic should look like

app.post("/api/admin/jobs", (req, res) => {
  const { title, category, location, type, salary, skills, description } =
    req.body;

  const sql =
    "INSERT INTO job_listings (title, category, location, type, salary, skills, description) VALUES (?, ?, ?, ?, ?, ?, ?)";

  db.query(
    sql,
    [title, category, location, type, salary, skills, description],
    (err, result) => {
      if (err) return res.status(500).json(err);

      res.status(200).json({ message: "Job posted successfully" });
    },
  );
});

// Delete Job (Admin)

app.delete("/api/admin/jobs/:id", (req, res) => {
  db.query("DELETE FROM job_listings WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).send(err);

    res.send("Job Deleted");
  });
});

// Get all Job Listings (Public)

app.get("/api/jobs", (req, res) => {
  db.query(
    "SELECT * FROM job_listings ORDER BY created_at DESC",
    (err, results) => {
      if (err) return res.status(500).json(err);

      res.json(results);
    },
  );
});

// Submit Application with Resume Upload

app.post("/api/jobs/apply", upload.single("resume"), (req, res) => {
  const { job_title, fullName, email, phone, message } = req.body;

  const resumePath = req.file ? req.file.path.replace(/\\/g, "/") : null;

  const sql =
    "INSERT INTO job_applications (job_title, full_name, email, phone, message, resume_path) VALUES (?, ?, ?, ?, ?, ?)";

  db.query(
    sql,
    [job_title, fullName, email, phone, message, resumePath],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      // 1. Mail to ADMIN

      const adminMail = {
        from: '"Career Portal" <bluestonesoftwaredeveloper@gmail.com>',

        to: "bluestonesoftwaredeveloper@gmail.com",

        subject: `💼 New Applicant: ${fullName} (${job_title})`,

        html: `<h3>New Job Application</h3>

                   <p><b>Candidate:</b> ${fullName}</p>

                                      <p><b>Phone Number:</b> ${phone}</p>

                   <p><b>Email ID:</b> ${email}</p>



                   <p><b>Position:</b> ${job_title}</p>

                   <p><b>Resume:</b> <a href="${API_BASE_URL}/${resumePath}">View Attached PDF</a></p>`,
      };

      // 2. Mail to CANDIDATE (Confirmation)

      const candidateMail = {
        from: '"Bluestone Careers" <bluestonesoftwaredeveloper@gmail.com>',

        to: email,

        subject: `Application Received: ${job_title}`,

        html: `<h3>Dear ${fullName},</h3>

                   <p>Thank you for applying for the <b>${job_title}</b> position at Bluestone Group.</p>

                   <p>This email confirms that we have successfully received your application and resume. Our HR team will contact you if your profile matches our requirements.</p>

                   <br/>

                   <p>Good luck!<br/><b>Bluestone HR Team</b></p>`,
      };

      transporter.sendMail(adminMail);

      transporter.sendMail(candidateMail);

      res.status(200).json({ success: true, message: "Application Submitted" });
    },
  );
});

// Get all Applications (Admin)

app.get("/api/admin/applications", (req, res) => {
  db.query(
    "SELECT * FROM job_applications ORDER BY applied_at DESC",
    (err, results) => {
      if (err) return res.status(500).json(err);

      res.json(results);
    },
  );
});

// --- 🔐 ADMIN AUTH ---

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  db.query(
    "SELECT * FROM admins WHERE username = ? AND password = ?",
    [username, password],
    (err, results) => {
      if (results && results.length > 0) {
        const token = jwt.sign({ id: results[0].id }, SECRET_KEY, {
          expiresIn: "1h",
        });

        res.json({ success: true, token });
      } else {
        res
          .status(401)
          .json({ success: false, message: "Invalid credentials" });
      }
    },
  );
});

// --- 🔐 ADMIN SETTINGS ROUTE ---

app.post("/api/admin/update-settings", (req, res) => {
  const { newUsername, newPassword } = req.body;

  // We target the first admin (ID 1) created by your SQL script

  const sql = "UPDATE admins SET username = ?, password = ? WHERE id = 1";

  db.query(sql, [newUsername, newPassword], (err, result) => {
    if (err) {
      console.error("Update Error:", err);

      return res.status(500).json({ success: false, error: err.message });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Admin user not found" });
    }

    res.json({ success: true, message: "Credentials updated successfully!" });
  });
});

// Multer Config for Media

const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, imageDir),
    filename: (req, file, cb) =>
        cb(null, `media-${Date.now()}${path.extname(file.originalname)}`),
});

// Adding strict 5MB limit to Multer
const uploadImage = multer({ 
    storage: imageStorage,
    limits: { fileSize:50 * 1024 * 1024 } // 5MB limit
});

// --- MEDIA ROUTES ---

// 1. Upload

// Example Express Route
app.post('/api/media/upload', (req, res) => {
    const { image, category, alt_text, caption } = req.body; // Expect caption

    // Ensure LONGTEXT is used in DB to prevent string cutoff
    const query = "INSERT INTO media (url, category, alt_text, caption) VALUES (?, ?, ?, ?)";
    
    db.query(query, [image, category, alt_text, caption || ''], (err, result) => {
        if (err) {
            console.error("DB Error:", err);
            return res.status(500).json({ message: "Database error" });
        }
        res.status(200).json({ message: "Uploaded successfully" });
    });
});

// 2. Fetch by Category

app.get("/api/media", (req, res) => {
  const { category, caption } = req.query;

  let sql = "SELECT * FROM media";
  let params = [];

  if (category && category !== 'all') {
    sql += " WHERE category = ?";
    params.push(category);
    
    if (caption) {
      sql += " AND caption = ?";
      params.push(caption);
    }
  }

  sql += " ORDER BY id DESC";

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // IMPORTANT: Do NOT prepend API_BASE_URL if it's a Base64 string
    res.json(results || []); 
  });
});

// DELETE ROUTE

app.delete("/api/media/:id", (req, res) => {
  db.query(
    "SELECT url FROM media WHERE id = ?",
    [req.params.id],
    (err, results) => {
      if (err || !results.length)
        return res.status(404).json({ error: "Not found" });

      const fullPath = path.join(__dirname, results[0].url);

      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

      db.query("DELETE FROM media WHERE id = ?", [req.params.id], () => {
        res.json({ success: true });
      });
    },
  );
});

app.put("/api/media/edit/:id", async (req, res) => {
    const { id } = req.params;
    const { cropData } = req.body;

    db.query("SELECT url FROM media WHERE id = ?", [id], async (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ error: "Not found" });

        try {
            const base64String = results[0].url;
            const parts = base64String.split(';base64,');
            const imageBuffer = Buffer.from(parts[1], 'base64');

            const metadata = await sharp(imageBuffer).metadata();
            const left = Math.max(0, Math.floor(cropData.x));
            const top = Math.max(0, Math.floor(cropData.y));

            const outputBuffer = await sharp(imageBuffer)
                .extract({ 
                    left, top, 
                    width: Math.min(Math.floor(cropData.width), metadata.width - left), 
                    height: Math.min(Math.floor(cropData.height), metadata.height - top) 
                })
                .toBuffer();

            const newBase64 = `data:${metadata.format === 'png' ? 'image/png' : 'image/jpeg'};base64,${outputBuffer.toString('base64')}`;

            db.query("UPDATE media SET url = ? WHERE id = ?", [newBase64, id], (updateErr) => {
                if (updateErr) throw updateErr;
                res.json({ success: true });
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
});

app.listen(5002, () =>
  console.log("🚀 Server running on http://localhost:5002"),
);
