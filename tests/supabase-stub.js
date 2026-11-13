// Supabase de mentira para las pruebas: la "nube" es /__remote del servidor de pruebas (y /__blob/ para los audios),
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
    const storage = { from: () => ({
      async upload(path, blob, o) { const r = await fetch('/__blob/' + path, { method: 'PUT', body: blob, headers: { 'Content-Type': (o && o.contentType) || 'application/octet-stream' } }); return r.ok ? { data: { path }, error: null } : { data: null, error: { message: 'Bucket not found' } }; },
      async download(path) { const r = await fetch('/__blob/' + path); return r.ok ? { data: await r.blob(), error: null } : { data: null, error: { message: 'not found' } }; },
      async remove(paths) { for (const p of paths) await fetch('/__blob/' + p, { method: 'DELETE' }); return { error: null }; }
    }) };
    return { auth, from, storage };
  }
};
