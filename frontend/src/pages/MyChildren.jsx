import { Users, Hammer } from 'lucide-react';
import { PageHeader } from '../components/ui.jsx';

// "أولادي في الاعتراف": under construction (the page content is decided later)
export default function MyChildren() {
  return (
    <div className="pb-32">
      <PageHeader title="أولادي في الاعتراف" />
      <div className="p-4 mt-10 flex flex-col items-center text-center gap-4">
        <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gold/20 text-maroon">
          <Users className="w-10 h-10" />
          <Hammer className="absolute -bottom-1 -left-1 h-7 w-7 rounded-full bg-white p-1.5 shadow" />
        </span>
        <h2 className="text-xl font-bold text-navy">الصفحة تحت الإنشاء</h2>
        <p className="max-w-xs text-gray-500">هنا ستظهر قائمة أولادي في الاعتراف. سنجهزها قريبًا.</p>
      </div>
    </div>
  );
}
