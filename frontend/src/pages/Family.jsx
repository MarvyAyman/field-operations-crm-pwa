import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Phone, Trash2, ClipboardList } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { deleteRow } from '../db';
import { useTables, lookupsFor, LOOKUP, buildingLabel } from '../data.js';
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

function PhoneLink({ number, label }) {
  if (!number) return null;
  return (
    <a href={`tel:${number}`} className="flex items-center gap-2 text-navy font-bold" dir="ltr">
      <Phone className="w-4 h-4" /> {number}
      {label && <span className="text-xs text-gray-500 font-normal">{label}</span>}
    </a>
  );
}

// One family: details, phones, people and visits
export default function Family() {
  const { familyId } = useParams();
  const navigate = useNavigate();
  const { runSync } = useAuth();
  const { data, loading } = useTables([
    'streets', 'buildings', 'families', 'people', 'family_phones', 'family_internal_notes', 'visits', 'lookup_values',
  ]);

  const family = data.families.find((f) => f.id === familyId);
  const building = data.buildings.find((b) => b.id === family?.building_id);
  const street = data.streets.find((s) => s.id === building?.street_id);

  const people = useMemo(
    () => data.people.filter((p) => p.family_id === familyId).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'ar')),
    [data.people, familyId]
  );
  const visits = useMemo(
    () => data.visits.filter((v) => v.family_id === familyId).sort((a, b) => (b.visited_on || '').localeCompare(a.visited_on || '')),
    [data.visits, familyId]
  );
  const extraPhones = useMemo(
    () => data.family_phones.filter((p) => p.family_id === familyId && p.phone),
    [data.family_phones, familyId]
  );

  const internalNote = data.family_internal_notes.find((n) => n.family_id === familyId)?.note;

  const labelOf = useMemo(() => {
    const map = new Map(data.lookup_values.map((l) => [l.id, l]));
    return (id, gender) => {
      const l = map.get(id);
      return l ? (gender === 'female' && l.label_f) || l.label : null;
    };
  }, [data.lookup_values]);
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

  const where = [street?.name, building && buildingLabel(building), family.floor_no && `الدور ${family.floor_no}`, family.apartment_no && `شقة ${family.apartment_no}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="pb-20">
      <PageHeader title={family.family_name} subtitle={where} back={back} />

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
          <Link
            to={`/family/${familyId}/edit`}
            className="bg-white text-navy p-4 rounded-xl flex items-center justify-center shadow-sm"
            aria-label="تعديل الأسرة"
          >
            <Pencil className="w-5 h-5" />
          </Link>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
          <PhoneLink number={family.primary_phone} label="موبايل" />
          <PhoneLink number={family.landline} label="أرضي" />
          {extraPhones.map((p) => (
            <PhoneLink key={p.id} number={p.phone} />
          ))}
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
          {!family.primary_phone && !family.landline && extraPhones.length === 0 && !family.notes && !family.membership_no
            && !family.contract_type_id && !family.last_visit_on && !internalNote && (
            <p className="text-gray-500 text-sm">لا توجد بيانات إضافية</p>
          )}
        </div>

        <Section
          title={`الأفراد (${people.length})`}
          action={
            <Link to={`/family/${familyId}/person/add`} className="text-maroon font-bold flex items-center gap-1">
              <Plus className="w-4 h-4" /> إضافة
            </Link>
          }
        >
          {people.length === 0 && <p className="text-gray-500 text-sm">لم يُسجَّل أي فرد</p>}
          {people.map((p) => (
            <Link key={p.id} to={`/person/${p.id}/edit`} className="block bg-white rounded-xl p-3 shadow-sm">
              <span className="font-bold text-navy">
                {p.full_name}
                <PendingBadge row={p} />
              </span>
              <span className="block text-sm text-gray-500">
                {[labelOf(p.relation_id, p.gender) || p.extra?.relation_other, GENDER[p.gender], labelOf(p.status_id, p.gender), labelOf(p.marital_status_id, p.gender), p.job,
                      (labelOf(p.confessor_id, p.gender) || p.extra?.confessor_other) && `أب الاعتراف: ${labelOf(p.confessor_id, p.gender) || p.extra.confessor_other}`].filter(Boolean).join(' · ')}
              </span>
              {(p.extra?.phone || p.extra?.phone2) && (
                <span dir="ltr" className="block text-sm text-gray-600 text-right">{[p.extra.phone, p.extra.phone2].filter(Boolean).join(' · ')}</span>
              )}
              {p.extra?.notes && <span className="block text-sm text-gray-500">{p.extra.notes}</span>}
            </Link>
          ))}
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
