// src/app/(main)/settings/security/page.tsx
import ChangePasswordForm from '@/components/Profile/ChangePasswordForm'; // Sesuaikan path

export default function SecuritySettingsPage() {
  return (
    <div className="container mx-auto py-8">
      <ChangePasswordForm />
    </div>
  );
}