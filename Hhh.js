const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = new sqlite3.Database("./school_absensi.db");

const OPERATOR_CREDENTIAL = {
  username: "admin",
  password: "admin123"
};

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      class_name TEXT NOT NULL,
      jurusan TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      student_name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      jurusan TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT DEFAULT 'Hadir',
      FOREIGN KEY(student_id) REFERENCES students(id)
    )
  `);
});

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function currentTime() {
  const now = new Date();
  return now.toLocaleTimeString("id-ID", { hour12: false });
}

app.post("/api/operator/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username dan password wajib diisi." });
  }

  if (username === OPERATOR_CREDENTIAL.username && password === OPERATOR_CREDENTIAL.password) {
    return res.json({
      message: "Login operator berhasil",
      user: {
        username: "admin",
        role: "operator"
      }
    });
  }

  return res.status(401).json({ message: "Username atau password operator salah." });
});

app.post("/api/student/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username dan password wajib diisi." });
  }

  db.get("SELECT * FROM students WHERE username = ?", [username], (err, student) => {
    if (err) {
      return res.status(500).json({ message: "Gagal memeriksa siswa." });
    }

    if (!student) {
      return res.status(404).json({ message: "Siswa belum terdaftar." });
    }

    const valid = bcrypt.compareSync(password, student.password);

    if (!valid) {
      return res.status(401).json({ message: "Password siswa salah." });
    }

    return res.json({
      message: "Login siswa berhasil",
      student: {
        id: student.id,
        name: student.name,
        username: student.username,
        class_name: student.class_name,
        jurusan: student.jurusan
      }
    });
  });
});

app.post("/api/operator/students", (req, res) => {
  const { name, username, password, class_name, jurusan } = req.body;

  if (!name || !username || !password || !class_name || !jurusan) {
    return res.status(400).json({ message: "Semua field wajib diisi." });
  }

  const hash = bcrypt.hashSync(password, 8);

  db.run(
    "INSERT INTO students (name, username, password, class_name, jurusan) VALUES (?, ?, ?, ?, ?)",
    [name, username, hash, class_name, jurusan],
    function (err) {
      if (err) {
        if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
          return res.status(409).json({ message: "Username sudah digunakan." });
        }
        return res.status(500).json({ message: "Gagal menambahkan siswa." });
      }

      return res.status(201).json({
        message: "Siswa berhasil ditambahkan",
        student: {
          id: this.lastID,
          name,
          username,
          class_name,
          jurusan
        }
      });
    }
  );
});

app.get("/api/operator/students", (req, res) => {
  db.all("SELECT * FROM students ORDER BY class_name, jurusan, name ASC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Gagal mengambil data siswa." });
    }
    return res.json(rows);
  });
});

app.post("/api/student/attendance", (req, res) => {
  const { studentId, class_name, jurusan } = req.body;

  if (!studentId || !class_name || !jurusan) {
    return res.status(400).json({ message: "Data absensi tidak lengkap." });
  }

  const dateNow = todayDate();
  const timeNow = currentTime();

  db.get(
    "SELECT * FROM attendance WHERE student_id = ? AND date = ?",
    [studentId, dateNow],
    (err, existing) => {
      if (err) {
        return res.status(500).json({ message: "Gagal mengecek absensi." });
      }

      if (existing) {
        return res.status(400).json({ message: "Anda sudah melakukan absensi hari ini." });
      }

      db.get("SELECT * FROM students WHERE id = ?", [studentId], (err2, student) => {
        if (err2 || !student) {
          return res.status(404).json({ message: "Siswa tidak ditemukan." });
        }

        db.run(
          "INSERT INTO attendance (student_id, student_name, class_name, jurusan, date, time, status) VALUES (?, ?, ?, ?, ?, ?, 'Hadir')",
          [student.id, student.name, class_name, jurusan, dateNow, timeNow],
          function (err3) {
            if (err3) {
              return res.status(500).json({ message: "Gagal menyimpan absensi." });
            }

            return res.status(201).json({
              message: "Absensi berhasil disimpan",
              attendance: {
                student_id: student.id,
                student_name: student.name,
                class_name,
                jurusan,
                date: dateNow,
                time: timeNow,
                status: "Hadir"
              }
            });
          }
        );
      });
    }
  );
});

app.get("/api/operator/attendance", (req, res) => {
  const { class_name, jurusan } = req.query;

  let query = "SELECT * FROM attendance";
  const params = [];

  if (class_name || jurusan) {
    query += " WHERE";
  }

  if (class_name) {
    query += " class_name = ?";
    params.push(class_name);
  }

  if (class_name && jurusan) {
    query += " AND";
  }

  if (jurusan) {
    query += " jurusan = ?";
    params.push(jurusan);
  }

  query += " ORDER BY date DESC, time DESC";

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Gagal mengambil data absensi." });
    }

    return res.json(rows);
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Aplikasi berjalan di http://localhost:${PORT}`);
});
