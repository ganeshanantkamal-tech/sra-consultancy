import { createContext, useContext, useEffect, useState } from 'react';
import { defaultStored, toDisplay } from './cms/model.js';

// Page content: the built-in defaults, replaced by whatever has been saved from /admin.
// If nothing is saved yet, a field is empty, or the request fails, the built-in content is shown.
export const DEFAULTS = toDisplay(defaultStored());

// The last saved content is kept per browser so repeat visits do not flash old text first
const CACHE_KEY = 'sra-content-v2';
function cached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? toDisplay(JSON.parse(raw)) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const ContentContext = createContext(DEFAULTS);

export function ContentProvider({ children }) {
  const [content, setContent] = useState(cached);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/content')
      .then((res) => (res.ok ? res.json() : null))
      .then((saved) => {
        if (cancelled || !saved) return;
        setContent(toDisplay(saved));
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ }
      })
      .catch(() => { /* keep built-in content */ });
    return () => { cancelled = true; };
  }, []);

  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>;
}

export const useContent = () => useContext(ContentContext);
