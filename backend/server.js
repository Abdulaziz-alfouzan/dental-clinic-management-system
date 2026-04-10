const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcrypt");
const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const RECAPTCHA_SECRET_KEY = "6LdIJK0sAAAAADxMqLvwTT8HJXJCUwjTHds27FI6";

/* =========================
   HELPER FUNCTIONS
========================= */

function isValidEmail(email) {
  return /^\S+@\S+\.\S+$/.test(email);
}

function isValidPhone(phone) {
  return /^[0-9]{8,15}$/.test(phone);
}

function isValidDate(date) {
  return !isNaN(Date.parse(date));
}

/* =========================
   TEST ROUTE
========================= */

app.get("/", (req, res) => {
  res.send("API is working 🚀");
});

/* =========================
   GET ROUTES
========================= */

// GET all patients
app.get("/patients", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM "Dental_Clinic_Management_System"."patients"
      ORDER BY patient_id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET /patients error:", err.message);
    res.status(500).json({ success: false, message: "Failed to load patients" });
  }
});

// GET doctors with names from users table
app.get("/doctors", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        d.doctor_id,
        d.user_id,
        u.full_name,
        d.specialization,
        d.clinic_room,
        d.phone
      FROM "Dental_Clinic_Management_System"."doctors" d
      JOIN "Dental_Clinic_Management_System"."users" u
        ON d.user_id = u.user_id
      ORDER BY d.doctor_id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET /doctors error:", err.message);
    res.status(500).json({ success: false, message: "Failed to load doctors" });
  }
});

// GET appointments
app.get("/appointments", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM "Dental_Clinic_Management_System"."appointments"
      ORDER BY appointment_id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET /appointments error:", err.message);
    res.status(500).json({ success: false, message: "Failed to load appointments" });
  }
});

// GET prescriptions
app.get("/prescriptions", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM "Dental_Clinic_Management_System"."prescriptions"
      ORDER BY prescription_id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET /prescriptions error:", err.message);
    res.status(500).json({ success: false, message: "Failed to load prescriptions" });
  }
});

// GET patient by user_id
app.get("/my-patient/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(`
      SELECT *
      FROM "Dental_Clinic_Management_System"."patients"
      WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });
    }

    res.json({
      success: true,
      patient: result.rows[0]
    });
  } catch (err) {
    console.error("GET /my-patient/:userId error:", err.message);
    res.status(500).json({ success: false, message: "Failed to load patient profile" });
  }
});

/* =========================
   REGISTER
========================= */

app.post("/register", async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      full_name,
      email,
      password,
      confirm_password,
      phone,
      birth_date,
      address,
      emergency_contact,
      medical_notes
    } = req.body;

    if (!full_name || !email || !password || !confirm_password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, password, and confirm password are required"
      });
    }

    if (full_name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Full name must be at least 2 characters"
      });
    }

    if (!isValidEmail(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format"
      });
    }

const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

if (!passwordRegex.test(password)) {
  return res.status(400).json({
    success: false,
    message: "Password must be at least 8 characters and include uppercase and number"
  });
}

    if (password.includes(" ")) {
      return res.status(400).json({
        success: false,
        message: "Password should not contain spaces"
      });
    }

    if (password !== confirm_password) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    if (phone && !isValidPhone(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: "Phone number must contain only digits and be between 8 and 15 digits"
      });
    }

    if (birth_date && !isValidDate(birth_date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid birth date"
      });
    }

    await client.query("BEGIN");

    const existingUser = await client.query(`
      SELECT user_id
      FROM "Dental_Clinic_Management_System"."users"
      WHERE LOWER(email) = LOWER($1)
    `, [email.trim()]);

    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Email already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await client.query(`
      INSERT INTO "Dental_Clinic_Management_System"."users"
      (full_name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING user_id, full_name, email, role
    `, [full_name.trim(), email.trim(), hashedPassword, "Patient"]);

    const user_id = newUser.rows[0].user_id;

    const newPatient = await client.query(`
      INSERT INTO "Dental_Clinic_Management_System"."patients"
      (user_id, phone, birth_date, address, emergency_contact, medical_notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      user_id,
      phone ? phone.trim() : null,
      birth_date || null,
      address ? address.trim() : null,
      emergency_contact ? emergency_contact.trim() : null,
      medical_notes ? medical_notes.trim() : null
    ]);

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Patient registered successfully",
      user: newUser.rows[0],
      patient: newPatient.rows[0]
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /register error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error during registration"
    });
  } finally {
    client.release();
  }
});

/* =========================
   LOGIN
========================= */

app.post("/login", async (req, res) => {
  const { email, password, captcha } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    if (!captcha) {
      return res.status(400).json({
        success: false,
        message: "CAPTCHA is required"
      });
    }

    if (!isValidEmail(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format"
      });
    }

    const captchaVerify = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      {
        params: {
          secret: RECAPTCHA_SECRET_KEY,
          response: captcha
        }
      }
    );

    if (!captchaVerify.data.success) {
      return res.status(400).json({
        success: false,
        message: "CAPTCHA verification failed"
      });
    }

    const result = await pool.query(`
      SELECT user_id, full_name, email, role, is_active, password_hash
      FROM "Dental_Clinic_Management_System"."users"
      WHERE LOWER(email) = LOWER($1)
    `, [email.trim()]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid login"
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "This account is inactive"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid login"
      });
    }

    if (user.role !== "Patient") {
      return res.status(403).json({
        success: false,
        message: "Only patients can use this portal"
      });
    }

    res.json({
      success: true,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error("POST /login error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/* =========================
   APPOINTMENTS
========================= */

// BOOK appointment
app.post("/appointments", async (req, res) => {
  try {
    const {
      patient_id,
      doctor_id,
      appointment_date,
      appointment_time,
      status,
      reason_for_visit
    } = req.body;

    if (!patient_id || !doctor_id || !appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        message: "Patient, doctor, date, and time are required"
      });
    }

    if (!isValidDate(appointment_date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment date"
      });
    }

    const allowedTimes = ["09:00:00", "10:00:00", "13:00:00", "14:00:00"];
    if (!allowedTimes.includes(appointment_time)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment time"
      });
    }

    const finalStatus = status || "Upcoming";

    // CHECK double booking first
    const existingAppointment = await pool.query(
      `
      SELECT appointment_id
      FROM "Dental_Clinic_Management_System"."appointments"
      WHERE doctor_id = $1
        AND appointment_date = $2
        AND appointment_time = $3
        AND status != 'Cancelled'
      LIMIT 1
      `,
      [doctor_id, appointment_date, appointment_time]
    );

    if (existingAppointment.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This appointment slot is already booked"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO "Dental_Clinic_Management_System"."appointments"
      (patient_id, doctor_id, appointment_date, appointment_time, status, reason_for_visit)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        patient_id,
        doctor_id,
        appointment_date,
        appointment_time,
        finalStatus,
        reason_for_visit ? reason_for_visit.trim() : null
      ]
    );

    res.status(201).json({
      success: true,
      message: "Appointment booked successfully",
      appointment: result.rows[0]
    });
  } catch (err) {
    console.error("POST /appointments error:", err.message);

    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This appointment slot is already booked"
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while booking appointment"
    });
  }
});



// CANCEL appointment
app.put("/appointments/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT appointment_date, appointment_time, status
      FROM "Dental_Clinic_Management_System"."appointments"
      WHERE appointment_id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found"
      });
    }

    const appointment = result.rows[0];

    if (appointment.status === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Appointment already cancelled"
      });
    }

    const appointmentDateTime = new Date(
      `${appointment.appointment_date}T${appointment.appointment_time}`
    );

    const now = new Date();
    const diffInHours = (appointmentDateTime - now) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return res.status(400).json({
        success: false,
        message: "You cannot cancel this appointment less than 24 hours before."
      });
    }

    await pool.query(
      `
      UPDATE "Dental_Clinic_Management_System"."appointments"
      SET status = 'Cancelled',
          cancelled_at = NOW(),
          updated_at = NOW()
      WHERE appointment_id = $1
      `,
      [id]
    );

    res.json({
      success: true,
      message: "Appointment cancelled successfully"
    });
  } catch (err) {
    console.error("PUT /appointments/:id/cancel error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error while cancelling appointment"
    });
  }
});


// RESCHEDULE appointment
app.put("/appointments/:id/reschedule", async (req, res) => {
  try {
    const { id } = req.params;
    const { appointment_date, appointment_time } = req.body;

    if (!appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        message: "New appointment date and time are required"
      });
    }

    if (!isValidDate(appointment_date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment date"
      });
    }

    const allowedTimes = ["09:00:00", "10:00:00", "13:00:00", "14:00:00"];
    if (!allowedTimes.includes(appointment_time)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment time"
      });
    }

    const currentAppointment = await pool.query(
      `
      SELECT appointment_id, doctor_id, status, appointment_date, appointment_time
      FROM "Dental_Clinic_Management_System"."appointments"
      WHERE appointment_id = $1
      `,
      [id]
    );

    if (currentAppointment.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found"
      });
    }

    const appointment = currentAppointment.rows[0];

    if (appointment.status === "Cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cancelled appointments cannot be rescheduled"
      });
    }

    const sameAppointmentCheck = await pool.query(
      `
      SELECT appointment_id
      FROM "Dental_Clinic_Management_System"."appointments"
      WHERE appointment_id = $1
        AND appointment_date = $2
        AND appointment_time = $3
      `,
      [id, appointment_date, appointment_time]
    );

    if (sameAppointmentCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Please choose a different date or time"
      });
    }

    const existingAppointment = await pool.query(
      `
      SELECT appointment_id
      FROM "Dental_Clinic_Management_System"."appointments"
      WHERE doctor_id = $1
        AND appointment_date = $2
        AND appointment_time = $3
        AND status != 'Cancelled'
        AND appointment_id != $4
      LIMIT 1
      `,
      [appointment.doctor_id, appointment_date, appointment_time, id]
    );

    if (existingAppointment.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This new appointment slot is already booked"
      });
    }

    const updatedAppointment = await pool.query(
      `
      UPDATE "Dental_Clinic_Management_System"."appointments"
      SET appointment_date = $1,
          appointment_time = $2,
          updated_at = NOW(),
          status = 'Upcoming'
      WHERE appointment_id = $3
      RETURNING *
      `,
      [appointment_date, appointment_time, id]
    );

    res.json({
      success: true,
      message: "Appointment rescheduled successfully",
      appointment: updatedAppointment.rows[0]
    });
  } catch (err) {
    console.error("PUT /appointments/:id/reschedule error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error while rescheduling appointment"
    });
  }
});

/* =========================
   PROFILE UPDATE
========================= */

app.put("/profile/:userId", async (req, res) => {
  const client = await pool.connect();

  try {
    const { userId } = req.params;
    const {
      full_name,
      phone,
      birth_date,
      address,
      emergency_contact,
      medical_notes
    } = req.body;

    if (!full_name || full_name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Full name must be at least 2 characters"
      });
    }

    if (phone && !isValidPhone(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: "Phone number must contain only digits and be between 8 and 15 digits"
      });
    }

    if (birth_date && !isValidDate(birth_date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid birth date"
      });
    }

    await client.query("BEGIN");

    const userResult = await client.query(
      `UPDATE "Dental_Clinic_Management_System"."users"
       SET full_name = $1
       WHERE user_id = $2
       RETURNING user_id`,
      [full_name.trim(), userId]
    );

    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const patientResult = await client.query(
      `UPDATE "Dental_Clinic_Management_System"."patients"
       SET phone = $1,
           birth_date = $2,
           address = $3,
           emergency_contact = $4,
           medical_notes = $5
       WHERE user_id = $6
       RETURNING user_id`,
      [
        phone ? phone.trim() : null,
        birth_date || null,
        address ? address.trim() : null,
        emergency_contact ? emergency_contact.trim() : null,
        medical_notes ? medical_notes.trim() : null,
        userId
      ]
    );

    if (patientResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Profile updated successfully"
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PUT /profile/:userId error:", err.message);

    res.status(500).json({
      success: false,
      message: "Server error while updating profile"
    });
  } finally {
    client.release();
  }
});
  
/* =========================
   PROFILE IMAGE UPDATE
========================= */

app.put("/profile-image/:userId", async (req, res) => {
  const client = await pool.connect();

  try {
    const { userId } = req.params;
    const { profile_image } = req.body;

    if (!profile_image) {
      return res.status(400).json({
        success: false,
        message: "No image provided"
      });
    }

    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE "Dental_Clinic_Management_System"."patients"
       SET profile_image = $1
       WHERE user_id = $2
       RETURNING user_id`,
      [profile_image, userId]
    );

    // 🔥 أهم تعديل
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Profile image updated successfully"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PUT /profile-image error:", err.message);

    res.status(500).json({
      success: false,
      message: "Server error while updating image"
    });
  } finally {
    client.release();
  }
});

/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 5050;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});