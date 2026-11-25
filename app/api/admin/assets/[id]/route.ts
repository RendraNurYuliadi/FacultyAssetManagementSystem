import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import {
    displayAsset,
    ensureAssetDataModel,
    findAssetSource,
    parseAssetForm,
    type AssetDocument,
} from '@/lib/server/assets';
import { reportManagementError, requireAdmin } from '@/lib/server/management';
import { getDb } from '@/lib/server/db';
import { getLocationDisplay } from '@/lib/server/locations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

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

export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const { id } = await params;
        if (!ObjectId.isValid(id)) {
            return errorResponse('ID aset tidak valid.', 400);
        }
        const form = await request.formData();
        const parsed = parseAssetForm(form);
        if (!parsed.ok) return errorResponse(parsed.error);
        const input = parsed.value;

        const db = await getDb();
        await ensureAssetDataModel(db);
        const assets = db.collection<AssetDocument>('assets');
        const assetId = new ObjectId(id);
        const existing = await assets.findOne({ _id: assetId });
        if (!existing) return errorResponse('Aset tidak ditemukan.', 404);

        if (
            await assets.findOne({
                _id: { $ne: assetId },
                code: input.code,
            })
        ) {
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

        await assets.updateOne(
            { _id: assetId },
            {
                $set: {
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
                    updatedAt: new Date(),
                },
                $unset:
                    input.category === 'Barang'
                        ? { roomId: '' }
                        : { itemId: '' },
            },
        );
        const saved = await assets.findOne({ _id: assetId });
        return NextResponse.json({
            asset: saved ? displayAsset(saved, source, location) : null,
        });
    } catch (error) {
        if (isDuplicateKey(error)) {
            return errorResponse('Kode aset sudah digunakan.', 409);
        }
        return reportManagementError('asset update', error);
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const { id } = await params;
        if (!ObjectId.isValid(id)) {
            return errorResponse('ID aset tidak valid.', 400);
        }

        const db = await getDb();
        await ensureAssetDataModel(db);
        const assets = db.collection<AssetDocument>('assets');
        const assetId = new ObjectId(id);
        const existing = await assets.findOne({ _id: assetId });
        if (!existing) {
            return errorResponse('Aset tidak ditemukan.', 404);
        }
        const result = await assets.deleteOne({ _id: assetId });
        if (result.deletedCount === 0) {
            return errorResponse('Aset tidak ditemukan.', 404);
        }
        return NextResponse.json({ deleted: true });
    } catch (error) {
        return reportManagementError('asset deletion', error);
    }
}
