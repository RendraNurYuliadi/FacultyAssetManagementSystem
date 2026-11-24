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
import {
    optionalUserProfileKeys,
    validateManagedUserProfile,
} from '@/lib/server/user-profile';

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

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
    let storedImage: string | undefined;
    let imagePersisted = false;
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;
        const { id } = await params;
        if (!ObjectId.isValid(id)) return errorResponse('ID pengguna tidak valid.', 400);

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
        const removePhoto =
            form.get('removePhoto') === 'true';

        const errors = validateManagedUserProfile(profile, role);
        if (!['admin', 'pengelola', 'peminjam'].includes(role)) {
            errors.role = 'Role pengguna tidak valid.';
        }
        if (password && (password.length < 8 || password.length > 255)) {
            errors.password = 'Password minimal 8 karakter.';
        } else if (password && password !== confirmation) {
            errors.password_confirmation =
                'Konfirmasi password tidak sama.';
        } else if (!password && confirmation) {
            errors.password_confirmation =
                'Isi password baru terlebih dahulu.';
        }
        if (photo !== null && !(photo instanceof File)) {
            errors.photo = 'File foto profil harus berupa gambar.';
        }
        if (Object.keys(errors).length) return validationResponse(errors);

        const db = await getDb();
        const users = db.collection<ManagedUserDocument>('users');
        const userId = new ObjectId(id);
        const existing = await users.findOne({ _id: userId });
        if (!existing) return errorResponse('Pengguna tidak ditemukan.', 404);
        if (id === access.user.id && role !== 'admin') {
            return errorResponse('Role administrator yang sedang digunakan tidak dapat diturunkan.', 409);
        }
        if (
            profile.email !== existing.email &&
            (await users.findOne(
                { email: profile.email, _id: { $ne: userId } },
                { projection: { _id: 1 } },
            ))
        ) {
            return errorResponse('Email sudah digunakan.', 409);
        }
        if (
            profile.identity_number &&
            profile.identity_number !== existing.identity_number &&
            (await users.findOne(
                {
                    identity_number: profile.identity_number,
                    _id: { $ne: userId },
                },
                { projection: { _id: 1 } },
            ))
        ) {
            return errorResponse('NIM/NIP/NIK sudah digunakan.', 409);
        }
        if (
            existing.role === 'admin' &&
            role !== 'admin' &&
            (await users.countDocuments({ role: 'admin' })) <= 1
        ) {
            return errorResponse('Sistem harus memiliki minimal satu administrator.', 409);
        }

        if (photo instanceof File && photo.size > 0) {
            storedImage = await storeManagementImage(photo, 'users');
        }
        const update: Record<string, unknown> = {
            ...userProfileFields(
                profile,
                role as ManagedUserDocument['role'],
            ),
            name: profile.name,
            email: profile.email,
            phone: profile.phone,
            role: role as ManagedUserDocument['role'],
            updatedAt: new Date(),
        };
        const unset: Record<string, ''> = Object.fromEntries(
            optionalUserProfileKeys
                .filter((key) => !profile[key])
                .map((key) => [key, '']),
        );
        if (password) update.passwordHash = await hashSecret(password);
        if (storedImage) {
            update.avatar = storedImage;
            update.hasAvatar = true;
        } else if (removePhoto) {
            unset.avatar = '';
            unset.hasAvatar = '';
        }

        const updateDocument: {
            $set: Record<string, unknown>;
            $unset?: Record<string, ''>;
        } = { $set: update };
        if (Object.keys(unset).length) updateDocument.$unset = unset;
        await users.updateOne({ _id: userId }, updateDocument);
        imagePersisted = true;
        if (storedImage || removePhoto) {
            await removeOldManagementImage(existing.avatar, storedImage);
        }
        const saved = await users.findOne({ _id: userId });
        return NextResponse.json({
            user: saved ? displayManagedUser(saved) : null,
        });
    } catch (error) {
        if (storedImage && !imagePersisted) {
            await removeOldManagementImage(storedImage);
        }
        const imageError = handleManagementImageError(error);
        if (imageError) return imageError;
        if (isDuplicateKey(error)) return errorResponse('Email atau NIM/NIP sudah digunakan.', 409);
        return reportManagementError('user update', error);
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;
        const { id } = await params;
        if (!ObjectId.isValid(id)) return errorResponse('ID pengguna tidak valid.', 400);
        if (id === access.user.id) {
            return errorResponse('Tidak dapat menghapus akun administrator yang sedang digunakan.', 409);
        }

        const db = await getDb();
        const users = db.collection<ManagedUserDocument>('users');
        const userId = new ObjectId(id);
        const existing = await users.findOne({ _id: userId });
        if (!existing) return errorResponse('Pengguna tidak ditemukan.', 404);
        if (
            existing.role === 'admin' &&
            (await users.countDocuments({ role: 'admin' })) <= 1
        ) {
            return errorResponse('Sistem harus memiliki minimal satu administrator.', 409);
        }

        await users.deleteOne({ _id: userId });
        await Promise.all([
            db.collection('auth_sessions').deleteMany({ userId }),
            db.collection('password_reset_codes').deleteMany({
                email: existing.email,
            }),
        ]);
        await removeOldManagementImage(existing.avatar);
        return NextResponse.json({ deleted: true });
    } catch (error) {
        return reportManagementError('user deletion', error);
    }
}
