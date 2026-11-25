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
        const locations = db.collection<{
            _id: ObjectId;
            images?: string[];
        }>('locations');
        const existingLocations = await locations
            .find({}, { projection: { _id: 1, images: 1 } })
            .toArray();
        if (!existingLocations.length) {
            return NextResponse.json({ deletedCount: 0 });
        }

        const locationIds = existingLocations.map((location) =>
            location._id.toString(),
        );
        const [linkedItem, linkedRoom, linkedAsset] = await Promise.all([
            db.collection('items').findOne(
                { locationId: { $in: locationIds } },
                { projection: { _id: 1 } },
            ),
            db.collection('rooms').findOne(
                { locationId: { $in: locationIds } },
                { projection: { _id: 1 } },
            ),
            db.collection('assets').findOne(
                { locationId: { $in: locationIds } },
                { projection: { _id: 1 } },
            ),
        ]);
        if (linkedItem || linkedRoom || linkedAsset) {
            return NextResponse.json(
                {
                    message:
                        'Lokasi tidak dapat dibersihkan karena masih digunakan oleh barang, ruangan, atau aset. Bersihkan data terkait terlebih dahulu.',
                },
                { status: 409 },
            );
        }

        const result = await locations.deleteMany({
            _id: { $in: existingLocations.map((location) => location._id) },
        });
        await Promise.all(
            existingLocations.flatMap((location) =>
                (Array.isArray(location.images) ? location.images : []).map(
                    removeManagementImage,
                ),
            ),
        );

        return NextResponse.json({ deletedCount: result.deletedCount });
    } catch (error) {
        return reportManagementError('location clearing', error);
    }
}
