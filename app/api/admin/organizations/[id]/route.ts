import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import {
    handleManagementImageError,
    removeOldManagementImage,
    reportManagementError,
    requireAdmin,
    storeManagementImage,
} from '@/lib/server/management';
import { getDb } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type OrganizationDocument = {
    _id: ObjectId;
    code?: string;
    name: string;
    type: string;
    faculty: string;
    leader: string;
    email?: string;
    phone?: string;
    memberCount: number;
    description?: string;
    status: 'Aktif' | 'Tidak Aktif';
    photo?: string;
    createdAt?: Date | string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type RouteContext = { params: Promise<{ id: string }> };

function formText(form: FormData, key: string) {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
}

function generateOrganizationCode() {
    return `ORG-${new ObjectId().toHexString().toUpperCase()}`;
}

function errorResponse(message: string, status = 422) {
    return NextResponse.json({ message }, { status });
}

function isDuplicateKey(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
    );
}

function displayOrganization(organization: OrganizationDocument) {
    return {
        id: organization._id.toString(),
        code: organization.code ?? '',
        name: organization.name,
        type: organization.type,
        faculty: organization.faculty,
        leader: organization.leader,
        email: organization.email ?? '',
        phone: organization.phone ?? '',
        memberCount: organization.memberCount ?? 0,
        description: organization.description ?? '',
        status: organization.status,
        photo:
            typeof organization.photo === 'string' &&
            organization.photo.startsWith('/assets/uploads/management/organizations/')
                ? organization.photo
                : '',
        createdAt:
            organization.createdAt instanceof Date
                ? organization.createdAt.toISOString().slice(0, 10)
                : typeof organization.createdAt === 'string'
                  ? organization.createdAt.slice(0, 10)
                  : '',
    };
}

function readOrganization(form: FormData) {
    const memberCountValue = formText(form, 'memberCount');
    return {
        code: formText(form, 'code').toUpperCase(),
        name: formText(form, 'name'),
        type: formText(form, 'type'),
        faculty: formText(form, 'faculty'),
        leader: formText(form, 'leader'),
        email: formText(form, 'email').toLowerCase(),
        phone: formText(form, 'phone'),
        memberCount: memberCountValue ? Number(memberCountValue) : 0,
        description: formText(form, 'description'),
        status: formText(form, 'status'),
    };
}

function validateOrganization(organization: ReturnType<typeof readOrganization>) {
    if (organization.code.length > 40) return 'Kode organisasi maksimal 40 karakter.';
    if (!organization.name || organization.name.length > 255) return 'Nama organisasi wajib diisi (maksimal 255 karakter).';
    if (!organization.type || organization.type.length > 100) return 'Jenis organisasi wajib diisi (maksimal 100 karakter).';
    if (!organization.faculty || organization.faculty.length > 255) return 'Fakultas atau unit wajib diisi (maksimal 255 karakter).';
    if (!organization.leader || organization.leader.length > 255) return 'Nama ketua wajib diisi (maksimal 255 karakter).';
    if (organization.email && (!emailPattern.test(organization.email) || organization.email.length > 255)) return 'Email organisasi tidak valid.';
    if (organization.phone.length > 30) return 'Nomor kontak maksimal 30 karakter.';
    if (!Number.isSafeInteger(organization.memberCount) || organization.memberCount < 0) return 'Jumlah anggota harus bilangan bulat positif.';
    if (organization.description.length > 2000) return 'Deskripsi maksimal 2000 karakter.';
    if (!['Aktif', 'Tidak Aktif'].includes(organization.status)) return 'Status organisasi tidak valid.';
    return null;
}

export async function PATCH(request: Request, { params }: RouteContext) {
    let storedImage: string | undefined;
    let imagePersisted = false;
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;
        const { id } = await params;
        if (!ObjectId.isValid(id)) return errorResponse('ID organisasi tidak valid.', 400);

        const form = await request.formData();
        const organization = readOrganization(form);
        const error = validateOrganization(organization);
        if (error) return errorResponse(error);
        const photo = form.get('photo');
        const removePhoto = formText(form, 'removePhoto') === 'true';
        if (photo !== null && !(photo instanceof File)) return errorResponse('File logo tidak valid.');

        const organizations = (await getDb()).collection<OrganizationDocument>('organizations');
        const organizationId = new ObjectId(id);
        const existing = await organizations.findOne({ _id: organizationId });
        if (!existing) return errorResponse('Organisasi tidak ditemukan.', 404);
        if (!organization.code) {
            organization.code = existing.code || generateOrganizationCode();
        }
        if (
            organization.code !== existing.code &&
            (await organizations.findOne(
                { code: organization.code, _id: { $ne: organizationId } },
                { projection: { _id: 1 } },
            ))
        ) {
            return errorResponse('Kode organisasi sudah digunakan.', 409);
        }
        if (photo instanceof File && photo.size > 0) {
            storedImage = await storeManagementImage(photo, 'organizations');
        }

        const update: Record<string, unknown> = {
            ...organization,
            updatedAt: new Date(),
        };
        const unset: Record<string, ''> = {};
        if (storedImage) update.photo = storedImage;
        else if (removePhoto) unset.photo = '';
        const updateDocument: {
            $set: Record<string, unknown>;
            $unset?: Record<string, ''>;
        } = { $set: update };
        if (Object.keys(unset).length) updateDocument.$unset = unset;
        await organizations.updateOne({ _id: organizationId }, updateDocument);
        imagePersisted = true;
        if (storedImage || removePhoto) {
            await removeOldManagementImage(existing.photo, storedImage);
        }

        const saved = await organizations.findOne({ _id: organizationId });
        return NextResponse.json({
            organization: saved ? displayOrganization(saved) : null,
        });
    } catch (error) {
        if (storedImage && !imagePersisted) {
            await removeOldManagementImage(storedImage);
        }
        const imageError = handleManagementImageError(error);
        if (imageError) return imageError;
        if (isDuplicateKey(error)) return errorResponse('Kode organisasi sudah digunakan.', 409);
        return reportManagementError('organization update', error);
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;
        const { id } = await params;
        if (!ObjectId.isValid(id)) return errorResponse('ID organisasi tidak valid.', 400);

        const organizations = (await getDb()).collection<OrganizationDocument>('organizations');
        const organizationId = new ObjectId(id);
        const existing = await organizations.findOne({ _id: organizationId });
        if (!existing) return errorResponse('Organisasi tidak ditemukan.', 404);
        await organizations.deleteOne({ _id: organizationId });
        await removeOldManagementImage(existing.photo);
        return NextResponse.json({ deleted: true });
    } catch (error) {
        return reportManagementError('organization deletion', error);
    }
}
