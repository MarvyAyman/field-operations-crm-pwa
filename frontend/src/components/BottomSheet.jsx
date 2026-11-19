import { useCallback, useEffect, useRef, useState } from 'react';

// A sheet that slides up from the bottom (like Instagram comments). Closes by: tapping the dark area, Esc,
// pulling the handle / title down, or the close() the content gets. `children` may be a function(close).
export default function BottomSheet({ title, onClose, children }) {
  const [shown, setShown] = useState(false); // false -> sheet is below the screen (start / end of the animation)
  const [drag, setDrag] = useState(0);
  const start = useRef(null);
  const dragRef = useRef(0); // latest pull distance, readable in the touch handlers without waiting for a re-render

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { cancelAnimationFrame(id); document.body.style.overflow = prev; };
  }, []);

  const close = useCallback(() => {
    setShown(false);
    setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const onTouchStart = (e) => { start.current = e.touches[0].clientY; };
  const onTouchMove = (e) => {
    if (start.current == null) return;
    dragRef.current = Math.max(0, e.touches[0].clientY - start.current);
    setDrag(dragRef.current);
  };
  const onTouchEnd = () => {
    const far = dragRef.current > 90;
    start.current = null;
    dragRef.current = 0;
    if (far) close();
    setDrag(0);
  };

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        className="absolute inset-0 bg-black transition-opacity duration-200"
        style={{ opacity: shown ? Math.max(0, 0.4 - drag / 800) : 0 }}
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md rounded-t-3xl bg-white shadow-2xl"
        style={{
          transform: `translateY(${shown ? drag : 1000}px)`,
          transition: drag ? 'none' : 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="touch-none select-none pt-2">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-gray-300" />
          <p className="px-4 py-3 text-center font-bold text-navy">{title}</p>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-3 pb-2">{typeof children === 'function' ? children(close) : children}</div>
      </div>
    </div>
  );
}
