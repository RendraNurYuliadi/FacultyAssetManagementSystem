import 'server-only';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessionUser, type SessionUser } from './auth';

const imageTypes = {
    'image/jpeg': { extension: 'jpg', signature: (data: Buffer) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
    'image/png': { extension: 'png', signature: (data: Buffer) => data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    'image/webp': { extension: 'webp', signature: (data: Buffer) => data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' },
} as const;

const maxImageSize = 5 * 1024 * 1024;
const imageRoot = path.join(
    process.cwd(),
    'public',
    'assets',
    'uploads',
    'management',
);
const publicImageRoot = '/assets/uploads/management/';

export async function requireAdmin(): Promise<
    | { user: SessionUser; response?: never }
    | { user?: never; response: NextResponse }
> {
    const user = await getSessionUser();
    if (!user) {
        return {
            response: NextResponse.json(
                { message: 'Sesi tidak valid. Silakan masuk kembali.' },
                { status: 401 },
            ),
        };
    }
    if (user.role !== 'admin') {
        return {
            response: NextResponse.json(
                { message: 'Akses hanya tersedia untuk administrator.' },
                { status: 403 },
            ),
        };
    }
    return { user };
}

export class InvalidManagementImageError extends Error {}

export async function storeManagementImage(
    file: File,
    category: 'users' | 'organizations' | 'locations' | 'rooms' | 'items',
) {
    if (file.size < 1 || file.size > maxImageSize) {
        throw new InvalidManagementImageError(
            'Foto harus JPG, PNG, atau WEBP dan maksimal 5 MB.',
        );
    }

    const contents = Buffer.from(await file.arrayBuffer());
    return storeManagementImageBuffer(contents, file.type, category);
}

export async function storeManagementImageBuffer(
    contents: Buffer,
    mime: string,
    category: 'users' | 'organizations' | 'locations' | 'rooms' | 'items',
) {
    const type = imageTypes[mime as keyof typeof imageTypes];
    if (!type || contents.length < 1 || contents.length > maxImageSize) {
        throw new InvalidManagementImageError(
            'Foto harus JPG, PNG, atau WEBP dan maksimal 5 MB.',
        );
    }
    if (!type.signature(contents)) {
        throw new InvalidManagementImageError(
            'Isi file tidak sesuai dengan format gambar.',
        );
    }

    const filename = `${randomUUID()}.${type.extension}`;
    const directory = path.join(imageRoot, category);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), contents, {
        flag: 'wx',
        mode: 0o644,
    });

    return `${publicImageRoot}${category}/${filename}`;
}

export async function removeManagementImage(value: unknown) {
    if (typeof value !== 'string' || !value.startsWith(publicImageRoot)) {
        return;
    }

    const relativePath = value.slice(publicImageRoot.length);
    if (!/^(users|organizations|locations|rooms|items)\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(relativePath)) {
        return;
    }

    const root = path.resolve(imageRoot);
    const target = path.resolve(root, relativePath);
    if (!target.startsWith(`${root}${path.sep}`)) return;

    try {
        await unlink(target);
    } catch (error) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'ENOENT'
        ) {
            return;
        }
        throw error;
    }
}

export function reportManagementError(scope: string, error: unknown) {
    console.error(`FAMS ${scope} request failed:`, error);
    return NextResponse.json(
        { message: 'Terjadi kesalahan saat memproses data. Silakan coba lagi.' },
        { status: 500 },
    );
}

export function handleManagementImageError(error: unknown) {
    if (error instanceof InvalidManagementImageError) {
        return NextResponse.json({ message: error.message }, { status: 422 });
    }
    return null;
}

export async function removeOldManagementImage(
    value: unknown,
    replacement?: string,
) {
    if (typeof value !== 'string' || value === replacement) return;
    try {
        await removeManagementImage(value);
    } catch (error) {
        console.error('FAMS could not remove an old management image:', error);
    }
}
