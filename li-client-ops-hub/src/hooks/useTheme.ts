import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'ops-hub-theme';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'dark' || stored === 'light') return stored;
  return 'dark'; // default to dark
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggle };
}
