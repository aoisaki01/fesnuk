// src/components/Profile/ChangePasswordForm.tsx (Contoh path)
"use client";

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation'; // Jika ingin redirect setelah sukses

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    if (newPassword !== confirmNewPassword) {
      setError('Password baru dan konfirmasi password tidak cocok.');
      setIsLoading(false);
      return;
    }
    if (newPassword.length < 6) {
        setError('Password baru minimal harus 6 karakter.');
        setIsLoading(false);
        return;
    }
    // Validasi lain bisa ditambahkan di sini

    const token = localStorage.getItem('jwtToken');
    if (!token) {
      setError('Sesi tidak valid. Silakan login kembali.');
      setIsLoading(false);
      // router.push('/login'); // Pertimbangkan redirect
      return;
    }

    try {
      const response = await fetch('/api/profile/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Gagal mengubah password.');
      }

      setSuccessMessage(data.message || 'Password berhasil diubah!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      // Pertimbangkan untuk logout pengguna setelah ganti password untuk keamanan,
      // atau biarkan sesi tetap aktif.
      // Jika ingin logout:
      // localStorage.removeItem('jwtToken');
      // localStorage.removeItem('userData');
      // router.push('/login?passwordChanged=true');

    } catch (err: any) {
      setError(err.message);
      console.error('Change password error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-white shadow-md rounded-lg border border-gray-200 max-w-md mx-auto">
      <h2 className="text-xl font-semibold text-center text-gray-800">Ganti Password</h2>
      
      {error && <p className="text-red-500 text-sm text-center p-3 bg-red-50 border border-red-200 rounded-md">{error}</p>}
      {successMessage && <p className="text-green-600 text-sm text-center p-3 bg-green-50 border border-green-200 rounded-md">{successMessage}</p>}

      <div>
        <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
          Password Saat Ini <span className="text-red-500">*</span>
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-black"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
          Password Baru <span className="text-red-500">*</span>
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-black"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div>
        <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700 mb-1">
          Konfirmasi Password Baru <span className="text-red-500">*</span>
        </label>
        <input
          id="confirmNewPassword"
          name="confirmNewPassword"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-black"
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          disabled={isLoading}
        />
        {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
            <p className="text-xs text-red-500 mt-1">Konfirmasi password tidak cocok.</p>
        )}
      </div>
      
      <div className="pt-2">
        <button
          type="submit"
          disabled={isLoading || !currentPassword || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword || newPassword.length < 6}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70"
        >
          {isLoading ? 'Menyimpan...' : 'Ganti Password'}
        </button>
      </div>
    </form>
  );
}
