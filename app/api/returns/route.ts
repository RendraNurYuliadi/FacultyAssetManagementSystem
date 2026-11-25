import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ObjectId, type Collection } from 'mongodb';
import { getSessionUser } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';
import {
    ensureAssetDataModel,
    type AssetDocument,
} from '@/lib/server/assets';
import {
    handleManagementImageError,
    reportManagementError,
    removeManagementImage,
    storeManagementImage,
} from '@/lib/server/management';
import {
    ensureBorrowingApprovalStatuses,
    type BorrowingDocument,
} from '@/lib/server/borrowings';
import {
    displayReturn,
    ensureReturnDataModel,
    type ReturnDocument,
    type OngoingBorrowingReturn,
} from '@/lib/server/returns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(message: string, status = 422) {
    return NextResponse.json({ message }, { status });
}

function isValidDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

function codeForToday() {
    return `PGB-${new Date().getFullYear()}-${randomBytes(3)
        .toString('hex')
        .toUpperCase()}`;
}

async function rollbackAssetStatuses(
    assets: Collection<AssetDocument>,
    assetIds: ObjectId[],
) {
    await Promise.all(
        assetIds.map(async (assetId) => {
            const result = await assets.updateOne(
                { _id: assetId, status: 'Diproses Pengembalian' },
                {
                    $set: {
                        status: 'Dipinjam',
                        updatedAt: new Date(),
                    },
                },
            );
            if (result.modifiedCount !== 1) {
                const alreadyRestored = await assets.findOne(
                    { _id: assetId, status: 'Dipinjam' },
                    { projection: { _id: 1 } },
                );
                if (!alreadyRestored) {
                    throw new Error(
                        'Status aset tidak dapat dipulihkan setelah pengajuan pengembalian gagal.',
                    );
                }
            }
        }),
    );
}

async function removeStoredPhotos(paths: string[]) {
    await Promise.all(
        paths.map(async (photo) => {
            try {
                await removeManagementImage(photo);
            } catch (error) {
                console.error(
                    'FAMS could not remove a failed return photo:',
                    error,
                );
            }
        }),
    );
    paths.length = 0;
}

export async function GET() {
    try {
        const user = await getSessionUser();
        if (!user) {
            return errorResponse(
                'Sesi tidak valid. Silakan masuk kembali.',
                401,
            );
        }
        if (!ObjectId.isValid(user.id)) {
            return errorResponse('Identitas akun tidak valid.', 401);
        }

        const db = await getDb();
        await ensureAssetDataModel(db);
        await ensureReturnDataModel(db);
        const userId = new ObjectId(user.id);
        const borrowings =
            db.collection<BorrowingDocument>('borrowings');
        await ensureBorrowingApprovalStatuses(borrowings);
        const [approvedBorrowings, returnRequests] = await Promise.all([
            borrowings
                .find(
                    { userId, approvalStatus: 'Disetujui' },
                    {
                        projection: {
                            assets: 1,
                            code: 1,
                            borrower: 1,
                            identity: 1,
                            borrowDate: 1,
                            returnDate: 1,
                            purpose: 1,
                        },
                    },
                )
                .sort({ createdAt: -1 })
                .toArray(),
            db
                .collection<ReturnDocument>('returns')
                .find({ userId })
                .sort({ submittedAt: -1 })
                .toArray(),
        ]);
        const assetIds = Array.from(
            new Set(
                approvedBorrowings.flatMap((borrowing) =>
                    (borrowing.assets ?? [])
                        .map((asset) => asset.id)
                        .filter(ObjectId.isValid),
                ),
            ),
        ).map((id) => new ObjectId(id));
        const assetDocuments = assetIds.length
            ? await db
                  .collection<AssetDocument>('assets')
                  .find({ _id: { $in: assetIds } })
                  .toArray()
            : [];
        const assetsById = new Map(
            assetDocuments.map((asset) => [
                asset._id.toString(),
                asset,
            ]),
        );
        const ongoingBorrowings: OngoingBorrowingReturn[] =
            approvedBorrowings.flatMap((borrowing) => {
                const eligibleAssets = (borrowing.assets ?? []).filter(
                    (asset) =>
                        assetsById.get(asset.id)?.status === 'Dipinjam',
                );
                if (!eligibleAssets.length) return [];

                return [
                    {
                        id: borrowing._id.toString(),
                        code: borrowing.code,
                        borrower: borrowing.borrower,
                        identity: borrowing.identity,
                        borrowDate: borrowing.borrowDate,
                        dueDate: borrowing.returnDate,
                        purpose: borrowing.purpose,
                        assets: eligibleAssets,
                    },
                ];
            });

        return NextResponse.json({
            borrowings: ongoingBorrowings,
            returns: returnRequests.map(displayReturn),
        });
    } catch (error) {
        return reportManagementError('return listing', error);
    }
}

export async function POST(request: Request) {
    const storedPhotos: string[] = [];
    const transitionedAssetIds: ObjectId[] = [];
    let assetsForRollback: Collection<AssetDocument> | null = null;
    try {
        const user = await getSessionUser();
        if (!user) {
            return errorResponse(
                'Sesi tidak valid. Silakan masuk kembali.',
                401,
            );
        }
        if (!ObjectId.isValid(user.id)) {
            return errorResponse('Identitas akun tidak valid.', 401);
        }

        let form: FormData;
        try {
            form = await request.formData();
        } catch {
            return errorResponse('Form pengembalian tidak valid.', 400);
        }
        const borrowingId = form.get('borrowingId');
        const returnDate = form.get('returnDate');
        const notesValue = form.get('notes');
        const notes = typeof notesValue === 'string' ? notesValue.trim() : '';
        const photoValues = form.getAll('photos');
        if (
            typeof borrowingId !== 'string' ||
            !ObjectId.isValid(borrowingId) ||
            typeof returnDate !== 'string' ||
            !isValidDate(returnDate) ||
            (notesValue !== null && typeof notesValue !== 'string') ||
            photoValues.some(
                (value) => !(value instanceof File),
            )
        ) {
            return errorResponse('Lengkapi data pengembalian dengan benar.');
        }
        const photoFiles = photoValues.filter(
            (value): value is File => value instanceof File && value.size > 0,
        );
        if (
            notes.length > 2000 ||
            photoFiles.length > 10
        ) {
            return errorResponse(
                photoFiles.length > 10
                    ? 'Maksimal 10 foto dapat diunggah.'
                    : 'Catatan pengembalian maksimal 2000 karakter.',
            );
        }

        const today = new Date().toISOString().slice(0, 10);
        if (returnDate > today) {
            return errorResponse(
                'Tanggal pengembalian tidak boleh di masa depan.',
            );
        }

        const db = await getDb();
        await ensureAssetDataModel(db);
        await ensureReturnDataModel(db);
        const userId = new ObjectId(user.id);
        const borrowingCollection =
            db.collection<BorrowingDocument>('borrowings');
        await ensureBorrowingApprovalStatuses(borrowingCollection);
        const borrowing = await borrowingCollection.findOne({
            _id: new ObjectId(borrowingId),
            userId,
            approvalStatus: 'Disetujui',
        });
        if (!borrowing) {
            return errorResponse(
                'Peminjaman tidak ditemukan atau belum disetujui.',
                404,
            );
        }
        if (returnDate < borrowing.borrowDate) {
            return errorResponse(
                'Tanggal pengembalian tidak boleh sebelum tanggal peminjaman.',
            );
        }

        const requestedAssets = (borrowing.assets ?? []).filter(
            (asset) => ObjectId.isValid(asset.id),
        );
        if (!requestedAssets.length) {
            return errorResponse(
                'Peminjaman ini tidak memiliki data aset yang valid.',
                409,
            );
        }

        const assets = db.collection<AssetDocument>('assets');
        assetsForRollback = assets;
        const assetDocuments = await assets
            .find({
                _id: {
                    $in: requestedAssets.map(
                        (asset) => new ObjectId(asset.id),
                    ),
                },
            })
            .toArray();
        const eligibleAssetIds = new Set(
            assetDocuments
                .filter((asset) => asset.status === 'Dipinjam')
                .map((asset) => asset._id.toString()),
        );
        const returnAssets = requestedAssets.filter((asset) =>
            eligibleAssetIds.has(asset.id),
        );
        if (!returnAssets.length) {
            return errorResponse(
                'Tidak ada aset pada peminjaman ini yang berstatus Dipinjam.',
                409,
            );
        }

        const photos: string[] = [];
        for (const file of photoFiles) {
            const photoPath = await storeManagementImage(file, 'returns');
            photos.push(photoPath);
            storedPhotos.push(photoPath);
        }

        const returnCollection =
            db.collection<ReturnDocument>('returns');
        await returnCollection.createIndex({ code: 1 }, { unique: true });
        let code = codeForToday();
        while (await returnCollection.findOne({ code }, { projection: { _id: 1 } })) {
            code = codeForToday();
        }

        const now = new Date();
        const returnRequest: ReturnDocument = {
            _id: new ObjectId(),
            code,
            borrowingId: borrowing._id,
            borrowingCode: borrowing.code,
            userId,
            borrower: borrowing.borrower,
            identity: borrowing.identity,
            assets: returnAssets,
            photos,
            returnDate,
            notes,
            submittedAt: now,
            updatedAt: now,
        };
        for (const asset of returnAssets) {
            const result = await assets.updateOne(
                { _id: new ObjectId(asset.id), status: 'Dipinjam' },
                {
                    $set: {
                        status: 'Diproses Pengembalian',
                        updatedAt: now,
                    },
                },
            );
            if (result.modifiedCount !== 1) {
                await rollbackAssetStatuses(assets, transitionedAssetIds);
                transitionedAssetIds.length = 0;
                await removeStoredPhotos(storedPhotos);
                return errorResponse(
                    'Status salah satu aset berubah. Muat ulang data sebelum mengirim kembali.',
                    409,
                );
            }
            transitionedAssetIds.push(new ObjectId(asset.id));
        }

        try {
            await returnCollection.insertOne(returnRequest);
        } catch (error) {
            await rollbackAssetStatuses(assets, transitionedAssetIds);
            transitionedAssetIds.length = 0;
            throw error;
        }

        transitionedAssetIds.length = 0;
        return NextResponse.json(
            { returnRequest: displayReturn(returnRequest) },
            { status: 201 },
        );
    } catch (error) {
        if (assetsForRollback && transitionedAssetIds.length) {
            try {
                await rollbackAssetStatuses(
                    assetsForRollback,
                    transitionedAssetIds,
                );
            } catch (rollbackError) {
                console.error(
                    'FAMS could not restore asset statuses after a failed return submission:',
                    rollbackError,
                );
            }
        }
        await removeStoredPhotos(storedPhotos);
        const imageError = handleManagementImageError(error);
        if (imageError) return imageError;
        return reportManagementError('return submission', error);
    }
}
