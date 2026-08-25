(() => {
  const form = document.getElementById('login-form');
  const button = document.getElementById('submit');
  const error = document.getElementById('error');
  const password = document.getElementById('password');
  if (!form || !button || !error || !password) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.textContent = '';
    button.disabled = true;
    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.value })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar sesión');
      window.location.replace('/');
    } catch (err) {
      error.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
})();
