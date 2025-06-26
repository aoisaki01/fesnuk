import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_FILE_NAME = 'social_media_app.db';

const projectRoot = process.cwd(); // Memberikan root direktori proyek

let dbFilePath = path.join(projectRoot, DB_FILE_NAME);

if (!fs.existsSync(dbFilePath)) {
  const potentialDbPathInDev = path.join(projectRoot, '..', DB_FILE_NAME); // Mencoba satu level di atas jika di dalam .next
  if (fs.existsSync(potentialDbPathInDev)) {
    dbFilePath = potentialDbPathInDev;
  } else {
    console.warn(
      `File database ${DB_FILE_NAME} tidak ditemukan di ${projectRoot} atau path alternatif.`
    );
  }
}

let dbInstance: Database.Database;

try {
  console.log(`Mencoba menghubungkan ke database di: ${dbFilePath}`);
  dbInstance = new Database(dbFilePath, { /* verbose: console.log */ });
  console.log(`Berhasil terhubung ke database: ${DB_FILE_NAME}`);
  dbInstance.pragma('foreign_keys = ON');
  console.log('Foreign key constraints diaktifkan.');
  dbInstance.pragma('busy_timeout = 5000'); 

} catch (error) {
  console.error('Gagal terhubung atau mengkonfigurasi database:', error);

}



export function getDbConnection(): Database.Database {
  if (!dbInstance) {
 
    try {
        console.warn('Instance database belum ada, mencoba membuat koneksi baru...');
        dbInstance = new Database(dbFilePath, { /* verbose: console.log */ });
        dbInstance.pragma('foreign_keys = ON');
        dbInstance.pragma('busy_timeout = 5000');
        console.log(`Koneksi database baru berhasil dibuat untuk ${DB_FILE_NAME}`);
    } catch (error) {
        console.error('Gagal membuat koneksi database baru:', error);
        throw new Error(`Tidak dapat terhubung ke database di ${dbFilePath}. Pastikan file database ada dan skrip Python setup_database.py sudah dijalankan.`);
    }
  }
  return dbInstance;
}