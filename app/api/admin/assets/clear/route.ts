import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/db';
import {
    requireAdmin,
    requireClearConfirmation,
    reportManagementError,
} from '@/lib/server/management';
import {
    ensureAssetDataModel,
    type AssetDocument,
} from '@/lib/server/assets';
import {
    ensureBorrowingApprovalStatuses,
    type BorrowingDocument,
} from '@/lib/server/borrowings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const confirmation = await requireClearConfirmation(request);
        if (confirmation) return confirmation;

        const db = await getDb();
        await ensureAssetDataModel(db);
        const assets = db.collection<AssetDocument>('assets');
        const existingAssets = await assets
            .find(
                {},
                {
                    projection: {
                        _id: 1,
                        status: 1,
                    },
                },
            )
            .toArray();
        if (!existingAssets.length) {
            return NextResponse.json({ deletedCount: 0 });
        }

        const assetIds = existingAssets.map((asset) => asset._id.toString());
        const borrowings =
            db.collection<BorrowingDocument>('borrowings');
        await ensureBorrowingApprovalStatuses(borrowings);
        const pendingBorrowing = await borrowings.findOne(
            {
                approvalStatus: 'Menunggu Persetujuan',
                'assets.id': { $in: assetIds },
            },
            { projection: { _id: 1 } },
        );
        const assetInUse = existingAssets.some(
            (asset) =>
                asset.status === 'Diproses Peminjam' ||
                asset.status === 'Dipinjam' ||
                asset.status === 'Diproses Pengembalian',
        );
        if (pendingBorrowing || assetInUse) {
            return NextResponse.json(
                {
                    message:
                        'Aset tidak dapat dibersihkan karena masih digunakan oleh pengajuan aktif atau berstatus diproses/dipinjam.',
                },
                { status: 409 },
            );
        }

        const result = await assets.deleteMany({
            _id: { $in: existingAssets.map((asset) => asset._id) },
        });

        return NextResponse.json({ deletedCount: result.deletedCount });
    } catch (error) {
        return reportManagementError('asset clearing', error);
    }
}
