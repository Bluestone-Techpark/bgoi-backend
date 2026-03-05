const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();

// Increase limits to handle Base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(cors());

const JWT_SECRET = 'bg_secret_2026';

// SMTP config (direct code config, no .env)
const SMTP_CONFIG = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for 465
    user: 'bluestonesoftwaredeveloper@gmail.com',
    pass: 'hwmo dxbr oiub mpfr',
    from: 'Bluestone CRM <bluestonetechparkcbe@gmail.com>'
};

// --- 1. DATABASE CONNECTION ---
const dbConfig = {
    host: 'auth-db1278.hstgr.io', 
    user: 'u287260207_bgoi_user',
    password: '4g@LMW2026',
    database: 'u287260207_bgoi_bg',
    connectTimeout: 15000, 
    waitForConnections: true,
    connectionLimit: 10
};

const pool = mysql.createPool(dbConfig);

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


function getLeadCodePrefix(domain = '') {
    const key = String(domain || '').trim().toLowerCase().replace(/\s+/g, ' ');

    if (key.includes('overseas')) return 'BOC';
    if (key.includes('ias')) return 'BIAS';
    if (key.includes('tech')) return 'BT';
    if (key.includes('placement')) return 'BP';
    if (key.includes('elite sport') || key.includes('sport')) return 'BES';
    if (key.includes('language')) return 'BLH';
    if (key.includes('international pre school') || key.includes('international preschool') || key.includes('preschool')) return 'BIPS';
    if (key.includes('start-up') || key.includes('startup') || key.includes('start up')) return 'BSP';
    if (key.includes('group') || key.includes('institution')) return 'BGOI';

    return 'BGOI';
}

function normalizeContactDomain(focus = '') {
    const key = String(focus || '').toLowerCase();

    if (key.includes('overseas')) return 'Overseas';
    if (key.includes('ias')) return 'IAS Academy';
    if (key.includes('tech')) return 'Techpark';
    if (key.includes('placement')) return 'Placements';
    if (key.includes('sport')) return 'Elite Sports';
    if (key.includes('language')) return 'Language Hub';
    if (key.includes('preschool')) return 'Preschool';
    if (key.includes('startup') || key.includes('business')) return 'Startup';
    if (key.includes('group')) return 'Group of Institutions';

    return focus;
}

function parseFocusList(raw = '') {
    if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean);
    return String(raw || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
}

function getDomainAliases(domain = '') {
    const key = String(domain || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const aliases = new Set();

    if (!key) return [];

    // 🔥 OVERSEAS
    if (key.includes('overseas')) {
        aliases.add('Overseas');
        aliases.add('Overseas Consulting');
        aliases.add('Bluestone Overseas');
    }

    // 🔥 IAS
    if (key.includes('ias')) {
        aliases.add('IAS Academy');
        aliases.add('IAS');
        aliases.add('Bluestone IAS Academy');
    }

    // 🔥 TECH
    if (key.includes('tech')) {
        aliases.add('Techpark');
        aliases.add('Tech Park');
        aliases.add('Bluestone Techpark');
    }

    // 🔥 PLACEMENT
    if (key.includes('placement')) {
        aliases.add('Placements');
        aliases.add('Placement Services');
        aliases.add('Placement Service');
        aliases.add('Bluestone Placements');
    }

    // 🔥 SPORTS
    if (key.includes('sport')) {
        aliases.add('Elite Sports');
        aliases.add('Sports');
        aliases.add('Bluestone Elite Sports');
    }

    // 🔥 LANGUAGE
    if (key.includes('language') || key.includes('languages')) {
        aliases.add('Language Hub');
        aliases.add('Bluestone Language Hub');
    }

    // 🔥 PRESCHOOL
    if (key.includes('preschool')) {
        aliases.add('Preschool');
        aliases.add('International Pre School');
        aliases.add('International Preschool');
        aliases.add('Bluestone Preschool');
    }

    // 🔥 STARTUP
    if (key.includes('startup') || key.includes('start up') || key.includes('start-up') || key.includes('business')) {
        aliases.add('Startup');
        aliases.add('Start-up');
        aliases.add('Business Ideas');
    }

    // 🔥 GROUP
    if (key.includes('group') || key.includes('institution')) {
        aliases.add('Group of Institutions');
        aliases.add('Bluestone Group');
    }

    // fallback
    if (aliases.size === 0) {
        aliases.add(domain);
    }

    return Array.from(aliases);
}



function appendDomainCondition(sql, params, domainValue, tableAlias = '') {
    const aliases = getDomainAliases(domainValue);
    if (aliases.length === 0) return sql;
    const col = tableAlias ? `${tableAlias}.domain` : 'domain';
    if (aliases.length === 1) {
        params.push(aliases[0]);
        return `${sql} AND ${col} = ?`;
    }
    params.push(...aliases);
    return `${sql} AND ${col} IN (${aliases.map(() => '?').join(', ')})`;
}

async function getNextLeadCode(domain, db = pool) {
    const prefix = getLeadCodePrefix(domain);
    const [rows] = await db.execute(
        `SELECT lead_code
         FROM leads
         WHERE lead_code LIKE ?
         ORDER BY CAST(SUBSTRING_INDEX(lead_code, '-', -1) AS UNSIGNED) DESC
         LIMIT 1`,
        [`${prefix}-%`]
    );

    const last = rows[0]?.lead_code || '';
    const lastNum = parseInt(String(last).split('-')[1], 10);
    const nextNum = Number.isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}

function createMailTransporter() {
    const host = SMTP_CONFIG.host;
    const port = Number(SMTP_CONFIG.port || 587);
    const user = SMTP_CONFIG.user;
    const pass = SMTP_CONFIG.pass;

    if (!host || !user || !pass) return null;

    return nodemailer.createTransport({
        host,
        port,
        secure: SMTP_CONFIG.secure ?? (port === 465),
        auth: { user, pass }
    });
}

function formatWho(user = {}) {
    const id = user?.id ? `(${user.id}) ` : '';
    return `${id}${user?.name || 'System'}`.trim();
}

function deriveTierFromRole(role = '') {
    const r = String(role || '').trim();
    if (['Main Admin', 'MD', 'GM'].includes(r)) return 'SUPER_ADMIN';
    if (['TL', 'Coordinator', 'Head'].includes(r)) return 'ADMIN';
    if (r === 'Staff') return 'STAFF';
    return 'STAFF';
}

function getUserTier(user = {}) {
    return user?.tier || deriveTierFromRole(user?.role);
}

function isSuperAdminUser(user = {}) {
    return getUserTier(user) === 'SUPER_ADMIN';
}

function isAdminUser(user = {}) {
    const t = getUserTier(user);
    return t === 'ADMIN' || t === 'SUPER_ADMIN';
}

function isStaffUser(user = {}) {
    return getUserTier(user) === 'STAFF';
}

function canUserAccessLead(lead, user) {
    if (!lead || !user) return false;
    if (isSuperAdminUser(user)) return true;
    if (getUserTier(user) === 'ADMIN') {
        const aliases = getDomainAliases(user.domain);
        return aliases.includes(lead.domain);
    }
    if (isStaffUser(user)) return Number(lead.assigned_to) === Number(user.id);
    return false;
}

// --- 2. AUTH MIDDLEWARE (FIXED) ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ msg: "Access Denied: No Token Provided" });
    }

    jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
        if (err) {
            return res.status(403).json({ msg: "Invalid or Expired Token" });
        }
        req.user = decodedUser; // Attach the user data to the request
        next();
    });
};

// --- 3. INITIALIZE TABLES ---
const initDB = async () => {
    try {
        const connection = await pool.getConnection();
await connection.query(`
    CREATE TABLE IF NOT EXISTS master_domains (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        icon_type ENUM('default', 'react_icon', 'logo') NOT NULL DEFAULT 'default',
        icon_name VARCHAR(100) NULL,
        logo_url MEDIUMTEXT NULL,
        submenus LONGTEXT NULL
    )
`);
        await connection.query(`ALTER TABLE master_domains ADD COLUMN IF NOT EXISTS icon_type ENUM('default', 'react_icon', 'logo') NOT NULL DEFAULT 'default'`);
        await connection.query(`ALTER TABLE master_domains ADD COLUMN IF NOT EXISTS icon_name VARCHAR(100) NULL`);
        await connection.query(`ALTER TABLE master_domains ADD COLUMN IF NOT EXISTS logo_url MEDIUMTEXT NULL`);
        await connection.query(`ALTER TABLE master_domains ADD COLUMN IF NOT EXISTS submenus LONGTEXT NULL`);
await connection.query(`
    CREATE TABLE IF NOT EXISTS master_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_id INT,
        category_name VARCHAR(255) NOT NULL,
        FOREIGN KEY (domain_id) REFERENCES master_domains(id) ON DELETE CASCADE
    )
`);
await connection.query(`
    CREATE TABLE IF NOT EXISTS master_values (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT,
        sub_value VARCHAR(255) NOT NULL,
        FOREIGN KEY (category_id) REFERENCES master_categories(id) ON DELETE CASCADE
    )
`);
await connection.query(`
    CREATE TABLE IF NOT EXISTS master_user_hierarchy (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tier ENUM('SUPER_ADMIN','ADMIN','STAFF') NOT NULL,
        role_name VARCHAR(100) NOT NULL UNIQUE,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);
        await connection.query(`ALTER TABLE master_user_hierarchy ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1`);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                phone VARCHAR(20) NOT NULL,
                domain VARCHAR(100) NOT NULL,
                role ENUM('MD', 'GM', 'Main Admin', 'TL', 'Staff') DEFAULT 'Staff',
                designation VARCHAR(100) NULL,
                password VARCHAR(255) NOT NULL,
                avatar MEDIUMTEXT,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                deleted_at DATETIME NULL,
                deleted_by VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Ensure avatar column exists with correct type for older databases
        await connection.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar MEDIUMTEXT`);
        await connection.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(100) NULL`);
        await connection.query(`ALTER TABLE users MODIFY COLUMN role VARCHAR(100) NOT NULL DEFAULT 'Staff'`);
        await connection.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1`);
        await connection.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL`);
        await connection.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255) NULL`);
        await connection.query(`ALTER TABLE users MODIFY COLUMN deleted_by VARCHAR(255) NULL`);
        await connection.query(`
            INSERT IGNORE INTO master_user_hierarchy (tier, role_name, is_active) VALUES
            ('SUPER_ADMIN', 'Main Admin', 1),
            ('SUPER_ADMIN', 'MD', 1),
            ('SUPER_ADMIN', 'GM', 1),
            ('ADMIN', 'TL', 1),
            ('ADMIN', 'Coordinator', 1),
            ('ADMIN', 'Head', 1),
            ('STAFF', 'Staff', 1)
        `);
        await connection.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS interested_in VARCHAR(255)`);
        await connection.query(`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS category VARCHAR(255)
`);
        await connection.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS remarks TEXT`);
        await connection.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS payment_status ENUM('Paid','Unpaid','Partially Paid') DEFAULT 'Unpaid'`);
        await connection.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS total_fees DECIMAL(12,2) DEFAULT 0`);
        await connection.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12,2) DEFAULT 0`);
        await connection.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS invalid_reason VARCHAR(255)`);
        await connection.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_code VARCHAR(20) NULL`);
        await connection.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1`);
        await connection.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL`);
        await connection.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255) NULL`);
        await connection.query(`ALTER TABLE leads MODIFY COLUMN deleted_by VARCHAR(255) NULL`);
        await connection.query(`UPDATE leads SET is_active = 1 WHERE is_active IS NULL`);
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS leads (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(20) NOT NULL,
                domain VARCHAR(100) NOT NULL,
                source VARCHAR(100),
                category VARCHAR(255),
                interested_in VARCHAR(255),
                remarks TEXT,
                lead_code VARCHAR(20) UNIQUE,
                payment_status ENUM('Paid', 'Unpaid', 'Partially Paid') DEFAULT 'Unpaid',
                total_fees DECIMAL(12,2) DEFAULT 0,
                paid_amount DECIMAL(12,2) DEFAULT 0,
                invalid_reason VARCHAR(255),
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                deleted_at DATETIME NULL,
                deleted_by VARCHAR(255) NULL,
                status ENUM('New', 'Follow Up', 'Enrolled', 'Closed') DEFAULT 'New',
                assigned_to INT,
                assigned_to_name VARCHAR(255),
                assigned_by INT,
                assigned_by_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);
        // Normalize lead_code by PREFIX (not raw domain string), collision-safe in 2 phases.
        const [allLeadRows] = await connection.query(`SELECT id, domain FROM leads ORDER BY id ASC`);
        const buckets = new Map(); // prefix -> [id]

        for (const row of allLeadRows) {
            const prefix = getLeadCodePrefix(row.domain);
            if (!buckets.has(prefix)) buckets.set(prefix, []);
            buckets.get(prefix).push(row.id);
        }

        // Phase 1: assign temporary unique codes to avoid unique-key collisions during remap
        for (const row of allLeadRows) {
            await connection.query('UPDATE leads SET lead_code = ? WHERE id = ?', [`TMP-${row.id}`, row.id]);
        }

        // Phase 2: assign final codes per prefix in id order
        for (const [prefix, ids] of buckets.entries()) {
            let seq = 1;
            for (const id of ids) {
                const expectedCode = `${prefix}-${String(seq).padStart(4, '0')}`;
                await connection.query('UPDATE leads SET lead_code = ? WHERE id = ?', [expectedCode, id]);
                seq += 1;
            }
        }

        // Create unique index AFTER normalization
        try {
            await connection.query(`ALTER TABLE leads ADD UNIQUE INDEX idx_leads_lead_code (lead_code)`);
        } catch (e) {
            const msg = String(e.message || '');
            if (!msg.includes('Duplicate key name')) throw e;
        }

        // Ensure assigned_by columns exist in existing databases
        await connection.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_by INT`);
        await connection.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_by_name VARCHAR(255)`);
        
        // Create remarks history table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS remarks_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                lead_id INT NOT NULL,
                old_remarks TEXT,
                new_remarks TEXT,
                changed_by VARCHAR(255),
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
            )
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS lead_edit_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                lead_id INT NOT NULL,
                action_type VARCHAR(100) NOT NULL,
                field_name VARCHAR(100),
                old_value TEXT,
                new_value TEXT,
                changed_by VARCHAR(255),
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
            )
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_edit_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                action_type VARCHAR(100) NOT NULL,
                field_name VARCHAR(100),
                old_value TEXT,
                new_value TEXT,
                changed_by VARCHAR(255),
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                date DATE NOT NULL,
                message TEXT NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                flag TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        await connection.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1`);
        await connection.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS flag TINYINT(1) NOT NULL DEFAULT 1`);
        await connection.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        await connection.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        await connection.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_by VARCHAR(255) DEFAULT NULL`);
        await connection.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255) DEFAULT NULL`);
        await connection.query(`UPDATE notifications SET is_active = COALESCE(is_active, flag, 1)`);
        await connection.query(`UPDATE notifications SET flag = COALESCE(flag, is_active, 1)`);
        await connection.query(`UPDATE notifications SET created_by = COALESCE(NULLIF(created_by, ''), 'System')`);
        await connection.query(`UPDATE notifications SET updated_by = COALESCE(NULLIF(updated_by, ''), created_by, 'System')`);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS lead_remarks_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                lead_id INT NOT NULL,
                ref_id VARCHAR(100) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                recipient_user_ids TEXT,
                recipient_emails TEXT,
                candidate_email VARCHAR(255),
                sent_status ENUM('SENT', 'FAILED') DEFAULT 'FAILED',
                sent_error TEXT,
                created_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
            )
        `);

        // Legacy migration: if old contact_inquiries exists, mirror into leads.
        try {
            const [legacyRows] = await connection.query(
                `SELECT id, name, email, phone, business_focus, message FROM contact_inquiries`
            );

            let migratedCount = 0;
            for (const row of legacyRows) {
                const studentName = String(row.name || '').trim();
                const studentEmail = String(row.email || '').trim() || null;
                const studentPhone = String(row.phone || '').trim();
                if (!studentName || !studentPhone) continue;

                const focusList = parseFocusList(row.business_focus);
                const interestedIn = focusList.join(', ') || null;
                const remarks = String(row.message || '').trim() || null;
                const domains = Array.from(
                    new Set((focusList.length ? focusList : ['General']).map((focus) => normalizeContactDomain(focus)))
                );

                for (const domain of domains) {
                    const [exists] = await connection.query(
                        `SELECT id
                         FROM leads
                         WHERE source = 'Website Contact'
                           AND student_name = ?
                           AND phone = ?
                           AND domain = ?
                           AND COALESCE(email, '') = COALESCE(?, '')
                         LIMIT 1`,
                        [studentName, studentPhone, domain, studentEmail]
                    );
                    if (exists.length > 0) continue;

                    const leadCode = await getNextLeadCode(domain, connection);
                    const category = 'Website Enquiry';
                    await connection.query(
                        `INSERT INTO leads
                         (student_name, email, phone, domain, source, category, interested_in, remarks, lead_code, status, created_at)
                         VALUES (?, ?, ?, ?, 'Website Contact', ?, ?, ?, ?, 'New', ?)`,
                        [
                            studentName,
                            studentEmail,
                            studentPhone,
                            domain,
                            category,
                            interestedIn,
                            remarks,
                            leadCode,
                            new Date()
                        ]
                    );
                    migratedCount += 1;
                }
            }

            if (migratedCount > 0) {
                console.log(`Migrated ${migratedCount} legacy contact enquiries into leads`);
            }
        } catch (legacyErr) {
            const legacyMsg = String(legacyErr?.message || '');
            if (!legacyMsg.toLowerCase().includes("doesn't exist")) {
                console.error('Legacy contact migration error:', legacyMsg);
            }
        }
        console.log("✅ MySQL Tables Verified and Connected");
        connection.release();
    } catch (err) {
        console.error("❌ Database Init Error:", err.message);
    }
};
initDB();

// Global error handler for body parser limits to return a friendly JSON response
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        res.status(413).json({ error: 'Payload Too Large' });
    } else {
        next(err);
    }
});

// --- 4. ROUTES ---

// Public Contact Enquiry (website form -> portal leads)
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, message, businessFocus, domain, category, interested_in } = req.body;

        if (!name || !phone || !email) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // New mode: payload from master-driven contact form
        if (domain && category && interested_in) {
            const normalizedDomain = normalizeContactDomain(domain);
            const leadCode = await getNextLeadCode(normalizedDomain);
            await pool.execute(
                `INSERT INTO leads
                 (student_name, email, phone, domain, source, category, interested_in, remarks, lead_code, status, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', 1)`,
                [
                    name,
                    email,
                    phone,
                    normalizedDomain,
                    'Website Contact',
                    category,
                    interested_in,
                    message || '',
                    leadCode
                ]
            );
            return res.json({ success: true, message: "Enquiry saved successfully" });
        }

        // Backward compatible mode: old businessFocus payload
        if (!businessFocus?.length) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const normalizedDomains = Array.from(
            new Set(
                (Array.isArray(businessFocus) ? businessFocus : [businessFocus]).map((raw) =>
                    normalizeContactDomain(raw)
                )
            )
        );

        for (const domainName of normalizedDomains) {
            const leadCode = await getNextLeadCode(domainName);
            await pool.execute(
                `INSERT INTO leads
                 (student_name, email, phone, domain, source, category, interested_in, remarks, lead_code, status, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', 1)`,
                [
                    name,
                    email,
                    phone,
                    domainName,
                    'Website Contact',
                    'Website Enquiry',
                    domainName,
                    message || '',
                    leadCode
                ]
            );
        }

        res.json({ success: true, message: "Enquiry saved successfully" });

    } catch (err) {
        console.error("CONTACT API ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// Registration Route

app.post('/api/auth/register', async (req, res) => {
    // Destructure role from req.body
    const { name, email, phone, domain, role, designation, password } = req.body; 
    
    console.log('Registering user:', { name, email, phone, domain, role });
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('Password hashed, inserting...');
        await pool.execute(
            'INSERT INTO users (name, email, phone, domain, role, designation, password) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, email, phone, domain, role, designation || null, hashedPassword] 
        );
        console.log('User inserted successfully');
        res.status(201).json({ msg: "User registered successfully" });
    } catch (err) {
        console.error("Registration error:", err);
        res.status(500).json({ error: "Registration failed" });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
        if (rows.length === 0) return res.status(400).json({ msg: "Invalid credentials" });
        
        const user = rows[0];
        const [tierRows] = await pool.execute(
            'SELECT tier FROM master_user_hierarchy WHERE role_name = ? AND is_active = 1 LIMIT 1',
            [user.role]
        );
        const tier = tierRows[0]?.tier || deriveTierFromRole(user.role);
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });

        const token = jwt.sign(
    { 
        id: user.id, 
        name: user.name, // ADD THIS LINE
        role: user.role, 
        domain: user.domain,
        tier
    },
    JWT_SECRET,
    { expiresIn: '12h' }
);
        res.json({ token, user: { id: user.id, name: user.name, role: user.role, domain: user.domain, designation: user.designation || null, tier } });
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});


// --- NEW: GRANULAR DASHBOARD STATS ---
app.get('/api/dashboard/stats/:timeframe/:type', authenticateToken, async (req, res) => {
    const { timeframe, type } = req.params; 
    let { domain } = req.query;
    const { role, domain: userDomain, id: userId } = req.user;

    // Security: Only Super Admins can query "All" or other domains
    const isSuperAdmin = isSuperAdminUser(req.user);
    if (!isSuperAdmin) domain = userDomain;

    try {
        let sql = "";
        let params = [];

        // Base Query based on Stat Type
        if (type === 'enquiry') sql = "SELECT COUNT(*) as count FROM leads WHERE is_active = 1";
        else if (type === 'followup') sql = "SELECT COUNT(*) as count FROM leads WHERE is_active = 1 AND status = 'Follow Up'";
        else if (type === 'admission') sql = "SELECT COUNT(*) as count FROM leads WHERE is_active = 1 AND status = 'Enrolled'";
        else if (type === 'pending') {
            if (isStaffUser(req.user)) {
                // Staff pending: their assigned leads with no remarks and not enrolled
                sql = "SELECT COUNT(*) as count FROM leads WHERE is_active = 1 AND assigned_to = ? AND TRIM(COALESCE(remarks, '')) = '' AND status != 'Enrolled'";
                params.push(userId);
            } else {
                // TL/Admin pending: either unassigned OR no remarks, and not enrolled
                sql = "SELECT COUNT(*) as count FROM leads WHERE is_active = 1 AND (assigned_to IS NULL OR TRIM(COALESCE(remarks, '')) = '') AND status != 'Enrolled'";
            }
        }

        // Restriction: Staff only see their own assignments
        if (isStaffUser(req.user) && type !== 'pending') {
            sql += " AND assigned_to = ?";
            params.push(userId);
        } else if (domain && domain !== 'All' && type !== 'pending') {
            sql = appendDomainCondition(sql, params, domain);
        }

        // Domain restriction for pending (staff already restricted by assigned_to)
        if (type === 'pending' && !isStaffUser(req.user) && domain && domain !== 'All') {
            sql = appendDomainCondition(sql, params, domain);
        }

        // Timeframe filter
        if (timeframe === 'today') sql += " AND DATE(created_at) = CURDATE()";

        const [rows] = await pool.execute(sql, params);
        res.json({ count: rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- NEW: TODAY & PENDING LEADS LIST ---
app.get('/api/dashboard/leads-filter', authenticateToken, async (req, res) => {
    const { role, domain: userDomain, id: userId } = req.user;
    const { filterType, domain: selectedDomain } = req.query; 

    try {
        let sql = "SELECT * FROM leads WHERE is_active = 1";
        let params = [];

        // --- Domain/Role Security ---
        const isSuperAdmin = isSuperAdminUser(req.user);
        if (!isSuperAdmin) {
            if (isStaffUser(req.user)) {
                sql += " AND assigned_to = ?";
                params.push(userId);
            } else { // ADMIN tier
                sql = appendDomainCondition(sql, params, userDomain);
            }
        } else if (selectedDomain && selectedDomain !== 'All') {
            sql = appendDomainCondition(sql, params, selectedDomain);
        }

        // --- Logic for "Today's Enquiry" ---
        if (filterType === 'today') {
            // Keep "today" table clean: only fresh New enquiries without remarks
            sql += " AND DATE(created_at) = CURDATE() AND status = 'New' AND TRIM(COALESCE(remarks, '')) = ''";
        } 
        
        // --- Logic for "Pending Tasks" ---
        else if (filterType === 'pending') {
            if (isStaffUser(req.user)) {
                // Staff Pending: Assigned to them but no remarks yet
                sql += " AND (remarks IS NULL OR remarks = '') AND status != 'Enrolled'";
            } else {
                // TL/Admin Pending: Either NOT assigned OR assigned but staff hasn't added remarks
                sql += " AND (assigned_to IS NULL OR remarks IS NULL OR remarks = '') AND status != 'Enrolled'";
            }
        }
        // --- Logic for "Updated by Staff" (moved from pending to status table) ---
        else if (filterType === 'updated') {
            if (isStaffUser(req.user)) {
                // Staff status table: assigned enquiries that are progressed
                // (status changed) OR New with remarks added
                sql += " AND assigned_to = ? AND (status != 'New' OR (status = 'New' AND TRIM(COALESCE(remarks, '')) != ''))";
                params.push(userId);
            } else {
                // TL/Admin status table: same progressed rule across accessible scope
                sql += " AND (status != 'New' OR (status = 'New' AND TRIM(COALESCE(remarks, '')) != ''))";
            }
        }

        sql += " ORDER BY created_at DESC LIMIT 15";
        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch Leads (Used by DomainPage.jsx)
// Fetch Leads (Used by DomainPage.jsx)
app.get('/api/leads', authenticateToken, async (req, res) => {
    const { domain, assignedTo, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;
    const { role, id: userId, domain: userDomain } = req.user;

    try {
        let where = "WHERE is_active = 1";
        const filters = [];
        const isSuperAdmin = isSuperAdminUser(req.user);
        const addDomainFilter = (domainValue) => {
            const aliases = getDomainAliases(domainValue);
            if (aliases.length <= 1) {
                where += " AND domain = ?";
                filters.push(aliases[0] || String(domainValue || '').trim());
                return;
            }
            where += ` AND domain IN (${aliases.map(() => '?').join(', ')})`;
            filters.push(...aliases);
        };

        if (isStaffUser(req.user)) {
            where += " AND assigned_to = ?";
            filters.push(userId);
        } else if (getUserTier(req.user) === 'ADMIN') {
            addDomainFilter(userDomain);
        } else if (domain && domain !== 'All') {
            addDomainFilter(domain);
        }

        if (assignedTo && isSuperAdmin) {
            where += " AND assigned_to = ?";
            filters.push(Number(assignedTo));
        }

        const dataSql = `SELECT * FROM leads ${where} ORDER BY id DESC LIMIT ? OFFSET ?`;
        const countSql = `SELECT COUNT(*) as total FROM leads ${where}`;

        const [rows] = await pool.execute(dataSql, [...filters, limitNum, offset]);
        const [countResult] = await pool.execute(countSql, filters);
        const total = countResult[0].total;

        res.json({
            leads: rows,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (err) {
        console.error("Lead list SQL ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Create Lead (Enquiry Form)
app.post('/api/leads', async (req, res) => {
    const { student_name, email, phone, domain, category, source, interested_in, remarks } = req.body;

    try {
        // ✅ NORMALIZE DOMAIN (CRITICAL FIX)
const normalizedDomain = normalizeContactDomain(domain);

        const leadCode = await getNextLeadCode(normalizedDomain);

        await pool.execute(
            `INSERT INTO leads 
            (student_name, email, phone, domain, category, source, interested_in, remarks, lead_code, status, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', 1)`,
            [
                student_name,
                email,
                phone,
                normalizedDomain,   // ✅ FIX HERE
                category,
                source || 'Dashboard',
                interested_in,
                remarks,
                leadCode
            ]
        );

        res.status(201).json({ msg: "Lead created", lead_code: leadCode });

    } catch (err) {
        console.error("CREATE LEAD ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});


// Update Status (Used by Dropdown in DomainPage)
app.put('/api/leads/:id/status', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const changedBy = req.user?.name || 'System';
    try {
        const [beforeRows] = await pool.execute('SELECT status FROM leads WHERE id = ?', [id]);
        if (beforeRows.length === 0) return res.status(404).json({ msg: "Lead not found" });
        const oldStatus = beforeRows[0].status;

        await pool.execute('UPDATE leads SET status = ? WHERE id = ?', [status, id]);
        await pool.execute(
            `INSERT INTO lead_edit_history (lead_id, action_type, field_name, old_value, new_value, changed_by)
             VALUES (?, 'STATUS_UPDATE', 'status', ?, ?, ?)`,
            [id, oldStatus || '', status || '', changedBy]
        );
        res.json({ msg: "Updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Payment Details (TL + Super Admin roles only)
app.put('/api/leads/:id/payment', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { payment_status, total_fees, paid_amount } = req.body;
    if (!isAdminUser(req.user)) {
        return res.status(403).json({ msg: 'Only admin tier and super admin can update payment details' });
    }

    try {
        const [beforeRows] = await pool.execute(
            'SELECT domain, payment_status, total_fees, paid_amount FROM leads WHERE id = ?',
            [id]
        );
        if (beforeRows.length === 0) return res.status(404).json({ msg: 'Lead not found' });
        const before = beforeRows[0];
        if (!isSuperAdminUser(req.user) && before.domain !== req.user.domain) {
            return res.status(403).json({ msg: 'Admin can only update payment for own domain leads' });
        }

        const allowedPaymentStatuses = ['Paid', 'Unpaid', 'Partially Paid'];
        const nextPaymentStatus = typeof payment_status === 'string' && payment_status.trim() !== ''
            ? payment_status.trim()
            : before.payment_status;
        if (!allowedPaymentStatuses.includes(nextPaymentStatus)) {
            return res.status(400).json({ msg: 'Invalid payment status value' });
        }

        const parseAmount = (value, fallback) => {
            if (value === undefined || value === null || value === '') return Number(fallback || 0);
            const num = Number(value);
            return Number.isFinite(num) ? num : NaN;
        };

        const nextTotalFees = parseAmount(total_fees, before.total_fees);
        const nextPaidAmount = parseAmount(paid_amount, before.paid_amount);
        if (Number.isNaN(nextTotalFees) || Number.isNaN(nextPaidAmount)) {
            return res.status(400).json({ msg: 'Fees and paid amount must be numbers' });
        }
        if (nextTotalFees < 0 || nextPaidAmount < 0) {
            return res.status(400).json({ msg: 'Fees and paid amount cannot be negative' });
        }

        await pool.execute(
            'UPDATE leads SET payment_status = ?, total_fees = ?, paid_amount = ? WHERE id = ?',
            [nextPaymentStatus, nextTotalFees, nextPaidAmount, id]
        );

        const changedBy = req.user?.name || 'System';
        const historyRows = [];
        if ((before.payment_status || '') !== (nextPaymentStatus || '')) {
            historyRows.push([id, 'PAYMENT_UPDATE', 'payment_status', before.payment_status || '', nextPaymentStatus || '', changedBy]);
        }
        if (Number(before.total_fees || 0) !== Number(nextTotalFees || 0)) {
            historyRows.push([id, 'PAYMENT_UPDATE', 'total_fees', String(before.total_fees || 0), String(nextTotalFees || 0), changedBy]);
        }
        if (Number(before.paid_amount || 0) !== Number(nextPaidAmount || 0)) {
            historyRows.push([id, 'PAYMENT_UPDATE', 'paid_amount', String(before.paid_amount || 0), String(nextPaidAmount || 0), changedBy]);
        }

        for (const h of historyRows) {
            await pool.execute(
                `INSERT INTO lead_edit_history (lead_id, action_type, field_name, old_value, new_value, changed_by)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                h
            );
        }

        return res.json({
            msg: 'Payment details updated',
            payment: {
                payment_status: nextPaymentStatus,
                total_fees: nextTotalFees,
                paid_amount: nextPaidAmount,
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Super-admin consolidated leads with advanced filters/sort/pagination
app.get('/api/bgi/leads', authenticateToken, async (req, res) => {
    const { role } = req.user;
  // Add 'Admin' or any other role you use in your database
if (!['Main Admin', 'MD', 'GM', 'Admin', 'SuperAdmin'].includes(role)) {
    return res.status(403).json({ error: 'Access denied' });
}

    const {
        view = 'all',
        page = 1,
        limit = 10,
        search = '',
        domain = 'All',
        status = 'All',
        payment_status = 'All',
        invalid_reason = 'All',
        sort_by = 'created_at',
        sort_order = 'desc',
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
    const offset = (pageNum - 1) * limitNum;

    const sortMap = {
        created_at: 'created_at',
        student_name: 'student_name',
        domain: 'domain',
        status: 'status',
        payment_status: 'payment_status',
        total_fees: 'total_fees',
        paid_amount: 'paid_amount',
    };
    const safeSortBy = sortMap[sort_by] || 'created_at';
    const safeSortOrder = String(sort_order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    try {
        let where = ' WHERE is_active = 1';
        const params = [];

        if (domain && domain !== 'All') {
            where = appendDomainCondition(where, params, domain);
        }
        if (status && status !== 'All') {
            where += ' AND status = ?';
            params.push(status);
        }
        if (payment_status && payment_status !== 'All') {
            where += ' AND payment_status = ?';
            params.push(payment_status);
        }
        if (invalid_reason && invalid_reason !== 'All') {
            where += ' AND invalid_reason = ?';
            params.push(invalid_reason);
        }

        const q = String(search || '').trim();
        if (q) {
            const like = `%${q}%`;
            where += ` AND (
                student_name LIKE ? OR
                email LIKE ? OR
                phone LIKE ? OR
                domain LIKE ? OR
                source LIKE ? OR
                category LIKE ? OR
                interested_in LIKE ? OR
                remarks LIKE ? OR
                assigned_to_name LIKE ? OR
                lead_code LIKE ? OR
                CAST(id AS CHAR) LIKE ?
            )`;
            params.push(like, like, like, like, like, like, like, like, like, like);
        }

        if (view === 'pending') {
            // Keep this in sync with dashboard "pending" metric for super admins.
            where += ` AND (assigned_to IS NULL OR TRIM(COALESCE(remarks, '')) = '')
                       AND status != 'Enrolled'`;
        } else if (view === 'payment') {
            where += ` AND payment_status IN ('Paid', 'Partially Paid')`;
        } else if (view === 'invalid') {
            where += ` AND status = 'Closed'`;
        }

        const countSql = `SELECT COUNT(*) AS total FROM leads ${where}`;
        const [countRows] = await pool.execute(countSql, params);
        const total = countRows[0]?.total || 0;

        const listSql = `
            SELECT *
            FROM leads
            ${where}
            ORDER BY ${safeSortBy} ${safeSortOrder}
            LIMIT ? OFFSET ?
        `;
        const [rows] = await pool.execute(listSql, [...params, limitNum, offset]);

        return res.json({
            leads: rows,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum) || 1,
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Update Remarks
app.put('/api/leads/remarks', authenticateToken, async (req, res) => {
    const { leadId, remarks } = req.body;
    const userName = req.user?.name || 'Staff'; // Use fallback to prevent SQL crash

    try {
        const [beforeRows] = await pool.execute('SELECT remarks FROM leads WHERE id = ?', [leadId]);
        const oldRemarks = beforeRows[0]?.remarks || '';

        // 1. Update the lead first (The most important part)
        await pool.execute('UPDATE leads SET remarks = ? WHERE id = ?', [remarks || '', leadId]);

        // 2. Try to log history (Wrapped in its own try/catch so it doesn't break the main save)
        try {
            await pool.execute(
                'INSERT INTO remarks_history (lead_id, old_remarks, new_remarks, changed_by) VALUES (?, ?, ?, ?)',
                [leadId, oldRemarks, remarks || '', userName]
            );
            await pool.execute(
                `INSERT INTO lead_edit_history (lead_id, action_type, field_name, old_value, new_value, changed_by)
                 VALUES (?, 'REMARKS_UPDATE', 'remarks', ?, ?, ?)`,
                [leadId, oldRemarks, remarks || '', userName]
            );
        } catch (historyErr) {
            console.error("History log failed, but remarks were saved:", historyErr.message);
        }

        // 3. Send a clean JSON response
        return res.status(200).json({ 
            success: true, 
            msg: "Remarks updated successfully",
            remarks: remarks 
        });

    } catch (err) {
        console.error("Main Update Error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Dashboard Summary
app.get('/api/dashboard/summary', authenticateToken, async (req, res) => {
    const { id, role, domain } = req.user;
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    try {
        let leadsQuery = 'SELECT * FROM leads WHERE is_active = 1';
        let countQuery = 'SELECT COUNT(*) as total FROM leads WHERE is_active = 1';
       // Find your existing statsQuery inside app.get('/api/dashboard/summary')
// REPLACE it with this version:
let statsQuery = `SELECT 
    -- Lifetime Stats
    COUNT(*) as total,
    COUNT(CASE WHEN status = 'Follow Up' THEN 1 END) as followUp,
    COUNT(CASE WHEN status = 'Enrolled' THEN 1 END) as admissions,
    -- Today's Stats
    COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as todayTotal,
    COUNT(CASE WHEN DATE(created_at) = CURDATE() AND status = 'Follow Up' THEN 1 END) as todayFollowUp,
    COUNT(CASE WHEN DATE(created_at) = CURDATE() AND status = 'Enrolled' THEN 1 END) as todayAdmissions
    FROM leads WHERE is_active = 1`;
        let params = [];
        let countParams = [];

        if (!isSuperAdminUser(req.user)) {
            if (getUserTier(req.user) === 'ADMIN') {
                leadsQuery += ' AND domain = ?';
                countQuery += ' AND domain = ?';
                statsQuery += ' AND domain = ?';
                params.push(domain);
                countParams.push(domain);
            } else {
                leadsQuery += ' AND assigned_to = ?';
                countQuery += ' AND assigned_to = ?';
                statsQuery += ' AND assigned_to = ?';
                params.push(id);
                countParams.push(id);
            }
        }
        leadsQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limitNum, offset);

        const [leads] = await pool.execute(leadsQuery, params);
        const [countResult] = await pool.execute(countQuery, countParams);
        const [stats] = await pool.execute(statsQuery, countParams);
        const total = countResult[0].total;
        
        res.json({ 
            leads, 
            stats: stats[0],
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch TLs for a domain (for multi-TL selection)
app.get('/api/tl-list', authenticateToken, async (req, res) => {
    try {
        const { role, domain } = req.user;
        let query = `
            SELECT u.id, u.name
            FROM users u
            LEFT JOIN master_user_hierarchy h ON h.role_name = u.role
            WHERE u.is_active = 1 AND COALESCE(h.tier, '${deriveTierFromRole('TL')}') = 'ADMIN'
        `;
        let params = [];

        // Only TL/Management can see other TLs
        if (!isAdminUser(req.user)) {
            return res.status(403).json({ msg: "Unauthorized" });
        }

        // If TL user, filter by their domain
        if (!isSuperAdminUser(req.user)) {
            query = appendDomainCondition(query, params, domain);
        }
        
        const [tls] = await pool.execute(query, params);
        res.json(tls);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch TLs" });
    }
});

// Fetch Staff for TL
app.get('/api/staff-list', authenticateToken, async (req, res) => {
    try {
        const { role, domain } = req.user;
        let query = `
            SELECT u.id, u.name
            FROM users u
            LEFT JOIN master_user_hierarchy h ON h.role_name = u.role
            WHERE u.is_active = 1 AND COALESCE(h.tier, '${deriveTierFromRole('Staff')}') = 'STAFF'
        `;
        let params = [];

        // TL can only see staff in their own domain
        if (!isSuperAdminUser(req.user)) {
            query = appendDomainCondition(query, params, domain);
        }
        
        const [staff] = await pool.execute(query, params);
        res.json(staff);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch staff" });
    }
});

// Assign Lead
app.post('/api/leads/assign', authenticateToken, async (req, res) => {
    const { leadId, staffId, staffName } = req.body;
    if (!isAdminUser(req.user)) {
        return res.status(403).json({ msg: "Unauthorized" });
    }
    try {
        // Get the assigner's name from the authenticated user
        const [assignerData] = await pool.execute('SELECT name FROM users WHERE id = ? AND is_active = 1', [req.user.id]);
        const assignerName = assignerData[0]?.name || 'Unknown';
        
        const [beforeRows] = await pool.execute(
            'SELECT assigned_to_name FROM leads WHERE id = ?',
            [leadId]
        );
        const oldAssignedTo = beforeRows[0]?.assigned_to_name || '';

        await pool.execute(
            'UPDATE leads SET assigned_to = ?, assigned_to_name = ?, assigned_by = ?, assigned_by_name = ? WHERE id = ?',
            [staffId, staffName, req.user.id, assignerName, leadId]
        );
        await pool.execute(
            `INSERT INTO lead_edit_history (lead_id, action_type, field_name, old_value, new_value, changed_by)
             VALUES (?, 'ASSIGNMENT_UPDATE', 'assigned_to_name', ?, ?, ?)`,
            [leadId, oldAssignedTo, staffName || '', assignerName]
        );
        res.json({ msg: "Lead assigned successfully" });
    } catch (err) {
        res.status(500).json({ error: "Assignment failed" });
    }
});

// Auto-assign leads that don't have assigned_by info yet (for backward compatibility)
app.get('/api/leads/assign-by/:userId', authenticateToken, async (req, res) => {
    const { userId } = req.params;
    try {
        // Find ADMIN-tier user(s) for this staff member's domain
        const [staffData] = await pool.execute('SELECT domain FROM users WHERE id = ? AND is_active = 1', [userId]);
        if (staffData.length === 0) return res.status(404).json({ error: "Staff not found" });
        
        const staffDomain = staffData[0].domain;
        
        // Find ALL ADMIN-tier users in the same domain
        const [tlData] = await pool.execute(
            `SELECT u.id, u.name
             FROM users u
             LEFT JOIN master_user_hierarchy h ON h.role_name = u.role
             WHERE u.domain = ? AND u.is_active = 1 AND COALESCE(h.tier, 'STAFF') = 'ADMIN'`,
            [staffDomain]
        );
        
        // If only 1 ADMIN in domain, auto-assign
        if (tlData.length === 1) {
            const tlId = tlData[0].id;
            const tlName = tlData[0].name;
            
            // Update any unassigned leads for this staff to have the ADMIN as assigned_by
            await pool.execute(
                'UPDATE leads SET assigned_by = ?, assigned_by_name = ? WHERE assigned_to = ? AND assigned_by IS NULL',
                [tlId, tlName, userId]
            );
            res.json({ msg: "Leads updated", tl: tlName });
        } else if (tlData.length > 1) {
            // If multiple ADMIN users, return the list and let frontend handle it
            res.json({ msg: "Multiple admins in domain", tls: tlData, staffId: userId });
        } else {
            res.json({ msg: "No admin found in domain" });
        }
    } catch (err) {
        res.status(500).json({ error: "Auto-assign failed" });
    }
});


app.get('/api/search/live', authenticateToken, async (req, res) => {
    const { q } = req.query;
    const { role, domain: userDomain, id: userId } = req.user;

    try {
        const query = (q || '').trim();
        if (!query) return res.json([]);

        const like = `%${query}%`;
        let sql = `
            SELECT 
                id, student_name, domain, phone, email, source, category, interested_in, 
                status, assigned_to_name, assigned_by_name, remarks, lead_code, created_at
            FROM leads 
            WHERE is_active = 1 AND (
                student_name LIKE ? OR
                phone LIKE ? OR
                email LIKE ? OR
                domain LIKE ? OR
                source LIKE ? OR
                category LIKE ? OR
                interested_in LIKE ? OR
                status LIKE ? OR
                assigned_to_name LIKE ? OR
                assigned_by_name LIKE ? OR
                remarks LIKE ? OR
                lead_code LIKE ? OR
                CAST(id AS CHAR) LIKE ?
            )
        `;
        let params = [like, like, like, like, like, like, like, like, like, like, like, like];

        // Restriction: Staff only assigned leads; TL domain scope; admins all
        if (isStaffUser(req.user)) {
            sql += " AND assigned_to = ?";
            params.push(userId);
        } else if (!isSuperAdminUser(req.user)) {
            sql = appendDomainCondition(sql, params, userDomain);
        }

        const [rows] = await pool.execute(sql + " ORDER BY created_at DESC LIMIT 25", params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/leads/bulk', authenticateToken, async (req, res) => {
    const { leads } = req.body; // Array of lead objects
    
    if (!leads || !Array.isArray(leads)) {
        return res.status(400).json({ error: "No data provided" });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

const sql = `
INSERT INTO leads 
(student_name, email, phone, domain, source, category, interested_in, remarks, lead_code, status, is_active) 
VALUES ?
`;
        const domainBuckets = {};
        for (const l of leads) {
            const d = normalizeContactDomain(String(l.domain || '').trim());
            if (!domainBuckets[d]) domainBuckets[d] = [];
            domainBuckets[d].push(l);
        }

        const codeMap = new Map();
        for (const d of Object.keys(domainBuckets)) {
            let nextCode = await getNextLeadCode(d, connection);
            let seq = parseInt(String(nextCode).split('-')[1], 10) || 1;
            const prefix = getLeadCodePrefix(d);
            for (const item of domainBuckets[d]) {
                codeMap.set(item, `${prefix}-${String(seq).padStart(4, '0')}`);
                seq += 1;
            }
        }
        
        // Transform array of objects into array of arrays for MySQL bulk insert
       const values = leads.map(l => [
    l.student_name,
    l.email,
    l.phone,
    normalizeContactDomain(String(l.domain || '').trim()),
    l.source || 'Bulk Import',
    l.category,        // ✅ ADD
    l.interested_in,
    l.remarks,
    codeMap.get(l),
    'New',
    1
]);

        await connection.query(sql, [values]);
        await connection.commit();
        
        res.json({ message: "Bulk import successful", count: values.length });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ error: "Database error during bulk import" });
    } finally {
        connection.release();
    }
});

app.get('/api/leads/domain/:domainName', authenticateToken, async (req, res) => {
    const { domainName } = req.params;
    const { page = 1, limit = 10, category = 'All', interest = 'All', status = 'All', search = '' } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const { role, id: userId, domain: userDomain } = req.user;

    try {
        let where = 'WHERE is_active = 1';
        let params = [];

        // ✅ FIXED DOMAIN MATCH (NO NORMALIZE HERE)
        const aliases = getDomainAliases(domainName);
        where += ` AND domain IN (${aliases.map(() => '?').join(', ')})`;
        params.push(...aliases);

        // ROLE
        if (isStaffUser(req.user)) {
            where += ' AND assigned_to = ?';
            params.push(userId);
        }

        // SEARCH
        if (search.trim()) {
            const like = `%${search}%`;
            where += ` AND (
                student_name LIKE ? OR
                phone LIKE ? OR
                email LIKE ? OR
                lead_code LIKE ?
            )`;
            params.push(like, like, like, like);
        }

        // FILTERS
        if (status !== 'All') {
            where += ' AND status = ?';
            params.push(status);
        }

        if (category !== 'All') {
            where += ' AND category = ?';
            params.push(category);
        }

        if (interest !== 'All') {
            where += ' AND interested_in = ?';
            params.push(interest);
        }

        const [countRows] = await pool.execute(
            `SELECT COUNT(*) as total FROM leads ${where}`,
            params
        );

        const [rows] = await pool.execute(
            `SELECT * FROM leads
             ${where}
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limitNum, offset]
        );

        res.json({
            leads: rows,
            pagination: {
                total: countRows[0].total,
                currentPage: pageNum,
                totalPages: Math.ceil(countRows[0].total / limitNum),
                pageSize: limitNum
            }
        });

    } catch (err) {
        console.error("DOMAIN ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/leads/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await pool.execute(
            'SELECT * FROM leads WHERE id = ? AND is_active = 1',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Lead not found" });
        }

        const lead = rows[0];

        if (!canUserAccessLead(lead, req.user)) {
            return res.status(403).json({ message: "Access denied" });
        }

        res.json(lead);
    } catch (err) {
        console.error("Lead details fetch error:", err);
        res.status(500).json({ error: "Failed to fetch lead details" });
    }
});

app.get('/api/leads/:id/domain-staff', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const [leadRows] = await pool.execute(
            'SELECT id, domain, assigned_to, is_active FROM leads WHERE id = ? AND is_active = 1',
            [id]
        );
        if (leadRows.length === 0) return res.status(404).json({ msg: 'Lead not found' });
        const lead = leadRows[0];
        if (!canUserAccessLead(lead, req.user)) return res.status(403).json({ msg: 'Access denied' });

        const aliases = getDomainAliases(lead.domain);
        if (aliases.length === 0) return res.json([]);
        const placeholders = aliases.map(() => '?').join(', ');
        const [rows] = await pool.execute(
            `SELECT id, name, email, phone, role, domain
             FROM users
             WHERE is_active = 1
               AND role IN ('TL', 'Staff')
               AND domain IN (${placeholders})
             ORDER BY role DESC, name ASC`,
            aliases
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Could not fetch domain staff' });
    }
});

app.get('/api/leads/:id/remark-messages', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const [leadRows] = await pool.execute(
            'SELECT id, domain, assigned_to, is_active FROM leads WHERE id = ? AND is_active = 1',
            [id]
        );
        if (leadRows.length === 0) return res.status(404).json({ msg: 'Lead not found' });
        const lead = leadRows[0];
        if (!canUserAccessLead(lead, req.user)) return res.status(403).json({ msg: 'Access denied' });

        const [rows] = await pool.execute(
            `SELECT id, lead_id, ref_id, subject, description, recipient_user_ids, recipient_emails,
                    candidate_email, sent_status, sent_error, created_by, created_at
             FROM lead_remarks_messages
             WHERE lead_id = ?
             ORDER BY created_at DESC, id DESC`,
            [id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Could not fetch remark messages' });
    }
});

app.post('/api/leads/:id/remark-messages/send', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { ref_id, subject, description, recipientUserIds = [] } = req.body;

    if (!ref_id || !subject || !description) {
        return res.status(400).json({ msg: 'ref_id, subject and description are required' });
    }

    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS lead_remarks_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                lead_id INT NOT NULL,
                ref_id VARCHAR(100) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                recipient_user_ids TEXT,
                recipient_emails TEXT,
                candidate_email VARCHAR(255),
                sent_status ENUM('SENT', 'FAILED') DEFAULT 'FAILED',
                sent_error TEXT,
                created_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
            )
        `);

        const [leadRows] = await pool.execute(
            'SELECT id, lead_code, student_name, email, domain, assigned_to, is_active FROM leads WHERE id = ? AND is_active = 1',
            [id]
        );
        if (leadRows.length === 0) return res.status(404).json({ msg: 'Lead not found' });
        const lead = leadRows[0];
        if (!canUserAccessLead(lead, req.user)) return res.status(403).json({ msg: 'Access denied' });

        const normalizedIds = Array.from(
            new Set((Array.isArray(recipientUserIds) ? recipientUserIds : [])
                .map((v) => Number(v))
                .filter((v) => Number.isInteger(v) && v > 0))
        );

        let staffRows = [];
        if (normalizedIds.length > 0) {
            const aliases = getDomainAliases(lead.domain);
            const idPlaceholders = normalizedIds.map(() => '?').join(', ');
            const domainPlaceholders = aliases.map(() => '?').join(', ');
            const [rows] = await pool.execute(
                `SELECT id, name, email, phone, role, domain
                 FROM users
                 WHERE is_active = 1
                   AND role IN ('TL', 'Staff')
                   AND id IN (${idPlaceholders})
                   AND domain IN (${domainPlaceholders})`,
                [...normalizedIds, ...aliases]
            );
            staffRows = rows;
        }

        const candidateEmail = String(lead.email || '').trim();
        const staffEmails = staffRows.map((u) => String(u.email || '').trim()).filter(Boolean);
        const toEmails = Array.from(new Set([candidateEmail, ...staffEmails].filter(Boolean)));

        const html = `
            <div style="font-family: Arial, sans-serif; line-height: 1.5;">
                <h3>Lead Remark Update</h3>
                <p><strong>Ref ID:</strong> ${String(ref_id)}</p>
                <p><strong>Candidate:</strong> ${String(lead.student_name || '')}</p>
                <p><strong>Domain:</strong> ${String(lead.domain || '')}</p>
                <p><strong>Subject:</strong> ${String(subject)}</p>
                <p><strong>Description:</strong><br/>${String(description).replace(/\n/g, '<br/>')}</p>
            </div>
        `;

        let sentStatus = 'FAILED';
        let sentError = '';
        if (toEmails.length === 0) {
            sentError = 'No recipient email available for candidate/staff';
        } else {
            const transporter = createMailTransporter();
            if (!transporter) {
                sentError = 'SMTP is not configured on server';
            } else {
                try {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.from || SMTP_CONFIG.user,
                        to: toEmails.join(','),
                        subject: `[Lead ${lead.lead_code || lead.id}] ${subject}`,
                        html
                    });
                    sentStatus = 'SENT';
                } catch (mailErr) {
                    sentError = `Mail send failed: ${mailErr.message}`;
                }
            }
        }

        const createdBy = formatWho(req.user);
        await pool.execute(
            `INSERT INTO lead_remarks_messages
             (lead_id, ref_id, subject, description, recipient_user_ids, recipient_emails, candidate_email, sent_status, sent_error, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                String(ref_id).trim(),
                String(subject).trim(),
                String(description).trim(),
                JSON.stringify(staffRows.map((u) => u.id)),
                staffEmails.join(','),
                candidateEmail || null,
                sentStatus,
                sentError || null,
                createdBy
            ]
        );

        if (sentStatus !== 'SENT') {
            return res.status(400).json({ msg: `Saved, but mail not sent: ${sentError}` });
        }
        return res.status(201).json({ msg: 'Remark saved and mail sent' });
    } catch (err) {
        console.error('Remark send route error:', err.message);
        return res.status(500).json({ error: 'Failed to save/send remark message', details: err.message });
    }
});

app.put('/api/leads/:id/remark-messages/:messageId', authenticateToken, async (req, res) => {
    const { id, messageId } = req.params;
    const { ref_id, subject, description, recipientUserIds = [] } = req.body;

    if (!ref_id || !subject || !description) {
        return res.status(400).json({ msg: 'ref_id, subject and description are required' });
    }

    try {
        const [leadRows] = await pool.execute(
            'SELECT id, lead_code, student_name, email, domain, assigned_to, is_active FROM leads WHERE id = ? AND is_active = 1',
            [id]
        );
        if (leadRows.length === 0) return res.status(404).json({ msg: 'Lead not found' });
        const lead = leadRows[0];
        if (!canUserAccessLead(lead, req.user)) return res.status(403).json({ msg: 'Access denied' });

        const [msgRows] = await pool.execute(
            'SELECT id FROM lead_remarks_messages WHERE id = ? AND lead_id = ?',
            [messageId, id]
        );
        if (msgRows.length === 0) return res.status(404).json({ msg: 'Message not found' });

        const normalizedIds = Array.from(
            new Set((Array.isArray(recipientUserIds) ? recipientUserIds : [])
                .map((v) => Number(v))
                .filter((v) => Number.isInteger(v) && v > 0))
        );

        let staffRows = [];
        if (normalizedIds.length > 0) {
            const aliases = getDomainAliases(lead.domain);
            const idPlaceholders = normalizedIds.map(() => '?').join(', ');
            const domainPlaceholders = aliases.map(() => '?').join(', ');
            const [rows] = await pool.execute(
                `SELECT id, name, email, phone, role, domain
                 FROM users
                 WHERE is_active = 1
                   AND role IN ('TL', 'Staff')
                   AND id IN (${idPlaceholders})
                   AND domain IN (${domainPlaceholders})`,
                [...normalizedIds, ...aliases]
            );
            staffRows = rows;
        }

        const candidateEmail = String(lead.email || '').trim();
        const staffEmails = staffRows.map((u) => String(u.email || '').trim()).filter(Boolean);
        const toEmails = Array.from(new Set([candidateEmail, ...staffEmails].filter(Boolean)));

        const html = `
            <div style="font-family: Arial, sans-serif; line-height: 1.5;">
                <h3>Lead Remark Update (Edited)</h3>
                <p><strong>Ref ID:</strong> ${String(ref_id)}</p>
                <p><strong>Candidate:</strong> ${String(lead.student_name || '')}</p>
                <p><strong>Domain:</strong> ${String(lead.domain || '')}</p>
                <p><strong>Subject:</strong> ${String(subject)}</p>
                <p><strong>Description:</strong><br/>${String(description).replace(/\n/g, '<br/>')}</p>
            </div>
        `;

        let sentStatus = 'FAILED';
        let sentError = '';
        if (toEmails.length === 0) {
            sentError = 'No recipient email available for candidate/staff';
        } else {
            const transporter = createMailTransporter();
            if (!transporter) {
                sentError = 'SMTP is not configured on server';
            } else {
                try {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.from || SMTP_CONFIG.user,
                        to: toEmails.join(','),
                        subject: `[Lead ${lead.lead_code || lead.id}] ${subject}`,
                        html
                    });
                    sentStatus = 'SENT';
                } catch (mailErr) {
                    sentError = `Mail send failed: ${mailErr.message}`;
                }
            }
        }

        await pool.execute(
            `UPDATE lead_remarks_messages
             SET ref_id = ?, subject = ?, description = ?, recipient_user_ids = ?, recipient_emails = ?, candidate_email = ?, sent_status = ?, sent_error = ?, created_by = ?
             WHERE id = ? AND lead_id = ?`,
            [
                String(ref_id).trim(),
                String(subject).trim(),
                String(description).trim(),
                JSON.stringify(staffRows.map((u) => u.id)),
                staffEmails.join(','),
                candidateEmail || null,
                sentStatus,
                sentError || null,
                formatWho(req.user),
                messageId,
                id
            ]
        );

        if (sentStatus !== 'SENT') {
            return res.status(400).json({ msg: `Updated, but mail not sent: ${sentError}` });
        }
        return res.json({ msg: 'Updated and mail re-sent' });
    } catch (err) {
        console.error('Remark update route error:', err.message);
        return res.status(500).json({ error: 'Failed to update/send remark message', details: err.message });
    }
});

app.delete('/api/leads/:id/remark-messages/:messageId', authenticateToken, async (req, res) => {
    const { id, messageId } = req.params;
    try {
        const [leadRows] = await pool.execute(
            'SELECT id, domain, assigned_to, is_active FROM leads WHERE id = ? AND is_active = 1',
            [id]
        );
        if (leadRows.length === 0) return res.status(404).json({ msg: 'Lead not found' });
        const lead = leadRows[0];
        if (!canUserAccessLead(lead, req.user)) return res.status(403).json({ msg: 'Access denied' });

        const [result] = await pool.execute(
            'DELETE FROM lead_remarks_messages WHERE id = ? AND lead_id = ?',
            [messageId, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ msg: 'Message not found' });
        return res.json({ msg: 'Remark message deleted' });
    } catch (err) {
        console.error('Remark delete route error:', err.message);
        return res.status(500).json({ error: 'Failed to delete remark message', details: err.message });
    }
});

// --- NOTIFICATION / LIVE FEED ROUTES ---

// 1. Get all active notifications
app.get('/api/notifications/all', authenticateToken, async (req, res) => {
    try {
        // Use [rows] to destructure the result from mysql2/promise
        const [rows] = await pool.execute(
            `SELECT id, date, message, is_active, flag, created_at, updated_at,
                    COALESCE(NULLIF(updated_by, ''), NULLIF(created_by, ''), 'System') AS updated_by
             FROM notifications
             WHERE flag = 1
             ORDER BY date DESC, id DESC`
        );
        
        // Ensure we ALWAYS return an array, even if empty
        res.json(Array.isArray(rows) ? rows : []);
    } catch (err) {
        console.error("DATABASE CRASH:", err.message);
        // If the table is missing, this is where it fails
        res.status(500).json({ error: "Table might be missing", details: err.message });
    }
});

// 2. Create Notification (allow multiple notifications for same date)
app.post('/api/notifications', authenticateToken, async (req, res) => {
    const { date, message } = req.body;
    const { role } = req.user;
    const actorName = req.user?.name || req.user?.email || "System";

    // Optional: Restrict to Admins/TLs if you don't want Staff posting broadcasts
    if (!isAdminUser(req.user)) {
        return res.status(403).json({ msg: "Not authorized to post broadcasts" });
    }

    if (!date || !message) {
        return res.status(400).json({ error: "Date and message are required" });
    }

    try {
        // Always insert a new row, even if same date exists.
        await pool.execute(
            'INSERT INTO notifications (date, message, flag, is_active, created_by, updated_by) VALUES (?, ?, 1, 1, ?, ?)',
            [date, message, actorName, actorName]
        );
        res.status(201).json({ msg: "Notification created successfully" });
    } catch (err) {
        console.error("Create notification error:", err.message);
        res.status(500).json({ error: "Database error" });
    }
});

app.put('/api/notifications/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { message, date, is_active } = req.body;
  const actorName = req.user?.name || req.user?.email || "System";

  try {
    const [result] = await pool.execute(
      `UPDATE notifications 
       SET message = ?, date = ?, is_active = ?, updated_by = ?, updated_at = NOW() 
       WHERE id = ?`,
      [message, date, is_active ?? 1, actorName, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true, message: "Updated successfully" });
  } catch (err) {
    console.error("UPDATE ERROR:", err.message);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// 3. Soft Delete (Archive) Notification
app.delete('/api/notifications/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    
    try {
        // We do a soft delete by setting flag to 0
        const [result] = await pool.execute(
            'UPDATE notifications SET flag = 0 WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ msg: "Notification not found" });
        }

        res.json({ msg: "Notification archived successfully" });
    } catch (err) {
        console.error("Delete notification error:", err.message);
        res.status(500).json({ error: "Failed to archive notification" });
    }
});

// POST: Add a new message to the day's list
app.post("/api/notifications", async (req, res) => {
  const { date, message } = req.body;

  try {
    await pool.execute(
      `INSERT INTO notifications (date, message, is_active) VALUES (?, ?, 1)`,
      [date, message]
    );

    res.json({ message: "Notification added" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/notifications/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  const actorName = req.user?.name || req.user?.email || "System";

  try {
    await pool.execute(
      `UPDATE notifications 
       SET is_active = ?, updated_by = ?, updated_at = NOW() 
       WHERE id = ?`,
      [is_active, actorName, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("TOGGLE ERROR:", err.message);
    res.status(500).json({ error: "Toggle failed" });
  }
});


// GET: Fetch ALL messages for a specific date
app.get('/api/notifications', authenticateToken, async (req, res) => {
  const { date } = req.query;

  try {
    const [rows] = await pool.execute(
      `SELECT id, date, message, is_active, flag, created_at, updated_at,
              COALESCE(NULLIF(updated_by, ''), NULLIF(created_by, ''), 'System') AS updated_by
       FROM notifications 
       WHERE DATE(date) = ? AND is_active = 1 AND flag = 1
       ORDER BY created_at DESC, id DESC`,
      [date]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Toggle active status
app.put("/api/notifications/toggle/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await pool.execute(`
      UPDATE notifications 
      SET is_active = NOT is_active 
      WHERE id = ?
    `, [id]);

    res.json({ message: "Status updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET: Fetch notification-date counts for a month (YYYY-MM) for calendar badges
app.get('/api/notifications/calendar', authenticateToken, async (req, res) => {
  const { month } = req.query; // YYYY-MM

  try {
    const [rows] = await pool.execute(
      `SELECT DATE_FORMAT(date, '%Y-%m-%d') as date_key, COUNT(*) as count
       FROM notifications
       WHERE DATE_FORMAT(date, '%Y-%m') = ?
         AND flag = 1
       GROUP BY DATE(date)
       ORDER BY DATE(date) ASC`,
      [month]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search Leads
app.get('/api/search', authenticateToken, async (req, res) => {
    const { query, page = 1, limit = 10 } = req.query;
    if (!query || query.trim().length < 1) return res.json([]);
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    try {
        const like = `%${query}%`;
        const [rows] = await pool.execute(
            `SELECT * FROM leads WHERE is_active = 1 AND (student_name LIKE ? OR phone LIKE ? OR email LIKE ? OR domain LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [like, like, like, like, limitNum, offset]
        );
        const [countResult] = await pool.execute(
            `SELECT COUNT(*) as total FROM leads WHERE is_active = 1 AND (student_name LIKE ? OR phone LIKE ? OR email LIKE ? OR domain LIKE ?)`,
            [like, like, like, like]
        );
        const total = countResult[0].total;
        
        res.json({
            leads: rows,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// Get Remarks History for a Lead
app.get('/api/remarks-history/:leadId', authenticateToken, async (req, res) => {
    const { leadId } = req.params;
    try {
        const [history] = await pool.execute(
            `SELECT id, lead_id, old_remarks, new_remarks, changed_by, changed_at 
             FROM remarks_history 
             WHERE lead_id = ? 
             ORDER BY changed_at DESC`,
            [leadId]
        );
        res.json(history);
    } catch (err) {
        console.error('Error fetching remarks history:', err);
        res.status(500).json({ error: 'Failed to fetch remarks history' });
    }
});

app.get('/api/history/leads/:leadId', authenticateToken, async (req, res) => {
    const { leadId } = req.params;
    try {
        const [rows] = await pool.execute(
            `SELECT id, lead_id, action_type, field_name, old_value, new_value, changed_by, changed_at
             FROM lead_edit_history
             WHERE lead_id = ?
             ORDER BY changed_at DESC, id DESC`,
            [leadId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch lead history' });
    }
});

app.get('/api/history/users/:userId', authenticateToken, async (req, res) => {
    const { userId } = req.params;
    try {
        const [rows] = await pool.execute(
            `SELECT id, user_id, action_type, field_name, old_value, new_value, changed_by, changed_at
             FROM user_edit_history
             WHERE user_id = ?
             ORDER BY changed_at DESC, id DESC`,
            [userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch user history' });
    }
});

// Update User Profile
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    // Destructure exactly what frontend sends
    const { name, phone, avatarBase64, oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    try {
        // 1. Handle Password Change - only if both fields are provided
        if (newPassword && oldPassword) {
            const [rows] = await pool.execute('SELECT password FROM users WHERE id = ? AND is_active = 1', [userId]);
            if (rows.length === 0) return res.status(404).json({ msg: "User not found" });

            const isMatch = await bcrypt.compare(oldPassword, rows[0].password);
            if (!isMatch) return res.status(400).json({ msg: "Old password incorrect" });

            const salt = await bcrypt.hash(newPassword, 10);
            await pool.execute('UPDATE users SET password = ? WHERE id = ? AND is_active = 1', [salt, userId]);
        }

        // 2. Update Profile Info
        // We use COALESCE or simple logic to ensure we don't overwrite with NULL if values are missing
        await pool.execute(
            'UPDATE users SET name = ?, phone = ?, avatar = ? WHERE id = ? AND is_active = 1',
            [name, phone, avatarBase64 || null, userId]
        );

        // 3. Return updated user
        const [updated] = await pool.execute(
            'SELECT id, name, email, phone, role, domain, avatar FROM users WHERE id = ? AND is_active = 1', 
            [userId]
        );
        
        res.json({ msg: "Profile Updated", user: updated[0] });

    } catch (err) {
        console.error("SERVER ERROR:", err); // Look for this in your terminal!
        res.status(500).json({ error: err.message || "Update failed" });
    }
});
// --- NEW: STAFF MANAGEMENT ROUTES ---

// 1. Fetch ALL Staff (For the Admin Directory)
// Example fix in server.js
app.get('/api/staff-directory', authenticateToken, async (req, res) => {
    try {
        // If you want everyone to see the directory, don't wrap it in a role check
        const [rows] = await pool.execute(
            'SELECT id, name, role, designation, domain, phone, email, avatar, is_active FROM users WHERE deleted_at IS NULL ORDER BY id DESC'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1b. Toggle Staff Active Status
app.patch('/api/staff/:id/status', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;

    if (!isSuperAdminUser(req.user)) {
        return res.status(403).json({ msg: "Unauthorized to update staff status." });
    }

    if (parseInt(id, 10) === req.user.id && Number(is_active) === 0) {
        return res.status(400).json({ msg: "You cannot deactivate your own account." });
    }

    try {
        const [beforeRows] = await pool.execute(
            'SELECT name, is_active FROM users WHERE id = ? AND deleted_at IS NULL',
            [id]
        );
        if (beforeRows.length === 0) {
            return res.status(404).json({ msg: "User not found" });
        }

        const before = beforeRows[0];
        await pool.execute(
            'UPDATE users SET is_active = ? WHERE id = ? AND deleted_at IS NULL',
            [
                Number(is_active) ? 1 : 0,
                id
            ]
        );

        const changedBy = req.user?.name || 'System';
        await pool.execute(
            `INSERT INTO user_edit_history (user_id, action_type, field_name, old_value, new_value, changed_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                id,
                'USER_STATUS',
                'is_active',
                String(before.is_active),
                String(Number(is_active) ? 1 : 0),
                changedBy
            ]
        );

        res.json({ msg: "Staff status updated" });
    } catch (err) {
        res.status(500).json({ error: "Failed to update staff status" });
    }
});

// 2. Delete Staff Member
app.delete('/api/staff/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
        return res.status(400).json({ msg: "You cannot delete your own account." });
    }

    // Only Main Admin/MD/GM can delete
    if (!isSuperAdminUser(req.user)) {
        return res.status(403).json({ msg: "Unauthorized to delete staff." });
    }

    try {
        const deletedBy = req.user?.id && req.user?.name
            ? `(${req.user.id}) ${req.user.name}`
            : (req.user?.name || 'System');

        const [result] = await pool.execute(
            'UPDATE users SET is_active = 0, deleted_at = NOW(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL',
            [deletedBy, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ msg: "Staff member not found or already deleted" });
        }

        res.json({ msg: "Staff member soft-deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

// 3. Edit Staff Member (Update role/domain/phone)

app.put('/api/staff/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, role, designation, domain, password } = req.body;

    // Security: Only Admins can edit
    if (!isSuperAdminUser(req.user)) {
        return res.status(403).json({ msg: "Access Denied" });
    }

    try {
        const [beforeRows] = await pool.execute(
            'SELECT name, email, phone, role, designation, domain FROM users WHERE id = ? AND is_active = 1',
            [id]
        );
        if (beforeRows.length === 0) {
            return res.status(404).json({ msg: "User not found" });
        }
        const before = beforeRows[0];

        // 1. Optional: Check if the new email is already used by another user
        if (email) {
            const [existing] = await pool.execute(
                'SELECT id FROM users WHERE email = ? AND id != ?', 
                [email, id]
            );
            if (existing.length > 0) {
                return res.status(400).json({ msg: "Email is already in use by another staff member" });
            }
        }

        let query = 'UPDATE users SET name = ?, email = ?, phone = ?, role = ?, designation = ?, domain = ?';
        let params = [name, email, phone, role, designation || null, domain];

        // 2. Only hash and update password if it's provided
        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            query += ', password = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ? AND is_active = 1';
        params.push(id);

        const [result] = await pool.execute(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ msg: "User not found" });
        }

        const changedBy = req.user?.name || 'System';
        const historyRows = [];
        if ((before.name || '') !== (name || '')) historyRows.push([id, 'USER_EDIT', 'name', before.name || '', name || '', changedBy]);
        if ((before.email || '') !== (email || '')) historyRows.push([id, 'USER_EDIT', 'email', before.email || '', email || '', changedBy]);
        if ((before.phone || '') !== (phone || '')) historyRows.push([id, 'USER_EDIT', 'phone', before.phone || '', phone || '', changedBy]);
        if ((before.role || '') !== (role || '')) historyRows.push([id, 'USER_EDIT', 'role', before.role || '', role || '', changedBy]);
        if ((before.designation || '') !== (designation || '')) historyRows.push([id, 'USER_EDIT', 'designation', before.designation || '', designation || '', changedBy]);
        if ((before.domain || '') !== (domain || '')) historyRows.push([id, 'USER_EDIT', 'domain', before.domain || '', domain || '', changedBy]);
        if (password && password.trim() !== "") historyRows.push([id, 'PASSWORD_RESET', 'password', '********', '********', changedBy]);

        for (const h of historyRows) {
            await pool.execute(
                `INSERT INTO user_edit_history (user_id, action_type, field_name, old_value, new_value, changed_by)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                h
            );
        }

        res.json({ msg: "Staff updated successfully" });
    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ error: "Database update failed" });
    }
});

// ==========================================
// 1. DOMAIN ROUTES
// ==========================================

// Get all domains
app.get('/api/master/domains', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM master_domains ORDER BY name ASC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create new domain
app.post('/api/master/domains', authenticateToken, async (req, res) => {
    if (!isSuperAdminUser(req.user)) return res.status(403).json({ msg: "Super admin only" });
    const { name, icon_type, icon_name, logo_url, submenus } = req.body;
    const safeIconType = ['default', 'react_icon', 'logo'].includes(icon_type) ? icon_type : 'default';
    const safeIconName = safeIconType === 'react_icon' ? (icon_name || null) : null;
    const safeLogoUrl = safeIconType === 'logo' ? (logo_url || null) : null;
    const safeSubmenus = JSON.stringify(
        Array.isArray(submenus)
            ? submenus
                .filter((x) => x && typeof x.name === 'string' && typeof x.path === 'string')
                .map((x) => ({ name: x.name.trim(), path: x.path.trim() }))
                .filter((x) => x.name && x.path)
            : []
    );
    try {
        await pool.execute(
            'INSERT INTO master_domains (name, icon_type, icon_name, logo_url, submenus) VALUES (?, ?, ?, ?, ?)',
            [name, safeIconType, safeIconName, safeLogoUrl, safeSubmenus]
        );
        res.json({ msg: "Domain created" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Edit Domain
app.put('/api/master/domains/:id', authenticateToken, async (req, res) => {
    const { name, icon_type, icon_name, logo_url, submenus } = req.body;
    const safeIconType = ['default', 'react_icon', 'logo'].includes(icon_type) ? icon_type : null;
    const safeIconName = safeIconType === 'react_icon' ? (icon_name || null) : null;
    const safeLogoUrl = safeIconType === 'logo' ? (logo_url || null) : null;
    const safeSubmenus = Array.isArray(submenus)
        ? JSON.stringify(
            submenus
                .filter((x) => x && typeof x.name === 'string' && typeof x.path === 'string')
                .map((x) => ({ name: x.name.trim(), path: x.path.trim() }))
                .filter((x) => x.name && x.path)
        )
        : null;
    try {
        if (safeIconType) {
            if (Array.isArray(submenus)) {
                await pool.execute(
                    'UPDATE master_domains SET name = ?, icon_type = ?, icon_name = ?, logo_url = ?, submenus = ? WHERE id = ?',
                    [name, safeIconType, safeIconName, safeLogoUrl, safeSubmenus, req.params.id]
                );
            } else {
                await pool.execute(
                    'UPDATE master_domains SET name = ?, icon_type = ?, icon_name = ?, logo_url = ? WHERE id = ?',
                    [name, safeIconType, safeIconName, safeLogoUrl, req.params.id]
                );
            }
        } else {
            await pool.execute('UPDATE master_domains SET name = ? WHERE id = ?', [name, req.params.id]);
        }
        res.json({ msg: "Domain Updated" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete Domain
app.delete('/api/master/domains/:id', authenticateToken, async (req, res) => {
    try {
        await pool.execute('DELETE FROM master_domains WHERE id = ?', [req.params.id]);
        res.json({ msg: "Domain and all associated data deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 2. CATEGORY ROUTES (Step 2)
// ==========================================

app.post('/api/master/categories', authenticateToken, async (req, res) => {
    const { domain_id, name } = req.body;
    try {
        await pool.execute('INSERT INTO master_categories (domain_id, category_name) VALUES (?, ?)', [domain_id, name]);
        res.json({ msg: "Category Added" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/master/categories/:id', authenticateToken, async (req, res) => {
    const { name } = req.body;
    try {
        await pool.execute('UPDATE master_categories SET category_name = ? WHERE id = ?', [name, req.params.id]);
        res.json({ msg: "Category Updated" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/master/categories/:id', authenticateToken, async (req, res) => {
    try {
        await pool.execute('DELETE FROM master_categories WHERE id = ?', [req.params.id]);
        res.json({ msg: "Category deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 3. VALUE ROUTES (Step 3 - Sub-values)
// ==========================================

app.post('/api/master/values', authenticateToken, async (req, res) => {
    const { category_id, value } = req.body;
    try {
        await pool.execute('INSERT INTO master_values (category_id, sub_value) VALUES (?, ?)', [category_id, value]);
        res.json({ msg: "Value Added" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/master/values/:id', authenticateToken, async (req, res) => {
    const { sub_value } = req.body;
    try {
        await pool.execute('UPDATE master_values SET sub_value = ? WHERE id = ?', [sub_value, req.params.id]);
        res.json({ msg: "Value Updated" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/master/values/:id', authenticateToken, async (req, res) => {
    try {
        await pool.execute('DELETE FROM master_values WHERE id = ?', [req.params.id]);
        res.json({ msg: "Value deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 4. USER HIERARCHY ROUTES
// ==========================================

app.get('/api/master/user-hierarchy', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT id, tier, role_name, is_active FROM master_user_hierarchy ORDER BY FIELD(tier, "SUPER_ADMIN","ADMIN","STAFF"), role_name'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/master/user-hierarchy', authenticateToken, async (req, res) => {
    if (!isSuperAdminUser(req.user)) {
        return res.status(403).json({ msg: "Unauthorized" });
    }
    const { tier, role_name, is_active } = req.body;
    if (!['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(tier) || !role_name) {
        return res.status(400).json({ msg: "Invalid payload" });
    }
    try {
        await pool.execute(
            'INSERT INTO master_user_hierarchy (tier, role_name, is_active) VALUES (?, ?, ?)',
            [tier, role_name, is_active === 0 ? 0 : 1]
        );
        res.json({ msg: "Hierarchy role added" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/master/user-hierarchy/:id', authenticateToken, async (req, res) => {
    if (!isSuperAdminUser(req.user)) {
        return res.status(403).json({ msg: "Unauthorized" });
    }
    const { tier, role_name, is_active } = req.body;
    if (!['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(tier) || !role_name) {
        return res.status(400).json({ msg: "Invalid payload" });
    }
    try {
        await pool.execute(
            'UPDATE master_user_hierarchy SET tier = ?, role_name = ?, is_active = ? WHERE id = ?',
            [tier, role_name, Number(is_active) ? 1 : 0, req.params.id]
        );
        res.json({ msg: "Hierarchy role updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/master/user-hierarchy/:id', authenticateToken, async (req, res) => {
    if (!isSuperAdminUser(req.user)) {
        return res.status(403).json({ msg: "Unauthorized" });
    }
    try {
        await pool.execute('DELETE FROM master_user_hierarchy WHERE id = ?', [req.params.id]);
        res.json({ msg: "Hierarchy role deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 5. THE MASTER VIEW (Full Structure)
// ==========================================

app.get('/api/master/full-structure', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 
                d.id as domainId, d.name as domainName, d.icon_type as domainIconType, d.icon_name as domainIconName, d.logo_url as domainLogoUrl, d.submenus as domainSubmenus,
                c.id as catId, c.category_name as catName,
                v.id as valId, v.sub_value as valName
            FROM master_domains d
            LEFT JOIN master_categories c ON d.id = c.domain_id
            LEFT JOIN master_values v ON c.id = v.category_id
            ORDER BY d.name, c.category_name
        `);

        const structure = rows.reduce((acc, row) => {
            let domain = acc.find(d => d.id === row.domainId);
            if (!domain) {
                domain = {
                    id: row.domainId,
                    name: row.domainName,
                    icon_type: row.domainIconType || 'default',
                    icon_name: row.domainIconName || null,
                    logo_url: row.domainLogoUrl || null,
                    submenus: (() => {
                        try {
                            const parsed = JSON.parse(row.domainSubmenus || '[]');
                            return Array.isArray(parsed) ? parsed : [];
                        } catch {
                            return [];
                        }
                    })(),
                    categories: []
                };
                acc.push(domain);
            }
            if (row.catId) {
                let cat = domain.categories.find(c => c.id === row.catId);
                if (!cat) {
                    cat = { id: row.catId, category_name: row.catName, values: [] };
                    domain.categories.push(cat);
                }
                if (row.valId) {
                    cat.values.push({ id: row.valId, sub_value: row.valName });
                }
            }
            return acc;
        }, []);

        res.json(structure);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE LEAD
// Note: Changed 'verifyToken' to 'authenticateToken' to match your error logs
app.delete('/api/leads/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const deletedBy = req.user?.id && req.user?.name
            ? `(${req.user.id}) ${req.user.name}`
            : (req.user?.name || 'System');

        // Soft delete: keep row in DB and just mark it inactive
        const [result] = await pool.query(
            'UPDATE leads SET is_active = 0, deleted_at = NOW(), deleted_by = ? WHERE id = ?',
            [deletedBy, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Lead not found" });
        }

        res.status(200).json({ message: "Lead soft-deleted successfully" });
    } catch (err) {
        console.error("DATABASE ERROR:", err);
        res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
});

// EDIT LEAD (UPDATE)
app.put('/api/leads/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { student_name, email, phone, category, interested_in } = req.body;

    try {
        const [beforeRows] = await pool.query(
            'SELECT student_name, email, phone, category, interested_in FROM leads WHERE id = ?',
            [id]
        );
        if (beforeRows.length === 0) {
            return res.status(404).json({ message: "Lead not found" });
        }
        const before = beforeRows[0];

        const sql = `UPDATE leads SET student_name=?, email=?, phone=?, category=?, interested_in=? WHERE id=?`;
        const [result] = await pool.query(sql, [student_name, email, phone, category, interested_in, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Lead not found" });
        }

        const changedBy = req.user?.name || 'System';
        const historyRows = [];
        if ((before.student_name || '') !== (student_name || '')) historyRows.push([id, 'LEAD_EDIT', 'student_name', before.student_name || '', student_name || '', changedBy]);
        if ((before.email || '') !== (email || '')) historyRows.push([id, 'LEAD_EDIT', 'email', before.email || '', email || '', changedBy]);
        if ((before.phone || '') !== (phone || '')) historyRows.push([id, 'LEAD_EDIT', 'phone', before.phone || '', phone || '', changedBy]);
        if ((before.category || '') !== (category || '')) historyRows.push([id, 'LEAD_EDIT', 'category', before.category || '', category || '', changedBy]);
        if ((before.interested_in || '') !== (interested_in || '')) historyRows.push([id, 'LEAD_EDIT', 'interested_in', before.interested_in || '', interested_in || '', changedBy]);

        for (const h of historyRows) {
            await pool.query(
                `INSERT INTO lead_edit_history (lead_id, action_type, field_name, old_value, new_value, changed_by)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                h
            );
        }

        res.status(200).json({ message: "Lead updated successfully" });
    } catch (err) {
        console.error("DATABASE ERROR:", err);
        res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
});



  app.get('/api/dashboard/trends-daily', async (req, res) => {
    const { domain } = req.query;
    const isAll = domain === 'All';

    const getDailyData = (status) => {
        return new Promise((resolve, reject) => {
            // Get data for last 30 days
            let sql = `
                SELECT DATE(created_at) as date, COUNT(*) as count 
                FROM leads 
                WHERE is_active = 1 AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                ${status ? 'AND status = ?' : ''}
                ${!isAll ? 'AND domain = ?' : ''}
                GROUP BY DATE(created_at)
                ORDER BY DATE(created_at) ASC
            `;

            const params = [];
            if (status) params.push(status);
            if (!isAll) params.push(domain);

            pool.query(sql, params, (err, results) => {
                if (err) return reject(err);

                // Fill gaps for dates with 0 activity
                const last30Days = [];
                for (let i = 29; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const dateStr = d.toISOString().split('T')[0];

                    const found = results.find(r => {
                        const dbDate = new Date(r.date).toISOString().split('T')[0];
                        return dbDate === dateStr;
                    });

                    last30Days.push({
                        date: dateStr,
                        value: found ? found.count : 0
                    });
                }
                resolve(last30Days);
            });
        });
    };

    try {
        const [enquiry, followup, admission] = await Promise.all([
            getDailyData('enquiry'),
            getDailyData('followup'),
            getDailyData('admission')
        ]);
        res.json({ enquiry, followup, admission });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


const PORT = 5005;
app.listen(PORT, () => {
    console.log(`🚀 Bluestone Backend active on port ${PORT}`);
});
