'use client';

import type { ComponentType } from 'react';
import { LegacyPageContext } from '../lib/next-compat';
import Welcome from '../pages/welcome';
import Splash from '../pages/auth/splash';
import Login from '../pages/auth/login';
import Register from '../pages/auth/register';
import ForgotPassword from '../pages/auth/forgot-password';
import PasswordResetSent from '../pages/auth/password-reset-sent';
import ResetPassword from '../pages/auth/reset-password';
import VerifyEmail from '../pages/auth/verify-email';
import Dashboard from '../pages/dashboard/index';
import Placeholder from '../pages/dashboard/Placeholder';
import Asset from '../pages/dashboard/aset/index';
import AssetItems from '../pages/dashboard/aset/barang';
import AssetCatalog from '../pages/dashboard/aset/katalog';
import AssetRooms from '../pages/dashboard/aset/ruangan';
import AssetLocations from '../pages/dashboard/aset/lokasi';
import Borrowing from '../pages/dashboard/peminjaman/index';
import BorrowingRequest from '../pages/dashboard/peminjaman/pengajuan';
import BorrowingApproval from '../pages/dashboard/peminjaman/persetujuan';
import Returns from '../pages/dashboard/pengembalian/index';
import ReturnInspection from '../pages/dashboard/pengembalian/pemeriksaan';
import Complaints from '../pages/dashboard/pengaduan/index';
import ComplaintHistory from '../pages/dashboard/pengaduan/riwayat';
import Users from '../pages/dashboard/pengguna/index';
import Organizations from '../pages/dashboard/pengguna/organisasi/index';

type SessionUser = {
    id: string;
    name: string;
    email: string;
    role: string;
    avatar?: string;
};

type PageProps = {
    email: string;
    status?: string;
    title?: string;
};

const pages: Record<string, ComponentType<PageProps>> = {
    '/': Welcome,
    '/splash-login': Splash,
    '/login': Login,
    '/register': Register,
    '/forgot-password': ForgotPassword,
    '/forgot-password/verify': PasswordResetSent,
    '/reset-password': ResetPassword,
    '/verify-email': VerifyEmail,
    '/dashboard': Dashboard,
    '/dashboard/aset': Asset,
    '/dashboard/aset/barang': AssetItems,
    '/dashboard/aset/katalog': AssetCatalog,
    '/dashboard/aset/ruangan': AssetRooms,
    '/dashboard/aset/lokasi': AssetLocations,
    '/dashboard/peminjaman': () => <Borrowing />,
    '/dashboard/peminjaman/pengajuan': BorrowingRequest,
    '/dashboard/peminjaman/persetujuan': BorrowingApproval,
    '/dashboard/pengembalian': Returns,
    '/dashboard/pengembalian/pemeriksaan': ReturnInspection,
    '/dashboard/pengaduan': Complaints,
    '/dashboard/pengaduan/riwayat': ComplaintHistory,
    '/dashboard/pengguna': () => <Users />,
    '/dashboard/pengguna/organisasi': () => <Organizations />,
    '/dashboard/pemeliharaan': ({ title }) => (
        <Placeholder title={title ?? 'Data Pemeliharaan'} />
    ),
    '/dashboard/pemeliharaan/jadwal': ({ title }) => (
        <Placeholder title={title ?? 'Jadwal Pemeliharaan'} />
    ),
    '/dashboard/rfid': ({ title }) => (
        <Placeholder title={title ?? 'Perangkat RFID'} />
    ),
    '/dashboard/rfid/pemindaian': ({ title }) => (
        <Placeholder title={title ?? 'Riwayat Pemindaian'} />
    ),
    '/dashboard/laporan/aset': ({ title }) => (
        <Placeholder title={title ?? 'Laporan Aset'} />
    ),
    '/dashboard/laporan/peminjaman': ({ title }) => (
        <Placeholder title={title ?? 'Laporan Peminjaman'} />
    ),
    '/dashboard/laporan/kerusakan': ({ title }) => (
        <Placeholder title={title ?? 'Laporan Kerusakan'} />
    ),
    '/dashboard/pengaturan': ({ title }) => (
        <Placeholder title={title ?? 'Pengaturan Sistem'} />
    ),
    '/dashboard/pengaturan/profil': ({ title }) => (
        <Placeholder title={title ?? 'Profil Saya'} />
    ),
};

const placeholderTitles: Record<string, string> = {
    '/dashboard/pemeliharaan': 'Data Pemeliharaan',
    '/dashboard/pemeliharaan/jadwal': 'Jadwal Pemeliharaan',
    '/dashboard/rfid': 'Perangkat RFID',
    '/dashboard/rfid/pemindaian': 'Riwayat Pemindaian',
    '/dashboard/laporan/aset': 'Laporan Aset',
    '/dashboard/laporan/peminjaman': 'Laporan Peminjaman',
    '/dashboard/laporan/kerusakan': 'Laporan Kerusakan',
    '/dashboard/pengaturan': 'Pengaturan Sistem',
    '/dashboard/pengaturan/profil': 'Profil Saya',
};

export default function NextPage({
    pathname,
    email,
    status,
    user,
}: {
    pathname: string;
    email: string;
    status: string;
    user: SessionUser | null;
}) {
    const PageComponent = pages[pathname];

    if (!PageComponent) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-surface-warm p-6 text-center">
                <div>
                    <h1 className="text-2xl font-semibold">
                        Halaman tidak ditemukan
                    </h1>
                    <a className="mt-4 inline-block text-primary-600" href="/">
                        Kembali ke beranda
                    </a>
                </div>
            </main>
        );
    }

    return (
        <LegacyPageContext pathname={pathname} user={user}>
            <PageComponent
                email={email}
                status={status || undefined}
                title={placeholderTitles[pathname]}
            />
        </LegacyPageContext>
    );
}
