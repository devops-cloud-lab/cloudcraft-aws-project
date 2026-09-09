// Fetch and display visit count from backend (backed by RDS)
fetch('/api/visits')
  .then(res => res.json())
  .then(data => {
    document.getElementById('visit-count').textContent = data.count;
  })
  .catch(() => {
    document.getElementById('visit-count').textContent = 'N/A';
  });

// Handle contact form submission
document.getElementById('contact-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const message = document.getElementById('message').value;
  const statusEl = document.getElementById('form-status');

  statusEl.textContent = 'Sending...';

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message })
    });
    if (res.ok) {
      statusEl.textContent = 'Thanks! Your message was saved.';
      document.getElementById('contact-form').reset();
    } else {
      statusEl.textContent = 'Something went wrong. Please try again.';
    }
  } catch (err) {
    statusEl.textContent = 'Network error. Please try again.';
  }
});
