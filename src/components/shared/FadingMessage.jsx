import { useState, useEffect } from 'react';

export default function FadingMessage({ children, onRemove, delay = 60000, duration = 5000 }) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), delay);
    const removeTimer = setTimeout(() => {
      setVisible(false);
      onRemove?.();
    }, delay + duration);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      opacity: fading ? 0 : 1,
      transition: `opacity ${duration}ms ease-out`,
    }}>
      {children}
    </div>
  );
}
