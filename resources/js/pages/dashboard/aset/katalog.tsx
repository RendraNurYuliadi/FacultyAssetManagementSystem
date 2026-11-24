
import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../../components/layouts/DashboardLayout';
import Icon from '../../../components/Icon';
import type { IconName } from '../../../components/Icon';
import Pagination from '../../../components/Pagination';
import AssetManagementBanner from '../../../components/dashboard/AssetManagementBanner';
import DashboardMetricCard from '../../../components/dashboard/DashboardMetricCard';
import ImagePreviewModal from '../../../components/dashboard/ImagePreviewModal';
import type { ImagePreviewState } from '../../../components/dashboard/ImagePreviewModal';
import {
    managementErrorMessage,
    managementRequest,
} from '../../../lib/management-client';

type AssetCategory = 'Barang' | 'Ruangan';
type AssetCondition = 'Baik' | 'Rusak Ringan' | 'Rusak Berat';
type AssetStatus = 'Tersedia' | 'Dipinjam' | 'Maintenance' | 'Tidak Aktif';

type ItemSource = {
    kind: 'Barang';
    code: string;
    name: string;
    type: string;
    brand: string;
    model: string;
    specification: string;
    unit: string;
    responsiblePerson: string;
    status: string;
    description: string;
    createdAt: string;
    images: string[];
};

type RoomSource = {
    kind: 'Ruangan';
    code: string;
    name: string;
    type: string;
    floor: string;
    roomNumber: string;
    capacity: number;
    area: number;
    responsiblePerson: string;
    facilities: string[];
    description: string;
    createdAt: string;
    images: string[];
};

type AssetSource = ItemSource | RoomSource;

type AssetLocation = {
    code: string;
    name: string;
    type: string;
    address: string;
    area: string;
    responsible: string;
    phone: string;
    description: string;
    images: string[];
};

type Asset = {
    id: string;
    code: string;
    name: string;
    category: AssetCategory;
    itemId: string;
    roomId: string;
    locationId: string;
    quantity: number;
    condition: AssetCondition;
    status: AssetStatus;
    acquisitionDate: string;
    price: number;
    fundingSource: string;
    description: string;
    images: string[];
    createdAt: string;
    source: AssetSource | null;
    location: AssetLocation | null;
};

const PAGE_SIZE = 4;

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value);

const formatDate = (value: string) => {
    if (!value) return '-';

    return new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
};

function getLocationName(asset: Asset) {
    return asset.location?.name || 'Lokasi tidak tersedia';
}

function getAssetTypeName(asset: Asset) {
    return asset.source?.name || asset.name;
}

const getStatusStyle = (status: AssetStatus) => {
    switch (status) {
        case 'Tersedia':
            return 'bg-neutral-100 text-neutral-800 border-neutral-200';
        case 'Dipinjam':
            return 'bg-neutral-900 text-white border-neutral-800';
        case 'Maintenance':
            return 'bg-neutral-200 text-neutral-800 border-neutral-300';
        case 'Tidak Aktif':
            return 'bg-neutral-300 text-neutral-700 border-neutral-400';
    }
};

const getConditionStyle = (condition: AssetCondition) => {
    switch (condition) {
        case 'Baik':
            return 'text-neutral-700';
        case 'Rusak Ringan':
            return 'text-neutral-500';
        case 'Rusak Berat':
            return 'text-neutral-900 font-semibold';
    }
};

export default function KatalogAset() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('Semua');
    const [statusFilter, setStatusFilter] = useState('Semua');
    const [page, setPage] = useState(1);
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [activeImage, setActiveImage] =
        useState<ImagePreviewState | null>(null);

    useEffect(() => {
        let active = true;

        managementRequest<{ assets: Asset[] }>('/api/catalog/assets')
            .then((response) => {
                if (!Array.isArray(response.assets)) {
                    throw new Error('Data katalog aset tidak valid.');
                }
                if (active) {
                    setAssets(response.assets);
                    setLoadError('');
                }
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

    useEffect(() => {
        if (!activeImage) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setActiveImage(null);
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeImage]);

    const filteredAssets = useMemo(() => {
        return assets.filter((asset) => {
            const keyword = search.toLowerCase().trim();
            const sourceFields =
                asset.source?.kind === 'Barang'
                    ? [
                          asset.source.code,
                          asset.source.name,
                          asset.source.type,
                          asset.source.brand,
                          asset.source.model,
                          asset.source.specification,
                          asset.source.unit,
                          asset.source.responsiblePerson,
                          asset.source.description,
                      ]
                    : asset.source
                      ? [
                            asset.source.code,
                            asset.source.name,
                            asset.source.type,
                            asset.source.floor,
                            asset.source.roomNumber,
                            asset.source.responsiblePerson,
                            asset.source.facilities.join(' '),
                            asset.source.description,
                        ]
                      : [];
            const locationFields = asset.location
                ? [
                      asset.location.code,
                      asset.location.name,
                      asset.location.type,
                      asset.location.address,
                      asset.location.area,
                      asset.location.responsible,
                      asset.location.phone,
                      asset.location.description,
                  ]
                : [];
            const matchesSearch = [
                asset.name,
                asset.code,
                asset.category,
                asset.quantity.toString(),
                asset.condition,
                asset.status,
                asset.acquisitionDate,
                asset.price.toString(),
                asset.fundingSource,
                asset.description,
                ...sourceFields,
                ...locationFields,
            ].some((value) => value.toLowerCase().includes(keyword));

            const matchesCategory =
                categoryFilter === 'Semua' || asset.category === categoryFilter;

            const matchesStatus =
                statusFilter === 'Semua' || asset.status === statusFilter;

            return matchesSearch && matchesCategory && matchesStatus;
        });
    }, [assets, search, categoryFilter, statusFilter]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredAssets.length / PAGE_SIZE),
    );
    const currentPage = Math.min(page, Math.max(totalPages, 1));
    const paginatedAssets = filteredAssets.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
    );

    const totalBarang = assets.filter((asset) => asset.category === 'Barang').length;
    const totalRuangan = assets.filter((asset) => asset.category === 'Ruangan').length;
    const totalTersedia = assets.filter((asset) => asset.status === 'Tersedia').length;
    const stats: {
        label: string;
        value: number;
        description: string;
        icon: IconName;
        iconStyle: string;
    }[] = [
        {
            label: 'Total Aset',
            value: assets.length,
            description: 'Seluruh data aset',
            icon: 'package',
            iconStyle: 'bg-neutral-100 text-neutral-800',
        },
        {
            label: 'Aset Barang',
            value: totalBarang,
            description: 'Jenis aset barang',
            icon: 'box',
            iconStyle: 'bg-neutral-200 text-neutral-800',
        },
        {
            label: 'Aset Ruangan',
            value: totalRuangan,
            description: 'Jenis aset ruangan',
            icon: 'building',
            iconStyle: 'bg-neutral-100 text-neutral-700',
        },
        {
            label: 'Tersedia',
            value: totalTersedia,
            description: 'Aset siap digunakan',
            icon: 'check-circle',
            iconStyle: 'bg-neutral-200 text-neutral-700',
        },
    ];

    function closeDetail() {
        setSelectedAsset(null);
        setActiveImage(null);
    }

    return (
        <DashboardLayout>
            <div className="w-full min-w-0 space-y-6 pb-8">
                <AssetManagementBanner
                    title="Jelajahi Katalog Aset."
                    description="Telusuri aset barang dan ruangan beserta lokasi serta status ketersediaannya."
                    contextLabel="Katalog aset"
                    icon="layers"
                    statusLabel="Informasi aset terkini"
                    metrics={[
                        { label: 'Total aset', value: assets.length },
                        { label: 'Aset tersedia', value: totalTersedia },
                    ]}
                />

                {/* Page Heading */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-xs text-neutral-400">
                            <span>Manajemen Aset</span>
                            <span>/</span>
                            <span className="font-medium text-neutral-700">Katalog Aset</span>
                        </div>

                        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
                            Katalog Aset
                        </h1>

                        <p className="mt-1 text-sm text-neutral-500">
                            Lihat dan telusuri seluruh aset barang dan ruangan fakultas.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-600">
                        <span className="h-2 w-2 rounded-full bg-neutral-800" />
                        <span>{assets.length} aset terdaftar</span>
                    </div>
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {stats.map((stat, index) => (
                        <DashboardMetricCard
                            key={stat.label}
                            label={stat.label}
                            value={stat.value}
                            icon={stat.icon}
                            index={index}
                            description={stat.description}
                        />
                    ))}
                </div>

                {/* Filter */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="relative flex-1">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <circle cx="11" cy="11" r="7" />
                                    <path d="m16 16 4 4" />
                                </svg>
                            </span>

                            <input
                                type="text"
                                value={search}
                                onChange={(event) => {
                                    setSearch(event.target.value);
                                    setPage(1);
                                }}
                                placeholder="Cari kode, nama, sumber aset, atau lokasi..."
                                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-neutral-500 focus:bg-white"
                            />
                        </div>

                        <select
                            value={categoryFilter}
                            onChange={(event) => {
                                setCategoryFilter(event.target.value);
                                setPage(1);
                            }}
                            className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 outline-none focus:border-neutral-500"
                        >
                            <option value="Semua">Semua Kategori</option>
                            <option value="Barang">Barang</option>
                            <option value="Ruangan">Ruangan</option>
                        </select>

                        <select
                            value={statusFilter}
                            onChange={(event) => {
                                setStatusFilter(event.target.value);
                                setPage(1);
                            }}
                            className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 outline-none focus:border-neutral-500"
                        >
                            <option value="Semua">Semua Status</option>
                            <option value="Tersedia">Tersedia</option>
                            <option value="Dipinjam">Dipinjam</option>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Tidak Aktif">Tidak Aktif</option>
                        </select>

                        <button
                            type="button"
                            onClick={() => {
                                setSearch('');
                                setCategoryFilter('Semua');
                                setStatusFilter('Semua');
                                setPage(1);
                            }}
                            className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100"
                        >
                            Reset
                        </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
                        <span>
                            Menampilkan{' '}
                            {filteredAssets.length === 0
                                ? 0
                                : (currentPage - 1) * PAGE_SIZE + 1}
                            –
                            {Math.min(currentPage * PAGE_SIZE, filteredAssets.length)} dari{' '}
                            {filteredAssets.length} aset
                        </span>
                        <span>Terakhir diperbarui: Data sistem</span>
                    </div>
                </div>

                {/* Asset Cards */}
                {loading ? (
                    <div className="rounded-2xl border border-neutral-200 bg-white px-5 py-16 text-center text-sm text-neutral-500">
                        Memuat katalog aset...
                    </div>
                ) : loadError ? (
                    <div className="rounded-2xl border border-red-200 bg-white px-5 py-12 text-center">
                        <p className="text-sm font-semibold text-neutral-800">
                            Katalog aset tidak dapat dimuat
                        </p>
                        <p className="mt-2 text-sm text-neutral-500">{loadError}</p>
                        <button
                            type="button"
                            onClick={() => {
                                setLoading(true);
                                setLoadError('');
                                setReloadKey((current) => current + 1);
                            }}
                            className="mt-4 rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-neutral-700"
                        >
                            Coba lagi
                        </button>
                    </div>
                ) : filteredAssets.length > 0 ? (
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {paginatedAssets.map((asset) => (
                            <button
                                type="button"
                                key={asset.id}
                                onClick={() => setSelectedAsset(asset)}
                                className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left transition duration-200 hover:-translate-y-1 hover:border-neutral-400 hover:shadow-lg"
                            >
                                <div className="relative h-52 overflow-hidden bg-neutral-100">
                                    {asset.images.length > 0 ? (
                                        <img
                                            src={asset.images[0]}
                                            alt={asset.name}
                                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-400">
                                            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.3">
                                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                                <circle cx="8.5" cy="8.5" r="1.5" />
                                                <path d="m21 15-5-5L5 21" />
                                            </svg>
                                            <span className="text-xs">Belum ada foto</span>
                                        </div>
                                    )}

                                    <div className="absolute left-3 top-3">
                                        <span className="rounded-lg border border-white/60 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-neutral-800 backdrop-blur">
                                            {asset.category}
                                        </span>
                                    </div>

                                    <div className="absolute right-3 top-3">
                                        <span className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold ${getStatusStyle(asset.status)}`}>
                                            {asset.status}
                                        </span>
                                    </div>

                                    {asset.images.length > 1 && (
                                        <div className="absolute bottom-3 right-3 rounded-lg bg-black/60 px-2.5 py-1.5 text-[11px] font-medium text-white backdrop-blur">
                                            +{asset.images.length - 1} foto
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4 p-5">
                                    <div>
                                        <p className="text-[11px] font-medium tracking-wide text-neutral-400">
                                            {asset.code}
                                        </p>
                                        <h3 className="mt-1 line-clamp-1 text-base font-bold text-neutral-900">
                                            {asset.name}
                                        </h3>
                                        <p className="mt-1 line-clamp-1 text-xs text-neutral-500">
                                            {getAssetTypeName(asset)}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 border-y border-neutral-100 py-3">
                                        <div>
                                            <p className="text-[11px] text-neutral-400">
                                                {asset.category === 'Barang' ? 'Jumlah' : 'Kapasitas data'}
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-neutral-800">
                                                {asset.category === 'Barang' ? `${asset.quantity} unit` : '1 ruangan'}
                                            </p>
                                        </div>

                                        <div>
                                            <p className="text-[11px] text-neutral-400">Kondisi</p>
                                            <p className={`mt-1 text-sm font-semibold ${getConditionStyle(asset.condition)}`}>
                                                {asset.condition}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[11px] text-neutral-400">Lokasi</p>
                                            <p className="mt-1 truncate text-xs font-medium text-neutral-700">
                                                {getLocationName(asset)}
                                            </p>
                                        </div>

                                        <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-neutral-800 transition group-hover:gap-2.5">
                                            Detail
                                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                                <path d="M5 12h14m-6-6 6 6-6 6" />
                                            </svg>
                                        </span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-16 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
                            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m16 16 4 4" />
                            </svg>
                        </div>
                        <h3 className="mt-4 text-sm font-semibold text-neutral-800">
                            Aset tidak ditemukan
                        </h3>
                        <p className="mt-1 text-xs text-neutral-500">
                            Coba ubah kata kunci atau filter pencarian.
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setSearch('');
                                setCategoryFilter('Semua');
                                setStatusFilter('Semua');
                                setPage(1);
                            }}
                            className="mt-4 text-xs font-semibold text-neutral-800 underline underline-offset-4"
                        >
                            Reset pencarian
                        </button>
                    </div>
                )}

                <Pagination
                    page={currentPage}
                    totalPages={totalPages}
                    onChange={setPage}
                />
            </div>

            {/* Asset Detail Modal */}
            {selectedAsset && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
                    onClick={closeDetail}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="asset-detail-title"
                        onClick={(event) => event.stopPropagation()}
                        className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                    >
                        {/* Modal Header */}
                        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4 sm:px-7">
                            <div>
                                <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                                    Katalog Aset / Detail
                                </p>
                                <h2 id="asset-detail-title" className="mt-1 text-lg font-bold text-neutral-900">
                                    Detail Aset
                                </h2>
                            </div>

                            <button
                                type="button"
                                onClick={closeDetail}
                                aria-label="Tutup detail"
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
                            >
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path d="m18 6-12 12M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="overflow-y-auto">
                            <div className="grid grid-cols-1 lg:grid-cols-2">
                                {/* Images */}
                                <div className="space-y-3 bg-neutral-50 p-5 sm:p-7">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-neutral-800">Dokumentasi Aset</h3>
                                        <span className="text-xs text-neutral-400">
                                            {selectedAsset.images.length} foto
                                        </span>
                                    </div>

                                    {selectedAsset.images.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-3">
                                            {selectedAsset.images.map((image, index) => (
                                                <button
                                                    type="button"
                                                    key={`${image}-${index}`}
                                                    onClick={() =>
                                                        setActiveImage({
                                                            images: selectedAsset.images,
                                                            index,
                                                            entityName: selectedAsset.name,
                                                        })
                                                    }
                                                    className={`group relative overflow-hidden rounded-xl border border-neutral-200 bg-white ${
                                                        index === 0 && selectedAsset.images.length > 2
                                                            ? 'col-span-2'
                                                            : ''
                                                    }`}
                                                >
                                                    <img
                                                        src={image}
                                                        alt={`${selectedAsset.name} ${index + 1}`}
                                                        className={`w-full object-cover transition duration-300 group-hover:scale-105 ${
                                                            index === 0 && selectedAsset.images.length > 2
                                                                ? 'h-56'
                                                                : 'h-36'
                                                        }`}
                                                    />
                                                    <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white">
                                                        Foto {index + 1}
                                                    </span>
                                                    <span className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-[10px] font-medium text-neutral-700 opacity-0 transition group-hover:opacity-100">
                                                        Perbesar
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white text-neutral-400">
                                            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.3">
                                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                                <circle cx="8.5" cy="8.5" r="1.5" />
                                                <path d="m21 15-5-5L5 21" />
                                            </svg>
                                            <p className="mt-3 text-xs">Belum ada dokumentasi foto</p>
                                        </div>
                                    )}

                                    <div className="rounded-xl border border-neutral-200 bg-white p-4">
                                        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                                            Deskripsi Aset
                                        </p>
                                        <p className="mt-2 text-sm leading-6 text-neutral-600">
                                            {selectedAsset.description || 'Tidak ada deskripsi aset.'}
                                        </p>
                                    </div>
                                </div>

                                {/* Information */}
                                <div className="space-y-6 p-5 sm:p-7">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-lg bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
                                                {selectedAsset.category}
                                            </span>
                                            <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${getStatusStyle(selectedAsset.status)}`}>
                                                {selectedAsset.status}
                                            </span>
                                        </div>

                                        <h3 className="mt-3 text-xl font-bold leading-snug text-neutral-900">
                                            {selectedAsset.name}
                                        </h3>
                                        <p className="mt-1 text-xs text-neutral-400">
                                            {selectedAsset.code}
                                        </p>
                                    </div>

                                    {/* Quick Summary */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-xl border border-neutral-200 p-3">
                                            <p className="text-[11px] text-neutral-400">Jumlah</p>
                                            <p className="mt-1 text-lg font-bold text-neutral-900">
                                                {selectedAsset.category === 'Barang'
                                                    ? `${selectedAsset.quantity} unit`
                                                    : '1 ruangan'}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-neutral-200 p-3">
                                            <p className="text-[11px] text-neutral-400">Kondisi</p>
                                            <p className={`mt-1 text-sm font-bold ${getConditionStyle(selectedAsset.condition)}`}>
                                                {selectedAsset.condition}
                                            </p>
                                        </div>
                                    </div>

                                    {/* General Information */}
                                    <section>
                                        <h4 className="mb-3 border-b border-neutral-200 pb-2 text-xs font-bold uppercase tracking-wider text-neutral-800">
                                            Informasi Umum
                                        </h4>

                                        <div className="space-y-3">
                                            <DetailRow label="Kode Aset" value={selectedAsset.code} />
                                            <DetailRow label="Nama Aset" value={selectedAsset.name} />
                                            <DetailRow label="Kategori" value={selectedAsset.category} />
                                            <DetailRow label="Jenis Aset" value={getAssetTypeName(selectedAsset)} />
                                            <DetailRow label="Status" value={selectedAsset.status} />
                                            <DetailRow label="Kondisi" value={selectedAsset.condition} />
                                            <DetailRow
                                                label={selectedAsset.category === 'Barang' ? 'Jumlah Barang' : 'Jumlah Ruangan'}
                                                value={selectedAsset.category === 'Barang' ? `${selectedAsset.quantity} unit` : '1 ruangan'}
                                            />
                                            <DetailRow
                                                label="Tanggal pencatatan"
                                                value={formatDate(selectedAsset.createdAt)}
                                            />
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className="mb-3 border-b border-neutral-200 pb-2 text-xs font-bold uppercase tracking-wider text-neutral-800">
                                            Data {selectedAsset.category}
                                        </h4>

                                        {selectedAsset.source ? (
                                            <div className="space-y-3">
                                                <DetailRow
                                                    label="Kode sumber"
                                                    value={selectedAsset.source.code || '-'}
                                                />
                                                <DetailRow
                                                    label="Nama"
                                                    value={selectedAsset.source.name || '-'}
                                                />
                                                <DetailRow
                                                    label={
                                                        selectedAsset.source.kind === 'Barang'
                                                            ? 'Kategori barang'
                                                            : 'Jenis ruangan'
                                                    }
                                                    value={selectedAsset.source.type || '-'}
                                                />
                                                {selectedAsset.source.kind === 'Barang' ? (
                                                    <>
                                                        <DetailRow
                                                            label="Merek"
                                                            value={selectedAsset.source.brand || '-'}
                                                        />
                                                        <DetailRow
                                                            label="Model"
                                                            value={selectedAsset.source.model || '-'}
                                                        />
                                                        <DetailRow
                                                            label="Satuan"
                                                            value={selectedAsset.source.unit || '-'}
                                                        />
                                                        <DetailRow
                                                            label="Status barang"
                                                            value={selectedAsset.source.status || '-'}
                                                        />
                                                        <DetailRow
                                                            label="Spesifikasi"
                                                            value={selectedAsset.source.specification || '-'}
                                                        />
                                                    </>
                                                ) : (
                                                    <>
                                                        <DetailRow
                                                            label="Nomor ruangan"
                                                            value={selectedAsset.source.roomNumber || '-'}
                                                        />
                                                        <DetailRow
                                                            label="Lantai"
                                                            value={selectedAsset.source.floor || '-'}
                                                        />
                                                        <DetailRow
                                                            label="Kapasitas"
                                                            value={`${selectedAsset.source.capacity} orang`}
                                                        />
                                                        <DetailRow
                                                            label="Luas"
                                                            value={`${selectedAsset.source.area} m²`}
                                                        />
                                                        <DetailRow
                                                            label="Fasilitas"
                                                            value={selectedAsset.source.facilities.join(', ') || '-'}
                                                        />
                                                    </>
                                                )}
                                                <DetailRow
                                                    label="Penanggung jawab"
                                                    value={selectedAsset.source.responsiblePerson || '-'}
                                                />
                                                <DetailRow
                                                    label="Tanggal data sumber"
                                                    value={formatDate(selectedAsset.source.createdAt)}
                                                />
                                                <DetailRow
                                                    label={`Deskripsi ${selectedAsset.category.toLowerCase()}`}
                                                    value={selectedAsset.source.description || '-'}
                                                />
                                            </div>
                                        ) : (
                                            <p className="text-xs leading-5 text-neutral-500">
                                                Data sumber {selectedAsset.category.toLowerCase()} tidak ditemukan.
                                            </p>
                                        )}
                                    </section>

                                    {/* Location */}
                                    <section>
                                        <h4 className="mb-3 border-b border-neutral-200 pb-2 text-xs font-bold uppercase tracking-wider text-neutral-800">
                                            Informasi Lokasi
                                        </h4>

                                        <div className="space-y-3">
                                            {selectedAsset.location ? (
                                                <>
                                                    <DetailRow
                                                        label="Kode lokasi"
                                                        value={selectedAsset.location.code || '-'}
                                                    />
                                                    <DetailRow
                                                        label="Nama lokasi"
                                                        value={selectedAsset.location.name || '-'}
                                                    />
                                                    <DetailRow
                                                        label="Jenis lokasi"
                                                        value={selectedAsset.location.type || '-'}
                                                    />
                                                    <DetailRow
                                                        label="Alamat"
                                                        value={selectedAsset.location.address || '-'}
                                                    />
                                                    <DetailRow
                                                        label="Area"
                                                        value={selectedAsset.location.area || '-'}
                                                    />
                                                    <DetailRow
                                                        label="Penanggung jawab"
                                                        value={selectedAsset.location.responsible || '-'}
                                                    />
                                                    <DetailRow
                                                        label="Nomor telepon"
                                                        value={selectedAsset.location.phone || '-'}
                                                    />
                                                    <DetailRow
                                                        label="Deskripsi lokasi"
                                                        value={selectedAsset.location.description || '-'}
                                                    />
                                                    {selectedAsset.location.images.length > 0 && (
                                                        <div className="pt-1">
                                                            <p className="mb-2 text-[11px] text-neutral-400">
                                                                Foto lokasi
                                                            </p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {selectedAsset.location.images.map(
                                                                    (image, index) => (
                                                                        <button
                                                                            type="button"
                                                                            key={`${image}-${index}`}
                                                                            onClick={() =>
                                                                                setActiveImage({
                                                                                    images:
                                                                                        selectedAsset.location?.images ?? [],
                                                                                    index,
                                                                                    entityName:
                                                                                        selectedAsset.location?.name ??
                                                                                        'Lokasi aset',
                                                                                })
                                                                            }
                                                                            className="h-14 w-14 overflow-hidden rounded-lg border border-neutral-200"
                                                                            aria-label={`Perbesar foto lokasi ${index + 1}`}
                                                                        >
                                                                            <img
                                                                                src={image}
                                                                                alt={`Lokasi ${selectedAsset.location?.name ?? ''} ${index + 1}`}
                                                                                className="h-full w-full object-cover"
                                                                            />
                                                                        </button>
                                                                    ),
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-xs leading-5 text-neutral-500">
                                                    Data lokasi aset tidak ditemukan.
                                                </p>
                                            )}
                                        </div>
                                    </section>

                                    {/* Acquisition */}
                                    <section>
                                        <h4 className="mb-3 border-b border-neutral-200 pb-2 text-xs font-bold uppercase tracking-wider text-neutral-800">
                                            Informasi Pengadaan
                                        </h4>

                                        <div className="space-y-3">
                                            <DetailRow
                                                label="Tanggal Perolehan"
                                                value={formatDate(selectedAsset.acquisitionDate)}
                                            />
                                            <DetailRow
                                                label="Nilai Perolehan"
                                                value={formatCurrency(selectedAsset.price)}
                                            />
                                            <DetailRow
                                                label="Sumber Dana"
                                                value={selectedAsset.fundingSource}
                                            />
                                        </div>
                                    </section>

                                    <div className="rounded-xl bg-neutral-50 p-4">
                                        <p className="text-[11px] font-medium text-neutral-400">
                                            Informasi
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-neutral-500">
                                            Detail ini menampilkan informasi aset yang tersedia pada katalog.
                                            Riwayat peminjaman, pengembalian, dan pemeliharaan dapat dilihat
                                            melalui menu masing-masing.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="flex shrink-0 items-center justify-between border-t border-neutral-200 bg-white px-5 py-3 sm:px-7">
                            <p className="hidden text-xs text-neutral-400 sm:block">
                                FAMS · Faculty Asset Management System
                            </p>
                            <button
                                type="button"
                                onClick={closeDetail}
                                className="ml-auto rounded-xl bg-neutral-900 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-neutral-700"
                            >
                                Tutup Detail
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ImagePreviewModal
                preview={activeImage}
                heading="Preview Foto Katalog"
                onClose={() => setActiveImage(null)}
                onIndexChange={(index) =>
                    setActiveImage((current) =>
                        current ? { ...current, index } : current,
                    )
                }
            />
        </DashboardLayout>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4 text-xs">
            <span className="shrink-0 text-neutral-400">{label}</span>
            <span className="max-w-[65%] text-right font-medium leading-5 text-neutral-800">
                {value}
            </span>
        </div>
    );
}
