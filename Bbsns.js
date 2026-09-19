const api = {
  async post(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Terjadi kesalahan.");
    }
    return data;
  },

  async get(url) {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Terjadi kesalahan.");
    }
    return data;
  }
};

const modeButtons = document.querySelectorAll(".mode-btn");
const studentLoginCard = document.getElementById("studentLoginCard");
const operatorLoginCard = document.getElementById("operatorLoginCard");

const authView = document.getElementById("authView");
const studentDashboard = document.getElementById("studentDashboard");
const operatorDashboard = document.getElementById("operatorDashboard");

const studentLoginForm = document.getElementById("studentLoginForm");
const operatorLoginForm = document.getElementById("operatorLoginForm");
const addStudentForm = document.getElementById("addStudentForm");
const attendanceFilterForm = document.getElementById("attendanceFilterForm");

function showMessage(elementId, text, type = "success") {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.className = "message " + type;
  el.textContent = text;
}

function setMode(mode) {
  modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle("active", active);
  });

  studentLoginCard.classList.toggle("hidden", mode !== "student");
  operatorLoginCard.classList.toggle("hidden", mode !== "operator");
}

function saveSession(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadSession(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

function clearSession() {
  localStorage.removeItem("session");
}

function renderStudentDashboard(student) {
  const profile = document.getElementById("studentProfile");
  profile.innerHTML = `
    <p><strong>Nama:</strong> ${student.name}</p>
    <p><strong>Username:</strong> ${student.username}</p>
    <p><strong>Kelas:</strong> ${student.class_name}</p>
    <p><strong>Jurusan:</strong> ${student.jurusan}</p>
  `;
}

function checkSession() {
  const session = loadSession("session");

  if (!session) {
    authView.classList.remove("hidden");
    studentDashboard.classList.add("hidden");
    operatorDashboard.classList.add("hidden");
    return;
  }

  authView.classList.add("hidden");

  if (session.role === "student") {
    renderStudentDashboard(session.student);
    studentDashboard.classList.remove("hidden");
    operatorDashboard.classList.add("hidden");
  }

  if (session.role === "operator") {
    operatorDashboard.classList.remove("hidden");
    studentDashboard.classList.add("hidden");
    loadStudents();
    loadAttendance();
  }
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

studentLoginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("studentUsername").value.trim();
  const password = document.getElementById("studentPassword").value.trim();

  try {
    const result = await api.post("/api/student/login", { username, password });
    saveSession("session", { role: "student", student: result.student });
    renderStudentDashboard(result.student);
    authView.classList.add("hidden");
    studentDashboard.classList.remove("hidden");
    operatorDashboard.classList.add("hidden");
    showMessage("studentLoginMessage", result.message, "success");
  } catch (error) {
    showMessage("studentLoginMessage", error.message, "error");
  }
});

operatorLoginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("operatorUsername").value.trim();
  const password = document.getElementById("operatorPassword").value.trim();

  try {
    const result = await api.post("/api/operator/login", { username, password });
    saveSession("session", { role: "operator", user: result.user });
    authView.classList.add("hidden");
    studentDashboard.classList.add("hidden");
    operatorDashboard.classList.remove("hidden");
    showMessage("operatorLoginMessage", result.message, "success");
    loadStudents();
    loadAttendance();
  } catch (error) {
    showMessage("operatorLoginMessage", error.message, "error");
  }
});

addStudentForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    name: document.getElementById("studentName").value.trim(),
    username: document.getElementById("studentUsernameRegister").value.trim(),
    password: document.getElementById("studentPasswordRegister").value.trim(),
    class_name: document.getElementById("studentClass").value.trim(),
    jurusan: document.getElementById("studentJurusan").value.trim()
  };

  try {
    const result = await api.post("/api/operator/students", payload);
    showMessage("studentRegisterMessage", result.message, "success");
    addStudentForm.reset();
    loadStudents();
  } catch (error) {
    showMessage("studentRegisterMessage", error.message, "error");
  }
});

attendanceFilterForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await loadAttendance();
});

async function loadStudents() {
  try {
    const students = await api.get("/api/operator/students");
    const tbody = document.getElementById("studentsTableBody");
    tbody.innerHTML = "";

    students.forEach((student) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${student.name}</td>
        <td>${student.username}</td>
        <td>${student.class_name}</td>
        <td>${student.jurusan}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error(error.message);
  }
}

async function loadAttendance() {
  try {
    const className = document.getElementById("filterClass").value.trim();
    const jurusan = document.getElementById("filterJurusan").value.trim();

    const query = new URLSearchParams();
    if (className) query.append("class_name", className);
    if (jurusan) query.append("jurusan", jurusan);

    const attendance = await api.get(`/api/operator/attendance?${query.toString()}`);

    const tbody = document.getElementById("attendanceTableBody");
    tbody.innerHTML = "";

    attendance.forEach((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${item.student_name}</td>
        <td>${item.class_name}</td>
        <td>${item.jurusan}</td>
        <td>${item.date}</td>
        <td>${item.time}</td>
        <td>${item.status}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error(error.message);
  }
}

document.getElementById("studentAttendanceBtn").addEventListener("click", async () => {
  const session = loadSession("session");
  if (!session || session.role !== "student") {
    showMessage("studentAttendanceMessage", "Login siswa terlebih dahulu.", "error");
    return;
  }

  try {
    const result = await api.post("/api/student/attendance", {
      studentId: session.student.id,
      class_name: session.student.class_name,
      jurusan: session.student.jurusan
    });

    showMessage("studentAttendanceMessage", result.message, "success");
  } catch (error) {
    showMessage("studentAttendanceMessage", error.message, "error");
  }
});

document.getElementById("studentLogoutBtn").addEventListener("click", () => {
  clearSession();
  authView.classList.remove("hidden");
  studentDashboard.classList.add("hidden");
  operatorDashboard.classList.add("hidden");
  setMode("student");
});

document.getElementById("operatorLogoutBtn").addEventListener("click", () => {
  clearSession();
  authView.classList.remove("hidden");
  studentDashboard.classList.add("hidden");
  operatorDashboard.classList.add("hidden");
  setMode("operator");
});

setMode("student");
checkSession();
