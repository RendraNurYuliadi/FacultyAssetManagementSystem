import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import {
    displayAsset,
    ensureAssetDataModel,
    findAssetSource,
    listAssetDisplays,
    parseAssetForm,
    type AssetDocument,
} from '@/lib/server/assets';
import {
    reportManagementError,
    requireAdmin,
} from '@/lib/server/management';
import { getDb } from '@/lib/server/db';
import { getLocationDisplay } from '@/lib/server/locations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isDuplicateKey(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
    );
}

function errorResponse(message: string, status = 422) {
    return NextResponse.json({ message }, { status });
}

export async function GET() {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const db = await getDb();
        await ensureAssetDataModel(db);
        const assets = await db
            .collection<AssetDocument>('assets')
            .find({})
            .sort({ createdAt: -1 })
            .toArray();
        return NextResponse.json({
            assets: await listAssetDisplays(db, assets),
        });
    } catch (error) {
        return reportManagementError('asset listing', error);
    }
}

export async function POST(request: Request) {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const form = await request.formData();
        const parsed = parseAssetForm(form);
        if (!parsed.ok) return errorResponse(parsed.error);
        const input = parsed.value;

        const db = await getDb();
        await ensureAssetDataModel(db);
        const assets = db.collection<AssetDocument>('assets');
        if (await assets.findOne({ code: input.code })) {
            return errorResponse('Kode aset sudah digunakan.', 409);
        }

        const source = await findAssetSource(db, input);
        if (!source) {
            return errorResponse('Data barang atau ruangan tidak ditemukan.', 404);
        }
        if (!ObjectId.isValid(source.locationId)) {
            return errorResponse('Lokasi sumber aset tidak valid.', 409);
        }
        const location = await getLocationDisplay(db, source.locationId);
        if (!location) {
            return errorResponse('Lokasi sumber aset tidak ditemukan.', 409);
        }

        const now = new Date();
        const result = await assets.insertOne({
            _id: new ObjectId(),
            code: input.code,
            name: source.name,
            category: input.category,
            ...(input.category === 'Barang'
                ? { itemId: input.itemId }
                : { roomId: input.roomId }),
            quantity: input.quantity,
            condition: input.condition,
            status: input.status,
            acquisitionDate: input.acquisitionDate,
            price: input.price,
            fundingSource: input.fundingSource,
            description: input.description,
            createdAt: now,
            updatedAt: now,
        });
        const created = await assets.findOne({ _id: result.insertedId });
        return NextResponse.json(
            {
                asset: created
                    ? displayAsset(created, source, location)
                    : null,
            },
            { status: 201 },
        );
    } catch (error) {
        if (isDuplicateKey(error)) {
            return errorResponse('Kode aset sudah digunakan.', 409);
        }
        return reportManagementError('asset creation', error);
    }
}
