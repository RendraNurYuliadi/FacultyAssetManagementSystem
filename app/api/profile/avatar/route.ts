import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getSessionUser } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const user = await getSessionUser();
    if (!user || !ObjectId.isValid(user.id)) {
        return new NextResponse(null, { status: 401 });
    }
    const record = await (await getDb())
        .collection<{ avatar?: string }>('users')
        .findOne(
            { _id: new ObjectId(user.id) },
            { projection: { avatar: 1 } },
        );
    if (record?.avatar?.startsWith('/assets/uploads/management/users/')) {
        return NextResponse.redirect(new URL(record.avatar, request.url));
    }
    const match = record?.avatar?.match(
        /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match) return new NextResponse(null, { status: 404 });

    return new NextResponse(Buffer.from(match[2], 'base64'), {
        headers: {
            'Content-Type': match[1],
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
