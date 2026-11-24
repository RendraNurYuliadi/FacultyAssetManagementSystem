import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { hashSecret } from '@/lib/server/auth';
import {
    handleManagementImageError,
    removeOldManagementImage,
    reportManagementError,
    requireAdmin,
    storeManagementImage,
} from '@/lib/server/management';
import { getDb } from '@/lib/server/db';
import {
    displayManagedUser,
    readUserProfile,
    userProfileFields,
    type ManagedUserDocument,
} from '@/lib/server/user-management';
import { validateManagedUserProfile } from '@/lib/server/user-profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(message: string, status = 422) {
    return NextResponse.json({ message }, { status });
}

function validationResponse(errors: Record<string, string>) {
    return NextResponse.json(
        { message: Object.values(errors)[0], errors },
        { status: 422 },
    );
}

function isDuplicateKey(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
    );
}

export async function GET() {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const users = await (await getDb())
            .collection<ManagedUserDocument>('users')
            .find(
                {},
                {
                    projection: {
                        passwordHash: 0,
                        hasAvatar: 0,
                    },
                },
            )
            .sort({ createdAt: -1 })
            .toArray();
        return NextResponse.json({ users: users.map(displayManagedUser) });
    } catch (error) {
        return reportManagementError('user listing', error);
    }
}

export async function POST(request: Request) {
    let storedImage: string | undefined;
    let imagePersisted = false;
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;

        const form = await request.formData();
        const profile = readUserProfile(form);
        const roleValue = form.get('role');
        const role = typeof roleValue === 'string' ? roleValue : '';
        const passwordValue = form.get('password');
        const password =
            typeof passwordValue === 'string' ? passwordValue : '';
        const confirmationValue = form.get('password_confirmation');
        const confirmation =
            typeof confirmationValue === 'string' ? confirmationValue : '';
        const photo = form.get('photo');

        const errors = validateManagedUserProfile(profile, role);
        if (!['admin', 'pengelola', 'peminjam'].includes(role)) {
            errors.role = 'Role pengguna tidak valid.';
        }
        if (password.length < 8 || password.length > 255) {
            errors.password = 'Password minimal 8 karakter.';
        } else if (password !== confirmation) {
            errors.password_confirmation = 'Konfirmasi password tidak sama.';
        }
        if (photo !== null && !(photo instanceof File)) {
            errors.photo = 'File foto profil harus berupa gambar.';
        }
        if (Object.keys(errors).length) return validationResponse(errors);

        const users = (await getDb()).collection<ManagedUserDocument>('users');
        if (await users.findOne({ email: profile.email }, { projection: { _id: 1 } })) {
            return errorResponse('Email sudah digunakan.', 409);
        }
        if (
            profile.identity_number &&
            (await users.findOne(
                { identity_number: profile.identity_number },
                { projection: { _id: 1 } },
            ))
        ) {
            return errorResponse('NIM/NIP/NIK sudah digunakan.', 409);
        }

        if (photo instanceof File && photo.size > 0) {
            storedImage = await storeManagementImage(photo, 'users');
        }
        const now = new Date();
        const user = {
            _id: new ObjectId(),
            ...userProfileFields(
                profile,
                role as ManagedUserDocument['role'],
            ),
            name: profile.name,
            email: profile.email,
            phone: profile.phone,
            role: role as ManagedUserDocument['role'],
            passwordHash: await hashSecret(password),
            createdAt: now,
            updatedAt: now,
        };
        if (storedImage) {
            Object.assign(user, { avatar: storedImage, hasAvatar: true });
        }

        const result = await users.insertOne(user);
        imagePersisted = true;
        const created = await users.findOne({ _id: result.insertedId });
        return NextResponse.json(
            { user: created ? displayManagedUser(created) : null },
            { status: 201 },
        );
    } catch (error) {
        if (storedImage && !imagePersisted) {
            await removeOldManagementImage(storedImage);
        }
        const imageError = handleManagementImageError(error);
        if (imageError) return imageError;
        if (isDuplicateKey(error)) return errorResponse('Email atau NIM/NIP sudah digunakan.', 409);
        return reportManagementError('user creation', error);
    }
}
