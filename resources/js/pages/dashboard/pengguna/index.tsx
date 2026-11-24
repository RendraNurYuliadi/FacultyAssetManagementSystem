
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, HTMLInputTypeAttribute } from 'react';

import DashboardLayout from '../../../components/layouts/DashboardLayout';
import Icon from '../../../components/Icon';
import AssetManagementBanner from '../../../components/dashboard/AssetManagementBanner';
import DashboardMetricCard from '../../../components/dashboard/DashboardMetricCard';
import ImagePreviewModal from '../../../components/dashboard/ImagePreviewModal';
import type { ImagePreviewState } from '../../../components/dashboard/ImagePreviewModal';
import {
    managementErrorMessage,
    managementRequest,
} from '../../../lib/management-client';
import {
    nextNumberedEmail,
    nextNumberedUniqueValue,
} from '../../../lib/duplicate';
import { copyStoredImage } from '../../../lib/image-file';

type UserRole = 'admin' | 'pengelola' | 'peminjam';
type BorrowerType = 'mahasiswa' | 'dosen' | 'staf' | 'eksternal';

type User = {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: UserRole;
    borrowerType: BorrowerType | '';
    identityNumber: string;
    faculty: string;
    studyProgram: string;
    enrollmentYear: string;
    unitName: string;
    position: string;
    organizationName: string;
    borrowingContext: string;
    address: string;
    createdAt: string;
    avatar: string;
};

type UserForm = Omit<User, 'id' | 'createdAt'> & {
    password: string;
    passwordConfirmation: string;
};

const PER_PAGE = 5;

const emptyForm: UserForm = {
    name: '',
    email: '',
    phone: '',
    role: 'peminjam',
    borrowerType: 'mahasiswa',
    identityNumber: '',
    faculty: '',
    studyProgram: '',
    enrollmentYear: '',
    unitName: '',
    position: '',
    organizationName: '',
    borrowingContext: 'pribadi',
    address: '',
    avatar: '',
    password: '',
    passwordConfirmation: '',
};

const borrowerOptions: {
    value: BorrowerType;
    label: string;
    description: string;
}[] = [
    { value: 'mahasiswa', label: 'Mahasiswa', description: 'Mahasiswa aktif' },
    { value: 'dosen', label: 'Dosen', description: 'Tenaga pengajar' },
    {
        value: 'staf',
        label: 'Tenaga Kependidikan',
        description: 'Staf dan pegawai kampus',
    },
    {
        value: 'eksternal',
        label: 'Pihak Eksternal',
        description: 'Tamu, mitra, atau umum',
    },
];

const borrowerLabels: Record<BorrowerType, string> = {
    mahasiswa: 'Mahasiswa',
    dosen: 'Dosen',
    staf: 'Tenaga Kependidikan',
    eksternal: 'Pihak Eksternal',
};

const roleLabels: Record<UserRole, string> = {
    admin: 'Admin',
    pengelola: 'Pengelola',
    peminjam: 'Peminjam',
};

const roleStyles: Record<UserRole, string> = {
    admin: 'bg-neutral-900 text-white',
    pengelola: 'bg-neutral-200 text-neutral-800',
    peminjam: 'bg-neutral-100 text-neutral-600',
};

const inputClass =
    'w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100';

function FormInput({
    label,
    name,
    value,
    placeholder,
    onChange,
    required = false,
    type = 'text',
    autoComplete,
    min,
    max,
    maxLength,
}: {
    label: string;
    name: string;
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
    required?: boolean;
    type?: HTMLInputTypeAttribute;
    autoComplete?: string;
    min?: number;
    max?: number;
    maxLength?: number;
}) {
    return (
        <label className="block space-y-2">
            <span className="text-xs font-semibold text-neutral-700">
                {label}
                {required && ' *'}
            </span>
            <input
                id={name}
                name={name}
                required={required}
                type={type}
                min={min}
                max={max}
                maxLength={maxLength}
                autoComplete={autoComplete}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className={inputClass}
                placeholder={placeholder}
            />
        </label>
    );
}

export default function ManageUser() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('Semua');
    const [currentPage, setCurrentPage] = useState(1);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [form, setForm] = useState<UserForm>(emptyForm);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState('');
    const [previewModal, setPreviewModal] =
        useState<ImagePreviewState | null>(null);
    const [removePhoto, setRemovePhoto] = useState(false);
    const [saving, setSaving] = useState(false);

    const closePhotoPreview = useCallback(() => {
        setPreviewModal(null);
    }, []);

    const changePhotoPreviewIndex = useCallback((index: number) => {
        setPreviewModal((current) =>
            current ? { ...current, index } : current,
        );
    }, []);

    async function loadUsers() {
        const result = await managementRequest<{ users: User[] }>(
            '/api/admin/users',
        );
        setUsers(result.users);
    }

    useEffect(() => {
        let active = true;
        managementRequest<{ users: User[] }>('/api/admin/users')
            .then((result) => {
                if (active) setUsers(result.users);
            })
            .catch((error: unknown) => {
                if (active) alert(managementErrorMessage(error));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!photoFile) {
            setPhotoPreview(form.avatar);
            return;
        }
        const previewUrl = URL.createObjectURL(photoFile);
        setPhotoPreview(previewUrl);
        return () => URL.revokeObjectURL(previewUrl);
    }, [photoFile, form.avatar]);

    const filteredUsers = useMemo(() => {
        const keyword = search.toLowerCase().trim();

        return users.filter((user) => {
            const matchesSearch = [
                user.name,
                user.email,
                user.phone,
                user.role,
                user.borrowerType,
                user.identityNumber,
                user.faculty,
                user.studyProgram,
                user.enrollmentYear,
                user.unitName,
                user.position,
                user.organizationName,
                user.borrowingContext,
                user.address,
            ].some((value) => value.toLowerCase().includes(keyword));

            const matchesRole =
                roleFilter === 'Semua' || user.role === roleFilter;

            return matchesSearch && matchesRole;
        });
    }, [users, search, roleFilter]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredUsers.length / PER_PAGE),
    );

    const safeCurrentPage = Math.min(currentPage, totalPages);

    const paginatedUsers = filteredUsers.slice(
        (safeCurrentPage - 1) * PER_PAGE,
        safeCurrentPage * PER_PAGE,
    );

    const stats = [
        {
            label: 'Total Pengguna',
            value: users.length,
            icon: 'users' as const,
        },
        {
            label: 'Administrator',
            value: users.filter((user) => user.role === 'admin').length,
            icon: 'users' as const,
        },
        {
            label: 'Pengelola',
            value: users.filter((user) => user.role === 'pengelola').length,
            icon: 'users' as const,
        },
        {
            label: 'Peminjam',
            value: users.filter((user) => user.role === 'peminjam').length,
            icon: 'users' as const,
        },
    ];

    function openCreateModal() {
        setEditingId(null);
        setForm(emptyForm);
        setPhotoFile(null);
        setRemovePhoto(false);
        setPreviewModal(null);
        setModalOpen(true);
    }

    async function duplicateUser(user: User) {
        let email: string;
        try {
            email = nextNumberedEmail(
                user.email,
                users.map((item) => item.email),
            );
        } catch (error: unknown) {
            alert(managementErrorMessage(error));
            return;
        }

        let photoCopy: File | null = null;
        try {
            if (user.avatar) {
                photoCopy = await copyStoredImage(
                    user.avatar,
                    `${user.name}-copy`,
                );
            }
        } catch (error: unknown) {
            alert(managementErrorMessage(error));
            return;
        }

        setEditingId(null);
        setForm({
            name: nextNumberedUniqueValue(
                user.name,
                users.map((item) => item.name),
            ),
            email,
            phone: user.phone,
            role: user.role,
            borrowerType: user.borrowerType,
            identityNumber: nextNumberedUniqueValue(
                user.identityNumber,
                users.map((item) => item.identityNumber),
                50,
            ),
            faculty: user.faculty,
            studyProgram: user.studyProgram,
            enrollmentYear: user.enrollmentYear,
            unitName: user.unitName,
            position: user.position,
            organizationName: user.organizationName,
            borrowingContext: user.borrowingContext,
            address: user.address,
            avatar: '',
            password: '',
            passwordConfirmation: '',
        });
        setPhotoFile(photoCopy);
        setRemovePhoto(false);
        setPreviewModal(null);
        setModalOpen(true);
    }

    function openEditModal(user: User) {
        setEditingId(user.id);

        setForm({
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            borrowerType: user.borrowerType,
            identityNumber: user.identityNumber,
            faculty: user.faculty,
            studyProgram: user.studyProgram,
            enrollmentYear: user.enrollmentYear,
            unitName: user.unitName,
            position: user.position,
            organizationName: user.organizationName,
            borrowingContext:
                user.borrowingContext ||
                (user.role === 'peminjam' ? 'pribadi' : ''),
            address: user.address,
            avatar: user.avatar,
            password: '',
            passwordConfirmation: '',
        });

        setPhotoFile(null);
        setRemovePhoto(false);
        setPreviewModal(null);
        setModalOpen(true);
    }

    function updateForm<K extends keyof UserForm>(
        key: K,
        value: UserForm[K],
    ) {
        setForm((previous) => ({
            ...previous,
            [key]: value,
        }));
    }

    function changeBorrowerType(borrowerType: BorrowerType) {
        setForm((current) => ({
            ...current,
            borrowerType,
            identityNumber: '',
            faculty: '',
            studyProgram: '',
            enrollmentYear: '',
            unitName: '',
            position: '',
            organizationName: '',
            borrowingContext: 'pribadi',
        }));
    }

    function changeRole(role: UserRole) {
        setForm((current) => {
            if (role === current.role) return current;
            if (role === 'peminjam') {
                return {
                    ...current,
                    role,
                    borrowerType: 'mahasiswa',
                    identityNumber: '',
                    faculty: '',
                    studyProgram: '',
                    enrollmentYear: '',
                    unitName: '',
                    position: '',
                    organizationName: '',
                    borrowingContext: 'pribadi',
                };
            }
            if (current.role === 'peminjam') {
                return {
                    ...current,
                    role,
                    borrowerType: '',
                    identityNumber: '',
                    faculty: '',
                    studyProgram: '',
                    enrollmentYear: '',
                    unitName: '',
                    position: '',
                    organizationName: '',
                    borrowingContext: '',
                };
            }
            return { ...current, role, borrowerType: '' };
        });
    }

    function openPhotoPreview() {
        if (!photoPreview || removePhoto) return;
        setPreviewModal({
            images: [photoPreview],
            imageNames: [photoFile?.name || form.name || 'Foto Profil'],
            index: 0,
            entityName: form.name || 'Foto Profil',
        });
    }

    async function saveUser(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const emailExists = users.some(
            (user) =>
                user.id !== editingId &&
                user.email.toLowerCase() === form.email.trim().toLowerCase(),
        );

        if (emailExists) {
            alert('Email sudah digunakan oleh pengguna lain.');
            return;
        }

        const data = new FormData();
        data.set('name', form.name);
        data.set('email', form.email);
        data.set('phone', form.phone);
        data.set('role', form.role);
        data.set('borrower_type', form.borrowerType);
        data.set('identity_number', form.identityNumber);
        data.set('faculty', form.faculty);
        data.set('study_program', form.studyProgram);
        data.set('enrollment_year', form.enrollmentYear);
        data.set('unit_name', form.unitName);
        data.set('position', form.position);
        data.set('organization_name', form.organizationName);
        data.set('borrowing_context', form.borrowingContext);
        data.set('address', form.address);
        if (form.password) data.set('password', form.password);
        if (form.passwordConfirmation) {
            data.set('password_confirmation', form.passwordConfirmation);
        }
        if (photoFile) data.set('photo', photoFile);
        if (removePhoto) data.set('removePhoto', 'true');

        setSaving(true);
        try {
            await managementRequest<{ user: User }>(
                editingId
                    ? `/api/admin/users/${editingId}`
                    : '/api/admin/users',
                {
                    method: editingId ? 'PATCH' : 'POST',
                    body: data,
                },
            );
            await loadUsers();
            setCurrentPage(1);
            closeModal();
        } catch (error) {
            alert(managementErrorMessage(error));
        } finally {
            setSaving(false);
        }
    }

    async function confirmDelete() {
        if (deleteId === null) return;
        try {
            await managementRequest<{ deleted: boolean }>(
                `/api/admin/users/${deleteId}`,
                { method: 'DELETE' },
            );
            await loadUsers();
            setDeleteId(null);
        } catch (error) {
            alert(managementErrorMessage(error));
        }
    }

    function closeModal() {
        setModalOpen(false);
        setEditingId(null);
        setForm(emptyForm);
        setPhotoFile(null);
        setRemovePhoto(false);
        setPreviewModal(null);
    }

    return (
        <DashboardLayout>
            <div className="space-y-6 p-4 sm:p-6 lg:p-8">
                <AssetManagementBanner
                    title="Kelola Pengguna."
                    description="Atur akun, informasi, dan hak akses pengguna dalam sistem Faculty Asset Management System."
                    contextLabel="Manajemen pengguna"
                    icon="users"
                    statusLabel="Akses pengguna terorganisir"
                    metrics={[
                        { label: 'Total pengguna', value: users.length },
                        {
                            label: 'Total administrator',
                            value: users.filter(
                                (user) => user.role === 'admin',
                            ).length,
                        },
                    ]}
                />

                {/* PAGE HEADING */}
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-xs text-neutral-400">
                            <span>Manajemen Pengguna</span>
                            <Icon name="chevron-right" size={13} />
                            <span className="font-semibold text-neutral-700">
                                Data Pengguna
                            </span>
                        </div>

                        <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                            Data Pengguna
                        </h1>

                        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">
                            Kelola data akun pengguna, informasi identitas,
                            serta hak akses dalam sistem FAMS.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={openCreateModal}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                    >
                        <Icon name="plus" size={17} />
                        Tambah Pengguna
                    </button>
                </div>

                {/* STATISTICS */}
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {stats.map((stat, index) => (
                        <DashboardMetricCard
                            key={stat.label}
                            label={stat.label}
                            value={stat.value}
                            icon={stat.icon}
                            index={index}
                        />
                    ))}
                </div>

                {/* USER TABLE */}
                <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    <div className="flex flex-col gap-4 border-b border-neutral-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="font-bold text-neutral-900">
                                Daftar Pengguna
                            </h2>
                            <p className="mt-1 text-xs text-neutral-500">
                                Seluruh akun yang terdaftar dalam sistem FAMS.
                            </p>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <div className="relative">
                                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400">
                                    <Icon name="search" size={16} />
                                </span>

                                <input
                                    value={search}
                                    onChange={(event) => {
                                        setSearch(event.target.value);
                                        setCurrentPage(1);
                                    }}
                                    placeholder="Cari nama, email, NIM/NIP..."
                                    className={`${inputClass} pl-9 sm:w-64`}
                                />
                            </div>

                            <select
                                value={roleFilter}
                                onChange={(event) => {
                                    setRoleFilter(event.target.value);
                                    setCurrentPage(1);
                                }}
                                className={`${inputClass} sm:w-44`}
                            >
                                <option value="Semua">Semua Role</option>
                                <option value="admin">Admin</option>
                                <option value="pengelola">Pengelola</option>
                                <option value="peminjam">Peminjam</option>
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1000px] text-left text-sm">
                            <thead className="bg-neutral-50 text-xs text-neutral-500">
                                <tr>
                                    <th className="px-5 py-4 font-semibold">
                                        Pengguna
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Kategori Peminjam
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        NIM / NIP
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Fakultas / Program Studi
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Role
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Tanggal Bergabung
                                    </th>
                                    <th className="px-5 py-4 text-right font-semibold">
                                        Aksi
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-neutral-100">
                                {paginatedUsers.map((user) => (
                                    <tr
                                        key={user.id}
                                        className="transition hover:bg-neutral-50/70"
                                    >
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 text-sm font-bold text-neutral-700">
                                                    {user.avatar ? (
                                                        <img
                                                            src={user.avatar}
                                                            alt=""
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        user.name
                                                            .split(' ')
                                                            .slice(0, 2)
                                                            .map((part) => part[0])
                                                            .join('')
                                                            .toUpperCase()
                                                    )}
                                                </div>

                                                <div>
                                                    <p className="font-semibold text-neutral-900">
                                                        {user.name}
                                                    </p>
                                                    <p className="mt-1 text-xs text-neutral-400">
                                                        {user.email}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-5 py-4 text-xs text-neutral-700">
                                            {user.borrowerType
                                                ? borrowerLabels[
                                                      user.borrowerType
                                                  ]
                                                : '-'}
                                        </td>

                                        <td className="px-5 py-4 text-neutral-700">
                                            {user.identityNumber || '-'}
                                        </td>

                                        <td className="max-w-52 px-5 py-4">
                                            <p className="text-xs text-neutral-700">
                                                {user.faculty || '-'}
                                            </p>
                                            <p className="mt-1 text-xs text-neutral-400">
                                                {user.studyProgram || '-'}
                                            </p>
                                        </td>

                                        <td className="px-5 py-4">
                                            <span
                                                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${roleStyles[user.role]}`}
                                            >
                                                {roleLabels[user.role]}
                                            </span>
                                        </td>

                                        <td className="px-5 py-4 text-xs text-neutral-600">
                                            {user.createdAt}
                                        </td>

                                        <td className="px-5 py-4">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    type="button"
                                                    title="Duplikasi"
                                                    aria-label={`Duplikasi pengguna ${user.name}`}
                                                    onClick={() =>
                                                        void duplicateUser(user)
                                                    }
                                                    className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                                                >
                                                    <Icon
                                                        name="copy"
                                                        size={16}
                                                    />
                                                </button>

                                                <button
                                                    type="button"
                                                    title="Edit"
                                                    onClick={() =>
                                                        openEditModal(user)
                                                    }
                                                    className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                                                >
                                                    <Icon
                                                        name="pencil"
                                                        size={16}
                                                    />
                                                </button>

                                                <button
                                                    type="button"
                                                    title="Hapus"
                                                    onClick={() =>
                                                        setDeleteId(user.id)
                                                    }
                                                    className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                                                >
                                                    <Icon
                                                        name="trash-2"
                                                        size={16}
                                                    />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}

                                {paginatedUsers.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={7}
                                            className="px-5 py-14 text-center"
                                        >
                                            <Icon
                                                name="users"
                                                size={30}
                                                className="mx-auto mb-3 text-neutral-300"
                                            />

                                            <p className="font-semibold text-neutral-700">
                                                {loading
                                                    ? 'Memuat data pengguna...'
                                                    : 'Pengguna tidak ditemukan'}
                                            </p>

                                            {!loading && (
                                                <p className="mt-1 text-xs text-neutral-400">
                                                    Ubah kata kunci atau filter
                                                    pencarian, atau tambahkan data pengguna.
                                                </p>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* PAGINATION */}
                    <div className="flex flex-col gap-3 border-t border-neutral-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-neutral-500">
                            Menampilkan{' '}
                            {filteredUsers.length > 0
                                ? (safeCurrentPage - 1) * PER_PAGE + 1
                                : 0}{' '}
                            -{' '}
                            {Math.min(
                                safeCurrentPage * PER_PAGE,
                                filteredUsers.length,
                            )}{' '}
                            dari {filteredUsers.length} pengguna
                        </p>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={safeCurrentPage === 1}
                                onClick={() =>
                                    setCurrentPage((page) =>
                                        Math.max(1, page - 1),
                                    )
                                }
                                className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 disabled:opacity-40"
                            >
                                Sebelumnya
                            </button>

                            <span className="text-xs text-neutral-500">
                                {safeCurrentPage} / {totalPages}
                            </span>

                            <button
                                type="button"
                                disabled={safeCurrentPage >= totalPages}
                                onClick={() =>
                                    setCurrentPage((page) =>
                                        Math.min(totalPages, page + 1),
                                    )
                                }
                                className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 disabled:opacity-40"
                            >
                                Berikutnya
                            </button>
                        </div>
                    </div>
                </section>

                <p className="text-xs text-neutral-400">
                    Data pengguna tersimpan di database FAMS.
                </p>
            </div>

            {/* CREATE / EDIT MODAL */}
            {modalOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            closeModal();
                        }
                    }}
                >
                    <form
                        onSubmit={saveUser}
                        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                    >
                        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 sm:px-7">
                            <div>
                                <h2 className="text-lg font-bold text-neutral-950">
                                    {editingId !== null
                                        ? 'Edit Data Pengguna'
                                        : 'Tambah Pengguna Baru'}
                                </h2>
                                <p className="mt-1 text-xs text-neutral-500">
                                    Lengkapi informasi akun dan hak akses
                                    pengguna.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100"
                            >
                                <Icon name="x" size={20} />
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                    Foto Profil
                                </h3>
                                <div className="flex flex-wrap items-center gap-4">
                                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 text-sm font-bold text-neutral-700">
                                        {photoPreview && !removePhoto ? (
                                            <button
                                                type="button"
                                                onClick={openPhotoPreview}
                                                title="Lihat pratinjau foto"
                                                aria-label="Lihat pratinjau foto profil"
                                                className="h-full w-full cursor-zoom-in"
                                            >
                                                <img
                                                    src={photoPreview}
                                                    alt=""
                                                    className="h-full w-full object-cover"
                                                />
                                            </button>
                                        ) : (
                                            form.name
                                                .split(' ')
                                                .slice(0, 2)
                                                .map((part) => part[0])
                                                .join('')
                                                .toUpperCase() || '-'
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-2">
                                        <input
                                            id="photo"
                                            name="photo"
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            onChange={(event) => {
                                                setPhotoFile(
                                                    event.target.files?.[0] ??
                                                        null,
                                                );
                                                setRemovePhoto(false);
                                            }}
                                            className={inputClass}
                                        />
                                        <p className="text-[11px] text-neutral-400">
                                            JPG, PNG, atau WEBP, maksimal 5 MB.
                                        </p>
                                        {(form.avatar || photoFile) && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPhotoFile(null);
                                                    setRemovePhoto(true);
                                                }}
                                                className="text-xs font-medium text-neutral-600 underline"
                                            >
                                                Hapus foto
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                    Informasi Pribadi
                                </h3>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <FormInput
                                        label="Nama Lengkap"
                                        name="name"
                                        value={form.name}
                                        placeholder="Masukkan nama lengkap"
                                        autoComplete="name"
                                        required
                                        onChange={(value) =>
                                            updateForm('name', value)
                                        }
                                    />
                                    <FormInput
                                        label="Email"
                                        name="email"
                                        type="email"
                                        value={form.email}
                                        placeholder="nama@email.com"
                                        autoComplete="email"
                                        required
                                        onChange={(value) =>
                                            updateForm('email', value)
                                        }
                                    />
                                    <FormInput
                                        label="Nomor Handphone"
                                        name="phone"
                                        type="tel"
                                        value={form.phone}
                                        placeholder="08xxxxxxxxxx"
                                        autoComplete="tel"
                                        required
                                        onChange={(value) =>
                                            updateForm('phone', value)
                                        }
                                    />
                                    <label className="block space-y-2">
                                        <span className="text-xs font-semibold text-neutral-700">
                                            Role Pengguna *
                                        </span>
                                        <select
                                            required
                                            value={form.role}
                                            onChange={(event) =>
                                                changeRole(
                                                    event.target.value as UserRole,
                                                )
                                            }
                                            className={inputClass}
                                        >
                                            <option value="admin">Admin</option>
                                            <option value="pengelola">
                                                Pengelola
                                            </option>
                                            <option value="peminjam">
                                                Peminjam
                                            </option>
                                        </select>
                                    </label>
                                </div>
                            </section>

                            {form.role === 'peminjam' && (
                                <section className="space-y-4">
                                    <div>
                                        <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                            Kategori Peminjam
                                        </h3>
                                        <p className="mt-2 text-xs text-neutral-500">
                                            Pilih kategori sesuai status
                                            pengguna.
                                        </p>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {borrowerOptions.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() =>
                                                    changeBorrowerType(
                                                        option.value,
                                                    )
                                                }
                                                className={`rounded-xl border p-3 text-left transition ${
                                                    form.borrowerType ===
                                                    option.value
                                                        ? 'border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900/10'
                                                        : 'border-neutral-200 bg-white hover:bg-neutral-50'
                                                }`}
                                            >
                                                <span className="text-sm font-semibold text-neutral-900">
                                                    {option.label}
                                                </span>
                                                <p className="mt-1 text-xs text-neutral-500">
                                                    {option.description}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {form.role === 'peminjam' &&
                                form.borrowerType && (
                                    <section className="space-y-4">
                                    <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                        {form.borrowerType === 'mahasiswa'
                                            ? 'Identitas Mahasiswa'
                                            : form.borrowerType === 'dosen'
                                              ? 'Identitas Dosen'
                                              : form.borrowerType === 'staf'
                                                ? 'Identitas Tenaga Kependidikan'
                                                : 'Identitas Pihak Eksternal'}
                                    </h3>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <FormInput
                                            label={
                                                form.borrowerType ===
                                                'mahasiswa'
                                                    ? 'NIM'
                                                    : form.borrowerType ===
                                                        'dosen'
                                                      ? 'NIP / NIDN'
                                                      : form.borrowerType ===
                                                          'staf'
                                                        ? 'NIP / NIK'
                                                        : 'NIK'
                                            }
                                            name="identity_number"
                                            value={form.identityNumber}
                                            placeholder={
                                                form.borrowerType ===
                                                'mahasiswa'
                                                    ? 'Masukkan NIM'
                                                    : form.borrowerType ===
                                                        'dosen'
                                                      ? 'Masukkan NIP atau NIDN'
                                                      : form.borrowerType ===
                                                          'staf'
                                                        ? 'Masukkan NIP atau NIK'
                                                        : 'Masukkan NIK (opsional)'
                                            }
                                            required={
                                                form.borrowerType !==
                                                'eksternal'
                                            }
                                            onChange={(value) =>
                                                updateForm(
                                                    'identityNumber',
                                                    value,
                                                )
                                            }
                                        />
                                        {(form.borrowerType === 'mahasiswa' ||
                                            form.borrowerType === 'dosen') && (
                                            <>
                                                <FormInput
                                                    label="Fakultas"
                                                    name="faculty"
                                                    value={form.faculty}
                                                    placeholder="Masukkan nama fakultas"
                                                    required
                                                    onChange={(value) =>
                                                        updateForm(
                                                            'faculty',
                                                            value,
                                                        )
                                                    }
                                                />
                                                <FormInput
                                                    label="Program Studi"
                                                    name="study_program"
                                                    value={form.studyProgram}
                                                    placeholder="Masukkan program studi"
                                                    required
                                                    onChange={(value) =>
                                                        updateForm(
                                                            'studyProgram',
                                                            value,
                                                        )
                                                    }
                                                />
                                            </>
                                        )}
                                        {form.borrowerType === 'mahasiswa' && (
                                            <FormInput
                                                label="Angkatan"
                                                name="enrollment_year"
                                                type="number"
                                                min={1900}
                                                max={new Date().getFullYear() + 1}
                                                value={form.enrollmentYear}
                                                placeholder="Contoh: 2024"
                                                required
                                                onChange={(value) =>
                                                    updateForm(
                                                        'enrollmentYear',
                                                        value,
                                                    )
                                                }
                                            />
                                        )}
                                        {form.borrowerType === 'staf' && (
                                            <>
                                                <FormInput
                                                    label="Fakultas"
                                                    name="faculty"
                                                    value={form.faculty}
                                                    placeholder="Masukkan nama fakultas"
                                                    onChange={(value) =>
                                                        updateForm(
                                                            'faculty',
                                                            value,
                                                        )
                                                    }
                                                />
                                                <FormInput
                                                    label="Unit Kerja"
                                                    name="unit_name"
                                                    value={form.unitName}
                                                    placeholder="Contoh: Tata Usaha FTI"
                                                    required
                                                    onChange={(value) =>
                                                        updateForm(
                                                            'unitName',
                                                            value,
                                                        )
                                                    }
                                                />
                                            </>
                                        )}
                                        {['dosen', 'staf', 'eksternal'].includes(
                                            form.borrowerType,
                                        ) && (
                                            <FormInput
                                                label={
                                                    form.borrowerType ===
                                                    'eksternal'
                                                        ? 'Jabatan / Peran'
                                                        : 'Jabatan'
                                                }
                                                name="position"
                                                value={form.position}
                                                placeholder={
                                                    form.borrowerType ===
                                                    'dosen'
                                                        ? 'Contoh: Dosen, Kaprodi'
                                                        : 'Masukkan jabatan atau peran'
                                                }
                                                required
                                                onChange={(value) =>
                                                    updateForm(
                                                        'position',
                                                        value,
                                                    )
                                                }
                                            />
                                        )}
                                        {form.borrowerType === 'eksternal' && (
                                            <FormInput
                                                label="Instansi / Organisasi"
                                                name="organization_name"
                                                value={form.organizationName}
                                                placeholder="Nama instansi atau organisasi"
                                                required
                                                onChange={(value) =>
                                                    updateForm(
                                                        'organizationName',
                                                        value,
                                                    )
                                                }
                                            />
                                        )}
                                    </div>
                                    </section>
                                )}

                            {form.role !== 'peminjam' && (
                                <section className="space-y-4">
                                    <div>
                                        <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                            Identitas Pengelola
                                        </h3>
                                        <p className="mt-2 text-xs text-neutral-500">
                                            Informasi kepegawaian bersifat
                                            opsional.
                                        </p>
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <FormInput
                                            label="NIP / NIK"
                                            name="identity_number"
                                            value={form.identityNumber}
                                            placeholder="Masukkan NIP atau NIK"
                                            onChange={(value) =>
                                                updateForm(
                                                    'identityNumber',
                                                    value,
                                                )
                                            }
                                        />
                                        <FormInput
                                            label="Fakultas"
                                            name="faculty"
                                            value={form.faculty}
                                            placeholder="Masukkan fakultas"
                                            onChange={(value) =>
                                                updateForm('faculty', value)
                                            }
                                        />
                                        <FormInput
                                            label="Unit Kerja"
                                            name="unit_name"
                                            value={form.unitName}
                                            placeholder="Masukkan unit kerja"
                                            onChange={(value) =>
                                                updateForm('unitName', value)
                                            }
                                        />
                                        <FormInput
                                            label="Jabatan"
                                            name="position"
                                            value={form.position}
                                            placeholder="Masukkan jabatan"
                                            onChange={(value) =>
                                                updateForm('position', value)
                                            }
                                        />
                                    </div>
                                </section>
                            )}

                            {form.role === 'peminjam' &&
                                form.borrowerType === 'mahasiswa' && (
                                    <section className="space-y-4">
                                    <div>
                                        <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                            Konteks Peminjaman
                                        </h3>
                                        <p className="mt-2 text-xs text-neutral-500">
                                            Pilih tujuan peminjaman aset.
                                        </p>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {[
                                            {
                                                value: 'pribadi',
                                                label: 'Pribadi',
                                                description:
                                                    'Meminjam untuk kebutuhan pribadi',
                                            },
                                            {
                                                value: 'organisasi',
                                                label: 'Organisasi',
                                                description:
                                                    'Mewakili UKM, Himpunan, BEM, atau organisasi lain',
                                            },
                                        ].map((context) => (
                                            <button
                                                key={context.value}
                                                type="button"
                                                onClick={() =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        borrowingContext:
                                                            context.value,
                                                        organizationName:
                                                            context.value ===
                                                            'pribadi'
                                                                ? ''
                                                                : current.organizationName,
                                                    }))
                                                }
                                                className={`rounded-xl border p-3 text-left transition ${
                                                    form.borrowingContext ===
                                                    context.value
                                                        ? 'border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900/10'
                                                        : 'border-neutral-200 bg-white hover:bg-neutral-50'
                                                }`}
                                            >
                                                <span className="text-sm font-semibold text-neutral-900">
                                                    {context.label}
                                                </span>
                                                <p className="mt-1 text-xs text-neutral-500">
                                                    {context.description}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                    {form.borrowingContext ===
                                        'organisasi' && (
                                        <FormInput
                                            label="Nama Organisasi"
                                            name="organization_name"
                                            value={form.organizationName}
                                            placeholder="Contoh: Himpunan Mahasiswa Informatika"
                                            required
                                            onChange={(value) =>
                                                updateForm(
                                                    'organizationName',
                                                    value,
                                                )
                                            }
                                        />
                                    )}
                                    </section>
                                )}

                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                    Alamat (Opsional)
                                </h3>
                                <textarea
                                    id="address"
                                    name="address"
                                    rows={3}
                                    maxLength={2000}
                                    value={form.address}
                                    onChange={(event) =>
                                        updateForm(
                                            'address',
                                            event.target.value,
                                        )
                                    }
                                    className={inputClass}
                                    placeholder="Masukkan alamat tempat tinggal"
                                />
                            </section>

                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                    Keamanan Akun
                                </h3>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <FormInput
                                        label={
                                            editingId !== null
                                                ? 'Password Baru'
                                                : 'Password'
                                        }
                                        name="password"
                                        type="password"
                                        value={form.password}
                                        placeholder="Minimal 8 karakter"
                                        autoComplete="new-password"
                                        required={editingId === null}
                                        onChange={(value) =>
                                            updateForm('password', value)
                                        }
                                        maxLength={255}
                                    />
                                    <FormInput
                                        label="Konfirmasi Password"
                                        name="password_confirmation"
                                        type="password"
                                        value={form.passwordConfirmation}
                                        placeholder="Ulangi password"
                                        autoComplete="new-password"
                                        required={editingId === null}
                                        onChange={(value) =>
                                            updateForm(
                                                'passwordConfirmation',
                                                value,
                                            )
                                        }
                                        maxLength={255}
                                    />
                                </div>
                                {editingId !== null && (
                                    <p className="text-[11px] text-neutral-400">
                                        Kosongkan kedua field password jika tidak
                                        ingin mengubahnya.
                                    </p>
                                )}
                            </section>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-4 sm:px-7">
                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
                            >
                                Batal
                            </button>

                            <button
                                type="submit"
                                disabled={saving}
                                className="rounded-xl bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
                            >
                                {saving
                                    ? 'Menyimpan...'
                                    : editingId !== null
                                      ? 'Simpan Perubahan'
                                      : 'Tambah Pengguna'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* DELETE CONFIRMATION */}
            {deleteId !== null && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100">
                            <Icon name="trash-2" size={21} />
                        </div>

                        <h2 className="text-lg font-bold text-neutral-950">
                            Hapus pengguna?
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-neutral-500">
                            Pengguna dan semua sesi login aktifnya akan dihapus
                            permanen dari sistem.
                        </p>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDeleteId(null)}
                                className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold"
                            >
                                Batal
                            </button>

                            <button
                                type="button"
                                onClick={confirmDelete}
                                className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white"
                            >
                                Ya, Hapus
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <ImagePreviewModal
                preview={previewModal}
                heading="Pratinjau Foto Profil"
                onClose={closePhotoPreview}
                onIndexChange={changePhotoPreviewIndex}
            />
        </DashboardLayout>
    );
}
