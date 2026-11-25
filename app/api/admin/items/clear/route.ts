import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/server/db';
import {
    removeManagementImage,
    requireAdmin,
    requireClearConfirmation,
    reportManagementError,
} from '@/lib/server/management';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const confirmation = await requireClearConfirmation(request);
        if (confirmation) return confirmation;

        const db = await getDb();
        const items = db.collection<{ _id: ObjectId; images?: string[] }>(
            'items',
        );
        const existingItems = await items
            .find({}, { projection: { _id: 1, images: 1 } })
            .toArray();
        if (!existingItems.length) {
            return NextResponse.json({ deletedCount: 0 });
        }

        const itemIds = existingItems.map((item) => item._id.toString());
        const linkedAsset = await db.collection('assets').findOne(
            { category: 'Barang', itemId: { $in: itemIds } },
            { projection: { _id: 1 } },
        );
        if (linkedAsset) {
            return NextResponse.json(
                {
                    message:
                        'Barang tidak dapat dibersihkan karena masih dipakai oleh data aset. Bersihkan data aset terkait terlebih dahulu.',
                },
                { status: 409 },
            );
        }

        const result = await items.deleteMany({
            _id: { $in: existingItems.map((item) => item._id) },
        });
        await Promise.all(
            existingItems.flatMap((item) =>
                (Array.isArray(item.images) ? item.images : []).map(
                    removeManagementImage,
                ),
            ),
        );

        return NextResponse.json({ deletedCount: result.deletedCount });
    } catch (error) {
        return reportManagementError('item clearing', error);
    }
}
