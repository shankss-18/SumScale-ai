import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EDF6F9] text-[#006D77] flex flex-col items-center justify-center font-sans antialiased sarvam-gradient-bg">
        <div className="flex items-center space-x-3 bg-white px-6 py-4 rounded-full border border-[#83C5BE]/50 shadow-md">
          <div className="w-4 h-4 rounded-full border-2 border-[#006D77] border-t-transparent animate-spin" />
          <span className="text-xs font-bold tracking-wide">Authenticating Session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
