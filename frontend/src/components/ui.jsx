import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';

// Blue header with a back arrow (RTL: the arrow points right)
export function PageHeader({ title, subtitle, back }) {
  return (
    <header className="bg-navy text-white p-4 rounded-b-2xl shadow-md">
      <div className="flex items-center">
        {back ? (
          <Link to={back} className="p-2" aria-label="رجوع">
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

// Round "+" button floating at the bottom-right of the screen: add a family.
// `to` already carries where the user is standing (?area= / ?street= / ?building=)
export function AddFamilyFab({ to = '/family/add' }) {
  return (
    <Link
      to={to}
      aria-label="إضافة أسرة"
      title="إضافة أسرة"
      className="fixed bottom-5 right-5 z-40 w-16 h-16 rounded-full bg-maroon text-white shadow-lg shadow-black/30 flex items-center justify-center active:scale-95 transition-transform"
    >
      <Plus className="w-8 h-8" strokeWidth={2.5} />
    </Link>
  );
}
