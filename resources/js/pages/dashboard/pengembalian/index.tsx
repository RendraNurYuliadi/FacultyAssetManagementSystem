import {
    useEffect,
    useMemo,
    useState,
    type ChangeEvent,
    type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import AssetManagementBanner from '@/components/dashboard/AssetManagementBanner';
import {
    managementErrorMessage,
    managementRequest,
} from '@/lib/management-client';

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

type ReturnAsset = BorrowingAsset & {
    inspectionCondition?: 'Baik' | 'Rusak Ringan' | 'Rusak Berat';
    inspectionNotes?: string;
    inspectedAt?: string;
    inspectedBy?: string;
};

type OngoingBorrowing = {
    id: string;
    code: string;
    borrower: string;
    identity: string;
    borrowDate: string;
    dueDate: string;
    purpose: string;
    assets: BorrowingAsset[];
};

type ReturnRequest = {
    id: string;
    code: string;
    borrowingId: string;
    borrowingCode: string;
    borrower: string;
    identity: string;
    assets: ReturnAsset[];
    photos: string[];
    returnDate: string;
    notes: string;
    submittedAt: string;
};

const pageSize = 8;
const today = new Date().toISOString().slice(0, 10);
const inputClass =
    'w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100';

function formatDate(value: string) {
    if (!value) return '-';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function assetSummary(assets: BorrowingAsset[]) {
    return assets
        .map((asset) => `${asset.name} (${asset.quantity})`)
        .join(', ');
}

function inspectionProgress(returnRequest: ReturnRequest) {
    const inspected = returnRequest.assets.filter(
        (asset) => asset.inspectedAt,
    ).length;
    return `${inspected}/${returnRequest.assets.length} aset diperiksa`;
}

export default function PengembalianPage() {
    const [borrowings, setBorrowings] = useState<OngoingBorrowing[]>([]);
    const [returns, setReturns] = useState<ReturnRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const [formOpen, setFormOpen] = useState(false);
    const [borrowingId, setBorrowingId] = useState('');
    const [returnDate, setReturnDate] = useState(today);
    const [notes, setNotes] = useState('');
    const [photos, setPhotos] = useState<File[]>([]);
    const [formError, setFormError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [selectedReturn, setSelectedReturn] =
        useState<ReturnRequest | null>(null);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setLoadError('');

        managementRequest<{
            borrowings: OngoingBorrowing[];
            returns: ReturnRequest[];
        }>('/api/returns')
            .then((result) => {
                if (!active) return;
                setBorrowings(result.borrowings);
                setReturns(result.returns);
            })
            .catch((error: unknown) => {
                if (!active) return;
                setLoadError(managementErrorMessage(error));
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [reloadKey]);

    const selectedBorrowing = borrowings.find(
        (borrowing) => borrowing.id === borrowingId,
    );

    const filteredReturns = useMemo(() => {
        const query = search.trim().toLowerCase();
        return returns.filter(
            (item) =>
                !query ||
                [
                    item.code,
                    item.borrowingCode,
                    item.borrower,
                    item.identity,
                    assetSummary(item.assets),
                ]
                    .join(' ')
                    .toLowerCase()
                    .includes(query),
        );
    }, [returns, search]);
    const totalPages = Math.max(
        1,
        Math.ceil(filteredReturns.length / pageSize),
    );
    const visibleReturns = filteredReturns.slice(
        (Math.min(page, totalPages) - 1) * pageSize,
        Math.min(page, totalPages) * pageSize,
    );
    const pendingReturns = returns.filter(
        (item) => item.assets.some((asset) => !asset.inspectedAt),
    ).length;

    function openForm() {
        setBorrowingId(borrowings[0]?.id ?? '');
        setReturnDate(today);
        setNotes('');
        setPhotos([]);
        setFormError('');
        setNotice('');
        setFormOpen(true);
    }

    function addPhotos(event: ChangeEvent<HTMLInputElement>) {
        const selected = Array.from(event.target.files ?? []);
        if (photos.length + selected.length > 10) {
            setFormError('Maksimal 10 foto dapat diunggah.');
            event.target.value = '';
            return;
        }
        setPhotos((current) => [...current, ...selected]);
        setFormError('');
        event.target.value = '';
    }

    async function submitReturn(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedBorrowing) {
            setFormError('Pilih peminjaman yang akan dikembalikan.');
            return;
        }

        setSubmitting(true);
        setFormError('');
        try {
            const formData = new FormData();
            formData.append('borrowingId', borrowingId);
            formData.append('returnDate', returnDate);
            formData.append('notes', notes);
            photos.forEach((photo) => formData.append('photos', photo));
            await managementRequest<{ returnRequest: ReturnRequest }>(
                '/api/returns',
                {
                    method: 'POST',
                    body: formData,
                },
            );
            setFormOpen(false);
            setNotice(
                'Pengajuan tersimpan. Aset kini berstatus Diproses Pengembalian; status tersebut hanya ada pada data aset.',
            );
            setReloadKey((value) => value + 1);
        } catch (error) {
            setFormError(managementErrorMessage(error));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <DashboardLayout>
            <div className="space-y-6 p-4 md:p-6">
                <AssetManagementBanner
                    title="Pengembalian Aset."
                    description="Ajukan pengembalian untuk aset yang sedang dipinjam. Pengajuan disimpan di data pengembalian, sedangkan status ketersediaan hanya diperbarui pada data aset."
                    contextLabel="Data pengembalian"
                    icon="clipboard-check"
                    statusLabel="Data pengembalian milik akun Anda"
                    metrics={[
                        {
                            label: 'Pengajuan pengembalian',
                            value: returns.length,
                        },
                        {
                            label: 'Menunggu pemeriksaan',
                            value: pendingReturns,
                        },
                        {
                            label: 'Peminjaman dapat dikembalikan',
                            value: borrowings.length,
                        },
                    ]}
                />

                {notice && (
                    <div
                        role="status"
                        className="flex items-start justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                    >
                        <p>{notice}</p>
                        <button
                            type="button"
                            onClick={() => setNotice('')}
                            className="font-semibold"
                            aria-label="Tutup notifikasi"
                        >
                            Tutup
                        </button>
                    </div>
                )}

                <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-4 border-b border-neutral-100 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-neutral-900">
                                Riwayat Pengembalian
                            </h2>
                            <p className="mt-1 text-sm text-neutral-500">
                                Data pengembalian yang diajukan dari akun Anda.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={openForm}
                            disabled={loading || borrowings.length === 0}
                            className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Ajukan Pengembalian
                        </button>
                    </div>

                    {formOpen &&
                        createPortal(
                            <div
                                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6"
                                onMouseDown={(event) => {
                                    if (
                                        event.target === event.currentTarget &&
                                        !submitting
                                    ) {
                                        setFormOpen(false);
                                    }
                                }}
                            >
                                <form
                                    onSubmit={submitReturn}
                                    className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                                >
                                    <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 sm:px-7">
                                        <div>
                                            <h3 className="text-lg font-bold text-neutral-900">
                                                Ajukan Pengembalian
                                            </h3>
                                            <p className="mt-1 text-xs text-neutral-500">
                                                Pilih peminjaman yang disetujui
                                                dan unggah maksimal 10 foto.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setFormOpen(false)}
                                            disabled={submitting}
                                            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
                                            aria-label="Tutup form"
                                        >
                                            Tutup
                                        </button>
                                    </div>

                                    <div className="space-y-5 overflow-y-auto p-5 sm:p-7">
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <label className="block space-y-2">
                                                <span className="text-sm font-medium text-neutral-700">
                                                    Peminjaman
                                                </span>
                                                <select
                                                    required
                                                    value={borrowingId}
                                                    onChange={(event) =>
                                                        setBorrowingId(
                                                            event.target.value,
                                                        )
                                                    }
                                                    className={inputClass}
                                                >
                                                    <option value="">
                                                        Pilih peminjaman
                                                    </option>
                                                    {borrowings.map(
                                                        (borrowing) => (
                                                            <option
                                                                key={
                                                                    borrowing.id
                                                                }
                                                                value={
                                                                    borrowing.id
                                                                }
                                                            >
                                                                {borrowing.code}{' '}
                                                                —{' '}
                                                                {assetSummary(
                                                                    borrowing.assets,
                                                                )}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            </label>
                                            <label className="block space-y-2">
                                                <span className="text-sm font-medium text-neutral-700">
                                                    Tanggal pengembalian
                                                </span>
                                                <input
                                                    required
                                                    type="date"
                                                    max={today}
                                                    min={
                                                        selectedBorrowing?.borrowDate
                                                    }
                                                    value={returnDate}
                                                    onChange={(event) =>
                                                        setReturnDate(
                                                            event.target.value,
                                                        )
                                                    }
                                                    className={inputClass}
                                                />
                                            </label>
                                        </div>

                                        {selectedBorrowing && (
                                            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                                                <p className="text-sm font-semibold text-neutral-900">
                                                    Aset dalam pengembalian
                                                </p>
                                                <p className="mt-1 text-xs text-neutral-500">
                                                    {selectedBorrowing.code} ·{' '}
                                                    {selectedBorrowing.borrower}{' '}
                                                    · NIM/NIP/NIK{' '}
                                                    {selectedBorrowing.identity}
                                                </p>
                                                <ul className="mt-3 divide-y divide-neutral-200">
                                                    {selectedBorrowing.assets.map(
                                                        (asset) => (
                                                            <li
                                                                key={asset.id}
                                                                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                                                            >
                                                                <div>
                                                                    <p className="text-sm font-medium text-neutral-800">
                                                                        {
                                                                            asset.name
                                                                        }
                                                                    </p>
                                                                    <p className="mt-1 text-xs text-neutral-500">
                                                                        {
                                                                            asset.code
                                                                        }{' '}
                                                                        ·{' '}
                                                                        {
                                                                            asset.type
                                                                        }{' '}
                                                                        ·{' '}
                                                                        {asset.location ||
                                                                            'Lokasi tidak tersedia'}
                                                                    </p>
                                                                </div>
                                                                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-neutral-700">
                                                                    Jumlah{' '}
                                                                    {
                                                                        asset.quantity
                                                                    }
                                                                </span>
                                                            </li>
                                                        ),
                                                    )}
                                                </ul>
                                            </div>
                                        )}

                                        <label className="block space-y-2">
                                            <span className="text-sm font-medium text-neutral-700">
                                                Foto bukti pengembalian
                                            </span>
                                            <input
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp"
                                                multiple
                                                onChange={addPhotos}
                                                className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-xs file:font-semibold`}
                                            />
                                            <span className="block text-xs text-neutral-500">
                                                JPG, PNG, atau WEBP; maksimal 10
                                                foto, 5 MB per foto.
                                            </span>
                                        </label>
                                        {photos.length > 0 && (
                                            <ul className="space-y-2">
                                                {photos.map((photo, index) => (
                                                    <li
                                                        key={`${photo.name}-${photo.lastModified}-${index}`}
                                                        className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-xs"
                                                    >
                                                        <span className="truncate text-neutral-700">
                                                            {photo.name}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setPhotos(
                                                                    (current) =>
                                                                        current.filter(
                                                                            (_, photoIndex) =>
                                                                                photoIndex !==
                                                                                index,
                                                                        ),
                                                                )
                                                            }
                                                            className="shrink-0 font-semibold text-neutral-600 underline"
                                                        >
                                                            Hapus
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}

                                        <label className="block space-y-2">
                                            <span className="text-sm font-medium text-neutral-700">
                                                Catatan (opsional)
                                            </span>
                                            <textarea
                                                maxLength={2000}
                                                rows={3}
                                                value={notes}
                                                onChange={(event) =>
                                                    setNotes(event.target.value)
                                                }
                                                placeholder="Tambahkan catatan untuk pengelola"
                                                className={inputClass}
                                            />
                                        </label>

                                        {formError && (
                                            <p
                                                role="alert"
                                                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                                            >
                                                {formError}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-100 px-5 py-4 sm:px-7">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFormOpen(false)
                                            }
                                            disabled={submitting}
                                            className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                                        >
                                            Batal
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={
                                                submitting ||
                                                !selectedBorrowing
                                            }
                                            className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {submitting
                                                ? 'Mengirim...'
                                                : 'Kirim Pengembalian'}
                                        </button>
                                    </div>
                                </form>
                            </div>,
                            document.body,
                        )}

                    <div className="flex flex-col gap-3 p-5 sm:flex-row">
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder="Cari kode, peminjam, atau aset"
                            className={`${inputClass} sm:max-w-sm`}
                        />
                    </div>

                    {loadError && (
                        <div
                            role="alert"
                            className="mx-5 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                        >
                            <p>{loadError}</p>
                            <button
                                type="button"
                                onClick={() => setReloadKey((value) => value + 1)}
                                className="mt-2 font-semibold underline"
                            >
                                Coba lagi
                            </button>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[850px] text-left">
                            <thead className="bg-neutral-50">
                                <tr className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                    <th className="px-5 py-3">Pengembalian</th>
                                    <th className="px-5 py-3">Peminjam</th>
                                    <th className="px-5 py-3">Aset</th>
                                    <th className="px-5 py-3">Tanggal</th>
                                    <th className="px-5 py-3">
                                        Pemeriksaan Kondisi
                                    </th>
                                    <th className="px-5 py-3">Foto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {loading ? (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="px-5 py-12 text-center text-sm text-neutral-500"
                                        >
                                            Memuat data pengembalian...
                                        </td>
                                    </tr>
                                ) : visibleReturns.length ? (
                                    visibleReturns.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-5 py-4">
                                                <p className="text-sm font-semibold text-neutral-900">
                                                    {item.code}
                                                </p>
                                                <p className="mt-1 text-xs text-neutral-500">
                                                    Peminjaman {item.borrowingCode}
                                                </p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-sm font-medium text-neutral-800">
                                                    {item.borrower}
                                                </p>
                                                <p className="mt-1 text-xs text-neutral-500">
                                                    {item.identity}
                                                </p>
                                            </td>
                                            <td className="max-w-sm px-5 py-4 text-sm text-neutral-700">
                                                {assetSummary(item.assets)}
                                            </td>
                                            <td className="px-5 py-4 text-sm text-neutral-700">
                                                {formatDate(item.returnDate)}
                                            </td>
                                            <td className="px-5 py-4 text-xs text-neutral-600">
                                                {inspectionProgress(item)}
                                            </td>
                                            <td className="px-5 py-4">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedReturn(item)
                                                    }
                                                    className="text-xs font-semibold text-neutral-700 underline"
                                                >
                                                    Detail ({item.photos.length}{' '}
                                                    foto)
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="px-5 py-12 text-center text-sm text-neutral-500"
                                        >
                                            Belum ada data pengembalian.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-neutral-100 px-5 py-4 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
                        <p>
                            Menampilkan{' '}
                            {filteredReturns.length
                                ? (Math.min(page, totalPages) - 1) * pageSize + 1
                                : 0}
                            –
                            {Math.min(page, totalPages) * pageSize} dari{' '}
                            {filteredReturns.length} data
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={page <= 1}
                                onClick={() => setPage((value) => value - 1)}
                                className="rounded-lg border border-neutral-200 px-3 py-1.5 font-medium text-neutral-700 disabled:opacity-40"
                            >
                                Sebelumnya
                            </button>
                            <span>
                                {Math.min(page, totalPages)} / {totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={page >= totalPages}
                                onClick={() => setPage((value) => value + 1)}
                                className="rounded-lg border border-neutral-200 px-3 py-1.5 font-medium text-neutral-700 disabled:opacity-40"
                            >
                                Berikutnya
                            </button>
                        </div>
                    </div>
                </section>
            </div>
            {selectedReturn &&
                createPortal(
                    <div
                        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6"
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) {
                                setSelectedReturn(null);
                            }
                        }}
                    >
                        <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 sm:px-7">
                                <div>
                                    <h2 className="text-lg font-bold text-neutral-900">
                                        Detail Pengembalian
                                    </h2>
                                    <p className="mt-1 text-xs text-neutral-500">
                                        {selectedReturn.code} · Peminjaman{' '}
                                        {selectedReturn.borrowingCode}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedReturn(null)}
                                    className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
                                >
                                    Tutup
                                </button>
                            </div>
                            <div className="space-y-5 overflow-y-auto p-5 sm:p-7">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <p className="text-xs text-neutral-500">
                                            Peminjam
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-neutral-900">
                                            {selectedReturn.borrower}
                                        </p>
                                        <p className="mt-1 text-xs text-neutral-500">
                                            {selectedReturn.identity}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-neutral-500">
                                            Tanggal pengembalian
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-neutral-900">
                                            {formatDate(
                                                selectedReturn.returnDate,
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <section>
                                    <h3 className="text-sm font-semibold text-neutral-900">
                                        Aset
                                    </h3>
                                    <ul className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200 px-4">
                                        {selectedReturn.assets.map((asset) => (
                                            <li
                                                key={asset.id}
                                                className="flex flex-wrap items-center justify-between gap-3 py-3"
                                            >
                                                <div>
                                                    <p className="text-sm font-medium text-neutral-900">
                                                        {asset.name}
                                                    </p>
                                                    <p className="mt-1 text-xs text-neutral-500">
                                                        {asset.code} ·{' '}
                                                        {asset.type} ·{' '}
                                                        {asset.location ||
                                                            'Lokasi tidak tersedia'}
                                                    </p>
                                                    <p className="mt-1 text-xs text-neutral-500">
                                                        Pemeriksaan kondisi:{' '}
                                                        {asset.inspectionCondition ??
                                                            'Menunggu'}{' '}
                                                        {asset.inspectedAt
                                                            ? `(${formatDate(asset.inspectedAt)})`
                                                            : ''}
                                                    </p>
                                                    {asset.inspectionNotes && (
                                                        <p className="mt-1 text-xs text-neutral-600">
                                                            Catatan pemeriksaan:{' '}
                                                            {asset.inspectionNotes}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="text-xs text-neutral-600">
                                                    Jumlah {asset.quantity}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                                {selectedReturn.notes && (
                                    <section>
                                        <h3 className="text-sm font-semibold text-neutral-900">
                                            Catatan peminjam
                                        </h3>
                                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-600">
                                            {selectedReturn.notes}
                                        </p>
                                    </section>
                                )}
                                <section>
                                    <h3 className="text-sm font-semibold text-neutral-900">
                                        Foto bukti
                                    </h3>
                                    {selectedReturn.photos.length ? (
                                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                            {selectedReturn.photos.map(
                                                (photo, index) => (
                                                    <a
                                                        key={photo}
                                                        href={photo}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="overflow-hidden rounded-xl border border-neutral-200"
                                                    >
                                                        <img
                                                            src={photo}
                                                            alt={`Foto bukti pengembalian ${index + 1}`}
                                                            className="h-32 w-full object-cover"
                                                        />
                                                    </a>
                                                ),
                                            )}
                                        </div>
                                    ) : (
                                        <p className="mt-2 text-sm text-neutral-500">
                                            Tidak ada foto bukti.
                                        </p>
                                    )}
                                </section>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </DashboardLayout>
    );
}
