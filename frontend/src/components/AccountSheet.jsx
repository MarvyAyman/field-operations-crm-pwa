import { useState } from 'react';
import { LogOut, Minus, Plus } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import PriestAvatar from './PriestAvatar.jsx';
import { useAuth } from '../auth.jsx';
import { FONT_LEVELS, getFontLevel, setFontLevel } from '../fontSize.js';

// The account menu: who is signed in, text size, sign out
export default function AccountSheet({ onClose, onLogout }) {
  const { user } = useAuth();
  const [level, setLevel] = useState(getFontLevel);
  const change = (d) => setLevel(setFontLevel(level + d));

  return (
    <BottomSheet title="حسابي" onClose={onClose}>
      {(close) => (
        <div className="space-y-5 pb-2 text-right">
          <div className="flex items-center gap-3">
            <PriestAvatar size={64} />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-navy">{user?.name || 'الحساب'}</p>
              <p className="truncate text-sm text-gray-500" dir="ltr" style={{ textAlign: 'right' }}>{user?.email}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 font-bold text-navy">حجم الخط</p>
            <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
              <button type="button" onClick={() => change(1)} disabled={level === FONT_LEVELS.length - 1} aria-label="تكبير الخط" className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm disabled:opacity-40"><Plus className="w-5 h-5" /></button>
              <div className="flex-1 text-center">
                <p className="font-bold text-maroon">{FONT_LEVELS[level].label}</p>
                <p className="text-sm text-gray-500">هذا شكل الكلام في التطبيق</p>
              </div>
              <button type="button" onClick={() => change(-1)} disabled={level === 0} aria-label="تصغير الخط" className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm disabled:opacity-40"><Minus className="w-5 h-5" /></button>
            </div>
          </div>

          <button type="button" onClick={() => { close(); setTimeout(onLogout, 260); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 p-4 font-bold text-red-600">
            <LogOut className="w-5 h-5" /> تسجيل الخروج
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
