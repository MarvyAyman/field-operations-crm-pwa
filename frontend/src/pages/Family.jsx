import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Phone, Trash2, ClipboardList, Copy, Check } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import BottomSheet from '../components/BottomSheet.jsx';
import waIcon from '../assets/whatsapp-svgrepo-com.svg';
import { deleteRow } from '../db';
import { useTables, lookupsFor, LOOKUP, buildingLabel, areaLabel, confessorNames, placeCrumbs, sortPeople, personPhones, waNumber } from '../data.js';
import { PageHeader, Loading, NotFound, PendingBadge } from '../components/ui.jsx';

const GENDER = { male: 'ذكر', female: 'أنثى' };

function Section({ title, action, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http / old browsers: the hidden-textarea way
    try {
      const t = document.createElement('textarea');
      t.value = text;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(t);
      return ok;
    } catch {
      return false;
    }
  }
}

// a number you can tap to copy it
function CopyNumber({ number }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    if (await copyText(number)) {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      dir="ltr"
      aria-label={`نسخ الرقم ${number}`}
      className="inline-flex items-center gap-2 rounded-lg bg-gray-100 active:bg-gray-200 px-3 py-2 text-sm text-gray-700"
    >
      {number}
      {done ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
      {done && <span className="text-xs text-green-700">تم النسخ</span>}
    </button>
  );
}

// call / WhatsApp button: one number -> opens straight away; several -> a bottom sheet slides up to pick the number
function NumberAction({ numbers, kind, open, onToggle, onClose }) {
  const isWa = kind === 'wa';
  const href = (n) => (isWa ? `whatsapp://send?phone=${waNumber(n)}` : `tel:${n}`);
  const label = isWa ? 'واتساب' : 'اتصال';
  const icon = (size) => (isWa
    ? <img src={waIcon} alt="" className={size} />
    : <span className={`${size} rounded-full bg-navy text-white flex items-center justify-center`}><Phone className="w-1/2 h-1/2" /></span>);
  const btn = 'w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-transform';
  if (numbers.length === 1) {
    return <a href={href(numbers[0])} aria-label={`${label} ${numbers[0]}`} title={label} className={btn}>{icon('w-11 h-11')}</a>;
  }
  return (
    <>
      <button type="button" onClick={onToggle} aria-label={label} aria-haspopup="dialog" title={label} className={btn}>{icon('w-11 h-11')}</button>
      {open && (
        <BottomSheet title={isWa ? 'واتساب على أي رقم؟' : 'اتصال بأي رقم؟'} onClose={onClose}>
          {(close) => numbers.map((n) => (
            <a key={n} href={href(n)} onClick={close} dir="ltr" className="flex items-center justify-between gap-3 rounded-xl px-4 py-4 text-xl font-bold text-navy active:bg-gray-100">
              {n}
              {icon('w-10 h-10')}
            </a>
          ))}
        </BottomSheet>
      )}
    </>
  );
}

// One family: details, phones, people and visits
export default function Family() {
  const { familyId } = useParams();
  const navigate = useNavigate();
  const { runSync, user } = useAuth();
  const { data, loading } = useTables([
    'areas', 'streets', 'buildings', 'families', 'people', 'family_internal_notes', 'visits', 'lookup_values',
  ]);

  const family = data.families.find((f) => f.id === familyId);
  const building = data.buildings.find((b) => b.id === family?.building_id);
  const street = data.streets.find((s) => s.id === building?.street_id);
  const area = data.areas.find((a) => a.id === street?.area_id);

  // view-only by default; the pencil switches editing on. Leaving the page always brings it back to view-only.
  const [editMode, setEditMode] = useState(false);
  const [menu, setMenu] = useState(null); // which person's call / WhatsApp number box is open: 'personId:call' | 'personId:wa'

  const people = useMemo(() => sortPeople(data.people.filter((p) => p.family_id === familyId && !p.deleted_at)), [data.people, familyId]);
  const visits = useMemo(
    () => data.visits.filter((v) => v.family_id === familyId).sort((a, b) => (b.visited_on || '').localeCompare(a.visited_on || '')),
    [data.visits, familyId]
  );
  const labelOf = useMemo(() => {
    const map = new Map(data.lookup_values.map((l) => [l.id, l]));
    return (id, gender) => {
      const l = map.get(id);
      return l ? (gender === 'female' && l.label_f) || l.label : null;
    };
  }, [data.lookup_values]);
  // the head: the member whose relation is "رب الأسرة", otherwise member no. 1
  const head = people.find((p) => labelOf(p.relation_id, p.gender) === 'رب الأسرة') || people.find((p) => String(p.person_no).trim() === '1');

  const internalNote = data.family_internal_notes.find((n) => n.family_id === familyId)?.note;
  const hasVisitStatuses = lookupsFor(data.lookup_values, LOOKUP.visitStatus).length > 0;

  if (loading) return <Loading />;
  if (!family) return <NotFound back="/" />;

  const back = building ? `/building/${building.id}` : '/';

  const handleDelete = async () => {
    if (!window.confirm(`حذف أسرة «${family.family_name}» بكل أفرادها وزياراتها؟`)) return;
    await deleteRow('families', familyId);
    runSync();
    navigate(back, { replace: true });
  };

  const movedTo = family.moved ? `انتقلت إلى ${area?.kind === 'other_church' ? areaLabel(area) : 'كنيسة أخرى'}` : '';
  const where = [movedTo, street?.name, !family.moved && building && buildingLabel(building), family.floor_no && `الدور ${family.floor_no}`, family.apartment_no && `شقة ${family.apartment_no}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="pb-28">
      <PageHeader title={family.family_name} subtitle={where} back={back} crumbs={placeCrumbs({ area, street, building })} />

      <div className="p-4 space-y-6">
        {family._pending && (
          <p className="p-2 rounded-lg bg-gold/20 text-navy text-center text-sm font-bold">
            هذه الأسرة محفوظة على الجهاز وستُرسل عند توفر الاتصال
          </p>
        )}

        <div className="flex gap-2">
          <Link
            to={`/family/${familyId}/visit/add`}
            className="flex-1 bg-maroon text-white font-bold p-4 rounded-xl flex items-center justify-center gap-2"
          >
            <ClipboardList className="w-5 h-5" /> تسجيل زيارة
          </Link>
          <button
            type="button"
            role="switch"
            aria-checked={editMode}
            aria-label="وضع التعديل"
            title="وضع التعديل"
            onClick={() => { setEditMode((v) => !v); setMenu(null); }}
            className={`p-4 rounded-xl flex items-center justify-center gap-2 shadow-sm font-bold ${editMode ? 'bg-gold text-navy' : 'bg-white text-navy'}`}
          >
            <Pencil className="w-5 h-5" />
            {editMode && <span className="text-sm">تعديل</span>}
          </button>
        </div>
        {(labelOf(family.contract_type_id) || family.membership_no || family.last_visit_on || building?.notes || family.notes || internalNote) && (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
            {labelOf(family.contract_type_id) && <p className="text-sm text-gray-600">نوع العقد: {labelOf(family.contract_type_id)}</p>}
            {family.membership_no && <p className="text-sm text-gray-600">رقم العضوية: {family.membership_no}</p>}
            {family.last_visit_on && <p className="text-sm text-gray-600">تاريخ آخر زيارة: {family.last_visit_on}</p>}
            {building?.notes && <p className="text-sm text-gray-600">عن العمارة: {building.notes}</p>}
            {family.notes && <p className="text-gray-700 whitespace-pre-line">{family.notes}</p>}
            {internalNote && (
              <p className="text-sm text-gray-600 whitespace-pre-line bg-gold/10 rounded-lg p-2">
                <span className="font-bold text-navy">ملاحظة داخلية (الورق القديم): </span>{internalNote}
              </p>
            )}
          </div>
        )}

        <Section
          title={`الأفراد (${people.length})`}
          action={
            <Link to={`/family/${familyId}/person/add`} className="text-maroon font-bold flex items-center gap-1">
              <Plus className="w-4 h-4" /> إضافة
            </Link>
          }
        >
          {people.length === 0 && <p className="text-gray-500 text-sm">لم يُسجَّل أي فرد</p>}
          {people.map((p) => {
            const isHead = p.id === head?.id;
            const nums = personPhones(p).length ? personPhones(p) : (isHead && family.primary_phone ? [family.primary_phone] : []);
            const details = (
              <>
                <span className="font-bold text-navy">
                  {p.full_name}
                  <PendingBadge row={p} />
                </span>
                <span className="block text-sm text-gray-500">
                  {[labelOf(p.relation_id, p.gender) || p.extra?.relation_other, GENDER[p.gender], labelOf(p.status_id, p.gender), labelOf(p.marital_status_id, p.gender), p.job,
                    confessorNames(p, data.lookup_values).length > 0 && `${confessorNames(p, data.lookup_values).length > 1 ? 'آباء الاعتراف' : 'أب الاعتراف'}: ${confessorNames(p, data.lookup_values).join('، ')}`].filter(Boolean).join(' · ')}
                </span>
                {p.extra?.notes && <span className="block text-sm text-gray-500">{p.extra.notes}</span>}
              </>
            );
            if (editMode) {
              return (
                <Link
                  key={p.id}
                  to={isHead ? `/family/${familyId}/edit` : `/person/${p.id}/edit`}
                  className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border-2 border-gold"
                >
                  <span className="flex-1 min-w-0">
                    {details}
                    {nums.length > 0 && <span dir="ltr" className="block text-sm text-gray-600 text-right">{nums.join(' · ')}</span>}
                  </span>
                  <Pencil className="w-5 h-5 text-maroon shrink-0" />
                </Link>
              );
            }
            return (
              <div key={p.id} className="relative bg-white rounded-xl p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">{details}</div>
                  {nums.length > 0 && (
                    <div className="flex gap-2 shrink-0">
                      <NumberAction numbers={nums} kind="call" open={menu === `${p.id}:call`} onToggle={() => setMenu(menu === `${p.id}:call` ? null : `${p.id}:call`)} onClose={() => setMenu(null)} />
                      <NumberAction numbers={nums} kind="wa" open={menu === `${p.id}:wa`} onToggle={() => setMenu(menu === `${p.id}:wa` ? null : `${p.id}:wa`)} onClose={() => setMenu(null)} />
                    </div>
                  )}
                </div>
                {nums.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {nums.map((n) => <CopyNumber key={n} number={n} />)}
                  </div>
                )}
              </div>
            );
          })}
        </Section>

        <Section title={`الزيارات (${visits.length})`}>
          {visits.length === 0 && <p className="text-gray-500 text-sm">لم تتم زيارة هذه الأسرة بعد</p>}
          {visits.map((v) => (
            <Link key={v.id} to={`/visit/${v.id}/edit`} className="block bg-white rounded-xl p-3 shadow-sm">
              <span className="font-bold text-navy">
                {v.visited_on}
                <PendingBadge row={v} />
              </span>
              {hasVisitStatuses && labelOf(v.status_id) && (
                <span className="text-sm text-green-700 mr-2">{labelOf(v.status_id)}</span>
              )}
              {v.notes && <span className="block text-sm text-gray-600 whitespace-pre-line">{v.notes}</span>}
              {(v.created_by_name || v._pending) && (
                <span className="block text-xs text-gray-500 mt-1">بواسطة: {v.created_by_name || user?.name || user?.email}</span>
              )}
            </Link>
          ))}
        </Section>

        <button type="button" onClick={handleDelete} className="w-full text-red-600 font-bold p-3 flex items-center justify-center gap-2">
          <Trash2 className="w-5 h-5" /> حذف الأسرة
        </button>
      </div>
    </div>
  );
}
