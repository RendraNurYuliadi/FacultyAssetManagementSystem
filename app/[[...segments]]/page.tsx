import { notFound, redirect } from 'next/navigation';
import {
    getPasswordResetEmail,
    getSessionUser,
} from '@/lib/server/auth';
import NextPage from '@/components/NextPage';

const dashboardPaths = [
    '/dashboard',
    '/dashboard/aset',
    '/dashboard/aset/barang',
    '/dashboard/aset/katalog',
    '/dashboard/aset/ruangan',
    '/dashboard/aset/lokasi',
    '/dashboard/peminjaman',
    '/dashboard/peminjaman/pengajuan',
    '/dashboard/peminjaman/persetujuan',
    '/dashboard/pengembalian',
    '/dashboard/pengembalian/pemeriksaan',
    '/dashboard/pengaduan',
    '/dashboard/pengaduan/riwayat',
    '/dashboard/pemeliharaan',
    '/dashboard/pemeliharaan/jadwal',
    '/dashboard/rfid',
    '/dashboard/rfid/pemindaian',
    '/dashboard/laporan/aset',
    '/dashboard/laporan/peminjaman',
    '/dashboard/laporan/kerusakan',
    '/dashboard/pengguna',
    '/dashboard/pengguna/organisasi',
    '/dashboard/pengaturan',
    '/dashboard/pengaturan/profil',
];

const guestOnlyPaths = ['/login', '/register'];
const publicPaths = [
    '/',
    '/splash-login',
    '/login',
    '/register',
    '/forgot-password',
    '/forgot-password/verify',
    '/reset-password',
    '/verify-email',
];

type Props = {
    params: Promise<{ segments?: string[] }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Page({ params, searchParams }: Props) {
    const [{ segments = [] }, query] = await Promise.all([
        params,
        searchParams,
    ]);
    const pathname = segments.length ? `/${segments.join('/')}` : '/';
    if (!publicPaths.includes(pathname) && !dashboardPaths.includes(pathname)) {
        notFound();
    }
    const user = await getSessionUser();

    if (dashboardPaths.includes(pathname)) {
        if (!user) redirect('/login');
        if (
            user.role === 'pengelola' &&
            pathname.startsWith('/dashboard/pengguna')
        ) {
            notFound();
        }
        if (
            user.role === 'peminjam' &&
            ![
                '/dashboard',
                '/dashboard/aset/katalog',
                '/dashboard/peminjaman',
                '/dashboard/pengembalian',
                '/dashboard/pengaduan',
            ].some(
                (section) =>
                    pathname === section ||
                    pathname.startsWith(`${section}/`),
            )
        ) {
            notFound();
        }
    } else if (guestOnlyPaths.includes(pathname) && user) {
        redirect('/dashboard');
    }

    const resetEmail =
        pathname === '/reset-password'
            ? await getPasswordResetEmail()
            : null;
    if (pathname === '/reset-password' && !resetEmail) {
        redirect(
            '/forgot-password?status=' +
                encodeURIComponent(
                    'Sesi verifikasi berakhir. Silakan minta kode reset password baru.',
                ),
        );
    }

    const email =
        resetEmail ??
        (typeof query.email === 'string' ? query.email : '');
    const status = typeof query.status === 'string' ? query.status : '';

    return (
        <NextPage
            pathname={pathname}
            email={email}
            status={status}
            user={user}
        />
    );
}
