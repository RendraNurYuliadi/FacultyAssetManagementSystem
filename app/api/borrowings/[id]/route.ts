import { NextResponse } from 'next/server';
import { ObjectId, type Filter } from 'mongodb';
import { getSessionUser } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';
import {
    displayBorrowing,
    ensureBorrowingApprovalStatuses,
    type BorrowingDocument,
} from '@/lib/server/borrowings';
import {
    ensureAssetDataModel,
    type AssetDocument,
} from '@/lib/server/assets';
import {
    reportManagementError,
    requireBorrowingManager,
} from '@/lib/server/management';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json(
                { message: 'Sesi tidak valid. Silakan masuk kembali.' },
                { status: 401 },
            );
        }

        const { id } = await params;
        if (!ObjectId.isValid(id)) {
            return NextResponse.json(
                { message: 'Data peminjaman tidak valid.' },
                { status: 400 },
            );
        }

        const db = await getDb();
        const borrowings = db.collection<BorrowingDocument>('borrowings');
        await ensureBorrowingApprovalStatuses(borrowings);
        const borrowing = await borrowings.findOne({
            _id: new ObjectId(id),
            userId: new ObjectId(user.id),
        });
        if (!borrowing) {
            return NextResponse.json(
                { message: 'Data peminjaman tidak ditemukan.' },
                { status: 404 },
            );
        }
        if (borrowing.approvalStatus !== 'Menunggu Persetujuan') {
            return NextResponse.json(
                {
                    message:
                        'Hanya pengajuan yang masih menunggu persetujuan yang dapat dibatalkan.',
                },
                { status: 409 },
            );
        }

        const result = await borrowings.updateOne(
            {
                _id: borrowing._id,
                userId: new ObjectId(user.id),
                approvalStatus: 'Menunggu Persetujuan',
            },
            {
                $set: {
                    approvalStatus: 'Dibatalkan',
                    updatedAt: new Date(),
                },
            },
        );
        if (result.modifiedCount !== 1) {
            return NextResponse.json(
                {
                    message:
                        'Status pengajuan berubah. Muat ulang data lalu coba lagi.',
                },
                { status: 409 },
            );
        }

        return NextResponse.json({
            borrowing: displayBorrowing({
                ...borrowing,
                approvalStatus: 'Dibatalkan',
                updatedAt: new Date(),
            }),
        });
    } catch (error) {
        return reportManagementError('borrowing cancellation', error);
    }
}

export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const access = await requireBorrowingManager();
        if (access.response) return access.response;

        const { id } = await params;
        if (!ObjectId.isValid(id)) {
            return NextResponse.json(
                { message: 'Data peminjaman tidak valid.' },
                { status: 400 },
            );
        }

        let payload: unknown;
        try {
            payload = await request.json();
        } catch {
            return NextResponse.json(
                { message: 'Keputusan persetujuan tidak valid.' },
                { status: 400 },
            );
        }
        if (
            typeof payload !== 'object' ||
            payload === null ||
            !('approvalStatus' in payload) ||
            (payload.approvalStatus !== 'Disetujui' &&
                payload.approvalStatus !== 'Tidak Disetujui')
        ) {
            return NextResponse.json(
                { message: 'Status persetujuan tidak valid.' },
                { status: 422 },
            );
        }

        const db = await getDb();
        const borrowings = db.collection<BorrowingDocument>('borrowings');
        await ensureBorrowingApprovalStatuses(borrowings);
        await ensureAssetDataModel(db);
        const approvalStatus = payload.approvalStatus;
        const pendingFilter: Filter<BorrowingDocument> = {
            _id: new ObjectId(id),
            approvalStatus: 'Menunggu Persetujuan',
        };
        const borrowing = await borrowings.findOne(pendingFilter);
        if (!borrowing) {
            return NextResponse.json(
                {
                    message: 'Pengajuan tidak ditemukan atau sudah diproses.',
                },
                { status: 409 },
            );
        }

        const reviewedAt = new Date();
        const assetIds = Array.from(
            new Set((borrowing.assets ?? []).map((asset) => asset.id)),
        )
            .filter((assetId) => ObjectId.isValid(assetId))
            .map((assetId) => new ObjectId(assetId));
        const assets = db.collection<AssetDocument>('assets');
        const updatedAssetIds: ObjectId[] = [];
        if (approvalStatus === 'Disetujui' && assetIds.length) {
            const requestedAssets = await assets
                .find({ _id: { $in: assetIds } })
                .toArray();
            if (
                requestedAssets.length !== assetIds.length ||
                requestedAssets.some((asset) => asset.status !== 'Tersedia')
            ) {
                return NextResponse.json(
                    {
                        message:
                            'Salah satu aset sudah tidak tersedia. Perbarui data aset sebelum menyetujui.',
                    },
                    { status: 409 },
                );
            }

            for (const asset of requestedAssets) {
                const result = await assets.updateOne(
                    { _id: asset._id, status: 'Tersedia' },
                    {
                        $set: {
                            status: 'Diproses Peminjam',
                            updatedAt: reviewedAt,
                        },
                    },
                );
                if (result.modifiedCount !== 1) {
                    await Promise.all(
                        updatedAssetIds.map(async (assetId) => {
                            const rollback = await assets.updateOne(
                                {
                                    _id: assetId,
                                    status: 'Diproses Peminjam',
                                },
                                {
                                    $set: {
                                        status: 'Tersedia',
                                        updatedAt: new Date(),
                                    },
                                },
                            );
                            if (rollback.modifiedCount !== 1) {
                                throw new Error(
                                    'Status aset tidak dapat dipulihkan setelah persetujuan gagal.',
                                );
                            }
                        }),
                    );
                    return NextResponse.json(
                        {
                            message:
                                'Salah satu aset sudah tidak tersedia. Perbarui data aset sebelum menyetujui.',
                        },
                        { status: 409 },
                    );
                }
                updatedAssetIds.push(asset._id);
            }
        }

        const result = await borrowings.updateOne(
            pendingFilter,
            {
                $set: {
                    approvalStatus,
                    reviewedBy: new ObjectId(access.user.id),
                    reviewedAt,
                    updatedAt: reviewedAt,
                },
            },
        );
        if (result.modifiedCount !== 1) {
            await Promise.all(
                updatedAssetIds.map(async (assetId) => {
                    const rollback = await assets.updateOne(
                        { _id: assetId, status: 'Diproses Peminjam' },
                        {
                            $set: {
                                status: 'Tersedia',
                                updatedAt: new Date(),
                            },
                        },
                    );
                    if (rollback.modifiedCount !== 1) {
                        throw new Error(
                            'Status aset tidak dapat dipulihkan setelah persetujuan gagal.',
                        );
                    }
                }),
            );
            return NextResponse.json(
                {
                    message:
                        'Pengajuan sudah diproses pengguna lain. Muat ulang data.',
                },
                { status: 409 },
            );
        }

        return NextResponse.json({
            borrowing: displayBorrowing({
                ...borrowing,
                approvalStatus,
                reviewedBy: new ObjectId(access.user.id),
                reviewedAt,
                updatedAt: reviewedAt,
            }),
        });
    } catch (error) {
        return reportManagementError('borrowing approval decision', error);
    }
}
