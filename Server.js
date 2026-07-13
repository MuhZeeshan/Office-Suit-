const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const libre = require("libreoffice-convert");
const PDFDocument = require("pdfkit");
const { fromPath } = require("pdf2pic");

const app = express();

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================= UPLOAD FOLDER =================
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use("/uploads", express.static(uploadDir));

// ================= SQL CONFIG =================
const config = {
  user: "sa",
  password: "zeeshan123",
  server: "ZEESHAN",
  database: "scannerapp",
  options: {
    trustServerCertificate: true,
    encrypt: false,
  },
};
// ================= DB CONNECT =================
sql.connect(config)
  .then(() => console.log("✅ Connected to SQL Server"))
  .catch(err => console.log("❌ DB Connection Error:", err));

// ================= MULTER =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({ storage });

// ================= EMAIL =================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "usamazahidkayani006@gmail.com",
    pass: "skhr vetg lonh alnr",
  },
});

// ================= OTP STORE =================
let otpStore = {};

// ================= USERS =================
app.get("/users", async (req, res) => {
  try {
    const pool = await sql.connect(config);

    const result = await pool.request().query(`
      SELECT id, name, email, password, is_verified, created_at 
      FROM dbo.users
    `);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ================= FILES =================
app.get("/userfile", async (req, res) => {
  try {
    const pool = await sql.connect(config);

    const result = await pool.request().query(`
      SELECT * FROM dbo.user_files
    `);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ================= SIGNUP OTP =================
app.post("/signup", async (req, res) => {
  const { email } = req.body;

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = otp;

  await transporter.sendMail({
    from: "Scanner App",
    to: email,
    subject: "OTP Verification",
    text: `Your OTP is ${otp}`,
  });

  res.json({ message: "OTP sent" });
});

// ================= VERIFY OTP =================
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  if (otpStore[email] === otp) {
    delete otpStore[email];
    res.json({ message: "verified" });
  } else {
    res.status(400).json({ message: "invalid otp" });
  }
});

// ================= SUBMIT USER =================
app.post("/submit-user", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const pool = await sql.connect(config);

    await pool.request()
      .input("name", sql.VarChar, name)
      .input("email", sql.VarChar, email)
      .input("password", sql.VarChar, password)
      .query(`
        INSERT INTO dbo.users (name, email, password, is_verified, created_at)
        VALUES (@name, @email, @password, 1, GETDATE())
      `);

    res.json({ message: "User created" });

  } catch (err) {
    res.status(500).json({ message: "Error saving user" });
  }
});

//Change password API
app.put("/change-password", async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    const pool = await sql.connect(config);

    // 1. Get last update time
    const user = await pool.request()
      .input("user_id", sql.Int, userId)
      .query(`
        SELECT password_updated_at 
        FROM dbo.users 
        WHERE id = @user_id
      `);

    const lastUpdate = user.recordset[0]?.password_updated_at;

    if (lastUpdate) {
      const lastDate = new Date(lastUpdate);
      const now = new Date();

      const diffDays =
        (now - lastDate) / (1000 * 60 * 60 * 24);

      if (diffDays < 10) {
        return res.status(400).json({
          message: "You can change password after 10 days"
        });
      }
    }

    // userfile with their name
    app.get("/userfile/:userId", async (req, res) => {
  try {
    const pool = await sql.connect(config);

    const userId = req.params.userId;

    const result = await pool.request()
      .input("user_id", sql.Int, userId)
      .query(`
        SELECT *
        FROM dbo.user_files
        WHERE user_id = @user_id
      `);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

    // 2. Update password
    await pool.request()
      .input("user_id", sql.Int, userId)
      .input("password", sql.VarChar, newPassword)
      .query(`
        UPDATE dbo.users
        SET password = @password,
            password_updated_at = GETDATE()
        WHERE id = @user_id
      `);

    res.json({ message: "Password updated successfully" });

  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Update name APi
app.put("/update-name", async (req, res) => {
  try {
    const { userId, name } = req.body;

    const pool = await sql.connect(config);

    await pool.request()
      .input("user_id", sql.Int, userId)
      .input("name", sql.VarChar, name)
      .query(`
        UPDATE dbo.users
        SET name = @name
        WHERE id = @user_id
      `);

    res.json({ message: "Name updated successfully" });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ======================================================
// 🔥 IMAGE → PDF
// ======================================================
app.post("/image-to-pdf", upload.array("files"), async (req, res) => {
  try {
    const doc = new PDFDocument();
    const outputPath = path.join(uploadDir, `image-${Date.now()}.pdf`);
    const stream = fs.createWriteStream(outputPath);

    doc.pipe(stream);

    req.files.forEach(file => {
      doc.addPage().image(file.path, { fit: [500, 700] });
    });

    doc.end();

    stream.on("finish", () => {
      res.json({
        message: "Image to PDF done",
        url: `http://${req.headers.host}/uploads/${path.basename(outputPath)}`
      });
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ======================================================
// 🔥 PDF → IMAGE
// ======================================================
app.post("/pdf-to-image", upload.single("file"), async (req, res) => {
  try {
    const pool = await sql.connect(config);

    const userId = req.body.userId;

    const convert = fromPath(req.file.path, {
      density: 100,
      saveFilename: "page",
      savePath: uploadDir,
      format: "png",
    });

    const pages = await convert.bulk(-1);

    let savedImages = [];

    // ======================================================
    // SAVE EACH IMAGE INTO DATABASE
    // ======================================================
    for (let i = 0; i < pages.length; i++) {
      const imgPath = pages[i].path;

      const fileUrl = `http://${req.headers.host}/uploads/${path.basename(imgPath)}`;

      await pool.request()
        .input("user_id", sql.Int, userId)
        .input("file_name", sql.VarChar, `pdf-page-${i + 1}`)
        .input("file_type", sql.VarChar, "image")
        .input("file_data", sql.VarChar, fileUrl)
        .input("file_size", sql.Int, 0)
        .query(`
          INSERT INTO dbo.user_files
          (user_id, file_name, file_type, file_data, file_size, created_at)
          VALUES (@user_id, @file_name, @file_type, @file_data, @file_size, GETDATE())
        `);

      savedImages.push({
        page: i + 1,
        url: fileUrl
      });
    }

    res.json({
      message: "PDF converted and images saved in DB",
      pages: savedImages
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: err.message
    });
  }
});

// ======================================================
// 🔥 DOC / DOCX → PDF
// ======================================================
app.post("/doc-to-pdf", upload.single("file"), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const outputPath = path.join(uploadDir, `${Date.now()}.pdf`);

    libre.convert(fileBuffer, ".pdf", undefined, (err, done) => {
      if (err) return res.status(500).send(err);

      fs.writeFileSync(outputPath, done);

      res.json({
        message: "DOC to PDF done",
        url: `http://${req.headers.host}/uploads/${path.basename(outputPath)}`
      });
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ======================================================
// 🔥 PDF → DOCX
// ======================================================
app.post("/pdf-to-doc", upload.single("file"), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const outputPath = path.join(uploadDir, `${Date.now()}.docx`);

    libre.convert(fileBuffer, ".docx", undefined, (err, done) => {
      if (err) return res.status(500).send(err);

      fs.writeFileSync(outputPath, done);

      res.json({
        message: "PDF to DOCX done",
        url: `http://${req.headers.host}/uploads/${path.basename(outputPath)}`
      });
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ======================================================
// 🔥 EXCEL → PDF
// ======================================================
app.post("/excel-to-pdf", upload.single("file"), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const outputPath = path.join(uploadDir, `${Date.now()}.pdf`);

    libre.convert(fileBuffer, ".pdf", undefined, (err, done) => {
      if (err) return res.status(500).send(err);

      fs.writeFileSync(outputPath, done);

      res.json({
        message: "Excel to PDF done",
        url: `http://${req.headers.host}/uploads/${path.basename(outputPath)}`
      });
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ======================================================
// 🔥 PDF → EXCEL
// ======================================================
app.post("/pdf-to-excel", upload.single("file"), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const outputPath = path.join(uploadDir, `${Date.now()}.xlsx`);

    libre.convert(fileBuffer, ".xlsx", undefined, (err, done) => {
      if (err) return res.status(500).send(err);

      fs.writeFileSync(outputPath, done);

      res.json({
        message: "PDF to Excel done",
        url: `http://${req.headers.host}/uploads/${path.basename(outputPath)}`
      });
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ======================================================
// 🔥 PPT → PDF
// ======================================================
app.post("/ppt-to-pdf", upload.single("file"), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const outputPath = path.join(uploadDir, `${Date.now()}.pdf`);

    libre.convert(fileBuffer, ".pdf", undefined, (err, done) => {
      if (err) return res.status(500).send(err);

      fs.writeFileSync(outputPath, done);

      res.json({
        message: "PPT to PDF done",
        url: `http://${req.headers.host}/uploads/${path.basename(outputPath)}`
      });
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ======================================================
// 🔥 PDF → PPT
// ======================================================
app.post("/pdf-to-ppt", upload.single("file"), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const outputPath = path.join(uploadDir, `${Date.now()}.pptx`);

    libre.convert(fileBuffer, ".pptx", undefined, (err, done) => {
      if (err) return res.status(500).send(err);

      fs.writeFileSync(outputPath, done);

      res.json({
        message: "PDF to PPT done",
        url: `http://${req.headers.host}/uploads/${path.basename(outputPath)}`
      });
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ================= START SERVER =================
app.listen(5000, "0.0.0.0", () => {
  console.log("🚀 Server running on port 5000");
});