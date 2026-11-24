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

const MAX_ITEM_IMAGES = 10;
const categories = [
    'Elektronik',
    'Peralatan Komputer',
    'Peralatan Kantor',
    'Furniture',
    'Peralatan Laboratorium',
    'Peralatan Multimedia',
    'Peralatan Kebersihan',
    'Lainnya',
] as const;
const units = [
    'Unit',
    'Buah',
    'Set',
    'Pasang',
    'Paket',
    'Lusin',
    'Meter',
    'Roll',
    'Lainnya',
] as const;
const statuses = ['Aktif', 'Tidak Aktif'] as const;

type ItemDocument = {
    _id: ObjectId;
    code: string;
    name: string;
    category: (typeof categories)[number];
    brand: string;
    model: string;
    specification: string;
    unit: (typeof units)[number];
    locationId: string;
    responsiblePerson: string;
    description: string;
    status: (typeof statuses)[number];
    rfidCode: string;
    images: string[];
    createdAt?: Date | string;
    updatedAt?: Date | string;
};

function readText(form: FormData, key: string) {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
}

function readItem(form: FormData) {
    return {
        code: readText(form, 'code').toUpperCase(),
        name: readText(form, 'name'),
        category: readText(form, 'category'),
        brand: readText(form, 'brand'),
        model: readText(form, 'model'),
        specification: readText(form, 'specification'),
        unit: readText(form, 'unit'),
        locationId: readText(form, 'locationId'),
        responsiblePerson: readText(form, 'responsiblePerson'),
        description: readText(form, 'description'),
        status: readText(form, 'status'),
        rfidCode: readText(form, 'rfidCode').toUpperCase(),
    };
}

function validateItem(item: ReturnType<typeof readItem>) {
    if (!item.code || item.code.length > 40) {
        return 'Kode barang wajib diisi (maksimal 40 karakter).';
    }
    if (!item.name || item.name.length > 255) {
        return 'Nama barang wajib diisi (maksimal 255 karakter).';
    }
    if (!categories.some((category) => category === item.category)) {
        return 'Kategori barang tidak valid.';
    }
    if (item.brand.length > 255 || item.model.length > 255) {
        return 'Merek dan model maksimal 255 karakter.';
    }
    if (!units.some((unit) => unit === item.unit)) {
        return 'Satuan barang tidak valid.';
    }
    if (!ObjectId.isValid(item.locationId)) {
        return 'Lokasi barang wajib dipilih.';
    }
    if (!item.responsiblePerson || item.responsiblePerson.length > 255) {
        return 'Penanggung jawab wajib diisi (maksimal 255 karakter).';
    }
    if (item.specification.length > 2000 || item.description.length > 2000) {
        return 'Spesifikasi dan deskripsi maksimal 2000 karakter.';
    }
    if (!statuses.some((status) => status === item.status)) {
        return 'Status barang tidak valid.';
    }
    if (!item.rfidCode || item.rfidCode.length > 100) {
        return 'Kode RFID wajib diisi (maksimal 100 karakter).';
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

function displayItem(item: ItemDocument) {
    const createdAt =
        item.createdAt instanceof Date
            ? item.createdAt.toISOString().slice(0, 10)
            : typeof item.createdAt === 'string'
              ? item.createdAt.slice(0, 10)
              : '';

    return {
        id: item._id.toString(),
        code: item.code,
        name: item.name,
        category: item.category,
        brand: item.brand,
        model: item.model,
        specification: item.specification,
        unit: item.unit,
        locationId:
            typeof item.locationId === 'string' ? item.locationId : '',
        responsiblePerson: item.responsiblePerson,
        description: item.description,
        status: item.status,
        rfidCode: item.rfidCode,
        images: Array.isArray(item.images)
            ? item.images.filter(
                  (image) =>
                      typeof image === 'string' &&
                      /^\/assets\/uploads\/management\/items\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(
                          image,
                      ),
              )
            : [],
        createdAt,
    };
}

function errorResponse(message: string, status = 422) {
    return NextResponse.json({ message }, { status });
}

export async function GET() {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const items = await (await getDb())
            .collection<ItemDocument>('items')
            .find({})
            .sort({ createdAt: -1 })
            .toArray();
        return NextResponse.json({ items: items.map(displayItem) });
    } catch (error) {
        return reportManagementError('item listing', error);
    }
}

export async function POST(request: Request) {
    const storedImages: string[] = [];
    let imagesPersisted = false;
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const form = await request.formData();
        const item = readItem(form);
        const validationError = validateItem(item);
        if (validationError) return errorResponse(validationError);
        const category = categories.find((value) => value === item.category);
        const unit = units.find((value) => value === item.unit);
        const status = statuses.find((value) => value === item.status);
        if (!category || !unit || !status) {
            return errorResponse('Data barang tidak valid.');
        }

        const files = readImageFiles(form);
        if (!files) return errorResponse('File foto barang tidak valid.');
        if (files.length > MAX_ITEM_IMAGES) {
            return errorResponse(`Maksimal ${MAX_ITEM_IMAGES} foto untuk satu barang.`);
        }

        const db = await getDb();
        const items = db.collection<ItemDocument>('items');
        const locationExists = await db.collection('locations').findOne(
            { _id: new ObjectId(item.locationId) },
            { projection: { _id: 1 } },
        );
        if (!locationExists) {
            return errorResponse('Lokasi barang tidak ditemukan.', 404);
        }
        if (
            await items.findOne({
                $or: [{ code: item.code }, { rfidCode: item.rfidCode }],
            })
        ) {
            return errorResponse('Kode barang atau kode RFID sudah digunakan.', 409);
        }
        if (await db.collection('rooms').findOne({ rfidCode: item.rfidCode })) {
            return errorResponse('Kode RFID sudah digunakan oleh ruangan lain.', 409);
        }

        for (const file of files) {
            storedImages.push(await storeManagementImage(file, 'items'));
        }

        const now = new Date();
        const result = await items.insertOne({
            _id: new ObjectId(),
            ...item,
            category,
            unit,
            status,
            images: storedImages,
            createdAt: now,
            updatedAt: now,
        });
        imagesPersisted = true;

        const created = await items.findOne({ _id: result.insertedId });
        return NextResponse.json(
            { item: created ? displayItem(created) : null },
            { status: 201 },
        );
    } catch (error) {
        if (!imagesPersisted) {
            await Promise.all(storedImages.map((image) => removeOldManagementImage(image)));
        }
        const imageError = handleManagementImageError(error);
        if (imageError) return imageError;
        if (isDuplicateKey(error)) {
            return errorResponse('Kode barang atau kode RFID sudah digunakan.', 409);
        }
        return reportManagementError('item creation', error);
    }
}
