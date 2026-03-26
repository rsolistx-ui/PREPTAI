// api/auth.js — PREPT AI
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Rate limit: max 10 auth attempts per IP per 15 minutes (blocks brute force)
const authAttempts = new Map();
function checkAuthRateLimit(ip) {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const max = 10;
  const entry = authAttempts.get(ip) || { count: 0, resetAt: now + window };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + window; }
  entry.count++;
  authAttempts.set(ip, entry);
  return entry.count <= max;
}

function isValidEmail(email) {
  return typeof email === "string"
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return typeof password === "string"
    && password.length >= 8
    && password.length <= 128;
}

function sanitize(str) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, 500);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://preptai.co");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // IP rate limit on auth attempts
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || "unknown";
  if (!checkAuthRateLimit(ip)) {
    return res.status(429).json({
      error: "too_many_attempts",
      message: "Too many login attempts. Please wait 15 minutes before trying again.",
    });
  }

  const { action, email, password } = req.body || {};
  const cleanAction   = sanitize(action);
  const cleanEmail    = sanitize(email)?.toLowerCase();
  const cleanPassword = password;

  if (!["signup", "login", "logout"].includes(cleanAction)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  if (cleanAction !== "logout") {
    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!isValidPassword(cleanPassword)) {
      return res.status(400).json({
        error: (cleanPassword?.length || 0) < 8
          ? "Password must be at least 8 characters."
          : "Invalid password.",
      });
    }
  }

  try {
    // ── SIGN UP ───────────────────────────────────────────────────────────────
    if (cleanAction === "signup") {
      const { data, error } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password: cleanPassword,
        email_confirm: true,
      });
      if (error) {
        if (error.message?.includes("already registered")) {
          return res.status(400).json({ error: "An account with this email already exists. Please log in." });
        }
        throw error;
      }
      // Add to subscribers as free user
      await supabase.from("subscribers").upsert(
        { email: cleanEmail, plan: "free" },
        { onConflict: "email" }
      );
      return res.status(200).json({
        success: true,
        message: "Account created. Welcome to PREPT AI.",
        user: { email: cleanEmail, plan: "free" },
      });
    }

    // ── LOG IN ────────────────────────────────────────────────────────────────
    if (cleanAction === "login") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      // Generic error — never reveal whether email exists
      if (error) return res.status(401).json({ error: "Incorrect email or password. Please try again." });

      const { data: subscriber } = await supabase
        .from("subscribers")
        .select("plan")
        .eq("email", cleanEmail)
        .single();

      const plan = subscriber?.plan || "free";

      // Auto-create subscriber record if missing
      if (!subscriber) {
        await supabase.from("subscribers").upsert(
          { email: cleanEmail, plan: "free" },
          { onConflict: "email" }
        );
      }

      return res.status(200).json({
        success: true,
        user: { email: cleanEmail, plan },
        session: data.session,
      });
    }

    // ── LOG OUT ───────────────────────────────────────────────────────────────
    if (cleanAction === "logout") {
      return res.status(200).json({ success: true });
    }

  } catch (error) {
    console.error("Auth error:", error);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
