import 'server-only';
import { createHash } from 'node:crypto';
import { getDb } from './db';

type LimitRecord = {
    _id: string;
    count: number;
    windowStartedAt: number;
};

export async function consumeRateLimit(
    scope: string,
    key: string,
    limit: number,
    windowMs: number,
) {
    const db = await getDb();
    const keyHash = createHash('sha256').update(key).digest('hex');
    const now = Date.now();
    const expired = {
        $gte: [
            { $subtract: [now, { $ifNull: ['$windowStartedAt', 0] }] },
            windowMs,
        ],
    };
    const result = await db
        .collection<LimitRecord>('auth_rate_limits')
        .findOneAndUpdate(
            { _id: `${scope}:${keyHash}` },
            [
                {
                    $set: {
                        windowStartedAt: {
                            $cond: [
                                expired,
                                now,
                                { $ifNull: ['$windowStartedAt', now] },
                            ],
                        },
                        count: {
                            $cond: [
                                expired,
                                1,
                                { $add: [{ $ifNull: ['$count', 0] }, 1] },
                            ],
                        },
                        updatedAt: new Date(now),
                    },
                },
            ],
            { upsert: true, returnDocument: 'after' },
        );
    const record = (
        result && 'value' in result ? result.value : result
    ) as LimitRecord | null;
    return (record?.count ?? limit + 1) <= limit;
}
