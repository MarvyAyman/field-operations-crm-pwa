"""
استيراد ملف الافتقاد (Excel) إلى قاعدة البيانات - النسخة الجديدة.

التشغيل (من مجلد backend، بجانب manage.py و .env):

    python import_excel.py "الملف.xlsx"            <- معاينة فقط: لا يكتب شيئاً في القاعدة
    python import_excel.py "الملف.xlsx" --commit   <- الاستيراد الفعلي

اختياري:  --church <uuid>   لتحديد الكنيسة (الافتراضي: كنيسة أول مسؤول في جدول members)

ما يفعله:
  * المنطقة > الشارع > العمارة > الأسرة > الأفراد (يعيد استخدام الموجود ولا يكرره).
  * الأسرة تبدأ عند رقم الفرد 1 (أو عند تغيّر العمارة)، ورب الأسرة = أول فرد في الأسرة.
  * الموبايل / موبايل آخر / الملاحظات تُحفظ في بيانات كل فرد (تظهر في نموذج الفرد).
  * أرقام التليفون الأرضي (040...) تُحفظ كذلك في خانة التليفون الأرضي للأسرة.
  * ملاحظات العمارة تُحفظ في ملاحظات العمارة.
  * أب الاعتراف: إن طابق أحد الآباء التسعة يُربط به، وإلا يُحفظ كنص ("آخر ...").
  * "تنيح / تنيحت" في الوظيفة تتحول إلى حالة "متنيح".
  * لو شغّلتيه مرتين لا يكرر شيئاً (كل صف له import_key).
"""
import argparse
import collections
import glob
import os
import re
import sys
import uuid

import pandas as pd
from dotenv import load_dotenv

load_dotenv()
if not os.getenv('DATABASE_URL'):
    sys.exit('❌ لم يتم العثور على DATABASE_URL في ملف .env')

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django  # noqa: E402

django.setup()

from django.db import transaction  # noqa: E402
from django.utils import timezone  # noqa: E402

from core.models import Area, Building, Church, Family, LookupValue, Member, Person, Street  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:  # pragma: no cover
    pass

SOURCE = 'xlsx'  # import_key prefix: xlsx:<excel row>
HEAD_RELATION = re.compile(r'رب\s*(ال)?[أاإ]سرة')
LANDLINE_PREFIX = '040'

# ---------------------------------------------------------------- text helpers
AR_DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')


def clean(v):
    """cell -> single-spaced text ('' when empty)"""
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).replace(' ', ' ').replace('‏', '').replace('‎', '')
    return re.sub(r'\s+', ' ', s).strip()


def norm(s):
    """comparison key: same letter families (ى=ي ، أإآ=ا ، ة=ه) and spacing"""
    s = clean(s).translate(AR_DIGITS)
    s = re.sub('[أإآ]', 'ا', s)
    s = s.replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')
    return re.sub(r'\s+', ' ', s).strip().lower()


def most_common(values):
    values = [v for v in values if v]
    return collections.Counter(values).most_common(1)[0][0] if values else ''


# ---------------------------------------------------------------- phones
def fix_number(d):
    # Excel dropped the leading zero of mobiles:  1287220680 -> 01287220680
    if len(d) == 10 and d[0] == '1':
        return '0' + d
    return d


def split_phone_cell(value):
    """cell -> (numbers[], leftover text).  A cell with words only (e.g. 'مسافر') is a note, not a phone."""
    text = clean(value).translate(AR_DIGITS)
    if not text:
        return [], ''
    compact = re.sub(r'[\s\-.()+]', '', text)
    if compact.isdigit() and len(compact) >= 7:
        return [fix_number(compact)], ''
    nums, rest = [], text  # several numbers, or a number with words
    for m in re.finditer(r'\+?\d[\d\s\-]{6,}\d', text):
        d = re.sub(r'\D', '', m.group())
        if len(d) >= 8:
            nums.append(fix_number(d))
            rest = rest.replace(m.group(), ' ')
    return nums, re.sub(r'\s+', ' ', rest).strip(' -/،,')


def is_landline(n):
    return n.startswith(LANDLINE_PREFIX) or (n.startswith('0') and not n.startswith('01') and len(n) <= 10)


def suspicious(n):
    if n.startswith('01'):
        return len(n) != 11
    if n.startswith(LANDLINE_PREFIX):
        return len(n) != 10
    return not n.startswith('966')


# ---------------------------------------------------------------- gender (only when it is clear, else left empty)
FEMALE = '''مريم مارينا مارى ماريان ماريا ميرنا نيفين يوستينا ساره سارة جيهان امل اميره أميرة اميرة مونيكا فيلومينا ميرفت فيرينا سوزان
امال تريزا ايمان منى نانسى نانسي مارلين مارتينا كرستينا ميرا نادية فيبى ايفون وفاء ماجده ماجدة انجى سوزى ايرينى ميريت حنان كلارا عايده عايدة
كيرمينا فيفيان شيرى يؤانا ميرولا ايزيس امانى سلوى دميانة نرفانا صوفيا ساميه سامية دينا انجيل كاترين سعاد مرجريت فيرونيكا كاميليا نيللى
مرفت جوسيان دنيا تهانى جورجينا جاكلين روفينا لافينا مادونا ناهد ساندرا كارين كريستين كارلا فيوليت شرين اوديت داليا جيسيكا فردوس مرثا ديانا
عفاف سماح فيرا هاله رانيا هناء مارلى هولى نورانا نيلى هيلين لوتس نهى منال ساندى كارولين كريمه مورا سميره فيفى ايلا راكسان سيسليا بياتريس
احلام عزه سمر جميله نها جيرمين إبيلا سوسنا نعمات فايزة فايزه ماروسكا نعمه فاليرى فادية فاديه فهيمة جنفياف رفقة لورين لوساندا لندة لنده
مادلين بيرلا اثناسيا سنيورة كارول انسطاسيا كيرومينا زهية هايدى ايلينا ميلانيا الهام جوليا مايا نوال جولينا بتول فايقه كارن الينور بدور
نجاة إميلى عطيات سيسيل فوزية نجدا ناتالى ناتلى ناريتا رانسى صباح نرجس سالى نبيلة نبيله فتنه بيلاجيا هالة كلير نينيت هيفاء فدية مروه
بدره تفاحه سيلينا ميجن جوفانا راندا افرونيا ميراى نهير سلفانا ايمى جيني الين ماريانا مارولا ماجى وجيهه سهير يسرية نجفه مروى ريرى هيام
جوليانا مارولينا ايناس سميرة ماريز لوريس تريفينا مارين جانسي سالي فبرونيا كرمه هلبيس ماريهام'''
MALE = '''مينا كيرلس مايكل جورج عماد ابانوب بيتر مارك فادى عادل يوسف كاراس مجدى جون بيشوى اندرو هانى دانيال ريمون ميلاد امير نبيل اشرف
سامى ماريو ميشيل مدحت باسم فيلوباتير سمير فوزى بولس ماجد ستيفن رمزى بافلى فيكتور منير رومانى فايز ادوار باتريك توماس جوزيف جونير رامى
شنوده شنودة انطونيوس فكرى سعيد صموئيل ناجى نجيب ديماس موسى مراد ابرام طارق جمال سيمون كمال عبد جرجس ارسانى اميل نادى ايمن فرج غطاس رشدى
رامز ماثيو فؤاد رضا مهرائيل باهر جوناثان نادر شادى سامح تونى فخرى عيد مارسيلينو روبين مفدى وديع فيليب انطوان حلمى حنا أمجد نشأت عازر
القمص القس كريم عصام وليد رفعت موريس ايهاب سلامه عزت مكارى بيشوي تادرس الامير راجى شريف انجيلوس فريد عابد رائف راغب رفيق بطرس باسيلى
الفريد افرايم يؤنا طلعت بيير باترك امين ثيؤدور وصفى اسامه اسامة وهبة سعد صفوت عهدى ثروت ساهر خليل ميخائيل داود لويس عزيز عدلى يحى امجد
رؤوف عطا عاطف وهيب نقولا رافت بسام حسام سوتير افرام انطونى اسعد وجيه البيرت تامر ايمانويل البير هنرى شاكر محب شهدى وليم ارسانيوس
مارفن ايليا مسعد عزمى شهير لطفى رفايل حشمت مختار مرقس حاتم رأفت كارلوس نصر مارتن عوض كيفين بولا ايثان ناثان سايمون منجي مارسيل مارتى
جوستاف ريفان'''
FEMALE_N = {norm(x) for x in FEMALE.split()}
MALE_N = {norm(x) for x in MALE.split()} - FEMALE_N
FEMALE_JOBS = re.compile(r'ربه? منزل|ربة منزل|صيدلانية|تنيحت')
MALE_JOBS = re.compile(r'^تنيح(\s|$)')


def guess_gender(name, job):
    if FEMALE_JOBS.search(job):
        return 'female'
    if MALE_JOBS.search(job):
        return 'male'
    first = norm(name).split(' ')[0] if norm(name) else ''
    if first in FEMALE_N:
        return 'female'
    if first in MALE_N:
        return 'male'
    return None


# ---------------------------------------------------------------- lookups
def lists(rows, pattern, exclude=None):
    return [r for r in rows if re.search(pattern, r.list_key or '', re.I) and not (exclude and re.search(exclude, r.list_key or '', re.I))]


def match_confessor(value, officials):
    """Excel name ('يوسف') -> official priest ('ابونا يوسف صبري') when it is clearly the same one."""
    v = norm(value)
    if not v:
        return None
    hits = []
    for o in officials:
        label = re.sub(r'^ابونا\s+', '', norm(o.label))
        if v == label or (' ' not in v and label.startswith(v + ' ')):
            hits.append(o)
    return hits[0] if len(hits) == 1 else None


# ================================================================= main
def pick_church(arg):
    if arg:
        return Church.objects.get(id=arg)
    ids = list(Member.objects.filter(role='admin', active=True).exclude(church_id=None).values_list('church_id', flat=True).distinct())
    if len(ids) == 1:
        return Church.objects.get(id=ids[0])
    every = list(Church.objects.all())
    if len(every) == 1:
        return every[0]
    sys.exit('❌ لم أستطع تحديد الكنيسة تلقائياً. استخدمي:  --church <id>   (الكنائس: %s)' % ', '.join(str(c.id) for c in every))


def read_rows(path):
    df = pd.read_excel(path, dtype=object)
    df.columns = [clean(c) for c in df.columns]
    need = ['الشارع', 'رقم المنزل', 'الدور', 'رقم الفرد', 'الاسم']
    missing = [c for c in need if c not in df.columns]
    if missing:
        sys.exit(f'❌ أعمدة ناقصة في الملف: {missing}\nالأعمدة الموجودة: {list(df.columns)}')

    def col(r, *names):
        for n in names:
            if n in df.columns:
                return r[n]
        return None

    rows = []
    for i, r in df.iterrows():
        name = clean(r['الاسم'])
        if not name:
            continue
        try:
            pno = int(float(clean(r['رقم الفرد']))) if clean(r['رقم الفرد']) else None
        except ValueError:
            pno = None
        rows.append(dict(
            row=i + 2,
            area=clean(col(r, 'المنطقة')) or 'غير محدد',
            street=clean(r['الشارع']) or 'غير محدد',
            house=clean(r['رقم المنزل']) or 'غير محدد',
            direction=clean(col(r, 'الاتجاة', 'الاتجاه')),
            floor=clean(r['الدور']).translate(AR_DIGITS),
            apt=clean(col(r, 'الشقة')),
            fam_no=clean(col(r, 'رقم الاسرة')),
            pno=pno,
            name=name,
            job=clean(col(r, 'الوظيفة')),
            mobile=col(r, 'الموبايل'),
            mobile2=col(r, 'موبايل اخر', 'موبايل آخر'),
            notes=clean(col(r, 'ملاحظات')),
            bnotes=clean(col(r, 'ملاحظات على العماره', 'ملاحظات على العمارة')),
            confessor=clean(col(r, 'اب الاعتراف')),
        ))
    return rows


def group_families(rows):
    """consecutive rows -> families.  New family: another building, or the member numbers start again."""
    fams, cur, prev = [], None, None
    for r in rows:
        r['bkey'] = (norm(r['area']), norm(r['street']), norm(r['house']))
        new = cur is None or r['bkey'] != prev['bkey']
        if not new:
            pn, ppn = r['pno'], prev['pno']
            if pn == 1 and ppn != 0:
                new = True
            elif pn is not None and ppn is not None and pn <= ppn and norm(r['floor']) != norm(prev['floor']):
                new = True  # numbers restarted on another floor (a duplicate number on the same floor is a typo, not a new family)
        if new:
            cur = []
            fams.append(cur)
        cur.append(r)
        prev = r
    return fams


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file', nargs='?')
    ap.add_argument('--commit', action='store_true', help='write to the database (default: preview only)')
    ap.add_argument('--church')
    args = ap.parse_args()

    path = args.file or next(iter(glob.glob('*.xlsx')), None)
    if not path or not os.path.exists(path):
        sys.exit('❌ ملف الإكسيل غير موجود. اكتبي اسمه بعد الأمر.')

    church = pick_church(args.church)
    cid = church.id
    print(f'⛪ الكنيسة: {church.name or "بدون اسم"}  ({cid})')

    lk = list(LookupValue.objects.filter(church_id=cid))
    officials = [x for x in lists(lk, r'confess') if x.active and re.match(r'^ابونا', norm(x.label))]
    deceased = next((x for x in lists(lk, r'status', r'visit|marital') if clean(x.label) == 'متنيح' and x.active is not False), None)
    head_rel = next((x for x in lists(lk, r'relation') if HEAD_RELATION.search(x.label or '') and x.active is not False), None)
    if len(officials) < 9:
        print(f'⚠️ وجدت {len(officials)} من آباء الاعتراف التسعة. لو ناقصين شغّلي 04_seed_confessors.sql أولاً.')
    if not deceased:
        print('⚠️ لا توجد حالة "متنيح" في قائمة الحالة (شغّلي 05_fix_person_status.sql). سيُحفظ نص الوظيفة في الملاحظات.')
    if not head_rel:
        print('⚠️ لم أجد "رب الأسرة" في قائمة صلة القرابة؛ لن تُحدَّد صلة القرابة لرب الأسرة.')

    rows = read_rows(path)
    fams = group_families(rows)
    print(f'📄 {len(rows)} فرداً في {len(fams)} أسرة (من {path})')

    now = timezone.now()
    area_names, street_names = {}, {}
    b_dirs, b_notes, b_house = collections.defaultdict(list), collections.defaultdict(list), collections.defaultdict(list)
    for r in rows:
        a, s, _h = r['bkey']
        area_names.setdefault(a, []).append(r['area'])
        street_names.setdefault((a, s), []).append(r['street'])
        b_house[r['bkey']].append(r['house'])
        b_dirs[r['bkey']].append(r['direction'])
        b_notes[r['bkey']].append(r['bnotes'])

    new_areas, new_streets, new_buildings, new_families, new_people = [], [], [], [], []
    existing_areas = {norm(a.area_no): a for a in Area.objects.filter(church_id=cid, deleted_at=None)}
    area_obj = {}
    for a, names in area_names.items():
        obj = existing_areas.get(a)
        if not obj:
            obj = Area(id=uuid.uuid4(), church_id=cid, area_no=most_common(names), created_at=now, updated_at=now)
            new_areas.append(obj)
        area_obj[a] = obj

    existing_streets = {(s.area_id, norm(s.name)): s for s in Street.objects.filter(church_id=cid, deleted_at=None)}
    street_obj = {}
    for (a, s), names in street_names.items():
        obj = existing_streets.get((area_obj[a].id, s))
        if not obj:
            obj = Street(id=uuid.uuid4(), church_id=cid, area_id=area_obj[a].id, name=most_common(names), created_at=now, updated_at=now)
            new_streets.append(obj)
        street_obj[(a, s)] = obj

    existing_buildings = {(b.street_id, norm(b.house_no)): b for b in Building.objects.filter(church_id=cid, deleted_at=None)}
    building_obj = {}
    for bkey in b_dirs:
        a, s, h = bkey
        st = street_obj[(a, s)]
        obj = existing_buildings.get((st.id, h))
        if not obj:
            notes = ' — '.join(dict.fromkeys(n for n in b_notes[bkey] if n))
            obj = Building(id=uuid.uuid4(), church_id=cid, street_id=st.id, house_no=most_common(b_house[bkey]),
                           direction=most_common(b_dirs[bkey]) or None, notes=notes or None, created_at=now, updated_at=now)
            new_buildings.append(obj)
        building_obj[bkey] = obj

    done_fams = set(Family.objects.filter(church_id=cid, import_key__startswith=f'{SOURCE}:').values_list('import_key', flat=True))
    done_ppl = set(Person.objects.filter(church_id=cid, import_key__startswith=f'{SOURCE}:').values_list('import_key', flat=True))
    skipped_families = 0
    suspicious_numbers = []
    confessor_map, confessor_other = collections.Counter(), collections.Counter()

    for fam_rows in fams:
        head = fam_rows[0]
        fkey = f'{SOURCE}:fam:{head["row"]}'
        if fkey in done_fams:
            skipped_families += 1
            continue
        fam_id = uuid.uuid4()
        mobiles, landlines = [], []
        people_here = []
        for n, r in enumerate(fam_rows, start=1):
            if f'{SOURCE}:{r["row"]}' in done_ppl:
                continue
            notes = [r['notes']] if r['notes'] else []
            nums = []
            for cell in (r['mobile'], r['mobile2']):
                found, rest = split_phone_cell(cell)
                nums.append(found[0] if found else '')
                notes.extend(f'رقم آخر: {x}' for x in found[1:])
                if rest:
                    notes.append(rest)
            phone, phone2 = nums
            if phone2 == phone:
                phone2 = ''
            for num in filter(None, (phone, phone2)):
                if suspicious(num):
                    suspicious_numbers.append((r['row'], r['name'], num))
                (landlines if is_landline(num) else mobiles).append(num)

            job, status_id = r['job'], None
            if 'تنيح' in job:
                if deceased:
                    status_id = deceased.id
                    if re.fullmatch(r'تنيح[ةت]?', job):
                        job = ''
                    elif job.startswith('تنيح'):  # e.g. "تنيح بالعريش": keep the sentence as a note
                        notes.append(job)
                        job = ''
                    else:  # e.g. "صيدلى (تنيح)"
                        job = re.sub(r'\s+', ' ', re.sub(r'[()]|تنيح[ةت]?', ' ', job)).strip()
                else:
                    notes.append(job)
                    job = ''

            extra = {}
            if phone:
                extra['phone'] = phone
            if phone2:
                extra['phone2'] = phone2
            if notes:
                extra['notes'] = ' — '.join(dict.fromkeys(notes))
            confessor_id = None
            if r['confessor']:
                official = match_confessor(r['confessor'], officials)
                if official:
                    confessor_id = official.id
                    confessor_map[(r['confessor'], official.label)] += 1
                else:
                    extra['confessor_other'] = r['confessor']
                    confessor_other[r['confessor']] += 1
            people_here.append(Person(
                id=uuid.uuid4(), church_id=cid, family_id=fam_id, person_no=str(n), full_name=r['name'],
                gender=guess_gender(r['name'], r['job']), job=job or None, status_id=status_id, confessor_id=confessor_id,
                relation_id=head_rel.id if (head_rel and n == 1) else None,
                extra=extra or None, import_key=f'{SOURCE}:{r["row"]}', created_at=now, updated_at=now))
        if not people_here:
            continue
        new_families.append(Family(
            id=fam_id, church_id=cid, building_id=building_obj[head['bkey']].id, family_name=head['name'],
            floor_no=most_common([r['floor'] for r in fam_rows]) or None, apartment_no=most_common([r['apt'] for r in fam_rows]) or None,
            primary_phone=(mobiles[0] if mobiles else None), landline=(landlines[0] if landlines else None),
            extra={'family_no': head['fam_no']} if head['fam_no'] else None,
            import_key=fkey, created_at=now, updated_at=now))
        new_people.extend(people_here)

    # ---------- report
    ex = lambda p, k: bool(p.extra and k in p.extra)  # noqa: E731
    print('\n──────── ما سيتم إدخاله ────────')
    print(f'المناطق:   {len(new_areas)} جديدة  (+{len(area_obj) - len(new_areas)} موجودة)')
    print(f'الشوارع:   {len(new_streets)} جديدة  (+{len(street_obj) - len(new_streets)} موجودة)')
    print(f'العمارات:  {len(new_buildings)} جديدة  (+{len(building_obj) - len(new_buildings)} موجودة)')
    print(f'الأسر:     {len(new_families)}   (تخطّيت {skipped_families} مستوردة سابقاً)')
    print(f'الأفراد:   {len(new_people)}')
    print(f'  موبايل: {sum(ex(p, "phone") for p in new_people)}   موبايل آخر: {sum(ex(p, "phone2") for p in new_people)}   ملاحظات: {sum(ex(p, "notes") for p in new_people)}')
    print(f'  متنيح: {sum(1 for p in new_people if deceased and p.status_id == deceased.id)}')
    print(f'  النوع: ذكر {sum(p.gender == "male" for p in new_people)}  أنثى {sum(p.gender == "female" for p in new_people)}  غير محدد {sum(not p.gender for p in new_people)}')
    print(f'  أسر بها موبايل: {sum(bool(f.primary_phone) for f in new_families)}   بها تليفون أرضي: {sum(bool(f.landline) for f in new_families)}')
    print(f'  عمارات بها ملاحظات: {sum(bool(b.notes) for b in new_buildings)}')
    print('\nأب الاعتراف - ربط تلقائي بالتسعة:')
    for (src, dst), cnt in sorted(confessor_map.items(), key=lambda x: -x[1]):
        print(f'   {src!r:24} -> {dst}   ({cnt})')
    print(f'أب الاعتراف - ليسوا من التسعة (يُحفظ اسمهم كنص "آخر"): {sum(confessor_other.values())} فرداً، {len(confessor_other)} اسماً')
    print('   ' + ' | '.join(f'{k}:{v}' for k, v in confessor_other.most_common(12)) + ' ...')
    if suspicious_numbers:
        print(f'\n⚠️ أرقام شكلها غير مألوف ({len(suspicious_numbers)}) - اتحفظت كما هي، راجعيها:')
        for row, name, num in suspicious_numbers[:15]:
            print(f'   صف {row}: {name} -> {num}')
    print('\nملحوظة: العمود الأخير بلا عنوان في الملف (قيم مثل 200 و ٧-٨) لم يُستورد.')

    if not args.commit:
        print('\n👀 هذه معاينة فقط - لم يُكتب شيء. للتنفيذ الفعلي أضيفي:  --commit')
        return

    with transaction.atomic():
        Area.objects.bulk_create(new_areas)
        Street.objects.bulk_create(new_streets)
        Building.objects.bulk_create(new_buildings)
        Family.objects.bulk_create(new_families, batch_size=200)
        Person.objects.bulk_create(new_people, batch_size=200)
    print(f'\n🎉 تم! أُدخلت {len(new_families)} أسرة و{len(new_people)} فرداً.')
    print('افتحي التطبيق وهو أونلاين ليتزامن، أو اعملي تحديث للصفحة.')


if __name__ == '__main__':
    main()
