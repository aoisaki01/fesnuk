// src/components/Auth/LoginForm.tsx
"use client";

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // <-- 1. Impor Link dari next/link

export default function LoginForm() {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emailOrUsername, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login gagal. Silakan coba lagi.');
      }

      if (data.token) {
        localStorage.setItem('jwtToken', data.token);
        if (data.user) { // Simpan data pengguna jika ada
            localStorage.setItem('userData', JSON.stringify(data.user));
        }
        router.push('/feed'); // Arahkan ke halaman feed setelah login
      } else {
        throw new Error('Token tidak diterima dari server.');
      }

    } catch (err: any) {
      setError(err.message);
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-8 bg-white shadow-xl rounded-lg border border-gray-200">
      <h2 className="text-2xl font-bold text-center text-gray-800">Login ke Akun Anda</h2>
      {error && <p className="text-red-500 text-sm text-center py-2 bg-red-50 rounded-md">{error}</p>}
      <div>
        <label
          htmlFor="emailOrUsername"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Email 
        </label>
        <input
          id="emailOrUsername"
          name="emailOrUsername"
          type="text"
          autoComplete="username"
          required
          className="mt-1 block text-black w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={emailOrUsername}
          onChange={(e) => setEmailOrUsername(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 text-black block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70"
        >
          {isLoading ? 'Memproses...' : 'Login'}
        </button>
      </div>

      {/* --- 2. TAMBAHKAN BAGIAN INI --- */}
      <p className="text-sm text-center text-gray-600">
        Belum punya akun?{' '}
        <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500 hover:underline">
          Daftar akun
        </Link>
      </p>
      {/* --- AKHIR BAGIAN TAMBAHAN --- */}
    </form>
  );
}