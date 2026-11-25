
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import DashboardLayout from '../../../components/layouts/DashboardLayout';
import Icon from '../../../components/Icon';
import type { IconName } from '../../../components/Icon';
import AssetManagementBanner from '../../../components/dashboard/AssetManagementBanner';
import ClearManagementDataButton from '../../../components/dashboard/ClearManagementDataButton';
import DashboardMetricCard from '../../../components/dashboard/DashboardMetricCard';
import ImagePreviewModal from '../../../components/dashboard/ImagePreviewModal';
import type { ImagePreviewState } from '../../../components/dashboard/ImagePreviewModal';
import {
    managementErrorMessage,
    managementRequest,
} from '../../../lib/management-client';
import { nextNumberedUniqueValue } from '../../../lib/duplicate';

type AssetCategory = 'Barang' | 'Ruangan';
type AssetCondition = 'Baik' | 'Rusak Ringan' | 'Rusak Berat';
type AssetStatus =
    | 'Tersedia'
    | 'Diproses Peminjam'
    | 'Dipinjam'
    | 'Diproses Pengembalian'
    | 'Maintenance'
    | 'Tidak Aktif';

type LocationSnapshot = {
    id: string;
    code: string;
    name: string;
    type: string;
    address: string;
    area: string;
    responsible: string;
    phone: string;
    description: string;
    images: string[];
    createdAt: string;
    updatedAt: string;
};

type AssetSource = {
    id: string;
    category: AssetCategory;
    locationId: string;
    code: string;
    name: string;
    kind: string;
    brand: string;
    model: string;
    specification: string;
    unit: string;
    floor: string;
    roomNumber: string;
    capacity: number;
    area: number;
    responsiblePerson: string;
    facilities: string[];
    status: string;
    description: string;
    images: string[];
    createdAt: string;
    updatedAt: string;
};

type Asset = {
    id: string;
    code: string;
    name: string;
    category: AssetCategory;
    itemId: string;
    roomId: string;
    locationId: string;
    location: LocationSnapshot | null;
    source: AssetSource | null;
    rfidCode: string;
    quantity: number;
    condition: AssetCondition;
    status: AssetStatus;
    acquisitionDate: string;
    price: number;
    fundingSource: string;
    description: string;
    images: string[];
    createdAt: string;
    updatedAt: string;
};

type AssetForm = {
    code: string;
    name: string;
    category: AssetCategory;
    itemId: string;
    roomId: string;
    locationId: string;
    quantity: string;
    condition: AssetCondition;
    status: AssetStatus;
    acquisitionDate: string;
    price: string;
    fundingSource: string;
    description: string;
    images: string[];
};

const PER_PAGE = 5;

type MasterRecord = {
    id: string;
    code: string;
    name: string;
    locationId: string;
    rfidCode: string;
    images: string[];
    status?: string;
};

type LocationOption = {
    id: string;
    name: string;
};

const emptyForm: AssetForm = {
    code: '',
    name: '',
    category: 'Barang',
    itemId: '',
    roomId: '',
    locationId: '',
    quantity: '1',
    condition: 'Baik',
    status: 'Tersedia',
    acquisitionDate: '',
    price: '',
    fundingSource: 'APBN',
    description: '',
    images: [],
};

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
        month: 'short',
        year: 'numeric',
    });
};

const statusStyles: Record<AssetStatus, string> = {
    Tersedia: 'bg-neutral-100 text-neutral-800 ring-1 ring-neutral-200',
    'Diproses Peminjam':
        'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
    Dipinjam: 'bg-neutral-900 text-white ring-1 ring-neutral-800',
    'Diproses Pengembalian':
        'bg-blue-50 text-blue-800 ring-1 ring-blue-200',
    Maintenance: 'bg-neutral-200 text-neutral-800 ring-1 ring-neutral-300',
    'Tidak Aktif': 'bg-neutral-300 text-neutral-700 ring-1 ring-neutral-400',
};

const conditionStyles: Record<AssetCondition, string> = {
    Baik: 'text-neutral-700',
    'Rusak Ringan': 'text-neutral-500',
    'Rusak Berat': 'font-semibold text-neutral-900',
};

function Field({
    label,
    children,
    required = false,
}: {
    label: string;
    children: React.ReactNode;
    required?: boolean;
}) {
    return (
        <label className="block min-w-0 space-y-2">
            <span className="text-xs font-semibold text-neutral-700">
                {label}
                {required && <span className="ml-1 text-neutral-950">*</span>}
            </span>
            {children}
        </label>
    );
}

const inputClass =
    'w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400';

export default function DataAset() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [items, setItems] = useState<MasterRecord[]>([]);
    const [rooms, setRooms] = useState<MasterRecord[]>([]);
    const [locations, setLocations] = useState<LocationOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('Semua');
    const [statusFilter, setStatusFilter] = useState('Semua');
    const [locationFilter, setLocationFilter] = useState('Semua');
    const [currentPage, setCurrentPage] = useState(1);
    const [modalOpen, setModalOpen] = useState(false);
    const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<AssetForm>(emptyForm);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [imagePreview, setImagePreview] =
        useState<ImagePreviewState | null>(null);

    async function loadAssets() {
        const result = await managementRequest<{ assets: Asset[] }>(
            '/api/admin/assets',
        );
        setAssets(result.assets);
    }

    useEffect(() => {
        let active = true;
        Promise.all([
            managementRequest<{ assets: Asset[] }>('/api/admin/assets'),
            managementRequest<{ items: MasterRecord[] }>('/api/admin/items'),
            managementRequest<{ rooms: MasterRecord[] }>('/api/admin/rooms'),
            managementRequest<{ locations: LocationOption[] }>(
                '/api/admin/locations',
            ),
        ])
            .then(([assetResult, itemResult, roomResult, locationResult]) => {
                if (!active) return;
                setAssets(assetResult.assets);
                setItems(itemResult.items);
                setRooms(roomResult.rooms);
                setLocations(locationResult.locations);
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
        if (!imagePreview) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setImagePreview(null);
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [imagePreview]);

    const filteredAssets = useMemo(() => {
        return assets.filter((asset) => {
            const keyword = search.toLowerCase().trim();

            const matchesSearch = [
                asset.name,
                asset.code,
                asset.category,
                asset.rfidCode,
                getLocationName(asset.locationId),
                asset.quantity.toString(),
                asset.condition,
                asset.status,
                asset.acquisitionDate,
                asset.price.toString(),
                asset.fundingSource,
                asset.description,
            ].some((value) => value.toLowerCase().includes(keyword));

            const matchesCategory =
                categoryFilter === 'Semua' ||
                asset.category === categoryFilter;

            const matchesStatus =
                statusFilter === 'Semua' ||
                asset.status === statusFilter;
            const matchesLocation =
                locationFilter === 'Semua' ||
                asset.locationId === locationFilter;

            return matchesSearch && matchesCategory && matchesStatus && matchesLocation;
        });
    }, [assets, search, categoryFilter, statusFilter, locationFilter, locations]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredAssets.length / PER_PAGE),
    );

    const safeCurrentPage = Math.min(currentPage, totalPages);

    const paginatedAssets = filteredAssets.slice(
        (safeCurrentPage - 1) * PER_PAGE,
        safeCurrentPage * PER_PAGE,
    );

    const stats: {
        label: string;
        value: number;
        icon: IconName;
        iconStyle: string;
    }[] = [
        {
            label: 'Total Aset',
            value: assets.length,
            icon: 'package',
            iconStyle: 'bg-neutral-100 text-neutral-800',
        },
        {
            label: 'Barang',
            value: assets.filter((asset) => asset.category === 'Barang').length,
            icon: 'box',
            iconStyle: 'bg-neutral-200 text-neutral-800',
        },
        {
            label: 'Ruangan',
            value: assets.filter((asset) => asset.category === 'Ruangan').length,
            icon: 'building',
            iconStyle: 'bg-neutral-100 text-neutral-700',
        },
        {
            label: 'Perlu Perhatian',
            value: assets.filter(
                (asset) =>
                    asset.condition !== 'Baik' ||
                    asset.status === 'Maintenance',
            ).length,
            icon: 'alert-circle',
            iconStyle: 'bg-neutral-200 text-neutral-700',
        },
    ];

    function openCreateModal() {
        setEditingId(null);
        setForm({
            ...emptyForm,
            code: `FAMS-${Date.now()}`,
        });
        setModalOpen(true);
    }

    function openEditModal(asset: Asset) {
        setEditingId(asset.id);

        setForm({
            code: asset.code,
            name: '',
            category: asset.category,
            itemId: asset.itemId,
            roomId: asset.roomId,
            locationId: asset.locationId,
            quantity: asset.quantity.toString(),
            condition: asset.condition,
            status: asset.status,
            acquisitionDate: asset.acquisitionDate,
            price: asset.price.toString(),
            fundingSource: asset.fundingSource,
            description: asset.description,
            images: [...asset.images],
        });

        setModalOpen(true);
    }

    function duplicateAsset(asset: Asset) {
        setEditingId(null);
        setDetailAsset(null);
        setForm({
            code: nextNumberedUniqueValue(
                asset.code,
                assets.map((existingAsset) => existingAsset.code),
                40,
            ),
            name: asset.name,
            category: asset.category,
            itemId: '',
            roomId: '',
            locationId: '',
            quantity: asset.quantity.toString(),
            condition: asset.condition,
            status: asset.status,
            acquisitionDate: asset.acquisitionDate,
            price: asset.price.toString(),
            fundingSource: asset.fundingSource,
            description: asset.description,
            images: [],
        });
        setModalOpen(true);
    }

    function updateForm<K extends keyof AssetForm>(
        key: K,
        value: AssetForm[K],
    ) {
        setForm((previous) => ({
            ...previous,
            [key]: value,
        }));
    }

    function handleCategoryChange(category: AssetCategory) {
        setForm((previous) => ({
            ...previous,
            category,
            itemId: '',
            roomId: '',
            name: '',
            locationId: '',
            quantity: '1',
            images: [],
        }));
    }

    function handleMasterSelection(value: string) {
        if (form.category === 'Barang') {
            const selected = items.find((item) => item.id === value);

            setForm((previous) => ({
                ...previous,
                itemId: value,
                roomId: '',
                name: selected?.name ?? '',
                locationId: selected?.locationId ?? '',
                images: selected?.images ?? [],
            }));
        } else {
            const selected = rooms.find((room) => room.id === value);

            setForm((previous) => ({
                ...previous,
                itemId: '',
                roomId: value,
                name: selected?.name ?? '',
                locationId: selected?.locationId ?? '',
                images: selected?.images ?? [],
            }));
        }
    }

    async function saveAsset(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (form.category === 'Barang' && !form.itemId) {
            alert('Silakan pilih barang.');
            return;
        }

        if (form.category === 'Ruangan' && !form.roomId) {
            alert('Silakan pilih ruangan.');
            return;
        }

        const selectedSource =
            form.category === 'Barang'
                ? items.find((item) => item.id === form.itemId)
                : rooms.find((room) => room.id === form.roomId);
        if (!selectedSource) {
            alert('Sumber barang atau ruangan tidak ditemukan. Muat ulang data.');
            return;
        }
        if (!selectedSource.locationId) {
            alert('Lokasi sumber barang atau ruangan belum diatur.');
            return;
        }

        const payload = new FormData();
        payload.set('code', form.code.trim());
        payload.set('category', form.category);
        payload.set('itemId', form.category === 'Barang' ? form.itemId : '');
        payload.set('roomId', form.category === 'Ruangan' ? form.roomId : '');
        payload.set('quantity', form.category === 'Ruangan' ? '1' : form.quantity);
        payload.set('condition', form.condition);
        payload.set('status', form.status);
        payload.set('acquisitionDate', form.acquisitionDate);
        payload.set('price', form.price || '0');
        payload.set('fundingSource', form.fundingSource.trim());
        payload.set('description', form.description.trim());

        setSaving(true);
        try {
            await managementRequest<{ asset: Asset }>(
                editingId
                    ? `/api/admin/assets/${editingId}`
                    : '/api/admin/assets',
                {
                    method: editingId ? 'PATCH' : 'POST',
                    body: payload,
                },
            );
            await loadAssets();
            setCurrentPage(1);
            closeModal();
        } catch (error: unknown) {
            alert(managementErrorMessage(error));
        } finally {
            setSaving(false);
        }
    }

    async function confirmDelete() {
        if (deleteId === null) return;
        try {
            await managementRequest<{ deleted: boolean }>(
                `/api/admin/assets/${deleteId}`,
                { method: 'DELETE' },
            );
            await loadAssets();
            setDeleteId(null);
            setDetailAsset(null);
        } catch (error: unknown) {
            alert(managementErrorMessage(error));
        }
    }

    function closeModal() {
        setModalOpen(false);
        setEditingId(null);
        setForm(emptyForm);
    }

    function getLocationName(id: string) {
        return locations.find((location) => location.id === id)?.name ?? '-';
    }

    return (
        <DashboardLayout>
            <div className="w-full min-w-0 space-y-6">
                <AssetManagementBanner
                    title="Kelola Data Aset."
                    description="Pantau inventaris barang dan ruangan, status penggunaan, serta kondisi aset fakultas."
                    contextLabel="Inventaris aset"
                    icon="package"
                    statusLabel="Status ketersediaan terpantau"
                    metrics={[
                        { label: 'Total aset', value: assets.length },
                        {
                            label: 'Aset tersedia',
                            value: assets.filter(
                                (asset) => asset.status === 'Tersedia',
                            ).length,
                        },
                    ]}
                />

                {/* PAGE HEADING */}
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-xs text-neutral-400">
                            <span>Manajemen Aset</span>
                            <Icon name="chevron-right" size={13} />
                            <span className="font-semibold text-neutral-700">
                                Data Aset
                            </span>
                        </div>

                        <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                            Data Aset
                        </h1>

                        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">
                            Kelola seluruh data inventaris barang dan ruangan
                            yang dimiliki fakultas.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <ClearManagementDataButton
                            endpoint="/api/admin/assets/clear"
                            dataLabel="aset"
                            warning="Data aset juga tampil di Katalog Aset. Pembersihan di sini akan mengosongkan keduanya."
                            onCleared={() => setAssets([])}
                        />
                        <button
                            type="button"
                            onClick={openCreateModal}
                            disabled={loading}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                        >
                            <Icon name="plus" size={17} />
                            Tambah Aset
                        </button>
                    </div>
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

                {/* MAIN TABLE */}
                <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    <div className="flex flex-col gap-4 border-b border-neutral-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="font-bold text-neutral-900">
                                Daftar Inventaris
                            </h2>
                            <p className="mt-1 text-xs text-neutral-500">
                                Informasi seluruh aset terdaftar.
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
                                    placeholder="Cari kode, nama, RFID, atau lokasi aset..."
                                    className={`${inputClass} pl-9 sm:w-64`}
                                />
                            </div>

                            <select
                                value={categoryFilter}
                                onChange={(event) => {
                                    setCategoryFilter(event.target.value);
                                    setCurrentPage(1);
                                }}
                                className={inputClass}
                            >
                                <option value="Semua">Semua Kategori</option>
                                <option value="Barang">Barang</option>
                                <option value="Ruangan">Ruangan</option>
                            </select>

                            <select
                                value={statusFilter}
                                onChange={(event) => {
                                    setStatusFilter(event.target.value);
                                    setCurrentPage(1);
                                }}
                                className={inputClass}
                            >
                                <option value="Semua">Semua Status Ketersediaan</option>
                                <option value="Tersedia">Tersedia</option>
                                <option value="Diproses Peminjam">
                                    Diproses Peminjam
                                </option>
                                <option value="Dipinjam">Dipinjam</option>
                                <option value="Diproses Pengembalian">
                                    Diproses Pengembalian
                                </option>
                                <option value="Maintenance">Maintenance</option>
                                <option value="Tidak Aktif">Tidak Aktif</option>
                            </select>

                            <select
                                value={locationFilter}
                                onChange={(event) => {
                                    setLocationFilter(event.target.value);
                                    setCurrentPage(1);
                                }}
                                className={inputClass}
                            >
                                <option value="Semua">Semua Lokasi</option>
                                {locations.map((location) => (
                                    <option key={location.id} value={location.id}>
                                        {location.name}
                                    </option>
                                ))}
                            </select>

                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[3600px] text-left text-sm">
                            <thead className="bg-neutral-50 text-xs text-neutral-500">
                                <tr>
                                    <th className="px-5 py-4 font-semibold">
                                        Aset
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Kategori
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Data Lokasi Lengkap
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Data Sumber Lengkap
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Jumlah
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Kondisi
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Status Ketersediaan
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Tanggal Perolehan
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Harga
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Sumber Dana
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Deskripsi Aset
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Dibuat
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Diperbarui
                                    </th>
                                    <th className="px-5 py-4 text-right font-semibold">
                                        Aksi
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-neutral-100">
                                {paginatedAssets.map((asset) => (
                                    <tr
                                        key={asset.id}
                                        className="transition hover:bg-neutral-50/70"
                                    >
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (asset.images[0]) {
                                                            setImagePreview({
                                                                images: asset.images,
                                                                index: 0,
                                                                entityName: asset.name,
                                                            });
                                                        }
                                                    }}
                                                    className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100"
                                                    title="Lihat gambar aset"
                                                >
                                                    {asset.images[0] ? (
                                                        <img
                                                            src={asset.images[0]}
                                                            alt={asset.name}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <Icon
                                                            name="image"
                                                            size={18}
                                                            className="mx-auto text-neutral-400"
                                                        />
                                                    )}
                                                </button>

                                                <div>
                                                    <p className="font-semibold text-neutral-900">
                                                        {asset.name}
                                                    </p>

                                                    <p className="mt-1 text-[10px] text-neutral-400">
                                                        ID: {asset.id}
                                                    </p>
                                                    <p className="mt-1 text-xs text-neutral-400">
                                                        {asset.code}
                                                    </p>
                                                    <p className="mt-1 text-[10px] text-neutral-400">
                                                        RFID: {asset.rfidCode}
                                                    </p>

                                                    {asset.images.length > 0 && (
                                                        <p className="mt-1 text-[10px] text-neutral-400">
                                                            {asset.images.length} gambar
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-5 py-4">
                                            <span className="rounded-lg bg-neutral-100 px-2.5 py-1.5 text-xs font-medium text-neutral-600">
                                                {asset.category}
                                            </span>
                                        </td>

                                        <td className="max-w-[380px] whitespace-pre-wrap break-words px-5 py-4 text-xs leading-5 text-neutral-600">
                                            <div className="space-y-1">
                                                <p className="font-semibold text-neutral-800">
                                                    {asset.location?.code || '-'} · {asset.location?.name || getLocationName(asset.locationId)}
                                                </p>
                                                <p>ID: {asset.locationId || '-'}</p>
                                                <p>Jenis: {asset.location?.type || '-'} · Area: {asset.location?.area || '-'}</p>
                                                <p>Alamat: {asset.location?.address || '-'}</p>
                                                <p>Penanggung jawab: {asset.location?.responsible || '-'} · Telepon: {asset.location?.phone || '-'}</p>
                                                <p>Deskripsi: {asset.location?.description || '-'}</p>
                                                <p>Dibuat: {asset.location?.createdAt || '-'} · Diperbarui: {asset.location?.updatedAt || '-'}</p>
                                                <button
                                                    type="button"
                                                    disabled={!asset.location?.images.length}
                                                    onClick={() => {
                                                        if (asset.location?.images.length) {
                                                            setImagePreview({
                                                                images: asset.location.images,
                                                                index: 0,
                                                                entityName: asset.location.name,
                                                            });
                                                        }
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-600 disabled:cursor-default"
                                                >
                                                    <Icon name="image" size={12} />
                                                    {asset.location?.images.length ?? 0} foto lokasi
                                                </button>
                                            </div>
                                        </td>

                                        <td className="max-w-[480px] whitespace-pre-wrap break-words px-5 py-4 text-xs leading-5 text-neutral-600">
                                            {asset.source ? (
                                                <div className="space-y-1">
                                                    <p className="font-semibold text-neutral-800">
                                                        ID: {asset.source.id} · {asset.source.code} · {asset.source.name}
                                                    </p>
                                                    <p>Jenis sumber: {asset.source.kind || '-'} · RFID: {asset.rfidCode || '-'}</p>
                                                    <p>ID lokasi sumber: {asset.source.locationId || '-'}</p>
                                                    {asset.category === 'Barang' ? (
                                                        <>
                                                            <p>Merek: {asset.source.brand || '-'} · Model: {asset.source.model || '-'}</p>
                                                            <p>Spesifikasi: {asset.source.specification || '-'}</p>
                                                            <p>Satuan: {asset.source.unit || '-'} · Status barang: {asset.source.status || '-'}</p>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <p>Lantai: {asset.source.floor || '-'} · Nomor ruangan: {asset.source.roomNumber || '-'}</p>
                                                            <p>Kapasitas: {asset.source.capacity} orang · Luas: {asset.source.area} m²</p>
                                                            <p>Fasilitas: {asset.source.facilities.join(', ') || '-'}</p>
                                                        </>
                                                    )}
                                                    <p>Penanggung jawab: {asset.source.responsiblePerson || '-'}</p>
                                                    <p>Deskripsi sumber: {asset.source.description || '-'}</p>
                                                    <p>Dibuat: {asset.source.createdAt || '-'} · Diperbarui: {asset.source.updatedAt || '-'}</p>
                                                    <button
                                                        type="button"
                                                        disabled={!asset.source.images.length}
                                                        onClick={() => {
                                                            if (asset.source?.images.length) {
                                                                setImagePreview({
                                                                    images: asset.source.images,
                                                                    index: 0,
                                                                    entityName: asset.source?.name ?? asset.name,
                                                                });
                                                            }
                                                        }}
                                                        className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-600 disabled:cursor-default"
                                                    >
                                                        <Icon name="image" size={12} />
                                                        {asset.source.images.length} foto sumber
                                                    </button>
                                                </div>
                                            ) : (
                                                <span>Sumber data tidak ditemukan.</span>
                                            )}
                                        </td>

                                        <td className="px-5 py-4 text-neutral-700">
                                            {asset.quantity}
                                        </td>

                                        <td className="px-5 py-4">
                                            <span
                                                className={`text-xs font-medium ${conditionStyles[asset.condition]}`}
                                            >
                                                {asset.condition}
                                            </span>
                                        </td>

                                        <td className="px-5 py-4">
                                            <span
                                                className={`inline-flex rounded-lg px-2.5 py-1.5 text-xs font-medium ${statusStyles[asset.status]}`}
                                            >
                                                {asset.status}
                                            </span>
                                        </td>

                                        <td className="whitespace-nowrap px-5 py-4 text-xs text-neutral-600">
                                            {formatDate(asset.acquisitionDate)}
                                        </td>

                                        <td className="whitespace-nowrap px-5 py-4 text-xs text-neutral-600">
                                            {formatCurrency(asset.price)}
                                        </td>

                                        <td className="whitespace-pre-wrap px-5 py-4 text-xs text-neutral-600">
                                            {asset.fundingSource || '-'}
                                        </td>

                                        <td className="max-w-[300px] whitespace-pre-wrap break-words px-5 py-4 text-xs leading-5 text-neutral-600">
                                            {asset.description || '-'}
                                        </td>

                                        <td className="whitespace-nowrap px-5 py-4 text-xs text-neutral-600">
                                            {asset.createdAt || '-'}
                                        </td>

                                        <td className="whitespace-nowrap px-5 py-4 text-xs text-neutral-600">
                                            {asset.updatedAt || '-'}
                                        </td>

                                        <td className="px-5 py-4">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    type="button"
                                                    title="Detail"
                                                    onClick={() => setDetailAsset(asset)}
                                                    className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                                                >
                                                    <Icon name="eye" size={16} />
                                                </button>

                                                <button
                                                    type="button"
                                                    title="Edit"
                                                    onClick={() => openEditModal(asset)}
                                                    className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                                                >
                                                    <Icon name="pencil" size={16} />
                                                </button>

                                                <button
                                                    type="button"
                                                    title="Duplikat"
                                                    aria-label={`Duplikat aset ${asset.name}`}
                                                    onClick={() => duplicateAsset(asset)}
                                                    className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                                                >
                                                    <Icon name="copy" size={16} />
                                                </button>

                                                <button
                                                    type="button"
                                                    title="Hapus"
                                                    onClick={() => setDeleteId(asset.id)}
                                                    className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                                                >
                                                    <Icon name="trash-2" size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}

                                {paginatedAssets.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={14}
                                            className="px-5 py-14 text-center"
                                        >
                                            <Icon
                                                name="package"
                                                size={30}
                                                className="mx-auto mb-3 text-neutral-300"
                                            />

                                            <p className="font-semibold text-neutral-700">
                                                {loading
                                                    ? 'Memuat data aset...'
                                                    : 'Aset tidak ditemukan'}
                                            </p>

                                            {!loading && (
                                                <p className="mt-1 text-xs text-neutral-400">
                                                    Ubah kata kunci atau filter pencarian.
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
                            {filteredAssets.length > 0
                                ? (safeCurrentPage - 1) * PER_PAGE + 1
                                : 0}{' '}
                            -{' '}
                            {Math.min(
                                safeCurrentPage * PER_PAGE,
                                filteredAssets.length,
                            )}{' '}
                            dari {filteredAssets.length} aset
                        </p>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={safeCurrentPage === 1}
                                onClick={() =>
                                    setCurrentPage((page) => Math.max(1, page - 1))
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
                    Foto aset mengikuti foto sumber barang atau ruangan yang dipilih.
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
                        onSubmit={saveAsset}
                        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                    >
                        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 sm:px-7">
                            <div>
                                <h2 className="text-lg font-bold text-neutral-950">
                                    {editingId !== null
                                        ? 'Edit Data Aset'
                                        : 'Tambah Aset Baru'}
                                </h2>

                                <p className="mt-1 text-xs text-neutral-500">
                                    Lengkapi informasi aset fakultas.
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

                        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-7">
                            {/* CATEGORY */}
                            <section className="space-y-3">
                                <div>
                                    <h3 className="text-sm font-bold text-neutral-900">
                                        Kategori Aset
                                    </h3>

                                    <p className="mt-1 text-xs text-neutral-500">
                                        Tentukan jenis aset yang akan didaftarkan.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    {(['Barang', 'Ruangan'] as AssetCategory[]).map(
                                        (category) => (
                                            <button
                                                key={category}
                                                type="button"
                                                onClick={() =>
                                                    handleCategoryChange(category)
                                                }
                                                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                                                    form.category === category
                                                        ? 'border-neutral-950 bg-neutral-50 ring-1 ring-neutral-950'
                                                        : 'border-neutral-200 hover:border-neutral-400'
                                                }`}
                                            >
                                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100">
                                                    <Icon
                                                        name={
                                                            category === 'Barang'
                                                                ? 'package'
                                                                : 'building'
                                                        }
                                                        size={19}
                                                    />
                                                </span>

                                                <span>
                                                    <span className="block text-sm font-semibold text-neutral-900">
                                                        {category}
                                                    </span>

                                                    <span className="mt-1 block text-[11px] text-neutral-500">
                                                        {category === 'Barang'
                                                            ? 'Aset berupa benda'
                                                            : 'Aset berupa ruangan'}
                                                    </span>
                                                </span>
                                            </button>
                                        ),
                                    )}
                                </div>
                            </section>

                            {/* MASTER DATA */}
                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                    Referensi Data Master
                                </h3>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    {form.category === 'Barang' ? (
                                        <Field label="Pilih Barang" required>
                                            <select
                                                required
                                                value={form.itemId}
                                                disabled={items.length === 0}
                                                onChange={(event) =>
                                                    handleMasterSelection(
                                                        event.target.value,
                                                    )
                                                }
                                                className={inputClass}
                                            >
                                                <option value="">
                                                    {items.length === 0
                                                        ? 'Belum ada data barang'
                                                        : 'Pilih barang'}
                                                </option>

                                                {items.map((item) => (
                                                    <option
                                                        key={item.id}
                                                        value={item.id}
                                                    >
                                                        {item.code} — {item.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>
                                    ) : (
                                        <Field label="Pilih Ruangan" required>
                                            <select
                                                required
                                                value={form.roomId}
                                                disabled={rooms.length === 0}
                                                onChange={(event) =>
                                                    handleMasterSelection(
                                                        event.target.value,
                                                    )
                                                }
                                                className={inputClass}
                                            >
                                                <option value="">
                                                    {rooms.length === 0
                                                        ? 'Belum ada data ruangan'
                                                        : 'Pilih ruangan'}
                                                </option>

                                                {rooms.map((room) => (
                                                    <option
                                                        key={room.id}
                                                        value={room.id}
                                                    >
                                                        {room.code} — {room.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>
                                    )}

                                    <Field label="Lokasi Sumber">
                                        <input
                                            readOnly
                                            value={getLocationName(form.locationId)}
                                            className={`${inputClass} bg-neutral-50`}
                                            placeholder="Otomatis dari data barang/ruangan"
                                        />
                                    </Field>

                                    <Field label="Kode RFID Sumber">
                                        <input
                                            readOnly
                                            value={
                                                (form.category === 'Barang'
                                                    ? items.find(
                                                          (item) =>
                                                              item.id === form.itemId,
                                                      )
                                                    : rooms.find(
                                                          (room) =>
                                                              room.id === form.roomId,
                                                      )
                                                )?.rfidCode ?? ''
                                            }
                                            className={`${inputClass} bg-neutral-50`}
                                            placeholder="Otomatis dari data barang/ruangan"
                                        />
                                    </Field>
                                </div>
                            </section>

                            {/* ASSET INFORMATION */}
                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                    Informasi Aset
                                </h3>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Kode Aset" required>
                                        <input
                                            required
                                            value={form.code}
                                            onChange={(event) =>
                                                updateForm('code', event.target.value)
                                            }
                                            className={inputClass}
                                            placeholder="Contoh: FAMS-BRG-001"
                                        />
                                    </Field>

                                    <div className="space-y-3 sm:col-span-2">
                                        <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:flex-row sm:items-center">
                                            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-white">
                                                {form.images[0] ? (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setImagePreview({
                                                                images: form.images,
                                                                index: 0,
                                                                entityName: form.name || 'Aset',
                                                            })
                                                        }
                                                        className="group relative h-full w-full cursor-zoom-in"
                                                        title="Lihat foto aset"
                                                    >
                                                        <img
                                                            src={form.images[0]}
                                                            alt="Preview foto aset"
                                                            className="h-full w-full object-cover"
                                                        />
                                                        <span className="absolute inset-0 flex items-center justify-center bg-neutral-950/0 text-white opacity-0 transition-all duration-200 group-hover:bg-neutral-950/35 group-hover:opacity-100">
                                                            <Icon name="eye" size={22} />
                                                        </span>
                                                    </button>
                                                ) : (
                                                    <Icon
                                                        name="image"
                                                        size={32}
                                                        className="text-neutral-300"
                                                    />
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-sm font-semibold text-neutral-900">
                                                        Foto Sumber Aset
                                                    </p>
                                                    <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-neutral-500">
                                                        {form.images.length} foto
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs leading-5 text-neutral-500">
                                                    Foto mengikuti dokumentasi pada data barang atau ruangan yang dipilih.
                                                </p>
                                            </div>
                                        </div>

                                        {form.images.length > 0 && (
                                            <div className="flex flex-wrap gap-3">
                                                {form.images.map((image, index) => (
                                                    <div
                                                        key={`${image}-${index}`}
                                                        className="relative h-16 w-16 overflow-hidden rounded-lg border border-neutral-200 bg-white"
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setImagePreview({
                                                                    images: form.images,
                                                                    index,
                                                                    entityName: form.name || 'Aset',
                                                                })
                                                            }
                                                            className="h-full w-full cursor-zoom-in"
                                                            title={`Lihat foto ${index + 1}`}
                                                        >
                                                            <img
                                                                src={image}
                                                                alt={`Foto aset ${index + 1}`}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <Field label="Nama Aset" required>
                                        <input
                                            required
                                            readOnly
                                            value={form.name}
                                            className={`${inputClass} bg-neutral-50`}
                                            placeholder="Otomatis dari data master"
                                        />
                                    </Field>

                                    <Field label="Jumlah Unit">
                                        <input
                                            type="number"
                                            min="1"
                                            required
                                            disabled={form.category === 'Ruangan'}
                                            value={form.category === 'Ruangan' ? '1' : form.quantity}
                                            onChange={(event) =>
                                                updateForm(
                                                    'quantity',
                                                    event.target.value,
                                                )
                                            }
                                            className={inputClass}
                                        />
                                    </Field>

                                    <Field label="Tanggal Perolehan">
                                        <input
                                            type="date"
                                            value={form.acquisitionDate}
                                            onChange={(event) =>
                                                updateForm(
                                                    'acquisitionDate',
                                                    event.target.value,
                                                )
                                            }
                                            className={inputClass}
                                        />
                                    </Field>

                                    <Field label="Kondisi Aset">
                                        <select
                                            value={form.condition}
                                            onChange={(event) =>
                                                updateForm(
                                                    'condition',
                                                    event.target.value as AssetCondition,
                                                )
                                            }
                                            className={inputClass}
                                        >
                                            <option>Baik</option>
                                            <option>Rusak Ringan</option>
                                            <option>Rusak Berat</option>
                                        </select>
                                    </Field>

                                    <Field label="Status Ketersediaan">
                                        <select
                                            value={form.status}
                                            onChange={(event) =>
                                                updateForm(
                                                    'status',
                                                    event.target.value as AssetStatus,
                                                )
                                            }
                                            className={inputClass}
                                        >
                                            <option>Tersedia</option>
                                            <option>Diproses Peminjam</option>
                                            <option>Dipinjam</option>
                                            <option>Diproses Pengembalian</option>
                                            <option>Maintenance</option>
                                            <option>Tidak Aktif</option>
                                        </select>
                                    </Field>

                                    <Field label="Harga Perolehan (Rp)">
                                        <input
                                            type="number"
                                            min="0"
                                            value={form.price}
                                            onChange={(event) =>
                                                updateForm(
                                                    'price',
                                                    event.target.value,
                                                )
                                            }
                                            className={inputClass}
                                            placeholder="Contoh: 5000000"
                                        />
                                    </Field>

                                    <Field label="Sumber Dana">
                                        <select
                                            value={form.fundingSource}
                                            onChange={(event) =>
                                                updateForm(
                                                    'fundingSource',
                                                    event.target.value,
                                                )
                                            }
                                            className={inputClass}
                                        >
                                            <option>APBN</option>
                                            <option>APBD</option>
                                            <option>Hibah</option>
                                            <option>Mandiri</option>
                                            <option>Lainnya</option>
                                        </select>
                                    </Field>
                                </div>

                                <Field label="Deskripsi / Keterangan">
                                    <textarea
                                        rows={3}
                                        value={form.description}
                                        onChange={(event) =>
                                            updateForm(
                                                'description',
                                                event.target.value,
                                            )
                                        }
                                        className={inputClass}
                                        placeholder="Tambahkan informasi aset..."
                                    />
                                </Field>
                            </section>

                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-xl border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
                            >
                                Batal
                            </button>

                            <button
                                type="submit"
                                className="rounded-xl bg-neutral-950 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-800"
                            >
                                {editingId !== null
                                    ? 'Simpan Perubahan'
                                    : 'Simpan Aset'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* DETAIL MODAL */}
            {detailAsset && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setDetailAsset(null);
                        }
                    }}
                >
                    <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
                            <div>
                                <h2 className="font-bold text-neutral-950">
                                    Detail Aset
                                </h2>

                                <p className="mt-1 text-xs text-neutral-500">
                                    {detailAsset.code}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setDetailAsset(null)}
                                className="rounded-xl p-2 hover:bg-neutral-100"
                            >
                                <Icon name="x" size={19} />
                            </button>
                        </div>

                        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-6">
                            {/* DETAIL IMAGES */}
                            {detailAsset.images.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-neutral-700">
                                        Foto Aset ({detailAsset.images.length})
                                    </p>

                                    <div className="grid grid-cols-3 gap-2">
                                        {detailAsset.images.map((image, index) => (
                                            <button
                                                key={index}
                                                type="button"
                                                onClick={() =>
                                                    setImagePreview({
                                                        images: detailAsset.images,
                                                        index,
                                                        entityName: detailAsset.name,
                                                    })
                                                }
                                                className="aspect-square overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100"
                                            >
                                                <img
                                                    src={image}
                                                    alt={`Foto ${index + 1} ${detailAsset.name}`}
                                                    className="h-full w-full object-cover transition hover:scale-105"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <p className="text-xs text-neutral-500">
                                    Nama Aset
                                </p>

                                <h3 className="mt-1 text-xl font-bold text-neutral-950">
                                    {detailAsset.name}
                                </h3>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    ['Kategori', detailAsset.category],
                                    ['Kode RFID', detailAsset.rfidCode],
                                    ['Lokasi', getLocationName(detailAsset.locationId)],
                                    ['Jumlah', `${detailAsset.quantity} unit`],
                                    ['Kondisi', detailAsset.condition],
                                    [
                                        'Status Ketersediaan',
                                        detailAsset.status,
                                    ],
                                    ['Perolehan', formatDate(detailAsset.acquisitionDate)],
                                    ['Harga', formatCurrency(detailAsset.price)],
                                    ['Sumber Dana', detailAsset.fundingSource],
                                ].map(([label, value]) => (
                                    <div
                                        key={label}
                                        className="rounded-xl bg-neutral-50 p-3"
                                    >
                                        <p className="text-[11px] text-neutral-500">
                                            {label}
                                        </p>

                                        <p className="mt-1 text-sm font-semibold text-neutral-800">
                                            {value || '-'}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div>
                                <p className="text-xs text-neutral-500">
                                    Deskripsi
                                </p>

                                <p className="mt-1 text-sm leading-6 text-neutral-700">
                                    {detailAsset.description ||
                                        'Tidak ada deskripsi.'}
                                </p>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const asset = detailAsset;
                                        setDetailAsset(null);
                                        openEditModal(asset);
                                    }}
                                    className="rounded-xl bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white"
                                >
                                    Edit Aset
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ImagePreviewModal
                preview={imagePreview}
                heading="Preview Foto Aset"
                onClose={() => setImagePreview(null)}
                onIndexChange={(index) =>
                    setImagePreview((current) =>
                        current ? { ...current, index } : current,
                    )
                }
            />

            {/* DELETE CONFIRMATION */}
            {deleteId !== null && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100">
                            <Icon name="trash-2" size={21} />
                        </div>

                        <h2 className="text-lg font-bold text-neutral-950">
                            Hapus aset?
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-neutral-500">
                            Data aset yang dihapus akan hilang dari daftar
                            tampilan ini.
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
        </DashboardLayout>
    );
}
