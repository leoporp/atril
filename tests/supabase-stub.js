// Supabase de mentira para las pruebas: la "nube" es /__remote del servidor de pruebas,
// compartida entre los navegadores (tablet y celular). Contraseña correcta: "bien".
window.supabase = {
  createClient(url, key, opts) {
    const sk = opts.auth.storageKey;
    let session = JSON.parse(localStorage.getItem(sk) || 'null');
    const subs = [];
    const auth = {
      async getSession() { return { data: { session } }; },
      onAuthStateChange(cb) { subs.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword({ email, password }) {
        if (password !== 'bien') return { data: {}, error: { message: 'Invalid login credentials' } };
        session = { user: { id: 'u1', email } }; localStorage.setItem(sk, JSON.stringify(session));
        subs.forEach((f) => f('SIGNED_IN', session));
        return { data: { session }, error: null };
      },
      async signOut() { session = null; localStorage.removeItem(sk); subs.forEach((f) => f('SIGNED_OUT', null)); return { error: null }; }
    };
    const from = () => ({
      select() { return { eq() { return { async maybeSingle() { const r = await fetch('/__remote'); const j = await r.json(); return { data: j ? { data: j } : null, error: null }; } }; } }; },
      async upsert(row) { await fetch('/__remote', { method: 'PUT', body: JSON.stringify(row.data) }); window.__pushes = (window.__pushes || 0) + 1; return { error: null }; }
    });
    return { auth, from };
  }
};
