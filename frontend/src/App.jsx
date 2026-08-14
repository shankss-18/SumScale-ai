import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PageTransition, { AppLoader } from './components/PageTransition';

import LandingPage    from './pages/LandingPage';
import Login          from './pages/Login';
import Signup         from './pages/Signup';
import Dashboard      from './pages/Dashboard';
import NewCase        from './pages/NewCase';
import ClarifyingChat from './pages/ClarifyingChat';
import CaseReport     from './pages/CaseReport';
import ProfilePage    from './pages/ProfilePage';
import FraudVerifyPage from './pages/FraudVerifyPage';
import FloatingChatbot from './components/FloatingChatbot';
import LanguageModal   from './components/LanguageModal';

import { Navigate } from 'react-router-dom';

/* Inner component so useLocation works inside BrowserRouter */
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <PageTransition key={location.pathname}>
      <Routes location={location}>
        {/* Public */}
        <Route path="/"        element={<LandingPage />} />
        <Route path="/login"   element={<Login />} />
        <Route path="/signup"  element={<Signup />} />

        {/* Protected */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard"          element={<Dashboard />} />
          <Route path="/new-case"           element={<NewCase />} />
          <Route path="/profile"            element={<Navigate to="/dashboard" replace />} />
          <Route path="/fraud-verify"       element={<FraudVerifyPage />} />
          <Route path="/case/:id/clarify"   element={<ClarifyingChat />} />
          <Route path="/case/:id"           element={<CaseReport />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </PageTransition>
  );
}

function App() {
  const [isLangModalOpen, setIsLangModalOpen] = useState(() => {
    return !localStorage.getItem('hasChosenLanguage');
  });

  useEffect(() => {
    const handleOpen = () => setIsLangModalOpen(true);
    window.addEventListener('openLanguageModal', handleOpen);
    return () => window.removeEventListener('openLanguageModal', handleOpen);
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<AppLoader />}>
          <AnimatedRoutes />
          <FloatingChatbot />
          <LanguageModal
            isOpen={isLangModalOpen}
            onClose={() => setIsLangModalOpen(false)}
          />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
