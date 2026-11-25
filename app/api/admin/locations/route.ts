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

export async function GET() {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const locations = await (await getDb())
            .collection<LocationDocument>('locations')
            .find({})
            .sort({ createdAt: -1 })
            .toArray();
        return NextResponse.json({
            locations: locations.map(displayLocation),
        });
    } catch (error) {
        return reportManagementError('location listing', error);
    }
}

export async function POST(request: Request) {
    const storedImages: string[] = [];
    let imagesPersisted = false;
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const form = await request.formData();
        const location = readLocation(form);
        const validationError = validateLocation(location);
        if (validationError) return errorResponse(validationError);
        const type = parseLocationType(location.type);
        if (!type) return errorResponse('Jenis lokasi tidak valid.');

        const files = readImageFiles(form);
        if (!files) return errorResponse('File foto lokasi tidak valid.');
        if (files.length > MAX_LOCATION_IMAGES) {
            return errorResponse(`Maksimal ${MAX_LOCATION_IMAGES} foto untuk satu lokasi.`);
        }

        const locations = (await getDb()).collection<LocationDocument>('locations');
        if (
            await locations.findOne(
                { code: location.code },
                { projection: { _id: 1 } },
            )
        ) {
            return errorResponse('Kode lokasi sudah digunakan.', 409);
        }

        for (const file of files) {
            storedImages.push(await storeManagementImage(file, 'locations'));
        }

        const now = new Date();
        const result = await locations.insertOne({
            _id: new ObjectId(),
            ...location,
            type,
            images: storedImages,
            createdAt: now,
            updatedAt: now,
        });
        imagesPersisted = true;

        const created = await locations.findOne({ _id: result.insertedId });
        return NextResponse.json(
            { location: created ? displayLocation(created) : null },
            { status: 201 },
        );
    } catch (error) {
        if (!imagesPersisted) {
            await Promise.all(storedImages.map((image) => removeOldManagementImage(image)));
        }
        const imageError = handleManagementImageError(error);
        if (imageError) return imageError;
        if (isDuplicateKey(error)) {
            return errorResponse('Kode lokasi sudah digunakan.', 409);
        }
        return reportManagementError('location creation', error);
    }
}
