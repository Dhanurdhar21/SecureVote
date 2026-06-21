import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import AdminLogin from './pages/admin/Login';
import AdminDashboard from './pages/admin/Dashboard';
import VoterLogin from './pages/voter/Login';
import VoterWizard from './pages/voter/Wizard';
import ThankYou from './pages/voter/ThankYou';
import { AuthProvider, useAuth } from './context/AuthContext';

const ProtectedRoute = ({ children, role }: { children: React.ReactNode, role?: string }) => {
  const { user, profile, loading } = useAuth();
  
  if (loading) return (
    <div className="h-screen w-screen flex items-center justify-center bg-black">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  
  if (!user) {
    console.log(`[App] ProtectedRoute: No user, redirecting to login. Required role: ${role}`);
    if (role === 'admin') return <Navigate to="/admin/login" />;
    if (role === 'voter') return <Navigate to="/voter/login" />;
    return <Navigate to="/" />;
  }
  if (role && profile?.role !== role) {
    console.log(`[App] ProtectedRoute: User role (${profile?.role}) does not match required role (${role}), redirecting to /`);
    return <Navigate to="/" />;
  }
  
  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-black text-white selection:bg-primary/30">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/voter/login" element={<VoterLogin />} />
            <Route 
              path="/admin/dashboard/*" 
              element={
                <ProtectedRoute role="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              } 
            />
            {/* Voter wizard: accessible after OTP auth (user will have a session) */}
            <Route path="/vote/wizard" element={<VoterWizard />} />
            <Route path="/voter/dashboard" element={<VoterWizard />} />
            <Route path="/voter/thanks" element={<ThankYou />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
