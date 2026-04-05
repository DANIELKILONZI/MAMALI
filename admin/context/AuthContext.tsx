'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi, AdminUser } from '@/lib/api';

interface AuthContextType {
  user: AdminUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('mamali_admin_token');
    if (storedToken) {
      setToken(storedToken);
      adminApi.auth
        .me()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('mamali_admin_token');
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { token: newToken, user: newUser } = await adminApi.auth.login(email, password);
    localStorage.setItem('mamali_admin_token', newToken);
    setToken(newToken);
    setUser(newUser);
    router.push('/dashboard');
  };

  const logout = () => {
    localStorage.removeItem('mamali_admin_token');
    setToken(null);
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, isLoading, isAdmin: user?.role === 'admin' }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  adminOnly = false
) {
  return function ProtectedComponent(props: P) {
    const { user, isLoading, isAdmin } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading) {
        if (!user) router.push('/login');
        else if (adminOnly && !isAdmin) router.push('/dashboard');
      }
    }, [user, isLoading, isAdmin, router]);

    if (isLoading || !user) return null;
    if (adminOnly && !isAdmin) return null;
    return <Component {...props} />;
  };
}
