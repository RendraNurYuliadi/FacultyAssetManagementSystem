import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import Icon from '@/components/Icon';
import AssetManagementBanner from '@/components/dashboard/AssetManagementBanner';
import {
    managementErrorMessage,
    managementRequest,
} from '@/lib/management-client';

type AssetCondition = 'Baik' | 'Rusak Ringan' | 'Rusak Berat';

type ReturnAsset = {
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
    inspectionCondition?: AssetCondition;
    inspectionNotes?: string;
    inspectedAt?: string;
    inspectedBy?: string;
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
const conditions: AssetCondition[] = [
    'Baik',
    'Rusak Ringan',
    'Rusak Berat',
];
const inputClass =
    'w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100';

function formatDate(value: string) {
    if (!value) return '-';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function getInspectedCount(item: ReturnRequest) {
    return item.assets.filter((asset) => asset.inspectedAt).length;
}

function getInspectionLabel(item: ReturnRequest) {
    return `${getInspectedCount(item)}/${item.assets.length} aset diperiksa`;
}

function isInspectionComplete(item: ReturnRequest) {
    return (
        item.assets.length > 0 &&
        item.assets.every((asset) => Boolean(asset.inspectedAt))
    );
}

export default function PemeriksaanPengembalian() {
    const [returns, setReturns] = useState<ReturnRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('Semua Data');
    const [page, setPage] = useState(1);
    const [selectedReturn, setSelectedReturn] =
        useState<ReturnRequest | null>(null);
    const [selectedAsset, setSelectedAsset] = useState<ReturnAsset | null>(
        null,
    );
    const [condition, setCondition] = useState<AssetCondition>('Baik');
    const [notes, setNotes] = useState('');
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        let active = true;
        setLoading(true);
        setLoadError('');

        managementRequest<{ returns: ReturnRequest[] }>(
            '/api/returns/inspection',
        )
            .then((result) => {
                if (!active) return;
                if (!Array.isArray(result.returns)) {
                    throw new Error('Data pengembalian tidak valid.');
                }
                setReturns(result.returns);
            })
            .catch((error: unknown) => {
                if (active) setLoadError(managementErrorMessage(error));
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [reloadKey]);

    const pendingAssets = returns.reduce(
        (total, item) =>
            total +
            item.assets.filter((asset) => !asset.inspectedAt).length,
        0,
    );
    const filteredReturns = useMemo(() => {
        const query = search.trim().toLowerCase();
        return returns.filter((item) => {
            const matchesFilter =
                filter === 'Semua Data' ||
                (filter === 'Menunggu Pemeriksaan' &&
                    item.assets.some((asset) => !asset.inspectedAt)) ||
                (filter === 'Selesai Diperiksa' &&
                    isInspectionComplete(item));
            const matchesSearch =
                !query ||
                [
                    item.code,
                    item.borrowingCode,
                    item.borrower,
                    item.identity,
                    item.assets.map((asset) => asset.name).join(' '),
                ]
                    .join(' ')
                    .toLowerCase()
                    .includes(query);
            return matchesFilter && matchesSearch;
        });
    }, [returns, search, filter]);
    const totalPages = Math.max(1, Math.ceil(filteredReturns.length / pageSize));
    const visibleReturns = filteredReturns.slice(
        (Math.min(page, totalPages) - 1) * pageSize,
        Math.min(page, totalPages) * pageSize,
    );

    function openInspection(item: ReturnRequest, asset: ReturnAsset) {
        setSelectedReturn(item);
        setSelectedAsset(asset);
        setCondition(asset.inspectionCondition ?? 'Baik');
        setNotes(asset.inspectionNotes ?? '');
        setFormError('');
    }

    async function submitInspection(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedReturn || !selectedAsset) return;

        setSaving(true);
        setFormError('');
        try {
            await managementRequest<{ saved: boolean }>(
                `/api/returns/${encodeURIComponent(selectedReturn.id)}/inspection`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        assetId: selectedAsset.id,
                        condition,
                        notes,
                    }),
                },
            );
            const inspectedAt = new Date().toISOString().slice(0, 10);
            const updatedAsset: ReturnAsset = {
                ...selectedAsset,
                inspectionCondition: condition,
                inspectionNotes: notes.trim(),
                inspectedAt,
            };
            const updateReturn = (item: ReturnRequest): ReturnRequest =>
                item.id === selectedReturn.id
                    ? {
                          ...item,
                          assets: item.assets.map((asset) =>
                              asset.id === selectedAsset.id
                                  ? updatedAsset
                                  : asset,
                          ),
                      }
                    : item;
            setReturns((previous) => previous.map(updateReturn));
            setSelectedReturn((previous) =>
                previous ? updateReturn(previous) : previous,
            );
            setSelectedAsset(null);
            setNotice(
                'Kondisi aset berhasil diperbarui. Status ketersediaan aset tidak diubah.',
            );
            setReloadKey((value) => value + 1);
        } catch (error) {
            setFormError(managementErrorMessage(error));
        } finally {
            setSaving(false);
        }
    }

    return (
        <DashboardLayout>
            <div className="space-y-6 p-4 md:p-6">
                <AssetManagementBanner
                    title="Pemeriksaan Aset."
                    description="Periksa aset satu per satu dari setiap data pengembalian. Pemeriksaan hanya memperbarui kondisi aset, bukan status ketersediaannya."
                    contextLabel="Pemeriksaan pengembalian"
                    icon="clipboard-check"
                    statusLabel="Data berasal dari pengembalian"
                    metrics={[
                        { label: 'Data pengembalian', value: returns.length },
                        { label: 'Aset menunggu pemeriksaan', value: pendingAssets },
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
                                Data Pengembalian
                            </h2>
                            <p className="mt-1 text-sm text-neutral-500">
                                Setiap baris adalah satu pengajuan; periksa aset
                                di dalamnya satu per satu.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => {
                                    setSearch(event.target.value);
                                    setPage(1);
                                }}
                                placeholder="Cari kode, peminjam, aset..."
                                className={`${inputClass} sm:w-72`}
                            />
                            <select
                                value={filter}
                                onChange={(event) => {
                                    setFilter(event.target.value);
                                    setPage(1);
                                }}
                                className={`${inputClass} sm:w-56`}
                            >
                                <option>Semua Data</option>
                                <option>Menunggu Pemeriksaan</option>
                                <option>Selesai Diperiksa</option>
                            </select>
                        </div>
                    </div>

                    {loadError && (
                        <div
                            role="alert"
                            className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
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
                        <table className="w-full min-w-[900px] text-left">
                            <thead className="bg-neutral-50">
                                <tr className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                    <th className="px-5 py-4">
                                        Data Pengembalian
                                    </th>
                                    <th className="px-5 py-4">Peminjam</th>
                                    <th className="px-5 py-4">Aset</th>
                                    <th className="px-5 py-4">Tanggal</th>
                                    <th className="px-5 py-4">
                                        Progres Pemeriksaan
                                    </th>
                                    <th className="px-5 py-4 text-right">
                                        Aksi
                                    </th>
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
                                                    Peminjaman{' '}
                                                    {item.borrowingCode}
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
                                                {item.assets
                                                    .map(
                                                        (asset) =>
                                                            `${asset.name} (${asset.quantity})`,
                                                    )
                                                    .join(', ')}
                                            </td>
                                            <td className="px-5 py-4 text-sm text-neutral-700">
                                                {formatDate(item.returnDate)}
                                            </td>
                                            <td className="px-5 py-4">
                                                <span
                                                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                        isInspectionComplete(item)
                                                            ? 'bg-emerald-50 text-emerald-800'
                                                            : 'bg-amber-50 text-amber-800'
                                                    }`}
                                                >
                                                    {getInspectionLabel(item)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedReturn(item)
                                                    }
                                                    className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                                                >
                                                    Periksa aset
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
                                            {returns.length
                                                ? 'Tidak ada data yang cocok dengan filter.'
                                                : 'Belum ada data pengembalian untuk diperiksa.'}
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
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6"
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) {
                                setSelectedReturn(null);
                            }
                        }}
                    >
                        <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 sm:px-7">
                                <div>
                                    <h2 className="text-lg font-bold text-neutral-900">
                                        Pemeriksaan Pengembalian
                                    </h2>
                                    <p className="mt-1 text-xs text-neutral-500">
                                        {selectedReturn.code} ·{' '}
                                        {selectedReturn.borrower}
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
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-neutral-50 p-4">
                                    <p className="text-sm text-neutral-700">
                                        {selectedReturn.assets.length} aset
                                        dalam pengembalian ini. Pilih setiap
                                        aset untuk mencatat kondisinya.
                                    </p>
                                    <p className="text-xs text-neutral-500">
                                        Status ketersediaan aset tidak diubah
                                        oleh pemeriksaan ini.
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    {selectedReturn.assets.map((asset) => (
                                        <div
                                            key={asset.id}
                                            className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <div>
                                                <p className="text-sm font-semibold text-neutral-900">
                                                    {asset.name}
                                                </p>
                                                <p className="mt-1 text-xs text-neutral-500">
                                                    {asset.code} · {asset.type} ·{' '}
                                                    {asset.location ||
                                                        'Lokasi tidak tersedia'}{' '}
                                                    · Jumlah {asset.quantity}
                                                </p>
                                                <p className="mt-2 text-xs text-neutral-600">
                                                    Kondisi tercatat:{' '}
                                                    {asset.inspectionCondition ??
                                                        'Belum diperiksa'}
                                                    {asset.inspectedAt
                                                        ? ` · ${formatDate(asset.inspectedAt)}`
                                                        : ''}
                                                </p>
                                                {asset.inspectionNotes && (
                                                    <p className="mt-1 text-xs text-neutral-500">
                                                        Catatan:{' '}
                                                        {asset.inspectionNotes}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openInspection(
                                                        selectedReturn,
                                                        asset,
                                                    )
                                                }
                                                className="shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-700"
                                            >
                                                {asset.inspectedAt
                                                    ? 'Ubah pemeriksaan'
                                                    : 'Periksa aset'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                {selectedReturn.photos.length > 0 && (
                                    <section>
                                        <h3 className="text-sm font-semibold text-neutral-900">
                                            Foto bukti dari peminjam
                                        </h3>
                                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                                                            alt={`Foto bukti ${index + 1}`}
                                                            className="h-28 w-full object-cover"
                                                        />
                                                    </a>
                                                ),
                                            )}
                                        </div>
                                    </section>
                                )}
                                {selectedReturn.notes && (
                                    <section>
                                        <h3 className="text-sm font-semibold text-neutral-900">
                                            Catatan peminjam
                                        </h3>
                                        <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600">
                                            {selectedReturn.notes}
                                        </p>
                                    </section>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}

            {selectedReturn &&
                selectedAsset &&
                createPortal(
                    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6">
                        <form
                            onSubmit={submitInspection}
                            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
                        >
                            <div className="border-b border-neutral-100 px-5 py-4 sm:px-6">
                                <h2 className="text-lg font-bold text-neutral-900">
                                    Periksa Kondisi Aset
                                </h2>
                                <p className="mt-1 text-xs text-neutral-500">
                                    {selectedAsset.code} · {selectedAsset.name}
                                </p>
                            </div>
                            <div className="space-y-4 p-5 sm:p-6">
                                <label className="block space-y-2">
                                    <span className="text-sm font-medium text-neutral-700">
                                        Kondisi setelah dikembalikan
                                    </span>
                                    <select
                                        required
                                        value={condition}
                                        onChange={(event) => {
                                            const selectedCondition =
                                                conditions.find(
                                                    (value) =>
                                                        value ===
                                                        event.target.value,
                                                );
                                            if (selectedCondition) {
                                                setCondition(selectedCondition);
                                            }
                                        }}
                                        className={inputClass}
                                    >
                                        {conditions.map((value) => (
                                            <option key={value} value={value}>
                                                {value}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm font-medium text-neutral-700">
                                        Catatan pemeriksaan (opsional)
                                    </span>
                                    <textarea
                                        rows={3}
                                        maxLength={2000}
                                        value={notes}
                                        onChange={(event) =>
                                            setNotes(event.target.value)
                                        }
                                        className={inputClass}
                                    />
                                </label>
                                <p className="text-xs leading-5 text-neutral-500">
                                    Tindakan ini hanya memperbarui kondisi aset.
                                    Status ketersediaannya tidak berubah.
                                </p>
                                {formError && (
                                    <p
                                        role="alert"
                                        className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                                    >
                                        {formError}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 p-5 sm:flex-row sm:justify-end sm:px-6">
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => setSelectedAsset(null)}
                                    className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                                >
                                    {saving ? 'Menyimpan...' : 'Simpan Kondisi'}
                                </button>
                            </div>
                        </form>
                    </div>,
                    document.body,
                )}
        </DashboardLayout>
    );
}
