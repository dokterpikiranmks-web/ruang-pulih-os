'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Shield, Lock, Mail, Loader2, AlertCircle } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw new Error(error.message || 'Login gagal. Periksa kembali email dan kata sandi Anda.');
      }

      if (data.session) {
        router.push('/admin');
        router.refresh();
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-klinik-bg p-4">
      <div className="w-full max-w-md rounded-2xl border border-klinik-border bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-klinik-primary text-white shadow-xs">
            <Shield className="h-7 w-7 text-klinik-gold" />
          </div>
          <h1 className="mt-4 text-xl font-black text-klinik-primary">
            Portal Praktisi Ruang Pulih
          </h1>
          <p className="mt-1 text-xs text-klinik-muted">
            Masuk untuk mengakses antrean jadwal, input fisik, dan Dewan Pakar AI.
          </p>
        </div>

        {errorMessage && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-klinik-text">
              Email Praktisi
            </label>
            <div className="relative mt-1">
              <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ruangpulihmakassar.com"
                className="w-full rounded-xl border border-klinik-border bg-white py-2.5 pl-10 pr-4 text-xs focus:border-klinik-primary focus:outline-none focus:ring-1 focus:ring-klinik-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-klinik-text">
              Kata Sandi
            </label>
            <div className="relative mt-1">
              <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-klinik-border bg-white py-2.5 pl-10 pr-4 text-xs focus:border-klinik-primary focus:outline-none focus:ring-1 focus:ring-klinik-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-klinik-primary text-xs font-bold text-white shadow-md transition hover:bg-klinik-primaryLight active:scale-[0.99]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Memverifikasi Akun...</span>
              </>
            ) : (
              <span>Masuk ke Dashboard Admin</span>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-gray-100 pt-4 text-center text-[11px] text-gray-400">
          Khusus terapis & staf Ruang Pulih Makassar.
        </div>
      </div>
    </div>
  );
}
