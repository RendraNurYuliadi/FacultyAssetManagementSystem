import 'server-only';
import { ObjectId, type Db } from 'mongodb';
import type { AssetCondition } from './assets';
import type { BorrowingAssetSnapshot } from './borrowings';

export type ReturnAssetSnapshot = BorrowingAssetSnapshot & {
    inspectionCondition?: AssetCondition;
    inspectionNotes?: string;
    inspectedAt?: Date | string;
    inspectedBy?: ObjectId;
};

export type ReturnDocument = {
    _id: ObjectId;
    code: string;
    borrowingId: ObjectId;
    borrowingCode: string;
    userId: ObjectId;
    borrower: string;
    identity: string;
    assets: ReturnAssetSnapshot[];
    photos: string[];
    returnDate: string;
    notes: string;
    submittedAt: Date;
    updatedAt?: Date;
};

export type OngoingBorrowingReturn = {
    id: string;
    code: string;
    borrower: string;
    identity: string;
    borrowDate: string;
    dueDate: string;
    purpose: string;
    assets: BorrowingAssetSnapshot[];
};

let returnDataModelMigration: Promise<void> | null = null;

export async function ensureReturnDataModel(db: Db) {
    if (!returnDataModelMigration) {
        returnDataModelMigration = db
            .collection('returns')
            .updateMany(
                { status: { $exists: true } },
                { $unset: { status: '' } },
            )
            .then(() => undefined)
            .catch((error: unknown) => {
                returnDataModelMigration = null;
                throw error;
            });
    }

    await returnDataModelMigration;
}

function dateOnly(value: Date | string | undefined) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') return value.slice(0, 10);
    return '';
}

export function displayReturn(returnRequest: ReturnDocument) {
    return {
        id: returnRequest._id.toString(),
        code: returnRequest.code,
        borrowingId: returnRequest.borrowingId.toString(),
        borrowingCode: returnRequest.borrowingCode,
        borrower: returnRequest.borrower,
        identity: returnRequest.identity,
        assets: (Array.isArray(returnRequest.assets)
            ? returnRequest.assets
            : []
        ).map((asset) => ({
            ...asset,
            inspectedAt: dateOnly(asset.inspectedAt),
            inspectedBy:
                asset.inspectedBy instanceof ObjectId
                    ? asset.inspectedBy.toString()
                    : '',
        })),
        photos: Array.isArray(returnRequest.photos)
            ? returnRequest.photos
            : [],
        returnDate: returnRequest.returnDate,
        notes: returnRequest.notes,
        submittedAt: dateOnly(returnRequest.submittedAt),
    };
}
