/** @type {import('next').NextConfig} */
const nextConfig = {
  // ...konfigurasi lain seperti 'images'
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'files.uty.ac.id',
        // ...
      },
    ],
  },
  // Pastikan tidak ada baris 'output: "export"' di sini
};

module.exports = nextConfig;