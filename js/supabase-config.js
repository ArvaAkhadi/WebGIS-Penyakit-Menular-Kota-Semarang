/* =========================================================
   KONFIGURASI SUPABASE
   Ganti 2 nilai di bawah dengan milik Anda
   (dari Settings → API di dashboard Supabase)
   ========================================================= */
const SUPABASE_URL  = 'https://glytzlguarcjehvzyomg.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseXR6bGd1YXJjamVodnp5b21nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDM4MzQsImV4cCI6MjEwNTU3OTgzNH0.-Fk3-Y37JeNDbu70E5Ec5fHyhjGvg9YMucWJPX6hc8s';

/* Inisialisasi client (pakai CDN library) */
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* =========================================================
   SESSION HELPER (localStorage)
   ========================================================= */
const SESSION_KEY = 'webgis_session';

function setSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function isAdmin() {
  const s = getSession();
  return s && s.role === 'admin';
}

function isLoggedIn() {
  return getSession() !== null;
}

/* Guard: redirect kalau bukan admin */
function requireAdmin() {
  if (!isAdmin()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

/* Guard: redirect kalau belum login (user/admin) */
function requireLogin() {
  if (!isLoggedIn()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}