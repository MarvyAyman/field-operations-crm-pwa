import { Link } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Home } from 'lucide-react';

// Blue header with a back arrow (RTL: the arrow points right)
// The path above the current page (home › area › street › building): every step is one tap away.
// The current page is not listed (the title already says it). Scrolls sideways when it is long.
export function Breadcrumbs({ crumbs }) {
  if (!crumbs || crumbs.length === 0) return null;
  return (
    <nav aria-label="المسار" className="mt-2">
      <ol className="flex items-center gap-1 overflow-x-auto whitespace-nowrap text-sm [scrollbar-width:none]">
        {crumbs.map((c, i) => (
          <li key={c.to} className="flex items-center gap-1 shrink-0">
            {i > 0 && <ChevronLeft className="w-4 h-4 text-white/50" aria-hidden="true" />}
            <Link
              to={c.to}
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-white/90 active:bg-white/25 max-w-[11rem] truncate"
            >
              {c.home ? <Home className="w-4 h-4" aria-label="الرئيسية" /> : c.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, subtitle, back, backState, crumbs }) {
  return (
    <header className="bg-navy text-white p-4 rounded-b-2xl shadow-md">
      <div className="flex items-center">
        {back ? (
          <Link to={back} state={backState} className="p-2" aria-label="رجوع">
            <ChevronRight className="w-6 h-6" />
          </Link>
        ) : (
          <span className="w-10" />
        )}
        <div className="mx-auto text-center">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-white/80 mt-1">{subtitle}</p>}
        </div>
        <span className="w-10" />
      </div>
      {crumbs && crumbs.length > 1 && <Breadcrumbs crumbs={crumbs} />}
    </header>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-navy font-bold mb-1">{label}</span>
      {children}
    </label>
  );
}

// "not sent yet" tag for rows that only exist on this phone so far
export function PendingBadge({ row }) {
  if (!row?._pending) return null;
  return (
    <span className="text-xs bg-gold/30 text-navy rounded-full px-2 py-0.5 mr-2 whitespace-nowrap">
      لم يُرسل بعد
    </span>
  );
}

export function Loading() {
  return <p className="text-center text-gray-500 p-10">جاري التحميل...</p>;
}

export function NotFound({ back = '/', text = 'غير موجود على هذا الجهاز' }) {
  return (
    <div className="p-10 text-center">
      <p className="text-gray-600 mb-4">{text}</p>
      <Link to={back} className="text-maroon font-bold underline">رجوع</Link>
    </div>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return <p className="text-red-600 font-bold">{children}</p>;
}

// a tappable row in a list
export function ListLink({ to, highlight = false, children }) {
  return (
    <Link
      to={to}
      className={`block p-4 rounded-xl border-2 flex justify-between items-center ${
        highlight ? 'bg-maroon text-white border-gold' : 'bg-white text-navy border-transparent shadow-sm'
      }`}
    >
      {children}
    </Link>
  );
}

