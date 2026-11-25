import { useEffect, useMemo, useState, type FormEvent } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import Icon from '@/components/Icon';
import AssetManagementBanner from '@/components/dashboard/AssetManagementBanner';
import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard';
import {
    managementErrorMessage,
    managementRequest,
} from '@/lib/management-client';

type ApprovalDecision = 'Disetujui' | 'Tidak Disetujui';
type ApprovalStatus =
    | ApprovalDecision
    | 'Menunggu Persetujuan'
    | 'Dibatalkan';
type BorrowingAsset = {
    id: string;
    code: string;
    name: string;
    type: 'Barang' | 'Ruangan';
    image: string;
    location: string;
    condition: string;
    availableQuantity: number;
    summary: string;
    quantity: number;
};

type LoanRequest = {
    id: string;
    code: string;
    borrower: string;
    identity: string;
    borrowerType: string;
    phone: string;
    email: string;
    faculty: string;
    studyProgram: string;
    position: string;
    address: string;
    organization: string;
    borrowingCategory: string;
    assets: BorrowingAsset[];
    asset: string;
    assetType: 'Barang' | 'Ruangan' | 'Campuran';
    quantity: number;
    purpose: string;
    usageLocation: string;
    participantCount: string;
    borrowDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    returnDate: string;
    submittedAt: string;
    reviewedAt?: string;
    approvalStatus: ApprovalStatus;
    activityName: string;
    activityPosition: string;
    responsiblePerson: string;
    responsiblePhone: string;
    notes: string;
    documents: Record<string, string>;
};

const PER_PAGE = 5;
const inputClass =
    'w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100';

const formatDate = (value: string) =>
    value
        ? new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
          })
        : '-';

function StatusBadge({ status }: { status: LoanRequest['approvalStatus'] }) {
    return (
        <span
            className={`inline-flex whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ${
                status === 'Menunggu Persetujuan'
                    ? 'bg-amber-50 text-amber-700 ring-amber-200'
                    : status === 'Disetujui'
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      : status === 'Tidak Disetujui'
                        ? 'bg-red-50 text-red-700 ring-red-200'
                        : 'bg-gray-50 text-gray-600 ring-gray-200'
            }`}
        >
            {status}
        </span>
    );
}

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <p className="text-xs font-semibold text-neutral-500">{label}</p>
            <div className="text-sm font-medium text-neutral-900">
                {children || '-'}
            </div>
        </div>
    );
}

function assetDescription(request: LoanRequest) {
    return (
        request.assets
            ?.map(
                (asset) =>
                    `${asset.name} (${asset.quantity} ${
                        asset.type === 'Barang' ? 'unit' : 'ruangan'
                    })`,
            )
            .join(', ') || request.asset
    );
}

export default function PersetujuanPeminjaman() {
    const [requests, setRequests] = useState<LoanRequest[]>([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('Semua Status');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRequest, setSelectedRequest] =
        useState<LoanRequest | null>(null);
    const [actionType, setActionType] = useState<ApprovalDecision | null>(
        null,
    );
    const [dataLoading, setDataLoading] = useState(true);
    const [savingDecision, setSavingDecision] = useState(false);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [notice, setNotice] = useState('');
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let active = true;
        managementRequest<{ borrowings: LoanRequest[] }>(
            '/api/borrowings/approval',
        )
            .then((response) => {
                if (!Array.isArray(response.borrowings)) {
                    throw new Error('Data persetujuan peminjaman tidak valid.');
                }
                if (active) {
                    setRequests(response.borrowings);
                    setError('');
                }
            })
            .catch((requestError: unknown) => {
                if (active) setError(managementErrorMessage(requestError));
            })
            .finally(() => {
                if (active) setDataLoading(false);
            });

        return () => {
            active = false;
        };
    }, [reloadKey]);

    const filteredRequests = useMemo(() => {
        const keyword = search.toLowerCase().trim();
        return requests.filter(
            (request) =>
                (statusFilter === 'Semua Status' ||
                    request.approvalStatus === statusFilter) &&
                (request.code.toLowerCase().includes(keyword) ||
                    request.borrower.toLowerCase().includes(keyword) ||
                    request.identity.toLowerCase().includes(keyword) ||
                    assetDescription(request).toLowerCase().includes(keyword)),
        );
    }, [requests, search, statusFilter]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredRequests.length / PER_PAGE),
    );
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const paginatedRequests = filteredRequests.slice(
        (safeCurrentPage - 1) * PER_PAGE,
        safeCurrentPage * PER_PAGE,
    );
    const pendingRequests = requests.filter(
        (request) => request.approvalStatus === 'Menunggu Persetujuan',
    );
    const pendingAssetQuantity = pendingRequests.reduce(
        (total, request) => total + request.quantity,
        0,
    );

    function openAction(
        request: LoanRequest,
        action: ApprovalDecision,
    ) {
        setSelectedRequest(request);
        setActionType(action);
        setActionError('');
    }

    function closeDetail() {
        setSelectedRequest(null);
        setActionType(null);
        setActionError('');
    }

    async function submitAction(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedRequest || !actionType) return;

        setSavingDecision(true);
        setActionError('');
        try {
            await managementRequest<{ borrowing: LoanRequest }>(
                `/api/borrowings/${encodeURIComponent(selectedRequest.id)}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ approvalStatus: actionType }),
                },
            );
            setRequests((previous) =>
                previous.map((item) =>
                    item.id === selectedRequest.id
                        ? { ...item, approvalStatus: actionType }
                        : item,
                ),
            );
            setDataLoading(true);
            setReloadKey((key) => key + 1);
            setNotice(
                actionType === 'Disetujui'
                    ? 'Pengajuan berhasil disetujui.'
                    : 'Pengajuan berhasil ditolak.',
            );
            setSelectedRequest(null);
            setActionType(null);
        } catch (requestError: unknown) {
            setActionError(managementErrorMessage(requestError));
        } finally {
            setSavingDecision(false);
        }
    }

    const metrics = [
        {
            label: 'Menunggu Persetujuan',
            value: pendingRequests.length,
            icon: 'clock' as const,
        },
        {
            label: 'Jumlah Aset Menunggu',
            value: pendingAssetQuantity,
            icon: 'package' as const,
        },
    ];

    return (
        <DashboardLayout>
            <div className="w-full min-w-0 space-y-6">
                <AssetManagementBanner
                    title="Persetujuan Peminjaman."
                    description="Tinjau pengajuan dari peminjam, lalu setujui atau tolak permohonan."
                    contextLabel="Administrasi peminjaman"
                    icon="clipboard-check"
                    statusLabel="Data seluruh pengguna terpantau"
                    metrics={[
                        {
                            label: 'Menunggu keputusan',
                            value: pendingRequests.length,
                        },
                        {
                            label: 'Aset menunggu persetujuan',
                            value: pendingAssetQuantity,
                        },
                    ]}
                />

                <div>
                    <div className="mb-2 flex items-center gap-2 text-xs text-neutral-400">
                        <span>Manajemen Peminjaman</span>
                        <Icon name="chevron-right" size={13} />
                        <span className="font-semibold text-neutral-700">
                            Persetujuan Peminjaman
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                        Persetujuan Peminjaman
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                        Seluruh pengajuan dari semua peminjam ditampilkan dalam
                        satu daftar. Pengajuan yang menunggu keputusan dapat
                        disetujui atau ditolak.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {metrics.map((metric, index) => (
                        <DashboardMetricCard
                            key={metric.label}
                            label={metric.label}
                            value={metric.value}
                            icon={metric.icon}
                            index={index}
                        />
                    ))}
                </div>

                {notice && (
                    <div
                        role="status"
                        className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
                    >
                        {notice}
                        <button
                            type="button"
                            onClick={() => setNotice('')}
                            aria-label="Tutup notifikasi"
                        >
                            <Icon name="x" size={16} />
                        </button>
                    </div>
                )}

                {error && (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-white p-4 text-sm text-neutral-700"
                    >
                        <span>Daftar pengajuan gagal dimuat: {error}</span>
                        <button
                            type="button"
                            onClick={() => {
                                setDataLoading(true);
                                setError('');
                                setReloadKey((key) => key + 1);
                            }}
                            className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium hover:bg-neutral-50"
                        >
                            Coba lagi
                        </button>
                    </div>
                )}

                <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    <div className="flex flex-col gap-4 border-b border-neutral-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="font-bold text-neutral-900">
                                Data Peminjaman
                            </h2>
                            <p className="mt-1 text-xs text-neutral-500">
                                {requests.length} data peminjaman,{' '}
                                {pendingRequests.length} menunggu keputusan.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
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
                                    placeholder="Cari peminjam, kode, aset..."
                                    className={`${inputClass} pl-9 sm:w-80`}
                                />
                            </div>
                            <select
                                value={statusFilter}
                                onChange={(event) => {
                                    setStatusFilter(event.target.value);
                                    setCurrentPage(1);
                                }}
                                className={`${inputClass} sm:w-56`}
                            >
                                <option>Semua Status</option>
                                <option>Menunggu Persetujuan</option>
                                <option>Disetujui</option>
                                <option>Tidak Disetujui</option>
                                <option>Dibatalkan</option>
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1000px] text-left text-sm">
                            <thead className="bg-neutral-50 text-xs text-neutral-500">
                                <tr>
                                    <th className="px-5 py-4 font-semibold">
                                        Kode Pengajuan
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Peminjam
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Aset
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Tanggal Peminjaman
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Tanggal Pengembalian
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Status Persetujuan
                                    </th>
                                    <th className="px-5 py-4 text-right font-semibold">
                                        Aksi
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {paginatedRequests.map((request) => (
                                    <tr
                                        key={request.id}
                                        className="transition hover:bg-neutral-50/70"
                                    >
                                        <td className="px-5 py-4">
                                            <p className="font-semibold text-neutral-900">
                                                {request.code}
                                            </p>
                                            <p className="mt-1 text-xs text-neutral-400">
                                                Diajukan{' '}
                                                {formatDate(request.submittedAt)}
                                            </p>
                                        </td>
                                        <td className="px-5 py-4">
                                            <p className="font-semibold text-neutral-900">
                                                {request.borrower}
                                            </p>
                                            <p className="mt-1 text-xs text-neutral-400">
                                                {request.identity}
                                            </p>
                                        </td>
                                        <td className="max-w-72 px-5 py-4">
                                            <p className="font-medium text-neutral-800">
                                                {assetDescription(request)}
                                            </p>
                                            <p className="mt-1 text-xs text-neutral-400">
                                                {request.quantity} aset
                                            </p>
                                        </td>
                                        <td className="px-5 py-4 text-xs text-neutral-600">
                                            {formatDate(request.borrowDate)}
                                        </td>
                                        <td className="px-5 py-4 text-xs text-neutral-600">
                                            {formatDate(request.returnDate)}
                                        </td>
                                        <td className="px-5 py-4">
                                            <StatusBadge
                                                status={request.approvalStatus}
                                            />
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    type="button"
                                                    title="Lihat detail"
                                                    onClick={() =>
                                                        setSelectedRequest(
                                                            request,
                                                        )
                                                    }
                                                    className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950"
                                                >
                                                    <Icon name="eye" size={16} />
                                                </button>
                                                {request.approvalStatus ===
                                                    'Menunggu Persetujuan' && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            title="Setujui"
                                                            onClick={() =>
                                                                openAction(
                                                                    request,
                                                                    'Disetujui',
                                                                )
                                                            }
                                                            className="rounded-lg p-2 text-emerald-700 transition hover:bg-emerald-50"
                                                        >
                                                            <Icon
                                                                name="check"
                                                                size={16}
                                                            />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title="Tolak"
                                                            onClick={() =>
                                                                openAction(
                                                                    request,
                                                                    'Tidak Disetujui',
                                                                )
                                                            }
                                                            className="rounded-lg p-2 text-red-600 transition hover:bg-red-50"
                                                        >
                                                            <Icon
                                                                name="x"
                                                                size={16}
                                                            />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {dataLoading && (
                                    <tr>
                                        <td
                                            colSpan={7}
                                            className="px-5 py-14 text-center text-sm text-neutral-500"
                                        >
                                            Memuat pengajuan...
                                        </td>
                                    </tr>
                                )}
                                {!dataLoading &&
                                    !error &&
                                    paginatedRequests.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={7}
                                                className="px-5 py-14 text-center"
                                            >
                                                <Icon
                                                    name="clipboard-list"
                                                    size={30}
                                                    className="mx-auto mb-3 text-neutral-300"
                                                />
                                                <p className="font-semibold text-neutral-700">
                                                    {requests.length
                                                        ? 'Pengajuan tidak ditemukan'
                                                        : 'Belum ada data peminjaman'}
                                                </p>
                                                <p className="mt-1 text-xs text-neutral-400">
                                                    {requests.length
                                                        ? 'Coba ubah kata kunci pencarian.'
                                                        : 'Pengajuan peminjaman dari semua pengguna akan muncul di sini.'}
                                                </p>
                                            </td>
                                        </tr>
                                    )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-neutral-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-neutral-500">
                            Menampilkan{' '}
                            {filteredRequests.length
                                ? (safeCurrentPage - 1) * PER_PAGE + 1
                                : 0}{' '}
                            -{' '}
                            {Math.min(
                                safeCurrentPage * PER_PAGE,
                                filteredRequests.length,
                            )}{' '}
                            dari {filteredRequests.length} pengajuan
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

            </div>

            {selectedRequest && !actionType && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closeDetail();
                    }}
                >
                    <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 sm:px-7">
                            <div>
                                <h2 className="text-lg font-bold text-neutral-950">
                                    Detail Pengajuan
                                </h2>
                                <p className="mt-1 text-xs text-neutral-500">
                                    {selectedRequest.code}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeDetail}
                                className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100"
                                aria-label="Tutup detail"
                            >
                                <Icon name="x" size={20} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-7">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs text-neutral-500">
                                        Status pengajuan
                                    </p>
                                    <div className="mt-2">
                                        <StatusBadge
                                            status={selectedRequest.approvalStatus}
                                        />
                                    </div>
                                </div>
                                <Field label="Tanggal pengajuan">
                                    {formatDate(selectedRequest.submittedAt)}
                                </Field>
                            </div>

                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-2 text-sm font-bold text-neutral-900">
                                    Informasi Peminjam
                                </h3>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Nama peminjam">
                                        {selectedRequest.borrower}
                                    </Field>
                                    <Field label="Nomor identitas">
                                        {selectedRequest.identity}
                                    </Field>
                                    <Field label="Jenis peminjam">
                                        {selectedRequest.borrowerType}
                                    </Field>
                                    <Field label="Nomor HP">
                                        {selectedRequest.phone}
                                    </Field>
                                    <Field label="Email">
                                        {selectedRequest.email}
                                    </Field>
                                    <Field label="Fakultas">
                                        {selectedRequest.faculty}
                                    </Field>
                                    <Field label="Program studi / jabatan">
                                        {selectedRequest.studyProgram}
                                    </Field>
                                    <Field label="Jabatan">
                                        {selectedRequest.position}
                                    </Field>
                                    <Field label="Organisasi">
                                        {selectedRequest.organization}
                                    </Field>
                                    <Field label="Alamat">
                                        {selectedRequest.address}
                                    </Field>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-2 text-sm font-bold text-neutral-900">
                                    Aset yang Diajukan
                                </h3>
                                <div className="space-y-3">
                                    {selectedRequest.assets.map((asset) => (
                                        <div
                                            key={asset.id}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 p-3"
                                        >
                                            <div>
                                                <p className="text-sm font-semibold text-neutral-900">
                                                    {asset.name}
                                                </p>
                                                <p className="mt-1 text-xs text-neutral-500">
                                                    {asset.code} · {asset.type}
                                                    {asset.location
                                                        ? ` · ${asset.location}`
                                                        : ''}
                                                </p>
                                                <p className="mt-1 text-xs text-neutral-500">
                                                    Kondisi: {asset.condition}
                                                </p>
                                                <p className="mt-1 text-xs text-neutral-500">
                                                    Ketersediaan saat pengajuan:{' '}
                                                    {asset.availableQuantity}
                                                </p>
                                                {asset.summary && (
                                                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                                                        {asset.summary}
                                                    </p>
                                                )}
                                                {asset.image && (
                                                    <a
                                                        href={asset.image}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="mt-1 inline-block text-xs font-medium text-neutral-600 underline"
                                                    >
                                                        Lihat foto aset
                                                    </a>
                                                )}
                                            </div>
                                            <span className="whitespace-nowrap text-xs font-medium text-neutral-600">
                                                {asset.quantity}{' '}
                                                {asset.type === 'Barang'
                                                    ? 'unit'
                                                    : 'ruangan'}
                                            </span>
                                        </div>
                                    ))}
                                    {!selectedRequest.assets.length && (
                                        <p className="text-sm text-neutral-700">
                                            {selectedRequest.asset}
                                        </p>
                                    )}
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Tipe aset">
                                        {selectedRequest.assetType}
                                    </Field>
                                    <Field label="Jumlah total">
                                        {selectedRequest.quantity}
                                    </Field>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-2 text-sm font-bold text-neutral-900">
                                    Kegiatan dan Jadwal
                                </h3>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Nama kegiatan">
                                        {selectedRequest.activityName}
                                    </Field>
                                    <Field label="Kategori peminjaman">
                                        {selectedRequest.borrowingCategory}
                                    </Field>
                                    <Field label="Jabatan dalam kegiatan">
                                        {selectedRequest.activityPosition}
                                    </Field>
                                    <Field label="Penanggung jawab">
                                        {selectedRequest.responsiblePerson}
                                    </Field>
                                    <Field label="Nomor penanggung jawab">
                                        {selectedRequest.responsiblePhone}
                                    </Field>
                                    <Field label="Tanggal mulai">
                                        {formatDate(
                                            selectedRequest.borrowDate,
                                        )}{' '}
                                        {selectedRequest.startTime}
                                    </Field>
                                    <Field label="Tanggal selesai">
                                        {formatDate(selectedRequest.endDate)}{' '}
                                        {selectedRequest.endTime}
                                    </Field>
                                    <Field label="Jumlah peserta">
                                        {selectedRequest.participantCount}
                                    </Field>
                                    <Field label="Rencana pengembalian">
                                        {formatDate(selectedRequest.returnDate)}
                                    </Field>
                                    <Field label="Lokasi penggunaan">
                                        {selectedRequest.usageLocation}
                                    </Field>
                                    {selectedRequest.reviewedAt && (
                                        <Field label="Tanggal keputusan">
                                            {formatDate(
                                                selectedRequest.reviewedAt,
                                            )}
                                        </Field>
                                    )}
                                </div>
                                <Field label="Tujuan peminjaman">
                                    <p className="leading-6 font-normal text-neutral-700">
                                        {selectedRequest.purpose}
                                    </p>
                                </Field>
                                <Field label="Catatan tambahan">
                                    <p className="leading-6 font-normal text-neutral-700">
                                        {selectedRequest.notes}
                                    </p>
                                </Field>
                            </section>

                            {Object.entries(selectedRequest.documents).length >
                                0 && (
                                <section className="space-y-3">
                                    <h3 className="border-b border-neutral-100 pb-2 text-sm font-bold text-neutral-900">
                                        Dokumen Pendukung
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(
                                            selectedRequest.documents,
                                        ).map(([name, path]) => (
                                            <a
                                                key={name}
                                                href={path}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                                            >
                                                <Icon
                                                    name="file-text"
                                                    size={14}
                                                />
                                                {name}
                                            </a>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>
                        <div className="flex flex-col gap-2 border-t border-neutral-100 p-5 sm:flex-row sm:justify-end sm:px-7">
                            {selectedRequest.approvalStatus ===
                                'Menunggu Persetujuan' ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            openAction(
                                                selectedRequest,
                                                'Tidak Disetujui',
                                            )
                                        }
                                        className="rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                                    >
                                        Tolak
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            openAction(
                                                selectedRequest,
                                                'Disetujui',
                                            )
                                        }
                                        className="rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                                    >
                                        Setujui Pengajuan
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={closeDetail}
                                    className="rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                                >
                                    Tutup
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedRequest && actionType && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm">
                    <form
                        onSubmit={submitAction}
                        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
                    >
                        <div className="border-b border-neutral-100 px-5 py-4 sm:px-6">
                            <h2 className="text-lg font-bold text-neutral-950">
                                {actionType === 'Disetujui'
                                    ? 'Setujui Pengajuan?'
                                    : 'Tolak Pengajuan?'}
                            </h2>
                            <p className="mt-1 text-xs text-neutral-500">
                                {selectedRequest.code} ·{' '}
                                {selectedRequest.borrower}
                            </p>
                        </div>
                        <div className="space-y-3 p-5 sm:p-6">
                            <div className="rounded-xl bg-neutral-50 p-4">
                                <p className="text-xs text-neutral-500">
                                    Aset yang diajukan
                                </p>
                                <p className="mt-1 text-sm font-semibold text-neutral-900">
                                    {assetDescription(selectedRequest)}
                                </p>
                                <p className="mt-1 text-xs text-neutral-500">
                                    {formatDate(selectedRequest.borrowDate)}{' '}
                                    sampai{' '}
                                    {formatDate(selectedRequest.returnDate)}
                                </p>
                            </div>
                            <p className="text-sm leading-6 text-neutral-600">
                                {actionType === 'Disetujui'
                                    ? 'Status pengajuan akan diubah menjadi Disetujui dan peminjam dapat melihat keputusan ini.'
                                    : 'Status persetujuan akan diubah menjadi Tidak Disetujui.'}
                            </p>
                            {actionError && (
                                <p
                                    role="alert"
                                    className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                                >
                                    {actionError}
                                </p>
                            )}
                        </div>
                        <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 p-5 sm:flex-row sm:justify-end sm:px-6">
                            <button
                                type="button"
                                disabled={savingDecision}
                                onClick={() => setActionType(null)}
                                className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={savingDecision}
                                className="rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50"
                            >
                                {savingDecision
                                    ? 'Memproses...'
                                    : actionType === 'Disetujui'
                                      ? 'Ya, Setujui'
                                      : 'Ya, Tolak'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </DashboardLayout>
    );
}
