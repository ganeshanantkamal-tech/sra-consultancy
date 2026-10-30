// JSON calls to the accounting API (/api/erp). Errors carry the server's plain-language
// message and the HTTP status; a 401 also tells the shell to show the login screen.
export async function api(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(`/api/erp${path}`, {
    method,
    signal,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('erp:unauthorized'));
    const error = new Error(data?.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

api.get = (path, options) => api(path, options);
api.post = (path, body = {}) => api(path, { method: 'POST', body });
api.put = (path, body = {}) => api(path, { method: 'PUT', body });
api.del = (path) => api(path, { method: 'DELETE' });

// Opens a server-rendered document (view / pdf / excel) in a new tab.
export const openDocument = (path) => window.open(`/api/erp${path}`, '_blank', 'noopener');

export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// Phone photos are large; shrink to `max` px on the long side as JPEG before upload.
export async function shrinkImage(file, max = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  return fileToBase64(blob);
}
