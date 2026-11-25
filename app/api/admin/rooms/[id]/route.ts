import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import {
    handleManagementImageError,
    removeOldManagementImage,
    reportManagementError,
    requireAdmin,
    storeManagementImage,
} from '@/lib/server/management';
import { ensureAssetDataModel } from '@/lib/server/assets';
import { getDb } from '@/lib/server/db';
import {
    displayLocation,
    type LocationDisplay,
    type LocationDocument,
} from '@/lib/server/locations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ROOM_IMAGES = 10;
const roomTypes = [
    'Ruang Kelas',
    'Laboratorium',
    'Ruang Rapat',
    'Ruang Dosen',
    'Ruang Administrasi',
    'Lainnya',
] as const;
type RoomType = (typeof roomTypes)[number];

type RoomDocument = {
    _id: ObjectId;
    code: string;
    name: string;
    type: RoomType;
    locationId: string;
    floor: string;
    roomNumber: string;
    rfidCode: string;
    capacity: number;
    area: number;
    responsiblePerson: string;
    facilities: string[];
    description: string;
    images: string[];
    createdAt?: Date | string;
    updatedAt?: Date | string;
};

type RouteContext = { params: Promise<{ id: string }> };

function readText(form: FormData, key: string) {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
}

function readRoom(form: FormData) {
    const facilities = readText(form, 'facilities')
        .split(',')
        .map((facility) => facility.trim())
        .filter(Boolean);

    return {
        code: readText(form, 'code').toUpperCase(),
        name: readText(form, 'name'),
        type: readText(form, 'type'),
        locationId: readText(form, 'locationId'),
        floor: readText(form, 'floor'),
        roomNumber: readText(form, 'roomNumber').toUpperCase(),
        rfidCode: readText(form, 'rfidCode').toUpperCase(),
        capacity: Number(readText(form, 'capacity')),
        area: Number(readText(form, 'area') || 0),
        responsiblePerson: readText(form, 'responsiblePerson'),
        facilities,
        description: readText(form, 'description'),
    };
}

function parseRoomType(value: string): RoomType | null {
    return roomTypes.find((type) => type === value) ?? null;
}

function validateRoom(room: ReturnType<typeof readRoom>) {
    if (!room.code || room.code.length > 40) {
        return 'Kode ruangan wajib diisi (maksimal 40 karakter).';
    }
    if (!room.name || room.name.length > 255) {
        return 'Nama ruangan wajib diisi (maksimal 255 karakter).';
    }
    if (!parseRoomType(room.type)) return 'Jenis ruangan tidak valid.';
    if (!ObjectId.isValid(room.locationId)) return 'Gedung atau lokasi tidak valid.';
    if (!room.floor || room.floor.length > 50) {
        return 'Lantai wajib diisi (maksimal 50 karakter).';
    }
    if (!room.roomNumber || room.roomNumber.length > 40) {
        return 'Nomor ruangan wajib diisi (maksimal 40 karakter).';
    }
    if (!room.rfidCode || room.rfidCode.length > 100) {
        return 'Kode RFID wajib diisi (maksimal 100 karakter).';
    }
    if (!Number.isSafeInteger(room.capacity) || room.capacity < 1) {
        return 'Kapasitas harus bilangan bulat minimal 1.';
    }
    if (!Number.isFinite(room.area) || room.area < 0) {
        return 'Luas ruangan tidak valid.';
    }
    if (!room.responsiblePerson || room.responsiblePerson.length > 255) {
        return 'Penanggung jawab wajib diisi (maksimal 255 karakter).';
    }
    if (
        room.facilities.length > 30 ||
        room.facilities.some((facility) => facility.length > 100)
    ) {
        return 'Maksimal 30 fasilitas, masing-masing maksimal 100 karakter.';
    }
    if (room.description.length > 2000) {
        return 'Deskripsi maksimal 2000 karakter.';
    }
    return null;
}

function isDuplicateKey(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
    );
}

function readImageFiles(form: FormData): File[] | null {
    const values = form.getAll('images');
    if (!values.every((value): value is File => value instanceof File)) {
        return null;
    }
    return values;
}

function readRetainedImages(
    form: FormData,
    existingImages: string[],
): string[] | null {
    const value = form.get('retainedImages');
    if (value === null) return existingImages;
    if (typeof value !== 'string') return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return null;
    }
    if (
        !Array.isArray(parsed) ||
        !parsed.every((image: unknown) => typeof image === 'string')
    ) {
        return null;
    }

    const existing = new Set(existingImages);
    if (parsed.some((image: string) => !existing.has(image))) return null;
    return [...new Set(parsed as string[])];
}

function dateOnly(value: Date | string | undefined) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') return value.slice(0, 10);
    return '';
}

function displayRoom(
    room: RoomDocument,
    location: LocationDisplay | null,
) {
    return {
        id: room._id.toString(),
        code: room.code,
        name: room.name,
        type: room.type,
        locationId: room.locationId,
        location,
        floor: room.floor,
        roomNumber: room.roomNumber,
        rfidCode: room.rfidCode,
        capacity: room.capacity,
        area: room.area,
        responsiblePerson: room.responsiblePerson,
        facilities: Array.isArray(room.facilities) ? room.facilities : [],
        description: room.description,
        images: Array.isArray(room.images)
            ? room.images.filter(
                  (image) =>
                      typeof image === 'string' &&
                      /^\/assets\/uploads\/management\/rooms\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(
                          image,
                      ),
              )
            : [],
        createdAt: dateOnly(room.createdAt),
        updatedAt: dateOnly(room.updatedAt),
    };
}

function errorResponse(message: string, status = 422) {
    return NextResponse.json({ message }, { status });
}

export async function PATCH(request: Request, { params }: RouteContext) {
    const storedImages: string[] = [];
    let imagesPersisted = false;
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const { id } = await params;
        if (!ObjectId.isValid(id)) {
            return errorResponse('ID ruangan tidak valid.', 400);
        }

        const form = await request.formData();
        const room = readRoom(form);
        const validationError = validateRoom(room);
        if (validationError) return errorResponse(validationError);
        const type = parseRoomType(room.type);
        if (!type) return errorResponse('Jenis ruangan tidak valid.');

        const files = readImageFiles(form);
        if (!files) return errorResponse('File foto ruangan tidak valid.');

        const db = await getDb();
        await ensureAssetDataModel(db);
        const roomId = new ObjectId(id);
        const rooms = db.collection<RoomDocument>('rooms');
        const existing = await rooms.findOne({ _id: roomId });
        if (!existing) return errorResponse('Ruangan tidak ditemukan.', 404);

        const locationExists = await db
            .collection<LocationDocument>('locations')
            .findOne({ _id: new ObjectId(room.locationId) });
        if (!locationExists) {
            return errorResponse('Gedung atau lokasi tidak ditemukan.', 404);
        }

        if (
            await rooms.findOne({
                _id: { $ne: roomId },
                $or: [
                    { code: room.code },
                    { rfidCode: room.rfidCode },
                    {
                        locationId: room.locationId,
                        roomNumber: room.roomNumber,
                    },
                ],
            })
        ) {
            return errorResponse(
                'Kode ruangan, kode RFID, atau nomor ruangan sudah digunakan.',
                409,
            );
        }
        if (await db.collection('items').findOne({ rfidCode: room.rfidCode })) {
            return errorResponse('Kode RFID sudah digunakan oleh barang lain.', 409);
        }

        const existingImages = Array.isArray(existing.images)
            ? existing.images
            : [];
        const retainedImages = readRetainedImages(form, existingImages);
        if (!retainedImages) {
            return errorResponse('Daftar foto ruangan tidak valid.');
        }
        if (retainedImages.length + files.length > MAX_ROOM_IMAGES) {
            return errorResponse(`Maksimal ${MAX_ROOM_IMAGES} foto untuk satu ruangan.`);
        }

        for (const file of files) {
            storedImages.push(await storeManagementImage(file, 'rooms'));
        }

        const images = [...retainedImages, ...storedImages];
        await rooms.updateOne(
            { _id: roomId },
            {
                $set: {
                    ...room,
                    type,
                    images,
                    updatedAt: new Date(),
                },
            },
        );
        imagesPersisted = true;

        const retained = new Set(images);
        await Promise.all(
            existingImages
                .filter((image) => !retained.has(image))
                .map((image) => removeOldManagementImage(image)),
        );

        const saved = await rooms.findOne({ _id: roomId });
        return NextResponse.json({
            room: saved
                ? displayRoom(saved, displayLocation(locationExists))
                : null,
        });
    } catch (error) {
        if (!imagesPersisted) {
            await Promise.all(storedImages.map((image) => removeOldManagementImage(image)));
        }
        const imageError = handleManagementImageError(error);
        if (imageError) return imageError;
        if (isDuplicateKey(error)) {
            return errorResponse(
                'Kode ruangan, kode RFID, atau nomor ruangan sudah digunakan.',
                409,
            );
        }
        return reportManagementError('room update', error);
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const { id } = await params;
        if (!ObjectId.isValid(id)) {
            return errorResponse('ID ruangan tidak valid.', 400);
        }

        const db = await getDb();
        await ensureAssetDataModel(db);
        const rooms = db.collection<RoomDocument>('rooms');
        const roomId = new ObjectId(id);
        const existing = await rooms.findOne({ _id: roomId });
        if (!existing) return errorResponse('Ruangan tidak ditemukan.', 404);

        const assetExists = await db.collection('assets').findOne(
            { roomId: id },
            { projection: { _id: 1 } },
        );
        if (assetExists) {
            return errorResponse(
                'Ruangan tidak dapat dihapus karena masih digunakan oleh aset.',
                409,
            );
        }

        await rooms.deleteOne({ _id: roomId });
        await Promise.all(
            (Array.isArray(existing.images) ? existing.images : []).map(
                (image) => removeOldManagementImage(image),
            ),
        );
        return NextResponse.json({ deleted: true });
    } catch (error) {
        return reportManagementError('room deletion', error);
    }
}
