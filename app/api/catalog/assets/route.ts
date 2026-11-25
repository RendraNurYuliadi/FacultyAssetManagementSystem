import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/server/db';
import { getSessionUser } from '@/lib/server/auth';
import {
    displayAsset,
    type AssetDocument,
} from '@/lib/server/assets';
import { reportManagementError } from '@/lib/server/management';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CatalogItemDocument = {
    _id: ObjectId;
    name: string;
    locationId: string;
    rfidCode: string;
    images: string[];
    code?: string;
    category?: string;
    brand?: string;
    model?: string;
    specification?: string;
    unit?: string;
    responsiblePerson?: string;
    status?: string;
    description?: string;
    createdAt?: Date | string;
};

type CatalogRoomDocument = {
    _id: ObjectId;
    name: string;
    locationId: string;
    rfidCode: string;
    images: string[];
    code?: string;
    type?: string;
    floor?: string;
    roomNumber?: string;
    capacity?: number;
    area?: number;
    responsiblePerson?: string;
    facilities?: string[];
    description?: string;
    createdAt?: Date | string;
};

type CatalogLocationDocument = {
    _id: ObjectId;
    code?: string;
    name?: string;
    type?: string;
    address?: string;
    area?: string;
    responsible?: string;
    phone?: string;
    description?: string;
    images?: string[];
};

function safeImages(value: unknown, collection: 'items' | 'rooms' | 'locations') {
    const pattern = new RegExp(
        `^/assets/uploads/management/${collection}/[0-9a-f-]{36}\\.(jpg|png|webp)$`,
        'i',
    );
    return Array.isArray(value)
        ? value.filter(
              (image): image is string =>
                  typeof image === 'string' && pattern.test(image),
          )
        : [];
}

function dateOnly(value: Date | string | undefined) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') return value.slice(0, 10);
    return '';
}

function itemDetails(item: CatalogItemDocument) {
    return {
        kind: 'Barang' as const,
        code: item.code ?? '',
        name: item.name ?? '',
        type: item.category ?? '',
        brand: item.brand ?? '',
        model: item.model ?? '',
        specification: item.specification ?? '',
        unit: item.unit ?? '',
        responsiblePerson: item.responsiblePerson ?? '',
        status: item.status ?? '',
        description: item.description ?? '',
        createdAt: dateOnly(item.createdAt),
        images: safeImages(item.images, 'items'),
    };
}

function roomDetails(room: CatalogRoomDocument) {
    return {
        kind: 'Ruangan' as const,
        code: room.code ?? '',
        name: room.name ?? '',
        type: room.type ?? '',
        floor: room.floor ?? '',
        roomNumber: room.roomNumber ?? '',
        capacity: room.capacity ?? 0,
        area: room.area ?? 0,
        responsiblePerson: room.responsiblePerson ?? '',
        facilities: Array.isArray(room.facilities) ? room.facilities : [],
        description: room.description ?? '',
        createdAt: dateOnly(room.createdAt),
        images: safeImages(room.images, 'rooms'),
    };
}

export async function GET() {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json(
                { message: 'Sesi tidak valid. Silakan masuk kembali.' },
                { status: 401 },
            );
        }

        const db = await getDb();
        const [assets, items, rooms, locations] = await Promise.all([
            db
                .collection<AssetDocument>('assets')
                .find({})
                .sort({ createdAt: -1 })
                .toArray(),
            db.collection<CatalogItemDocument>('items').find({}).toArray(),
            db.collection<CatalogRoomDocument>('rooms').find({}).toArray(),
            db
                .collection<CatalogLocationDocument>('locations')
                .find({})
                .toArray(),
        ]);
        const itemById = new Map(
            items.map((item) => [item._id.toString(), item]),
        );
        const roomById = new Map(
            rooms.map((room) => [room._id.toString(), room]),
        );
        const locationById = new Map(
            locations.map((location) => [location._id.toString(), location]),
        );

        return NextResponse.json({
            assets: assets.map((asset) => {
                const item =
                    asset.category === 'Barang'
                        ? itemById.get(asset.itemId ?? '') ?? null
                        : null;
                const room =
                    asset.category === 'Ruangan'
                        ? roomById.get(asset.roomId ?? '') ?? null
                        : null;
                const source = item ?? room;
                const locationId = source?.locationId ?? asset.locationId ?? '';
                const location = locationById.get(locationId) ?? null;
                const display = displayAsset(
                    asset,
                    source,
                    null,
                );

                return {
                    id: display.id,
                    code: display.code,
                    name: display.name,
                    category: display.category,
                    itemId: display.itemId,
                    roomId: display.roomId,
                    locationId: display.locationId,
                    quantity: display.quantity,
                    condition: display.condition,
                    status: display.status,
                    acquisitionDate: display.acquisitionDate,
                    price: display.price,
                    fundingSource: display.fundingSource,
                    description: display.description,
                    images: display.images,
                    createdAt: display.createdAt,
                    source: item
                        ? itemDetails(item)
                        : room
                          ? roomDetails(room)
                          : null,
                    location: location
                        ? {
                              code: location.code ?? '',
                              name: location.name ?? '',
                              type: location.type ?? '',
                              address: location.address ?? '',
                              area: location.area ?? '',
                              responsible: location.responsible ?? '',
                              phone: location.phone ?? '',
                              description: location.description ?? '',
                              images: safeImages(location.images, 'locations'),
                          }
                        : null,
                };
            }),
        });
    } catch (error) {
        return reportManagementError('catalog asset listing', error);
    }
}
