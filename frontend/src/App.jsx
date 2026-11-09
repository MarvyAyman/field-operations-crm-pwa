import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { AuthProvider, useAuth } from './auth.jsx';
import { useOnline } from './online.js';
import UpdatePrompt from './components/UpdatePrompt.jsx';
import Login from './pages/Login';
import Home from './pages/Home';
import Area from './pages/Area';
import Street from './pages/Street';
import Building from './pages/Building';
import BuildingForm from './pages/BuildingForm';
import Family from './pages/Family';
import AddFamily from './pages/AddFamily';
import PersonForm from './pages/PersonForm';
import VisitForm from './pages/VisitForm';

// حماية الصفحات التي تتطلب تسجيل دخول
// (المستخدم يُقرأ من الجهاز، فيعمل بدون إنترنت)
function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// شريط يظهر عند انقطاع الإنترنت
function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="bg-gold text-navy text-sm font-bold p-2 flex items-center justify-center gap-2">
      <WifiOff className="w-4 h-4" />
      لا يوجد اتصال — يعمل التطبيق بالبيانات المحفوظة على الجهاز
    </div>
  );
}

const protect = (element) => <ProtectedRoute>{element}</ProtectedRoute>;

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <OfflineBanner />
        <UpdatePrompt />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={protect(<Home />)} />

          <Route path="/area/:areaId" element={protect(<Area />)} />
          <Route path="/street/:streetId" element={protect(<Street />)} />

          <Route path="/building/add" element={protect(<BuildingForm />)} />
          <Route path="/building/:buildingId" element={protect(<Building />)} />
          <Route path="/building/:buildingId/edit" element={protect(<BuildingForm />)} />

          <Route path="/family/add" element={protect(<AddFamily />)} />
          <Route path="/family/:familyId" element={protect(<Family />)} />
          <Route path="/family/:familyId/edit" element={protect(<AddFamily />)} />
          <Route path="/family/:familyId/person/add" element={protect(<PersonForm />)} />
          <Route path="/family/:familyId/visit/add" element={protect(<VisitForm />)} />

          <Route path="/person/:personId/edit" element={protect(<PersonForm />)} />
          <Route path="/visit/:visitId/edit" element={protect(<VisitForm />)} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
