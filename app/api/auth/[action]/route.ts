import { randomInt } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import {
    clearPasswordResetGrant,
    createPasswordResetGrant,
    createSession,
    getPasswordResetEmail,
    getSessionId,
    hashSecret,
    verifySecret,
} from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';
import {
    removeOldManagementImage,
    storeManagementImageBuffer,
} from '@/lib/server/management';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import {
    storedBorrowerType,
    validateUserProfile,
} from '@/lib/server/user-profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UserDocument = {
    _id: ObjectId;
    name: string;
    email: string;
    passwordHash: string;
    role: 'admin' | 'pengelola' | 'peminjam';
    avatar?: string;
};

type ResetCode = {
    email: string;
    codeHash: string;
    attempts: number;
    expiresAt: Date;
};

type ProfilePhotoChunk = {
    uploadId: string;
    index: number;
    parts: number;
    mime: string;
    data: string;
    expiresAt: Date;
};

type FormFields = Record<string, FormDataEntryValue | undefined>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const photoMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const photoChunkSize = 1024 * 1024;
const maxPhotoSize = 5 * photoChunkSize;
const uploadIdPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resetStatus =
    'Jika email terdaftar, kode verifikasi telah dikirim dan berlaku selama 10 menit.';

function fieldErrors(errors: Record<string, string>, status = 422) {
    return NextResponse.json({ errors }, { status });
}

function text(fields: FormFields, key: string) {
    const value = fields[key];
    return typeof value === 'string' ? value.trim() : '';
}

function rawText(fields: FormFields, key: string) {
    const value = fields[key];
    return typeof value === 'string' ? value : '';
}

function emailValue(fields: FormFields) {
    return text(fields, 'email').toLowerCase();
}

function isValidImage(mime: string, image: Buffer) {
    return (
        (mime === 'image/jpeg' &&
            image[0] === 0xff &&
            image[1] === 0xd8 &&
            image[2] === 0xff) ||
        (mime === 'image/png' &&
            image.subarray(0, 8).equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            )) ||
        (mime === 'image/webp' &&
            image.toString('ascii', 0, 4) === 'RIFF' &&
            image.toString('ascii', 8, 12) === 'WEBP')
    );
}

function rateKey(request: NextRequest) {
    return (
        request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
        request.headers.get('x-real-ip') ||
        'unknown'
    );
}

function redirectResponse(path: string, status?: string) {
    const url = new URL(path, 'http://localhost');
    if (status) url.searchParams.set('status', status);
    return NextResponse.json({ redirect: `${url.pathname}${url.search}` });
}

function configuredTransport() {
    const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) return null;
    return createTransport({
        host: SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
    });
}

async function login(request: NextRequest, fields: FormFields) {
    if (!(await consumeRateLimit('login', rateKey(request), 5, 60_000))) {
        return fieldErrors(
            { email: 'Terlalu banyak percobaan. Coba lagi dalam satu menit.' },
            429,
        );
    }

    const email = emailValue(fields);
    const password = rawText(fields, 'password');
    if (
        !emailPattern.test(email) ||
        email.length > 255 ||
        !password ||
        password.length > 255
    ) {
        return fieldErrors({
            email: 'Email atau password yang Anda masukkan tidak sesuai.',
        });
    }

    const db = await getDb();
    const user = await db
        .collection<UserDocument>('users')
        .findOne({ email });
    if (!user || !(await verifySecret(password, user.passwordHash))) {
        return fieldErrors({
            email: 'Email atau password yang Anda masukkan tidak sesuai.',
        });
    }

    const response = redirectResponse('/dashboard');
    const session = createSession(
        {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
        },
        text(fields, 'remember') === 'true',
    );
    await db
        .collection<{
            _id: string;
            userId: ObjectId;
            expiresAt: Date;
            createdAt: Date;
        }>('auth_sessions')
        .insertOne({
            _id: session.sessionId,
            userId: user._id,
            expiresAt: new Date(
                Date.now() + session.options.maxAge * 1000,
            ),
            createdAt: new Date(),
        });
    response.cookies.set(session.name, session.value, session.options);
    return response;
}

async function register(request: NextRequest, fields: FormFields) {
    if (!(await consumeRateLimit('register', rateKey(request), 5, 60_000))) {
        return fieldErrors(
            { email: 'Terlalu banyak percobaan. Coba lagi dalam satu menit.' },
            429,
        );
    }

    const email = emailValue(fields);
    const name = text(fields, 'name');
    const phone = text(fields, 'phone');
    const borrowerType = text(fields, 'borrower_type');
    const identityNumber = text(fields, 'identity_number');
    const faculty = text(fields, 'faculty');
    const studyProgram = text(fields, 'study_program');
    const enrollmentYear = text(fields, 'enrollment_year');
    const unitName = text(fields, 'unit_name');
    const position = text(fields, 'position');
    const organizationName = text(fields, 'organization_name');
    const borrowingContext = text(fields, 'borrowing_context');
    const address = text(fields, 'address');
    const password = rawText(fields, 'password');
    const confirmation = rawText(fields, 'password_confirmation');
    const profile = {
        name,
        email,
        phone,
        borrower_type: borrowerType,
        identity_number: identityNumber,
        faculty,
        study_program: studyProgram,
        enrollment_year: enrollmentYear,
        unit_name: unitName,
        position,
        organization_name: organizationName,
        borrowing_context: borrowingContext,
        address,
    };
    const errors = validateUserProfile(profile);
    if (!password || password.length < 8) {
        errors.password = 'Password minimal 8 karakter.';
    } else if (password.length > 255) {
        errors.password = 'Password maksimal 255 karakter.';
    } else if (password !== confirmation) {
        errors.password_confirmation = 'Konfirmasi password tidak sama.';
    }
    const external =
        borrowerType === 'eksternal' || borrowerType === 'lainnya';

    const photo = fields.photo;
    const photoUploadId = text(fields, 'photo_upload_id');
    let avatar: string | undefined;
    let photoBytes: Buffer | undefined;
    let photoMime: string | undefined;
    if (photoUploadId && photo !== undefined) {
        errors.photo = 'Unggah satu foto profil saja.';
    } else if (photoUploadId && !uploadIdPattern.test(photoUploadId)) {
        errors.photo = 'Unggahan foto tidak valid. Pilih foto kembali.';
    } else if (photoUploadId) {
        const chunks = await (await getDb())
            .collection<ProfilePhotoChunk>('profile_photo_uploads')
            .find({ uploadId: photoUploadId })
            .sort({ index: 1 })
            .toArray();
        const expectedParts = chunks[0]?.parts;
        const complete =
            !!expectedParts &&
            chunks.length === expectedParts &&
            chunks.every(
                (chunk, index) =>
                    chunk.index === index &&
                    chunk.parts === expectedParts &&
                    chunk.mime === chunks[0].mime,
            );
        if (!complete) {
            errors.photo = 'Unggahan foto kedaluwarsa. Pilih foto kembali.';
        } else {
            photoMime = chunks[0].mime;
            photoBytes = Buffer.concat(
                chunks.map(({ data }) => Buffer.from(data, 'base64')),
            );
            if (photoBytes.length > maxPhotoSize) {
                errors.photo = 'Foto harus JPG, PNG, atau WEBP dan maksimal 5 MB.';
            }
        }
        await (await getDb())
            .collection<ProfilePhotoChunk>('profile_photo_uploads')
            .deleteMany({ uploadId: photoUploadId });
    } else if (photo !== undefined && !(photo instanceof File)) {
        errors.photo = 'Foto profil harus berupa file gambar.';
    }
    if (photo instanceof File && photo.size > 0) {
        if (
            !photoMimeTypes.includes(photo.type) ||
            photo.size > maxPhotoSize
        ) {
            errors.photo = 'Foto harus JPG, PNG, atau WEBP dan maksimal 5 MB.';
        } else {
            photoMime = photo.type;
            photoBytes = Buffer.from(await photo.arrayBuffer());
        }
    }
    if (
        photoBytes &&
        photoMime &&
        !errors.photo &&
        !isValidImage(photoMime, photoBytes)
    ) {
        errors.photo = 'File foto profil tidak valid.';
    }
    if (Object.keys(errors).length) return fieldErrors(errors);

    const db = await getDb();
    const users = db.collection('users');
    const duplicateErrors: Record<string, string> = {};
    if (await users.findOne({ email }, { projection: { _id: 1 } })) {
        duplicateErrors.email = 'Email sudah digunakan. Gunakan nilai lain.';
    }
    if (
        identityNumber &&
        (await users.findOne(
            { identity_number: identityNumber },
            { projection: { _id: 1 } },
        ))
    ) {
        duplicateErrors.identity_number =
            'NIM/NIP/NIK sudah digunakan. Gunakan nilai lain.';
    }
    if (Object.keys(duplicateErrors).length) return fieldErrors(duplicateErrors);

    if (photoBytes && photoMime) {
        avatar = await storeManagementImageBuffer(
            photoBytes,
            photoMime,
            'users',
        );
    }

    const user: Record<string, unknown> = {
        name,
        email,
        phone,
        role: 'peminjam',
        borrower_type: storedBorrowerType(borrowerType),
        passwordHash: await hashSecret(password),
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    if (avatar) user.hasAvatar = true;
    for (const [key, value] of Object.entries({
        identity_number: identityNumber,
        faculty,
        study_program: studyProgram,
        enrollment_year: enrollmentYear ? Number(enrollmentYear) : undefined,
        unit_name: unitName,
        position,
        organization_name: organizationName,
        borrowing_context: borrowingContext,
        address,
        avatar,
    })) {
        if (value) user[key] = value;
    }

    try {
        await users.insertOne(user);
    } catch (error) {
        if (avatar) await removeOldManagementImage(avatar);
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 11000
        ) {
            const duplicateField =
                'keyPattern' in error &&
                typeof error.keyPattern === 'object' &&
                error.keyPattern !== null &&
                'identity_number' in error.keyPattern
                    ? 'identity_number'
                    : 'email';
            return fieldErrors({
                [duplicateField]:
                    duplicateField === 'email'
                        ? 'Email sudah digunakan. Gunakan nilai lain.'
                        : 'NIM/NIP/NIK sudah digunakan. Gunakan nilai lain.',
            });
        }
        throw error;
    }
    return redirectResponse(
        '/login',
        'Akun berhasil dibuat. Silakan masuk dengan email dan password Anda.',
    );
}

async function uploadProfilePhoto(
    request: NextRequest,
    fields: FormFields,
) {
    if (
        !(await consumeRateLimit(
            'profile-photo-upload',
            rateKey(request),
            10,
            10 * 60_000,
        ))
    ) {
        return fieldErrors(
            { photo: 'Terlalu banyak unggahan foto. Coba lagi nanti.' },
            429,
        );
    }

    const uploadId = text(fields, 'upload_id');
    const index = Number(text(fields, 'index'));
    const parts = Number(text(fields, 'parts'));
    const mime = text(fields, 'mime');
    const chunk = fields.chunk;
    if (
        !uploadIdPattern.test(uploadId) ||
        !Number.isInteger(index) ||
        !Number.isInteger(parts) ||
        parts < 2 ||
        parts > 5 ||
        index < 0 ||
        index >= parts ||
        !photoMimeTypes.includes(mime) ||
        !(chunk instanceof File) ||
        chunk.size === 0 ||
        chunk.size > photoChunkSize
    ) {
        return fieldErrors({ photo: 'Data unggahan foto tidak valid.' });
    }

    const db = await getDb();
    await db.collection<ProfilePhotoChunk>('profile_photo_uploads').updateOne(
        { uploadId, index },
        {
            $set: {
                uploadId,
                index,
                parts,
                mime,
                data: Buffer.from(await chunk.arrayBuffer()).toString('base64'),
                expiresAt: new Date(Date.now() + 20 * 60_000),
            },
        },
        { upsert: true },
    );
    return NextResponse.json({ uploaded: true });
}

async function requestPasswordReset(
    request: NextRequest,
    fields: FormFields,
) {
    const email = emailValue(fields);
    const ipAllowed = await consumeRateLimit(
        'password-request:ip',
        rateKey(request),
        3,
        60_000,
    );
    const emailAllowed = await consumeRateLimit(
        'password-request:email',
        email,
        3,
        60_000,
    );
    if (!ipAllowed || !emailAllowed) {
        return fieldErrors(
            { email: 'Terlalu banyak permintaan kode. Coba lagi dalam 60 detik.' },
            429,
        );
    }
    if (!emailPattern.test(email) || email.length > 255) {
        return fieldErrors({ email: 'Email harus berupa alamat email yang valid.' });
    }

    const transporter = configuredTransport();
    if (!transporter) {
        return fieldErrors({
            email: 'Kode belum dapat dikirim karena SMTP belum dikonfigurasi. Silakan hubungi administrator.',
        });
    }

    const db = await getDb();
    const user = await db.collection<UserDocument>('users').findOne({ email });
    if (user) {
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        const expiresAt = new Date(Date.now() + 10 * 60_000);
        await db.collection<ResetCode>('password_reset_codes').updateOne(
            { email },
            {
                $set: {
                    email,
                    codeHash: await hashSecret(code),
                    attempts: 0,
                    expiresAt,
                    createdAt: new Date(),
                },
            },
            { upsert: true },
        );
        try {
            await transporter.sendMail({
                from: process.env.SMTP_FROM,
                to: email,
                subject: 'Kode reset password FAMS',
                text: `Kode verifikasi reset password Anda adalah ${code}. Kode berlaku selama 10 menit.`,
            });
        } catch (error) {
            await db.collection('password_reset_codes').deleteOne({ email });
            throw error;
        }
    }
    return redirectResponse(
        `/forgot-password/verify?email=${encodeURIComponent(email)}`,
        resetStatus,
    );
}

async function verifyPasswordReset(
    request: NextRequest,
    fields: FormFields,
) {
    if (
        !(await consumeRateLimit(
            'password-verify',
            rateKey(request),
            10,
            60_000,
        ))
    ) {
        return fieldErrors(
            { code: 'Terlalu banyak percobaan. Coba lagi dalam satu menit.' },
            429,
        );
    }
    const email = emailValue(fields);
    const code = text(fields, 'code');
    if (!emailPattern.test(email) || !/^\d{6}$/.test(code)) {
        return fieldErrors({ code: 'Masukkan kode verifikasi 6 digit.' });
    }

    const db = await getDb();
    const record = await db
        .collection<ResetCode>('password_reset_codes')
        .findOne(
            { email, attempts: { $lt: 5 }, expiresAt: { $gt: new Date() } },
        );
    if (!record || !(await verifySecret(code, record.codeHash))) {
        if (record) {
            await db.collection('password_reset_codes').updateOne(
                {
                    email,
                    attempts: { $lt: 5 },
                    expiresAt: { $gt: new Date() },
                },
                { $inc: { attempts: 1 } },
            );
        }
        return fieldErrors({
            code: 'Kode tidak valid atau sudah kedaluwarsa. Periksa email atau minta kode baru.',
        });
    }

    const response = redirectResponse('/reset-password');
    const cookie = createPasswordResetGrant(email);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
}

async function resetPassword(request: NextRequest, fields: FormFields) {
    if (
        !(await consumeRateLimit(
            'password-reset',
            rateKey(request),
            5,
            60_000,
        ))
    ) {
        return fieldErrors(
            { password: 'Terlalu banyak percobaan. Coba lagi dalam satu menit.' },
            429,
        );
    }
    const email = await getPasswordResetEmail();
    const submittedEmail = emailValue(fields);
    const password = rawText(fields, 'password');
    const confirmation = rawText(fields, 'password_confirmation');
    if (!email || submittedEmail !== email) {
        const response = redirectResponse(
            '/forgot-password',
            'Sesi verifikasi berakhir. Silakan minta kode reset password baru.',
        );
        const cookie = clearPasswordResetGrant();
        response.cookies.set(cookie.name, cookie.value, cookie.options);
        return response;
    }
    if (password.length < 8) {
        return fieldErrors({ password: 'Password minimal 8 karakter.' });
    }
    if (password.length > 255) {
        return fieldErrors({ password: 'Password maksimal 255 karakter.' });
    }
    if (password !== confirmation) {
        return fieldErrors({
            password_confirmation: 'Konfirmasi password tidak sama.',
        });
    }

    const db = await getDb();
    const record = await db
        .collection<ResetCode>('password_reset_codes')
        .findOne({
            email,
            attempts: { $lt: 5 },
            expiresAt: { $gt: new Date() },
        });
    if (!record) {
        const response = redirectResponse(
            '/forgot-password',
            'Kode reset tidak lagi berlaku. Silakan minta kode baru.',
        );
        const cookie = clearPasswordResetGrant();
        response.cookies.set(cookie.name, cookie.value, cookie.options);
        return response;
    }

    const updateResult = await db.collection('users').updateOne(
        { email },
        { $set: { passwordHash: await hashSecret(password), updatedAt: new Date() } },
    );
    if (updateResult.matchedCount !== 1) {
        await db.collection('password_reset_codes').deleteOne({ email });
        const response = redirectResponse(
            '/forgot-password',
            'Akun tidak ditemukan. Silakan minta kode reset password baru.',
        );
        const cookie = clearPasswordResetGrant();
        response.cookies.set(cookie.name, cookie.value, cookie.options);
        return response;
    }
    await db.collection('password_reset_codes').deleteOne({ email });
    const response = redirectResponse(
        '/login',
        'Password berhasil diperbarui. Silakan masuk dengan password baru.',
    );
    const cookie = clearPasswordResetGrant();
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ action: string }> },
) {
    try {
        const { action } = await params;
        if (action === 'logout') {
            const sessionId = getSessionId(
                request.cookies.get('fams_session')?.value,
            );
            if (sessionId) {
                const db = await getDb();
                await db
                    .collection<{ _id: string }>('auth_sessions')
                    .deleteOne({ _id: sessionId });
            }
            const response = redirectResponse('/login');
            response.cookies.set('fams_session', '', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: 0,
                expires: new Date(0),
            });
            return response;
        }

        if (action === 'verification-notification') {
            return redirectResponse('/verify-email');
        }

        const formData = await request.formData();
        const fields = Object.fromEntries(formData.entries());
        switch (action) {
            case 'photo-upload':
                return await uploadProfilePhoto(request, fields);
            case 'login':
                return await login(request, fields);
            case 'register':
                return await register(request, fields);
            case 'password-request':
                return await requestPasswordReset(request, fields);
            case 'password-verify':
                return await verifyPasswordReset(request, fields);
            case 'password-reset':
                return await resetPassword(request, fields);
            default:
                return NextResponse.json(
                    { message: 'Aksi tidak ditemukan.' },
                    { status: 404 },
                );
        }
    } catch (error) {
        console.error('FAMS authentication request failed:', error);
        return NextResponse.json(
            {
                errors: {
                    email: 'Layanan autentikasi sedang tidak tersedia. Coba lagi nanti.',
                },
            },
            { status: 500 },
        );
    }
}
