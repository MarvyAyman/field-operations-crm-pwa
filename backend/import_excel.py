import os
import sys
import django
import pandas as pd
import uuid
from datetime import datetime
from dotenv import load_dotenv

# 1. تحميل المتغيرات من ملف .env الموجود في نفس المجلد
load_dotenv()

# 2. التأكد من وجود رابط قاعدة البيانات وطباعته للتأكيد
db_url = os.getenv('DATABASE_URL')
if not db_url:
    print("❌ خطأ: لم يتم العثور على DATABASE_URL في ملف .env")
    sys.exit(1)

# إخفاء كلمة المرور عند الطباعة للأمان
safe_url = db_url.split('@')[-1] if '@' in db_url else "Unknown"
print(f"🔗 جاري الاتصال بقاعدة بيانات Supabase: ...@{safe_url}")

# 3. إعداد بيئة Django للعمل
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

# 4. استيراد النماذج بعد إعداد Django
from core.models import (
    Church, Area, Street, Building, Family, Person, LookupValue
)

# ⚠️ تأكد أن هذا الـ ID موجود في جدول churches في Supabase
CHURCH_ID = '11111111-1111-1111-1111-111111111111' 

def get_or_create_lookup(list_key, label):
    """دالة مساعدة لإنشاء قيم القوائم (مثل أب الاعتراف) إذا لم تكن موجودة"""
    if pd.isna(label) or str(label).strip() == '':
        return None
    
    label = str(label).strip()
    
    lookup = LookupValue.objects.filter(
        church_id=CHURCH_ID, 
        list_key=list_key, 
        label=label
    ).first()
    
    if not lookup:
        lookup = LookupValue.objects.create(
            id=uuid.uuid4(),
            church_id=CHURCH_ID,
            list_key=list_key,
            label=label,
            label_f=label,
            active=True
        )
    return lookup

def run_import(file_path):
    print("⏳ جاري قراءة ملف الإكسيل...")
    try:
        df = pd.read_excel(file_path)
    except Exception as e:
        print(f"❌ فشل قراءة الملف: {e}")
        return
    
    df.columns = [str(c).strip() for c in df.columns]
    print(f"✅ تم العثور على {len(df)} صفاً. جاري الإدخال في قاعدة البيانات...")

    success_count = 0
    error_count = 0

    for index, row in df.iterrows():
        try:
            area_no = str(row['المنطقة']).strip() if pd.notna(row['المنطقة']) else "غير محدد"
            street_name = str(row['الشارع']).strip() if pd.notna(row['الشارع']) else "غير محدد"
            house_no = str(row['رقم المنزل']).strip() if pd.notna(row['رقم المنزل']) else "غير محدد"
            direction = str(row['الاتجاة']).strip() if pd.notna(row['الاتجاة']) else ""
            floor_no = str(row['الدور']).strip() if pd.notna(row['الدور']) else ""
            
            family_no = str(row['رقم الاسرة']).strip() if pd.notna(row['رقم الاسرة']) else f"F_{index}"
            apartment_no = str(row['الشقة']).strip() if pd.notna(row['الشقة']) else ""

            # 1. المنطقة
            area, _ = Area.objects.get_or_create(
                church_id=CHURCH_ID,
                area_no=area_no,
                defaults={'id': uuid.uuid4(), 'created_at': datetime.now(), 'updated_at': datetime.now()}
            )

            # 2. الشارع
            street, _ = Street.objects.get_or_create(
                church_id=CHURCH_ID,
                area_id=area.id,
                name=street_name,
                defaults={'id': uuid.uuid4(), 'created_at': datetime.now(), 'updated_at': datetime.now()}
            )

            # 3. المبنى
            building, _ = Building.objects.get_or_create(
                church_id=CHURCH_ID,
                street_id=street.id,
                house_no=house_no,
                direction=direction,
                defaults={'id': uuid.uuid4(), 'created_at': datetime.now(), 'updated_at': datetime.now()}
            )

            # 4. الأسرة
            family, created = Family.objects.get_or_create(
                church_id=CHURCH_ID,
                building_id=building.id,
                apartment_no=apartment_no,
                floor_no=floor_no,
                defaults={
                    'id': uuid.uuid4(),
                    'family_name': f"أسرة {house_no}/{apartment_no}",
                    'created_at': datetime.now(),
                    'updated_at': datetime.now()
                }
            )

            # 5. الفرد
            full_name = str(row['الاسم']).strip() if pd.notna(row['الاسم']) else "غير محدد"
            if full_name == "غير محدد" or full_name == "":
                continue

            person_no = str(row['رقم الفرد']).strip() if pd.notna(row['رقم الفرد']) else ""
            job = str(row['الوظيفة']).strip() if pd.notna(row['الوظيفة']) else ""
            
            gender = 'male'
            confessor_name = str(row['اب الاعتراف']).strip() if pd.notna(row['اب الاعتراف']) else None
            confessor = get_or_create_lookup('confessor', confessor_name) if confessor_name else None

            status_id = None
            if job == 'تنيح' or job == 'تنيحت':
                status_lookup = get_or_create_lookup('person_status', 'متنيح')
                status_id = status_lookup.id if status_lookup else None
                job = ""

            # الإدخال الفعلي للفرد
            Person.objects.create(
                id=uuid.uuid4(),
                church_id=CHURCH_ID,
                family_id=family.id,
                full_name=full_name,
                person_no=person_no,
                job=job,
                gender=gender,
                confessor_id=confessor.id if confessor else None,
                status_id=status_id,
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
            
            if person_no == '1':
                family.family_name = full_name
                family.save()

            success_count += 1

            if index > 0 and index % 50 == 0:
                print(f"📊 تم معالجة {index} صفاً...")

        except Exception as e:
            error_count += 1
            print(f"❌ خطأ في الصف {index + 2} (رقم الإكسيل): {e}")
            continue

    print(f"\n🎉 تم الانتهاء!")
    print(f"✅ تم إدخال {success_count} فرداً بنجاح.")
    if error_count > 0:
        print(f"⚠️ فشل إدخال {error_count} صفاً. راجع الأخطاء أعلاه.")

if __name__ == '__main__':
    file_path = 'الافتقاد-مارفى.xlsx'
    
    if not os.path.exists(file_path):
        print(f"❌ لم يتم العثور على الملف: {file_path}")
        print("تأكد من وضع ملف الإكسيل في نفس مجلد manage.py")
        sys.exit(1)
        
    # تأكيد وجود الكنيسة قبل البدء
    try:
        church = Church.objects.get(id=CHURCH_ID)
        print(f"⛪ الكنيسة المستهدفة: {church.name or 'بدون اسم'}")
    except Church.DoesNotExist:
        print(f"❌ خطأ: الكنيسة بالـ ID ({CHURCH_ID}) غير موجودة في قاعدة البيانات!")
        print("قم بتشغيل أمر SQL لإضافتها أولاً.")
        sys.exit(1)

    run_import(file_path)