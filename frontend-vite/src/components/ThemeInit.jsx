'use client';
// Applies the saved dark/light theme on page load (also for standalone popup windows)
import { useEffect } from 'react';

export default function ThemeInit() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem('aop-theme');
      if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    } catch (_) {}
  }, []);
  return null;
}
