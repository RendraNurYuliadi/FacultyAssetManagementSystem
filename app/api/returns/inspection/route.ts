import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/db';
import {
    reportManagementError,
    requireBorrowingManager,
} from '@/lib/server/management';
import {
    displayReturn,
    ensureReturnDataModel,
    type ReturnDocument,
} from '@/lib/server/returns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const access = await requireBorrowingManager();
        if (access.response) return access.response;

        const db = await getDb();
        await ensureReturnDataModel(db);
        const returnRequests = await db
            .collection<ReturnDocument>('returns')
            .find({})
            .sort({ submittedAt: -1 })
            .toArray();

        return NextResponse.json({
            returns: returnRequests.map(displayReturn),
        });
    } catch (error) {
        return reportManagementError('return inspection listing', error);
    }
}
