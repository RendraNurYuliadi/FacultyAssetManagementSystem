import 'server-only';
import { ObjectId, type Db } from 'mongodb';
import {
    getLocationDisplays,
    type LocationDisplay,
} from '@/lib/server/locations';

export type AssetCategory = 'Barang' | 'Ruangan';
export type AssetCondition = 'Baik' | 'Rusak Ringan' | 'Rusak Berat';
export type AssetStatus =
    | 'Tersedia'
    | 'Diproses Peminjam'
    | 'Dipinjam'
    | 'Diproses Pengembalian'
    | 'Maintenance'
    | 'Tidak Aktif';

export type AssetInput = {
    code: string;
    category: AssetCategory;
    itemId: string;
    roomId: string;
    sourceId: string;
    quantity: number;
    condition: AssetCondition;
    status: AssetStatus;
    acquisitionDate: string;
    price: number;
    fundingSource: string;
    description: string;
};

export type AssetDocument = {
    _id: ObjectId;
    code: string;
    category: AssetCategory;
    itemId?: string;
    roomId?: string;
    locationId?: string;
    name?: string;
    quantity: number;
    condition: AssetCondition;
    status: AssetStatus;
    acquisitionDate: string;
    price: number;
    fundingSource: string;
    description: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};

export type AssetSourceDocument = {
    _id: ObjectId;
    code?: string;
    name: string;
    locationId: string;
    rfidCode: string;
    images: string[];
    category?: string;
    type?: string;
    brand?: string;
    model?: string;
    specification?: string;
    unit?: string;
    responsiblePerson?: string;
    description?: string;
    status?: string;
    floor?: string;
    roomNumber?: string;
    capacity?: number;
    area?: number;
    facilities?: string[];
    createdAt?: Date | string;
    updatedAt?: Date | string;
};

const categories: AssetCategory[] = ['Barang', 'Ruangan'];
const conditions: AssetCondition[] = ['Baik', 'Rusak Ringan', 'Rusak Berat'];
const statuses: AssetStatus[] = [
    'Tersedia',
    'Diproses Peminjam',
    'Dipinjam',
    'Diproses Pengembalian',
    'Maintenance',
    'Tidak Aktif',
];
let assetDataModelMigration: Promise<void> | null = null;

export async function ensureAssetDataModel(db: Db) {
    if (!assetDataModelMigration) {
        assetDataModelMigration = Promise.all([
            db.collection('assets').updateMany(
                { status: 'Diajukan Peminjam' },
                {
                    $set: {
                        status: 'Diproses Peminjam',
                        updatedAt: new Date(),
                    },
                },
            ),
            db.collection('items').updateMany(
                { availabilityStatus: { $exists: true } },
                { $unset: { availabilityStatus: '' } },
            ),
            db.collection('rooms').updateMany(
                { availabilityStatus: { $exists: true } },
                { $unset: { availabilityStatus: '' } },
            ),
        ])
            .then(() => undefined)
            .catch((error: unknown) => {
                assetDataModelMigration = null;
                throw error;
            });
    }

    await assetDataModelMigration;
}

function readText(form: FormData, key: string) {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
}

function isOneOf<T extends string>(
    value: string,
    choices: T[],
): value is T {
    return choices.includes(value as T);
}

export function isAssetStatus(value: unknown): value is AssetStatus {
    return (
        typeof value === 'string' &&
        statuses.some((status) => status === value)
    );
}

export function parseAssetForm(form: FormData):
    | { ok: true; value: AssetInput }
    | { ok: false; error: string } {
    const categoryValue = readText(form, 'category');
    const conditionValue = readText(form, 'condition');
    const statusValue = readText(form, 'status');
    const itemId = readText(form, 'itemId');
    const roomId = readText(form, 'roomId');
    const sourceId = categoryValue === 'Barang' ? itemId : roomId;
    const quantity = Number(readText(form, 'quantity'));
    const price = Number(readText(form, 'price') || 0);
    const acquisitionDate = readText(form, 'acquisitionDate');
    const code = readText(form, 'code').toUpperCase();
    const fundingSource = readText(form, 'fundingSource');
    const description = readText(form, 'description');

    if (!code || code.length > 40) {
        return { ok: false, error: 'Kode aset wajib diisi (maksimal 40 karakter).' };
    }
    if (!isOneOf(categoryValue, categories)) {
        return { ok: false, error: 'Kategori aset tidak valid.' };
    }
    if (!isOneOf(conditionValue, conditions)) {
        return { ok: false, error: 'Kondisi aset tidak valid.' };
    }
    if (!isAssetStatus(statusValue)) {
        return {
            ok: false,
            error: 'Status ketersediaan aset tidak valid.',
        };
    }
    if (
        (categoryValue === 'Barang' && (!itemId || roomId)) ||
        (categoryValue === 'Ruangan' && (!roomId || itemId)) ||
        !ObjectId.isValid(sourceId)
    ) {
        return {
            ok: false,
            error: 'Pilih satu sumber data barang atau ruangan yang valid.',
        };
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
        return { ok: false, error: 'Jumlah aset harus bilangan bulat minimal 1.' };
    }
    if (categoryValue === 'Ruangan' && quantity !== 1) {
        return { ok: false, error: 'Jumlah aset ruangan harus 1.' };
    }
    if (!Number.isFinite(price) || price < 0) {
        return { ok: false, error: 'Harga perolehan tidak valid.' };
    }
    if (
        acquisitionDate &&
        !/^\d{4}-\d{2}-\d{2}$/.test(acquisitionDate)
    ) {
        return { ok: false, error: 'Tanggal perolehan tidak valid.' };
    }
    if (fundingSource.length > 100) {
        return { ok: false, error: 'Sumber dana maksimal 100 karakter.' };
    }
    if (description.length > 2000) {
        return { ok: false, error: 'Deskripsi maksimal 2000 karakter.' };
    }

    return {
        ok: true,
        value: {
            code,
            category: categoryValue,
            itemId: categoryValue === 'Barang' ? itemId : '',
            roomId: categoryValue === 'Ruangan' ? roomId : '',
            sourceId,
            quantity: categoryValue === 'Ruangan' ? 1 : quantity,
            condition: conditionValue,
            status: statusValue,
            acquisitionDate,
            price,
            fundingSource,
            description,
        },
    };
}

export async function findAssetSource(
    db: Db,
    input: Pick<AssetInput, 'category' | 'sourceId'>,
) {
    const collectionName = input.category === 'Barang' ? 'items' : 'rooms';
    return db
        .collection<AssetSourceDocument>(collectionName)
        .findOne({ _id: new ObjectId(input.sourceId) });
}

function safeImages(images: unknown, category: AssetCategory) {
    const sourceFolder = category === 'Barang' ? 'items' : 'rooms';
    return Array.isArray(images)
        ? images.filter(
              (image): image is string =>
                  typeof image === 'string' &&
                  new RegExp(
                      `^/assets/uploads/management/${sourceFolder}/[0-9a-f-]{36}\\.(jpg|png|webp)$`,
                      'i',
                  ).test(image),
          )
        : [];
}

function dateOnly(value: Date | string | undefined) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') return value.slice(0, 10);
    return '';
}

export function displayAsset(
    asset: AssetDocument,
    source: AssetSourceDocument | null,
    location: LocationDisplay | null,
) {
    return {
        id: asset._id.toString(),
        code: asset.code,
        name: source?.name ?? asset.name ?? 'Sumber data tidak ditemukan',
        category: asset.category,
        itemId: asset.itemId ?? '',
        roomId: asset.roomId ?? '',
        locationId: source?.locationId ?? asset.locationId ?? '',
        location,
        rfidCode: source?.rfidCode ?? '',
        source: source
            ? {
                  id: source._id.toString(),
                  category: asset.category,
                  locationId: source.locationId ?? '',
                  code: source.code ?? '',
                  name: source.name ?? '',
                  kind: source.category ?? source.type ?? '',
                  brand: source.brand ?? '',
                  model: source.model ?? '',
                  specification: source.specification ?? '',
                  unit: source.unit ?? '',
                  floor: source.floor ?? '',
                  roomNumber: source.roomNumber ?? '',
                  capacity: source.capacity ?? 0,
                  area: source.area ?? 0,
                  responsiblePerson: source.responsiblePerson ?? '',
                  facilities: Array.isArray(source.facilities)
                      ? source.facilities
                      : [],
                  status: source.status ?? '',
                  description: source.description ?? '',
                  images: safeImages(source.images, asset.category),
                  createdAt: dateOnly(source.createdAt),
                  updatedAt: dateOnly(source.updatedAt),
              }
            : null,
        quantity: asset.category === 'Ruangan' ? 1 : asset.quantity,
        condition: asset.condition,
        status: asset.status,
        acquisitionDate: asset.acquisitionDate ?? '',
        price: asset.price ?? 0,
        fundingSource: asset.fundingSource ?? '',
        description: asset.description ?? '',
        images: safeImages(source?.images, asset.category),
        createdAt: dateOnly(asset.createdAt),
        updatedAt: dateOnly(asset.updatedAt),
    };
}

export async function listAssetDisplays(db: Db, assets: AssetDocument[]) {
    const itemIds = [
        ...new Set(
            assets
                .filter((asset) => asset.category === 'Barang')
                .map((asset) => asset.itemId)
                .filter((id): id is string => typeof id === 'string' && ObjectId.isValid(id)),
        ),
    ].map((id) => new ObjectId(id));
    const roomIds = [
        ...new Set(
            assets
                .filter((asset) => asset.category === 'Ruangan')
                .map((asset) => asset.roomId)
                .filter((id): id is string => typeof id === 'string' && ObjectId.isValid(id)),
        ),
    ].map((id) => new ObjectId(id));
    const [items, rooms] = await Promise.all([
        itemIds.length
            ? db.collection<AssetSourceDocument>('items').find({ _id: { $in: itemIds } }).toArray()
            : Promise.resolve([]),
        roomIds.length
            ? db.collection<AssetSourceDocument>('rooms').find({ _id: { $in: roomIds } }).toArray()
            : Promise.resolve([]),
    ]);
    const sources = new Map(
        [...items, ...rooms].map((source) => [source._id.toString(), source]),
    );
    const sourceList = [...items, ...rooms];
    const locations = await getLocationDisplays(
        db,
        sourceList.map((source) => source.locationId),
    );

    return assets.map((asset) => {
        const source =
            sources.get(
                asset.category === 'Barang'
                    ? asset.itemId ?? ''
                    : asset.roomId ?? '',
            ) ?? null;
        return displayAsset(
            asset,
            source,
            source ? locations.get(source.locationId) ?? null : null,
        );
    });
}
