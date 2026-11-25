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
        const rooms = db.collection<{ _id: ObjectId; images?: string[] }>(
            'rooms',
        );
        const existingRooms = await rooms
            .find({}, { projection: { _id: 1, images: 1 } })
            .toArray();
        if (!existingRooms.length) {
            return NextResponse.json({ deletedCount: 0 });
        }

        const roomIds = existingRooms.map((room) => room._id.toString());
        const linkedAsset = await db.collection('assets').findOne(
            { category: 'Ruangan', roomId: { $in: roomIds } },
            { projection: { _id: 1 } },
        );
        if (linkedAsset) {
            return NextResponse.json(
                {
                    message:
                        'Ruangan tidak dapat dibersihkan karena masih dipakai oleh data aset. Bersihkan data aset terkait terlebih dahulu.',
                },
                { status: 409 },
            );
        }

        const result = await rooms.deleteMany({
            _id: { $in: existingRooms.map((room) => room._id) },
        });
        await Promise.all(
            existingRooms.flatMap((room) =>
                (Array.isArray(room.images) ? room.images : []).map(
                    removeManagementImage,
                ),
            ),
        );

        return NextResponse.json({ deletedCount: result.deletedCount });
    } catch (error) {
        return reportManagementError('room clearing', error);
    }
}
