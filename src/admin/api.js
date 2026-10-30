// Calls to /api/admin. Errors carry the server's plain-language message and the HTTP status.
async function call(action, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/admin?action=${action}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  session: async () => {
    const result = await fetch('/api/erp/auth/session', { credentials: 'same-origin' });
    if (!result.ok) return { loggedIn: false };
    const { user } = await result.json();
    return { loggedIn: Boolean(user), user };
  },
  login: async (username, password) => {
    const result = await fetch('/api/erp/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) { const error = new Error(data.error || 'Unable to log in.'); error.status = result.status; throw error; }
    return data;
  },
  logout: async () => { await fetch('/api/erp/auth/logout', { method: 'POST', credentials: 'same-origin' }); },
  getContent: () => call('content'),
  saveContent: (content) => call('content', { method: 'PUT', body: { content } }),
  history: () => call('history'),
  restore: (id) => call('restore', { method: 'POST', body: { id } }),
  enquiries: () => call('enquiries'),
  updateEnquiry: (id, patch) => call('enquiry', { method: 'PATCH', body: { id, ...patch } }),
  deleteEnquiry: (id) => call('enquiry', { method: 'DELETE', body: { id } }),
};

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

// Phone photos are often 4000px and several MB; shrink to at most `max` px on the long side as JPEG
// before uploading, which keeps uploads quick and under the server's size limit.
export async function uploadPhoto(file, max = 1800) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo (JPG or PNG).');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  const { src } = await call('upload', {
    method: 'POST',
    body: { filename: file.name, contentType: 'image/jpeg', data: await toBase64(blob) },
  });
  return src;
}
