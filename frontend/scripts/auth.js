// frontend/scripts/auth.js
async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    throw new Error('No token found');
  }

  options.headers = options.headers || {};
  options.headers['Authorization'] = `Bearer ${token}`;
  options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';

  const response = await fetch(url, options);
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
    throw new Error('Unauthorized');
  }
  return response;
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = 'login.html';
}