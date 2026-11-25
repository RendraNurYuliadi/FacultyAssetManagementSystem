import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/server/db';
import {
    reportManagementError,
    requireBorrowingManager,
} from '@/lib/server/management';
import {
    type AssetCondition,
    type AssetDocument,
} from '@/lib/server/assets';
import {
    ensureReturnDataModel,
    type ReturnDocument,
} from '@/lib/server/returns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };
const conditions: readonly AssetCondition[] = [
    'Baik',
    'Rusak Ringan',
    'Rusak Berat',
];

function isAssetCondition(value: unknown): value is AssetCondition {
    return (
        typeof value === 'string' &&
        conditions.some((condition) => condition === value)
    );
}

function errorResponse(message: string, status = 422) {
    return NextResponse.json({ message }, { status });
}

export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const access = await requireBorrowingManager();
        if (access.response) return access.response;

        const { id } = await params;
        if (!ObjectId.isValid(id) || !ObjectId.isValid(access.user.id)) {
            return errorResponse('Data pengembalian tidak valid.', 400);
        }

        let payload: unknown;
        try {
            payload = await request.json();
        } catch {
            return errorResponse('Data pemeriksaan tidak valid.', 400);
        }
        const assetIdValue =
            typeof payload === 'object' &&
            payload !== null &&
            'assetId' in payload
                ? payload.assetId
                : undefined;
        const conditionValue =
            typeof payload === 'object' &&
            payload !== null &&
            'condition' in payload
                ? payload.condition
                : undefined;
        const notesValue =
            typeof payload === 'object' &&
            payload !== null &&
            'notes' in payload
                ? payload.notes
                : undefined;
        if (
            typeof payload !== 'object' ||
            payload === null ||
            typeof assetIdValue !== 'string' ||
            !ObjectId.isValid(assetIdValue) ||
            !isAssetCondition(conditionValue) ||
            (notesValue !== undefined &&
                (typeof notesValue !== 'string' ||
                    notesValue.trim().length > 2000))
        ) {
            return errorResponse('Lengkapi kondisi aset dengan benar.');
        }

        const assetIdString = assetIdValue;
        const inspectionCondition = conditionValue;
        const notes = typeof notesValue === 'string' ? notesValue.trim() : '';
        const db = await getDb();
        await ensureReturnDataModel(db);
        const returnId = new ObjectId(id);
        const assetId = new ObjectId(assetIdString);
        const returnCollection =
            db.collection<ReturnDocument>('returns');
        const returnRequest = await returnCollection.findOne({
            _id: returnId,
        });
        if (!returnRequest) {
            return errorResponse('Data pengembalian tidak ditemukan.', 404);
        }
        if (
            !returnRequest.assets.some(
                (asset) => asset.id === assetIdString,
            )
        ) {
            return errorResponse(
                'Aset tersebut tidak tercatat pada pengembalian ini.',
                404,
            );
        }

        const assetCollection = db.collection<AssetDocument>('assets');
        const asset = await assetCollection.findOne({ _id: assetId });
        if (!asset) {
            return errorResponse('Data aset tidak ditemukan.', 404);
        }

        const now = new Date();
        const assetUpdate = await assetCollection.updateOne(
            { _id: assetId, condition: asset.condition },
            {
                $set: {
                    condition: inspectionCondition,
                    updatedAt: now,
                },
            },
        );
        if (assetUpdate.matchedCount !== 1) {
            return errorResponse(
                'Kondisi aset berubah. Muat ulang data sebelum menyimpan pemeriksaan.',
                409,
            );
        }

        const restoreCondition = async () => {
            if (assetUpdate.modifiedCount !== 1) return;
            const rollback = await assetCollection.updateOne(
                {
                    _id: assetId,
                    condition: inspectionCondition,
                    updatedAt: now,
                },
                {
                    $set: {
                        condition: asset.condition,
                        updatedAt: new Date(),
                    },
                },
            );
            if (rollback.modifiedCount !== 1) {
                throw new Error(
                    'Kondisi aset tidak dapat dipulihkan setelah pemeriksaan gagal.',
                );
            }
        };

        let returnUpdate;
        try {
            returnUpdate = await returnCollection.updateOne(
                {
                    _id: returnId,
                    assets: { $elemMatch: { id: assetIdString } },
                },
                {
                    $set: {
                        'assets.$.inspectionCondition': inspectionCondition,
                        'assets.$.inspectionNotes': notes,
                        'assets.$.inspectedAt': now,
                        'assets.$.inspectedBy': new ObjectId(access.user.id),
                        updatedAt: now,
                    },
                },
            );
        } catch (error) {
            await restoreCondition();
            throw error;
        }
        if (returnUpdate.matchedCount !== 1) {
            await restoreCondition();
            return errorResponse(
                'Data pemeriksaan berubah. Muat ulang lalu coba lagi.',
                409,
            );
        }

        return NextResponse.json({ saved: true });
    } catch (error) {
        return reportManagementError('return asset inspection', error);
    }
}
