import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/db';
import {
    displayBorrowing,
    ensureBorrowingApprovalStatuses,
    type BorrowingDocument,
} from '@/lib/server/borrowings';
import { ensureAssetDataModel } from '@/lib/server/assets';
import {
    reportManagementError,
    requireBorrowingManager,
} from '@/lib/server/management';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const access = await requireBorrowingManager();
        if (access.response) return access.response;

        const db = await getDb();
        await ensureAssetDataModel(db);
        const collection = db.collection<BorrowingDocument>('borrowings');
        await ensureBorrowingApprovalStatuses(collection);
        const borrowings = await collection
            .find({})
            .sort({ createdAt: -1 })
            .toArray();

        return NextResponse.json({
            borrowings: borrowings.map(displayBorrowing),
        });
    } catch (error) {
        return reportManagementError('borrowing approval listing', error);
    }
}
