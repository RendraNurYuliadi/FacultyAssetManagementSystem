import 'server-only';
import {
    createHmac,
    randomBytes,
    randomUUID,
    scrypt,
    timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { getDb } from './db';

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = 'fams_session';
const RESET_COOKIE = 'fams_password_reset';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type SessionUser = {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'pengelola' | 'peminjam';
    avatar?: string;
};

type SignedPayload = {
    email?: string;
    exp: number;
    scope: 'session' | 'password-reset';
    jti?: string;
    id?: string;
    name?: string;
    role?: SessionUser['role'];
    avatar?: string;
};

function getSecret() {
    const secret = process.env.SESSION_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) {
        throw new Error(
            'SESSION_SECRET harus diatur dengan nilai acak minimal 32 karakter.',
        );
    }
    return secret;
}

function signature(payload: string) {
    return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

function sign(payload: SignedPayload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${signature(encoded)}`;
}

function verify(token: string | undefined, scope: SignedPayload['scope']) {
    if (!token) return null;
    const [encoded, suppliedSignature] = token.split('.');
    if (!encoded || !suppliedSignature) return null;

    const expected = Buffer.from(signature(encoded));
    const supplied = Buffer.from(suppliedSignature);
    if (
        expected.length !== supplied.length ||
        !timingSafeEqual(expected, supplied)
    ) {
        return null;
    }

    try {
        const payload = JSON.parse(
            Buffer.from(encoded, 'base64url').toString('utf8'),
        ) as SignedPayload;
        if (
            payload.scope !== scope ||
            typeof payload.exp !== 'number' ||
            payload.exp <= Date.now()
        ) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

export async function hashSecret(value: string) {
    const salt = randomBytes(16);
    const digest = (await scryptAsync(value, salt, 64)) as Buffer;
    return `scrypt$${salt.toString('hex')}$${digest.toString('hex')}`;
}

export async function verifySecret(value: string, stored: string) {
    const [algorithm, saltHex, digestHex] = stored.split('$');
    if (
        algorithm !== 'scrypt' ||
        !saltHex ||
        !digestHex ||
        !/^[a-f0-9]{32}$/i.test(saltHex) ||
        !/^[a-f0-9]{128}$/i.test(digestHex)
    ) {
        return false;
    }
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(digestHex, 'hex');
    const actual = (await scryptAsync(value, salt, expected.length)) as Buffer;
    return (
        expected.length === actual.length && timingSafeEqual(expected, actual)
    );
}

function cookieOptions(maxAge: number) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge,
    };
}

export function createSession(user: SessionUser, remember: boolean) {
    const maxAge = remember ? SESSION_MAX_AGE : 60 * 60 * 12;
    const sessionId = randomUUID();
    return {
        sessionId,
        name: SESSION_COOKIE,
        value: sign({
            id: user.id,
            jti: sessionId,
            scope: 'session',
            exp: Date.now() + maxAge * 1000,
        }),
        options: cookieOptions(maxAge),
    };
}

export async function getSessionUser(): Promise<SessionUser | null> {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const payload = verify(token, 'session');
    if (
        !payload?.id ||
        !payload.jti ||
        !ObjectId.isValid(payload.id)
    ) {
        return null;
    }
    const db = await getDb();
    const session = await db
        .collection<{
            _id: string;
            userId: ObjectId;
            expiresAt: Date;
        }>('auth_sessions')
        .findOne({
            _id: payload.jti,
            userId: new ObjectId(payload.id),
            expiresAt: { $gt: new Date() },
        });
    if (!session) return null;
    const user = await db
        .collection<{
            _id: ObjectId;
            name: string;
            email: string;
            role: SessionUser['role'];
            hasAvatar?: boolean;
            avatar?: string;
        }>('users')
        .findOne(
            { _id: new ObjectId(payload.id) },
            {
                projection: {
                    name: 1,
                    email: 1,
                    role: 1,
                    hasAvatar: 1,
                    avatar: 1,
                },
            },
        );
    if (!user || !['admin', 'pengelola', 'peminjam'].includes(user.role)) {
        return null;
    }
    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        avatar:
            user.avatar?.startsWith('/assets/uploads/management/users/') ||
            user.hasAvatar
                ? user.avatar?.startsWith('/assets/uploads/management/users/')
                    ? user.avatar
                    : '/api/profile/avatar'
                : undefined,
    };
}

export function getSessionId(token: string | undefined) {
    return verify(token, 'session')?.jti ?? null;
}

export function createPasswordResetGrant(email: string) {
    const maxAge = 10 * 60;
    return {
        name: RESET_COOKIE,
        value: sign({
            email,
            scope: 'password-reset',
            exp: Date.now() + maxAge * 1000,
        }),
        options: cookieOptions(maxAge),
    };
}

export async function getPasswordResetEmail() {
    const token = (await cookies()).get(RESET_COOKIE)?.value;
    return verify(token, 'password-reset')?.email ?? null;
}

export function clearPasswordResetGrant() {
    return {
        name: RESET_COOKIE,
        value: '',
        options: { ...cookieOptions(0), expires: new Date(0) },
    };
}
