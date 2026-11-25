import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import {
    handleManagementImageError,
    removeOldManagementImage,
    reportManagementError,
    requireAdmin,
    storeManagementImage,
} from '@/lib/server/management';
import { getDb } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LOCATION_IMAGES = 10;
const locationTypes = ['Gedung', 'Area', 'Kompleks', 'Lainnya'] as const;
type LocationType = (typeof locationTypes)[number];

type LocationDocument = {
    _id: ObjectId;
    code: string;
    name: string;
    type: LocationType;
    address: string;
    area: string;
    responsible: string;
    phone: string;
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

function readLocation(form: FormData) {
    return {
        code: readText(form, 'code').toUpperCase(),
        name: readText(form, 'name'),
        type: readText(form, 'type'),
        address: readText(form, 'address'),
        area: readText(form, 'area'),
        responsible: readText(form, 'responsible'),
        phone: readText(form, 'phone'),
        description: readText(form, 'description'),
    };
}

function parseLocationType(value: string): LocationType | null {
    return locationTypes.find((type) => type === value) ?? null;
}

function validateLocation(location: ReturnType<typeof readLocation>) {
    if (!location.code || location.code.length > 40) {
        return 'Kode lokasi wajib diisi (maksimal 40 karakter).';
    }
    if (!location.name || location.name.length > 255) {
        return 'Nama lokasi wajib diisi (maksimal 255 karakter).';
    }
    if (!parseLocationType(location.type)) {
        return 'Jenis lokasi tidak valid.';
    }
    if (!location.address || location.address.length > 1000) {
        return 'Alamat lokasi wajib diisi (maksimal 1000 karakter).';
    }
    if (location.area.length > 255 || location.responsible.length > 255) {
        return 'Area dan penanggung jawab maksimal 255 karakter.';
    }
    if (location.phone.length > 30) {
        return 'Nomor telepon maksimal 30 karakter.';
    }
    if (location.description.length > 2000) {
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
    if (!Array.isArray(parsed) || !parsed.every((image) => typeof image === 'string')) {
        return null;
    }

    const existing = new Set(existingImages);
    if (parsed.some((image: string) => !existing.has(image))) return null;
    return [...new Set(parsed as string[])];
}

function displayLocation(location: LocationDocument) {
    const dateOnly = (value: Date | string | undefined) => {
        if (value instanceof Date) return value.toISOString().slice(0, 10);
        if (typeof value === 'string') return value.slice(0, 10);
        return '';
    };

    return {
        id: location._id.toString(),
        code: location.code,
        name: location.name,
        type: location.type,
        address: location.address,
        area: location.area,
        responsible: location.responsible,
        phone: location.phone,
        description: location.description,
        images: Array.isArray(location.images)
            ? location.images.filter(
                  (image) =>
                      typeof image === 'string' &&
                      /^\/assets\/uploads\/management\/locations\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(
                          image,
                      ),
              )
            : [],
        createdAt: dateOnly(location.createdAt),
        updatedAt: dateOnly(location.updatedAt),
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
            return errorResponse('ID lokasi tidak valid.', 400);
        }

        const form = await request.formData();
        const location = readLocation(form);
        const validationError = validateLocation(location);
        if (validationError) return errorResponse(validationError);
        const type = parseLocationType(location.type);
        if (!type) return errorResponse('Jenis lokasi tidak valid.');

        const files = readImageFiles(form);
        if (!files) return errorResponse('File foto lokasi tidak valid.');

        const locations = (await getDb()).collection<LocationDocument>('locations');
        const locationId = new ObjectId(id);
        const existing = await locations.findOne({ _id: locationId });
        if (!existing) return errorResponse('Lokasi tidak ditemukan.', 404);

        if (
            location.code !== existing.code &&
            (await locations.findOne(
                { code: location.code, _id: { $ne: locationId } },
                { projection: { _id: 1 } },
            ))
        ) {
            return errorResponse('Kode lokasi sudah digunakan.', 409);
        }

        const existingImages = Array.isArray(existing.images)
            ? existing.images
            : [];
        const retainedImages = readRetainedImages(form, existingImages);
        if (!retainedImages) {
            return errorResponse('Daftar foto lokasi tidak valid.');
        }
        if (retainedImages.length + files.length > MAX_LOCATION_IMAGES) {
            return errorResponse(`Maksimal ${MAX_LOCATION_IMAGES} foto untuk satu lokasi.`);
        }

        for (const file of files) {
            storedImages.push(await storeManagementImage(file, 'locations'));
        }

        const images = [...retainedImages, ...storedImages];
        await locations.updateOne(
            { _id: locationId },
            {
                $set: {
                    ...location,
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

        const saved = await locations.findOne({ _id: locationId });
        return NextResponse.json({
            location: saved ? displayLocation(saved) : null,
        });
    } catch (error) {
        if (!imagesPersisted) {
            await Promise.all(storedImages.map((image) => removeOldManagementImage(image)));
        }
        const imageError = handleManagementImageError(error);
        if (imageError) return imageError;
        if (isDuplicateKey(error)) {
            return errorResponse('Kode lokasi sudah digunakan.', 409);
        }
        return reportManagementError('location update', error);
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const { id } = await params;
        if (!ObjectId.isValid(id)) {
            return errorResponse('ID lokasi tidak valid.', 400);
        }

        const db = await getDb();
        const locations = db.collection<LocationDocument>('locations');
        const locationId = new ObjectId(id);
        const existing = await locations.findOne({ _id: locationId });
        if (!existing) return errorResponse('Lokasi tidak ditemukan.', 404);

        const roomExists = await db.collection('rooms').findOne(
            { locationId: id },
            { projection: { _id: 1 } },
        );
        const itemExists = await db.collection('items').findOne(
            { locationId: id },
            { projection: { _id: 1 } },
        );
        if (roomExists || itemExists) {
            return errorResponse(
                'Lokasi tidak dapat dihapus karena masih digunakan oleh ruangan atau barang.',
                409,
            );
        }

        await locations.deleteOne({ _id: locationId });
        await Promise.all(
            (Array.isArray(existing.images) ? existing.images : []).map(
                (image) => removeOldManagementImage(image),
            ),
        );
        return NextResponse.json({ deleted: true });
    } catch (error) {
        return reportManagementError('location deletion', error);
    }
}
