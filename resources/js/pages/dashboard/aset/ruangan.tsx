
import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
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
import { copyStoredImage } from '../../../lib/image-file';

type RoomType =
    | 'Ruang Kelas'
    | 'Laboratorium'
    | 'Ruang Rapat'
    | 'Ruang Dosen'
    | 'Ruang Administrasi'
    | 'Lainnya';

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

type Room = {
    id: string;
    code: string;
    name: string;
    type: RoomType;
    locationId: string;
    location: LocationSnapshot | null;
    floor: string;
    roomNumber: string;
    rfidCode: string;
    capacity: number;
    area: number;
    responsiblePerson: string;
    facilities: string[];
    description: string;
    images: string[];
    createdAt: string;
    updatedAt: string;
};

type RoomFormImage = {
    src: string;
    name: string;
    file?: File;
};

type LocationOption = {
    id: string;
    name: string;
};

type RoomForm = {
    code: string;
    name: string;
    type: RoomType;
    locationId: string;
    floor: string;
    roomNumber: string;
    rfidCode: string;
    capacity: string;
    area: string;
    responsiblePerson: string;
    facilities: string;
    description: string;
    images: RoomFormImage[];
};

const MAX_IMAGES = 10;
const PER_PAGE = 5;

const roomTypeStyles: Record<RoomType, string> = {
    'Ruang Kelas': 'bg-neutral-100 text-neutral-800',
    Laboratorium: 'bg-neutral-200 text-neutral-800',
    'Ruang Rapat': 'bg-neutral-300 text-neutral-800',
    'Ruang Dosen': 'bg-neutral-100 text-neutral-700',
    'Ruang Administrasi': 'bg-neutral-200 text-neutral-700',
    Lainnya: 'bg-neutral-100 text-neutral-600',
};

const emptyForm: RoomForm = {
    code: '',
    name: '',
    type: 'Ruang Kelas',
    locationId: '',
    floor: '',
    roomNumber: '',
    rfidCode: '',
    capacity: '',
    area: '',
    responsiblePerson: '',
    facilities: '',
    description: '',
    images: [],
};

const roomTypes: RoomType[] = [
    'Ruang Kelas',
    'Laboratorium',
    'Ruang Rapat',
    'Ruang Dosen',
    'Ruang Administrasi',
    'Lainnya',
];

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

export default function DataRuangan() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [locations, setLocations] = useState<LocationOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('Semua');
    const [locationFilter, setLocationFilter] = useState('Semua');
    const [currentPage, setCurrentPage] = useState(1);

    const [modalOpen, setModalOpen] = useState(false);
    const [detailRoom, setDetailRoom] = useState<Room | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<RoomForm>(emptyForm);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const [imagePreview, setImagePreview] =
        useState<ImagePreviewState | null>(null);

    useEffect(() => {
        let active = true;
        Promise.all([
            managementRequest<{ rooms: Room[] }>('/api/admin/rooms'),
            managementRequest<{ locations: LocationOption[] }>(
                '/api/admin/locations',
            ),
        ])
            .then(([roomResult, locationResult]) => {
                if (!active) return;
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

    const filteredRooms = useMemo(() => {
        return rooms.filter((room) => {
            const keyword = search.toLowerCase().trim();

            const matchesSearch = [
                room.name,
                room.code,
                room.type,
                room.rfidCode,
                room.floor,
                room.roomNumber,
                room.responsiblePerson,
                room.facilities.join(' '),
                room.description,
                getLocationName(room.locationId),
            ].some((value) => value.toLowerCase().includes(keyword));

            const matchesType =
                typeFilter === 'Semua' || room.type === typeFilter;

            const matchesLocation =
                locationFilter === 'Semua' ||
                room.locationId === locationFilter;

            return matchesSearch && matchesType && matchesLocation;
        });
    }, [rooms, search, typeFilter, locationFilter]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredRooms.length / PER_PAGE),
    );

    const safeCurrentPage = Math.min(currentPage, totalPages);

    const paginatedRooms = filteredRooms.slice(
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
            label: 'Total Ruangan',
            value: rooms.length,
            icon: 'building',
            iconStyle: 'bg-neutral-100 text-neutral-800',
        },
        {
            label: 'Jenis Ruangan',
            value: new Set(rooms.map((room) => room.type)).size,
            icon: 'tag',
            iconStyle: 'bg-neutral-200 text-neutral-800',
        },
        {
            label: 'Total Kapasitas',
            value: rooms.reduce((total, room) => total + room.capacity, 0),
            icon: 'users',
            iconStyle: 'bg-neutral-100 text-neutral-700',
        },
        {
            label: 'Total Dokumentasi',
            value: rooms.reduce(
                (total, room) => total + room.images.length,
                0,
            ),
            icon: 'image',
            iconStyle: 'bg-neutral-200 text-neutral-700',
        },
    ];

    function getLocationName(id: string) {
        return (
            locations.find((location) => location.id === id)?.name ?? '-'
        );
    }

    function openCreateModal() {
        setEditingId(null);
        setForm({
            ...emptyForm,
            code: `FAMS-RNG-${Date.now()}`,
        });
        setModalOpen(true);
    }

    async function duplicateRoom(room: Room) {
        let images: RoomFormImage[];
        try {
            images = await Promise.all(
                room.images.map(async (src, index) => {
                    const file = await copyStoredImage(
                        src,
                        `${room.code}-copy-${index + 1}`,
                    );
                    return {
                        src: await readImage(file),
                        name: file.name,
                        file,
                    };
                }),
            );
        } catch (error: unknown) {
            alert(managementErrorMessage(error));
            return;
        }

        setEditingId(null);
        setForm({
            code: nextNumberedUniqueValue(
                room.code,
                rooms.map((item) => item.code),
                40,
            ),
            name: nextNumberedUniqueValue(
                room.name,
                rooms.map((item) => item.name),
            ),
            type: room.type,
            locationId: room.locationId,
            floor: room.floor,
            roomNumber: nextNumberedUniqueValue(
                room.roomNumber,
                rooms
                    .filter((item) => item.locationId === room.locationId)
                    .map((item) => item.roomNumber),
                40,
            ),
            rfidCode: '',
            capacity: room.capacity.toString(),
            area: room.area.toString(),
            responsiblePerson: room.responsiblePerson,
            facilities: room.facilities.join(', '),
            description: room.description,
            images,
        });
        setModalOpen(true);
    }

    function openEditModal(room: Room) {
        setEditingId(room.id);

        setForm({
            code: room.code,
            name: room.name,
            type: room.type,
            locationId: room.locationId,
            floor: room.floor,
            roomNumber: room.roomNumber,
            rfidCode: room.rfidCode,
            capacity: room.capacity.toString(),
            area: room.area.toString(),
            responsiblePerson: room.responsiblePerson,
            facilities: room.facilities.join(', '),
            description: room.description,
            images: room.images.map((src, index) => ({
                src,
                name: `Foto ${index + 1}`,
            })),
        });

        setModalOpen(true);
    }

    function updateForm<K extends keyof RoomForm>(
        key: K,
        value: RoomForm[K],
    ) {
        setForm((previous) => ({
            ...previous,
            [key]: value,
        }));
    }

    function readImage(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                } else {
                    reject(new Error('Format gambar tidak valid.'));
                }
            };

            reader.onerror = () => reject(new Error('Gagal membaca gambar.'));
            reader.readAsDataURL(file);
        });
    }

    async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';

        if (files.length === 0) return;

        const remainingSlots = MAX_IMAGES - form.images.length;

        if (remainingSlots <= 0) {
            alert(`Maksimal ${MAX_IMAGES} gambar untuk satu ruangan.`);
            return;
        }

        const validFiles = files.filter(
            (file) =>
                ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
                file.size > 0 &&
                file.size <= 5 * 1024 * 1024,
        );

        if (validFiles.length !== files.length) {
            alert('Foto harus JPG, PNG, atau WEBP dan maksimal 5 MB per file.');
        }

        const selectedFiles = validFiles.slice(0, remainingSlots);

        if (selectedFiles.length === 0) return;

        if (validFiles.length > remainingSlots) {
            alert(
                `Hanya ${remainingSlots} gambar yang dapat ditambahkan. Maksimal ${MAX_IMAGES} gambar.`,
            );
        }

        try {
            const imageResults = await Promise.all(
                selectedFiles.map(async (file) => ({
                    src: await readImage(file),
                    name: file.name,
                    file,
                })),
            );

            setForm((previous) => ({
                ...previous,
                images: [...previous.images, ...imageResults].slice(0, MAX_IMAGES),
            }));
        } catch (error: unknown) {
            alert(
                error instanceof Error
                    ? error.message
                    : 'Ada gambar yang gagal dibaca. Silakan coba kembali.',
            );
        }
    }

    function removeImage(index: number) {
        setForm((previous) => ({
            ...previous,
            images: previous.images.filter(
                (_, imageIndex) => imageIndex !== index,
            ),
        }));
    }

    async function loadRooms() {
        const result = await managementRequest<{ rooms: Room[] }>(
            '/api/admin/rooms',
        );
        setRooms(result.rooms);
    }

    async function saveRoom(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!form.responsiblePerson.trim()) {
            alert('Penanggung jawab ruangan wajib diisi.');
            return;
        }

        if (!form.rfidCode.trim()) {
            alert('Kode RFID ruangan wajib diisi.');
            return;
        }

        const codeExists = rooms.some(
            (room) =>
                room.id !== editingId &&
                room.code.toLowerCase() === form.code.trim().toLowerCase(),
        );
        if (codeExists) {
            alert('Kode ruangan sudah digunakan. Gunakan kode yang berbeda.');
            return;
        }

        const rfidCodeExists = rooms.some(
            (room) =>
                room.id !== editingId &&
                room.rfidCode.toLowerCase() ===
                    form.rfidCode.trim().toLowerCase(),
        );
        if (rfidCodeExists) {
            alert('Kode RFID sudah terdaftar pada ruangan lain.');
            return;
        }

        const roomNumberExists = rooms.some(
            (room) =>
                room.id !== editingId &&
                room.locationId === form.locationId &&
                room.roomNumber.trim().toLowerCase() ===
                    form.roomNumber.trim().toLowerCase(),
        );

        if (roomNumberExists) {
            alert('Nomor ruangan tersebut sudah digunakan pada gedung ini.');
            return;
        }

        const data = new FormData();
        data.set('code', form.code.trim());
        data.set('name', form.name.trim());
        data.set('type', form.type);
        data.set('locationId', form.locationId);
        data.set('floor', form.floor.trim());
        data.set('roomNumber', form.roomNumber.trim());
        data.set('rfidCode', form.rfidCode.trim());
        data.set('capacity', form.capacity);
        data.set('area', form.area);
        data.set('responsiblePerson', form.responsiblePerson.trim());
        data.set('facilities', form.facilities);
        data.set('description', form.description.trim());
        data.set(
            'retainedImages',
            JSON.stringify(
                form.images
                    .filter((image) => !image.file)
                    .map((image) => image.src),
            ),
        );
        form.images.forEach((image) => {
            if (image.file) data.append('images', image.file);
        });

        setSaving(true);
        try {
            await managementRequest<{ room: Room }>(
                editingId
                    ? `/api/admin/rooms/${editingId}`
                    : '/api/admin/rooms',
                {
                    method: editingId ? 'PATCH' : 'POST',
                    body: data,
                },
            );
            await loadRooms();
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
                `/api/admin/rooms/${deleteId}`,
                { method: 'DELETE' },
            );
            await loadRooms();
            setDeleteId(null);
            setDetailRoom(null);
        } catch (error: unknown) {
            alert(managementErrorMessage(error));
        }
    }

    function closeModal() {
        setModalOpen(false);
        setEditingId(null);
        setForm(emptyForm);
    }

    return (
        <DashboardLayout>
            <div className="w-full min-w-0 space-y-6">
                <AssetManagementBanner
                    title="Kelola Data Ruangan."
                    description="Atur informasi ruangan, kapasitas, fasilitas, dan dokumentasi untuk mendukung inventaris fakultas."
                    contextLabel="Data ruangan"
                    icon="building"
                    statusLabel="Fasilitas terorganisir"
                    metrics={[
                        { label: 'Total ruangan', value: rooms.length },
                        {
                            label: 'Total kapasitas',
                            value: rooms.reduce(
                                (total, room) => total + room.capacity,
                                0,
                            ),
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
                                Data Ruangan
                            </span>
                        </div>

                        <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                            Data Ruangan
                        </h1>

                        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">
                            Kelola data master ruangan, informasi gedung,
                            kapasitas, fasilitas, dan dokumentasi ruangan
                            fakultas.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <ClearManagementDataButton
                            endpoint="/api/admin/rooms/clear"
                            dataLabel="ruangan"
                            warning="Data ruangan yang masih dipakai oleh aset tidak dapat dihapus. Bersihkan aset terkait terlebih dahulu."
                            onCleared={() => setRooms([])}
                        />
                        <button
                            type="button"
                            onClick={openCreateModal}
                            disabled={loading}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                        >
                            <Icon name="plus" size={17} />
                            Tambah Ruangan
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
                                Daftar Ruangan
                            </h2>
                            <p className="mt-1 text-xs text-neutral-500">
                                Seluruh data master ruangan yang terdaftar.
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
                                    placeholder="Cari kode, nama, RFID, atau nomor ruangan..."
                                    className={`${inputClass} pl-9 sm:w-64`}
                                />
                            </div>

                            <select
                                value={typeFilter}
                                onChange={(event) => {
                                    setTypeFilter(event.target.value);
                                    setCurrentPage(1);
                                }}
                                className={inputClass}
                            >
                                <option value="Semua">Semua Jenis</option>
                                {roomTypes.map((type) => (
                                    <option key={type} value={type}>
                                        {type}
                                    </option>
                                ))}
                            </select>

                            <select
                                value={locationFilter}
                                onChange={(event) => {
                                    setLocationFilter(event.target.value);
                                    setCurrentPage(1);
                                }}
                                className={inputClass}
                            >
                                <option value="Semua">Semua Gedung</option>
                                {locations.map((location) => (
                                    <option
                                        key={location.id}
                                        value={location.id}
                                    >
                                        {location.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[2600px] text-left text-sm">
                            <thead className="bg-neutral-50 text-xs text-neutral-500">
                                <tr>
                                    <th className="px-5 py-4 font-semibold">
                                        Ruangan
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Jenis
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Gedung / Lokasi
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Lantai
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Nomor Ruangan
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Kode RFID
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Kapasitas
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Luas
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Penanggung Jawab
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Fasilitas
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Deskripsi
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
                                {paginatedRooms.map((room) => (
                                    <tr
                                        key={room.id}
                                        className="transition hover:bg-neutral-50/70"
                                    >
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (room.images[0]) {
                                                            setImagePreview({
                                                                images: room.images,
                                                                index: 0,
                                                                entityName: room.name,
                                                            });
                                                        }
                                                    }}
                                                    className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100"
                                                    title="Lihat foto ruangan"
                                                >
                                                    {room.images[0] ? (
                                                        <img
                                                            src={room.images[0]}
                                                            alt={room.name}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <Icon
                                                            name="building"
                                                            size={18}
                                                            className="text-neutral-400"
                                                        />
                                                    )}
                                                </button>

                                                <div>
                                                    <p className="font-semibold text-neutral-900">
                                                        {room.name}
                                                    </p>
                                                    <p className="mt-1 text-xs text-neutral-400">
                                                        {room.code}
                                                    </p>
                                                    <p className="mt-1 text-[10px] text-neutral-400">
                                                        ID: {room.id}
                                                    </p>
                                                    <p className="mt-1 text-[10px] text-neutral-400">
                                                        {room.images.length} foto
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-5 py-4">
                                            <span className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${roomTypeStyles[room.type]}`}>
                                                {room.type}
                                            </span>
                                        </td>

                                        <td className="max-w-[360px] whitespace-pre-wrap break-words px-5 py-4 text-xs leading-5 text-neutral-600">
                                            <div className="space-y-1">
                                                <p className="font-semibold text-neutral-800">
                                                    {room.location?.code || '-'} · {room.location?.name || getLocationName(room.locationId)}
                                                </p>
                                                <p>ID: {room.locationId || '-'}</p>
                                                <p>Jenis: {room.location?.type || '-'} · Area: {room.location?.area || '-'}</p>
                                                <p>Alamat: {room.location?.address || '-'}</p>
                                                <p>Penanggung jawab: {room.location?.responsible || '-'} · Telepon: {room.location?.phone || '-'}</p>
                                                <p>Deskripsi: {room.location?.description || '-'}</p>
                                                <p>Dibuat: {room.location?.createdAt || '-'} · Diperbarui: {room.location?.updatedAt || '-'}</p>
                                                <button
                                                    type="button"
                                                    disabled={!room.location?.images.length}
                                                    onClick={() => {
                                                        if (room.location?.images.length) {
                                                            setImagePreview({
                                                                images: room.location.images,
                                                                index: 0,
                                                                entityName: room.location.name,
                                                            });
                                                        }
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-600 disabled:cursor-default"
                                                >
                                                    <Icon name="image" size={12} />
                                                    {room.location?.images.length ?? 0} foto lokasi
                                                </button>
                                            </div>
                                        </td>

                                        <td className="px-5 py-4 text-neutral-700">
                                            {room.floor}
                                        </td>

                                        <td className="px-5 py-4 text-neutral-700">
                                            {room.roomNumber}
                                        </td>

                                        <td className="px-5 py-4 text-xs text-neutral-600">
                                            {room.rfidCode}
                                        </td>

                                        <td className="px-5 py-4 text-neutral-700">
                                            {room.capacity} orang
                                        </td>

                                        <td className="px-5 py-4 text-neutral-700">
                                            {room.area} m²
                                        </td>

                                        <td className="whitespace-pre-wrap px-5 py-4 text-xs text-neutral-600">
                                            {room.responsiblePerson || '-'}
                                        </td>

                                        <td className="max-w-[240px] whitespace-pre-wrap break-words px-5 py-4 text-xs text-neutral-600">
                                            {room.facilities.join(', ') || '-'}
                                        </td>

                                        <td className="max-w-[260px] whitespace-pre-wrap break-words px-5 py-4 text-xs leading-5 text-neutral-600">
                                            {room.description || '-'}
                                        </td>

                                        <td className="whitespace-nowrap px-5 py-4 text-xs text-neutral-600">
                                            {room.createdAt || '-'}
                                        </td>

                                        <td className="whitespace-nowrap px-5 py-4 text-xs text-neutral-600">
                                            {room.updatedAt || '-'}
                                        </td>

                                        <td className="px-5 py-4">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    type="button"
                                                    title="Duplikasi"
                                                    aria-label={`Duplikasi ruangan ${room.name}`}
                                                    onClick={() =>
                                                        void duplicateRoom(room)
                                                    }
                                                    className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                                                >
                                                    <Icon name="copy" size={16} />
                                                </button>

                                                <button
                                                    type="button"
                                                    title="Detail"
                                                    onClick={() =>
                                                        setDetailRoom(room)
                                                    }
                                                    className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                                                >
                                                    <Icon name="eye" size={16} />
                                                </button>

                                                <button
                                                    type="button"
                                                    title="Edit"
                                                    onClick={() =>
                                                        openEditModal(room)
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
                                                        setDeleteId(room.id)
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

                                {paginatedRooms.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={14}
                                            className="px-5 py-14 text-center"
                                        >
                                            <Icon
                                                name="building"
                                                size={30}
                                                className="mx-auto mb-3 text-neutral-300"
                                            />

                                            <p className="font-semibold text-neutral-700">
                                                {loading
                                                    ? 'Memuat data ruangan...'
                                                    : 'Ruangan tidak ditemukan'}
                                            </p>

                                            {!loading && (
                                                <p className="mt-1 text-xs text-neutral-400">
                                                    Ubah kata kunci atau filter pencarian, atau tambahkan data ruangan.
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
                            {filteredRooms.length > 0
                                ? (safeCurrentPage - 1) * PER_PAGE + 1
                                : 0}{' '}
                            -{' '}
                            {Math.min(
                                safeCurrentPage * PER_PAGE,
                                filteredRooms.length,
                            )}{' '}
                            dari {filteredRooms.length} ruangan
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
                    Data ruangan dan foto tersimpan di database FAMS. Setiap ruangan
                    memiliki kode RFID unik untuk identifikasi perangkat ESP32.
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
                        onSubmit={saveRoom}
                        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                    >
                        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 sm:px-7">
                            <div>
                                <h2 className="text-lg font-bold text-neutral-950">
                                    {editingId !== null
                                        ? 'Edit Data Ruangan'
                                        : 'Tambah Ruangan Baru'}
                                </h2>

                                <p className="mt-1 text-xs text-neutral-500">
                                    Lengkapi informasi master ruangan fakultas.
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
                            {/* BASIC INFORMATION */}
                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                    Informasi Ruangan
                                </h3>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Kode Ruangan" required>
                                        <input
                                            required
                                            value={form.code}
                                            onChange={(event) =>
                                                updateForm(
                                                    'code',
                                                    event.target.value,
                                                )
                                            }
                                            className={inputClass}
                                            placeholder="Contoh: FAMS-RNG-001"
                                            maxLength={40}
                                        />
                                    </Field>

                                    <Field label="Nama Ruangan" required>
                                        <input
                                            required
                                            value={form.name}
                                            onChange={(event) =>
                                                updateForm(
                                                    'name',
                                                    event.target.value,
                                                )
                                            }
                                            className={inputClass}
                                            placeholder="Contoh: Laboratorium Komputer"
                                            maxLength={255}
                                        />
                                    </Field>

                                    <Field label="Jenis Ruangan" required>
                                        <select
                                            required
                                            value={form.type}
                                            onChange={(event) =>
                                                updateForm(
                                                    'type',
                                                    event.target.value as RoomType,
                                                )
                                            }
                                            className={inputClass}
                                        >
                                            {roomTypes.map((type) => (
                                                <option key={type} value={type}>
                                                    {type}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>

                                    <Field label="Gedung / Lokasi" required>
                                        <select
                                            required
                                            value={form.locationId}
                                            disabled={locations.length === 0}
                                            onChange={(event) =>
                                                updateForm(
                                                    'locationId',
                                                    event.target.value,
                                                )
                                            }
                                            className={inputClass}
                                        >
                                            <option value="">
                                                {locations.length === 0
                                                    ? 'Tambahkan lokasi terlebih dahulu'
                                                    : 'Pilih gedung'}
                                            </option>

                                            {locations.map((location) => (
                                                <option
                                                    key={location.id}
                                                    value={location.id}
                                                >
                                                    {location.name}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>

                                    <Field label="Lantai" required>
                                        <input
                                            required
                                            value={form.floor}
                                            onChange={(event) =>
                                                updateForm(
                                                    'floor',
                                                    event.target.value,
                                                )
                                            }
                                            className={inputClass}
                                            placeholder="Contoh: 2"
                                            maxLength={50}
                                        />
                                    </Field>

                                    <Field label="Nomor Ruangan" required>
                                        <input
                                            required
                                            value={form.roomNumber}
                                            onChange={(event) =>
                                                updateForm(
                                                    'roomNumber',
                                                    event.target.value,
                                                )
                                            }
                                            className={inputClass}
                                            placeholder="Contoh: 201"
                                            maxLength={40}
                                        />
                                    </Field>

                                    <Field label="Kode RFID (UID Tag)" required>
                                        <input
                                            required
                                            value={form.rfidCode}
                                            onChange={(event) =>
                                                updateForm(
                                                    'rfidCode',
                                                    event.target.value,
                                                )
                                            }
                                            className={inputClass}
                                            placeholder="Scan atau masukkan UID tag RFID"
                                            maxLength={100}
                                        />
                                        <p className="text-[11px] text-neutral-400">
                                            Kode ini harus sesuai dengan tag yang dipindai
                                            ESP32 dan unik untuk setiap ruangan.
                                        </p>
                                    </Field>
                                </div>
                            </section>

                            {/* ROOM CAPACITY */}
                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                    Kapasitas dan Penanggung Jawab
                                </h3>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Kapasitas (Orang)" required>
                                        <input
                                            type="number"
                                            min="1"
                                            required
                                            value={form.capacity}
                                            onChange={(event) =>
                                                updateForm(
                                                    'capacity',
                                                    event.target.value,
                                                )
                                            }
                                            className={inputClass}
                                            placeholder="Contoh: 30"
                                        />
                                    </Field>

                                    <Field label="Luas Ruangan (m²)">
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={form.area}
                                            onChange={(event) =>
                                                updateForm(
                                                    'area',
                                                    event.target.value,
                                                )
                                            }
                                            className={inputClass}
                                            placeholder="Contoh: 72"
                                        />
                                    </Field>

                                    <div className="sm:col-span-2">
                                        <Field label="Penanggung Jawab" required>
                                            <input
                                                required
                                                value={form.responsiblePerson}
                                                onChange={(event) =>
                                                    updateForm(
                                                        'responsiblePerson',
                                                        event.target.value,
                                                    )
                                                }
                                                className={inputClass}
                                                placeholder="Nama penanggung jawab ruangan"
                                            />
                                        </Field>
                                    </div>

                                    <div className="sm:col-span-2">
                                        <Field label="Fasilitas Ruangan">
                                            <input
                                                value={form.facilities}
                                                onChange={(event) =>
                                                    updateForm(
                                                        'facilities',
                                                        event.target.value,
                                                    )
                                                }
                                                className={inputClass}
                                                placeholder="Contoh: AC, Proyektor, Whiteboard, Komputer"
                                            />
                                            <p className="text-[11px] text-neutral-400">
                                                Pisahkan setiap fasilitas dengan
                                                tanda koma.
                                            </p>
                                        </Field>
                                    </div>
                                </div>
                            </section>

                            {/* ROOM IMAGES */}
                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                    Dokumentasi Ruangan
                                </h3>

                                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-white">
                                            {form.images[0] ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setImagePreview({
                                                            images: form.images.map(
                                                                (image) => image.src,
                                                            ),
                                                            imageNames:
                                                                form.images.map(
                                                                    (image) =>
                                                                        image.name,
                                                                ),
                                                            index: 0,
                                                            entityName: form.name || 'Ruangan',
                                                        })
                                                    }
                                                    className="h-full w-full cursor-zoom-in"
                                                >
                                                    <img
                                                        src={form.images[0].src}
                                                        alt="Preview ruangan"
                                                        className="h-full w-full object-cover"
                                                    />
                                                </button>
                                            ) : (
                                                <Icon
                                                    name="building"
                                                    size={32}
                                                    className="text-neutral-300"
                                                />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-semibold text-neutral-900">
                                                    Foto Ruangan
                                                </p>

                                                <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-neutral-500">
                                                    {form.images.length}/{MAX_IMAGES}{' '}
                                                    foto
                                                </span>
                                            </div>

                                            <p className="mt-1 text-xs leading-5 text-neutral-500">
                                                Unggah foto tampak depan,
                                                interior, dan fasilitas ruangan.
                                                Maksimal 10 foto.
                                            </p>

                                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                                {form.images.length < MAX_IMAGES && (
                                                    <label
                                                        htmlFor="room-images"
                                                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:border-neutral-950 hover:text-neutral-950"
                                                    >
                                                        <Icon
                                                            name="image-plus"
                                                            size={14}
                                                        />
                                                        Tambah Foto
                                                    </label>
                                                )}

                                                {form.images.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setForm((previous) => ({
                                                                ...previous,
                                                                images: [],
                                                            }))
                                                        }
                                                        className="text-xs font-medium text-neutral-500 transition hover:text-neutral-950"
                                                    >
                                                        Hapus semua foto
                                                    </button>
                                                )}
                                            </div>

                                            <input
                                                id="room-images"
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp"
                                                multiple
                                                className="sr-only"
                                                disabled={
                                                    form.images.length >=
                                                    MAX_IMAGES
                                                }
                                                onChange={handleImageUpload}
                                            />

                                            <p className="mt-2 text-[10px] text-neutral-400">
                                                Format JPG, PNG, atau WEBP, maksimal 5 MB per foto.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {form.images.length > 0 && (
                                    <div className="flex flex-wrap gap-3">
                                        {form.images.map((image, index) => (
                                            <div
                                                key={`${image.name}-${index}`}
                                                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-neutral-200 bg-white"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setImagePreview({
                                                            images: form.images.map(
                                                                (item) => item.src,
                                                            ),
                                                            imageNames:
                                                                form.images.map(
                                                                    (item) =>
                                                                        item.name,
                                                                ),
                                                            index,
                                                            entityName: form.name || 'Ruangan',
                                                        })
                                                    }
                                                    className="h-full w-full cursor-zoom-in"
                                                >
                                                    <img
                                                        src={image.src}
                                                        alt={`Foto ruangan ${index + 1}`}
                                                        className="h-full w-full object-cover"
                                                    />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        removeImage(index)
                                                    }
                                                    title="Hapus foto"
                                                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-neutral-800 shadow"
                                                >
                                                    <Icon name="x" size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            {/* DESCRIPTION */}
                            <section className="space-y-4">
                                <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold text-neutral-900">
                                    Keterangan
                                </h3>

                                <Field label="Deskripsi Ruangan">
                                    <textarea
                                        rows={4}
                                        value={form.description}
                                        onChange={(event) =>
                                            updateForm(
                                                'description',
                                                event.target.value,
                                            )
                                        }
                                        className={inputClass}
                                        placeholder="Tambahkan deskripsi atau informasi ruangan..."
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
                                disabled={saving}
                                className="rounded-xl bg-neutral-950 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60"
                            >
                                {saving
                                    ? 'Menyimpan...'
                                    : editingId !== null
                                    ? 'Simpan Perubahan'
                                    : 'Simpan Ruangan'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* DETAIL MODAL */}
            {detailRoom && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setDetailRoom(null);
                        }
                    }}
                >
                    <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
                            <div>
                                <h2 className="font-bold text-neutral-950">
                                    Detail Ruangan
                                </h2>

                                <p className="mt-1 text-xs text-neutral-500">
                                    {detailRoom.code}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setDetailRoom(null)}
                                className="rounded-xl p-2 hover:bg-neutral-100"
                            >
                                <Icon name="x" size={19} />
                            </button>
                        </div>

                        <div className="max-h-[75vh] space-y-5 overflow-y-auto p-6">
                            {/* DETAIL IMAGES */}
                            {detailRoom.images.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-neutral-700">
                                        Foto Ruangan ({detailRoom.images.length})
                                    </p>

                                    <div className="grid grid-cols-3 gap-2">
                                        {detailRoom.images.map((image, index) => (
                                            <button
                                                key={index}
                                                type="button"
                                                onClick={() =>
                                                    setImagePreview({
                                                        images: detailRoom.images,
                                                        index,
                                                        entityName: detailRoom.name,
                                                    })
                                                }
                                                className="aspect-square overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100"
                                            >
                                                <img
                                                    src={image}
                                                    alt={`Foto ${index + 1} ${detailRoom.name}`}
                                                    className="h-full w-full object-cover transition hover:scale-105"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <p className="text-xs text-neutral-500">
                                    Nama Ruangan
                                </p>

                                <h3 className="mt-1 text-xl font-bold text-neutral-950">
                                    {detailRoom.name}
                                </h3>

                                <span className={`mt-2 inline-flex rounded-lg px-2.5 py-1.5 text-xs font-medium ${roomTypeStyles[detailRoom.type]}`}>
                                    {detailRoom.type}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    [
                                        'Kode Ruangan',
                                        detailRoom.code,
                                    ],
                                    [
                                        'Gedung',
                                        getLocationName(detailRoom.locationId),
                                    ],
                                    [
                                        'Lantai',
                                        detailRoom.floor,
                                    ],
                                    [
                                        'Nomor Ruangan',
                                        detailRoom.roomNumber,
                                    ],
                                    ['Kode RFID', detailRoom.rfidCode],
                                    [
                                        'Kapasitas',
                                        `${detailRoom.capacity} orang`,
                                    ],
                                    [
                                        'Luas Ruangan',
                                        `${detailRoom.area} m²`,
                                    ],
                                    [
                                        'Penanggung Jawab',
                                        detailRoom.responsiblePerson || '-',
                                    ],
                                    [
                                        'Tanggal Dibuat',
                                        new Date(
                                            `${detailRoom.createdAt}T00:00:00`,
                                        ).toLocaleDateString('id-ID', {
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                        }),
                                    ],
                                ].map(([label, value]) => (
                                    <div
                                        key={label}
                                        className="rounded-xl bg-neutral-50 p-3"
                                    >
                                        <p className="text-[11px] text-neutral-500">
                                            {label}
                                        </p>

                                        <p className="mt-1 text-sm font-semibold text-neutral-800">
                                            {value}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div>
                                <p className="text-xs font-semibold text-neutral-700">
                                    Fasilitas Ruangan
                                </p>

                                {detailRoom.facilities.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {detailRoom.facilities.map(
                                            (facility) => (
                                                <span
                                                    key={facility}
                                                    className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700"
                                                >
                                                    {facility}
                                                </span>
                                            ),
                                        )}
                                    </div>
                                ) : (
                                    <p className="mt-1 text-sm text-neutral-500">
                                        Belum ada fasilitas.
                                    </p>
                                )}
                            </div>

                            <div>
                                <p className="text-xs text-neutral-500">
                                    Deskripsi
                                </p>

                                <p className="mt-1 text-sm leading-6 text-neutral-700">
                                    {detailRoom.description ||
                                        'Tidak ada deskripsi.'}
                                </p>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const room = detailRoom;
                                        setDetailRoom(null);
                                        openEditModal(room);
                                    }}
                                    className="rounded-xl bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white"
                                >
                                    Edit Ruangan
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ImagePreviewModal
                preview={imagePreview}
                heading="Preview Foto Ruangan"
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
                            Hapus ruangan?
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-neutral-500">
                            Data master ruangan yang dihapus akan hilang dari
                            daftar tampilan ini. Pastikan ruangan tersebut
                            tidak sedang digunakan oleh data aset.
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
