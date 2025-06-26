// src/lib/authUtils.ts
import { NextRequest } from 'next/server';
import jwt, { JwtPayload } from 'jsonwebtoken';

// Gunakan secret yang sama seperti saat pembuatan token
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-strong-secret-key-for-development-sosmed';
export interface AuthenticatedUserPayload extends JwtPayload {
  userId: number;
  username: string;
  email: string;
  // tambahkan properti lain dari payload token jika ada
}

export function verifyAuth(request: NextRequest): AuthenticatedUserPayload | null {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Authorization header tidak ada atau format salah');
    return null;
  }

  const token = authHeader.substring(7); // Ambil token setelah "Bearer "

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUserPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.error('Token expired:', error.message);
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.error('Token tidak valid:', error.message);
    } else {
      console.error('Error verifikasi token:', error);
    }
    return null;
  }
}