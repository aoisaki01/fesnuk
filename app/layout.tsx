// src/app/layout.tsx (atau app/layout.tsx)
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css"; // Pastikan file ini ada dan path-nya benar

export const metadata: Metadata = {
  title: "Fesnuk", // Ganti sesuai nama aplikasi Anda
  description: "Platform media sosial yang keras, ketuk untuk terhubung dan berbagi. :v", // Ganti deskripsi
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">
        {/* Jika Anda menggunakan provider global (SWRConfig, Context API, dll.), 
          tempatkan di sini membungkus {children}.
          Contoh:
          <SWRConfigProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </SWRConfigProvider>
        */}
        {children}
      </body>
    </html>
  );
}