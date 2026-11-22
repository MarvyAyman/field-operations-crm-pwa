import { Link, matchPath, useLocation } from 'react-router-dom';
import { Home, Plus, Search, Users, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { openGlobalSearch } from '../searchIndex.js';

// pages that show the bar (forms hide it: they have their own save button and the keyboard)
const SHOWN = ['/', '/area/:id', '/street/:id', '/building/:id', '/family/:id', '/dashboard', '/follow-up', '/my-children'];
const HOME_GROUP = ['/', '/dashboard', '/area/:id', '/street/:id', '/building/:id', '/family/:id'];
const is = (patterns, path) => patterns.some((p) => matchPath({ path: p, end: true }, path));

// "+" adds a family where you are standing: inside an area / street / building it comes pre-filled
function addTarget(path) {
  const m = (p) => matchPath({ path: p, end: true }, path)?.params.id;
  if (m('/area/:id')) return `/family/add?area=${m('/area/:id')}`;
  if (m('/street/:id')) return `/family/add?street=${m('/street/:id')}`;
  if (m('/building/:id')) return `/family/add?building=${m('/building/:id')}`;
  return '/family/add';
}

function Item({ to, onClick, icon: Icon, label, active }) {
  const cls = `relative flex-1 flex flex-col items-center justify-center gap-1 h-full px-0.5 text-[11px] font-bold ${active ? 'text-navy' : 'text-gray-500'}`;
  const inner = (
    <>
      <Icon className="w-7 h-7" strokeWidth={active ? 2.6 : 2.2} fill={active && Icon === Home ? 'currentColor' : 'none'} />
      <span className="text-center leading-tight">{label}</span>
      {active && <span className="absolute top-0 h-1 w-10 rounded-b-full bg-navy" />}
    </>
  );
  return to
    ? <Link to={to} aria-current={active ? 'page' : undefined} className={cls}>{inner}</Link>
    : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

// Bottom navigation: الرئيسية | إضافة | بحث | زياراتي | أولادي في الاعتراف  (RTL: الرئيسية on the right)
export default function BottomNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user || pathname === '/family/add' || pathname === '/building/add' || !is(SHOWN, pathname)) return null;
  const home = is(HOME_GROUP, pathname);
  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-40 bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.07)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex h-[68px] max-w-md items-stretch px-1">
      <Item to="/" icon={Home} label="الرئيسية" active={home} />
      <Item to={addTarget(pathname)} icon={Plus} label="أسرة جديدة" active={false} />
      <button
        type="button"
        onClick={openGlobalSearch}
        aria-label="بحث"
        className="relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-maroon"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-maroon text-white shadow-lg shadow-maroon/40 -mt-1">
          <Search className="w-6 h-6" strokeWidth={2.6} />
        </span>
        <span>بحث</span>
      </button>
      <Item to="/follow-up" icon={ClipboardCheck} label="زياراتي" active={pathname === '/follow-up'} />
      <Item to="/my-children" icon={Users} label="أولادي في الاعتراف" active={pathname === '/my-children'} />
      </div>
    </nav>
  );
}
