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

function formText(form: FormData, key: string) {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
}

function generateOrganizationCode() {
    return `ORG-${new ObjectId().toHexString().toUpperCase()}`;
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

function readOrganization(form: FormData) {
    const memberCountValue = formText(form, 'memberCount');
    const memberCount = memberCountValue ? Number(memberCountValue) : 0;
    return {
        code: formText(form, 'code').toUpperCase(),
        name: formText(form, 'name'),
        type: formText(form, 'type'),
        faculty: formText(form, 'faculty'),
        leader: formText(form, 'leader'),
        email: formText(form, 'email').toLowerCase(),
        phone: formText(form, 'phone'),
        memberCount,
        description: formText(form, 'description'),
        status: formText(form, 'status'),
    };
}

function validateOrganization(
    organization: ReturnType<typeof readOrganization>,
) {
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

export async function GET() {
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;
        const organizations = await (await getDb())
            .collection<OrganizationDocument>('organizations')
            .find({})
            .sort({ createdAt: -1 })
            .toArray();
        return NextResponse.json({
            organizations: organizations.map(displayOrganization),
        });
    } catch (error) {
        return reportManagementError('organization listing', error);
    }
}

export async function POST(request: Request) {
    let storedImage: string | undefined;
    let imagePersisted = false;
    try {
        const access = await requireAdmin();
        if (access.response) return access.response;
        const form = await request.formData();
        const organization = readOrganization(form);
        const error = validateOrganization(organization);
        if (error) return errorResponse(error);
        if (!organization.code) {
            organization.code = generateOrganizationCode();
        }
        const photo = form.get('photo');
        if (photo !== null && !(photo instanceof File)) return errorResponse('File logo tidak valid.');

        const organizations = (await getDb()).collection<OrganizationDocument>('organizations');
        if (await organizations.findOne(
            { code: organization.code },
            { projection: { _id: 1 } },
        )) {
            return errorResponse('Kode organisasi sudah digunakan.', 409);
        }
        if (photo instanceof File && photo.size > 0) {
            storedImage = await storeManagementImage(photo, 'organizations');
        }

        const now = new Date();
        const document: Record<string, unknown> = {
            ...organization,
            createdAt: now,
            updatedAt: now,
        };
        if (storedImage) document.photo = storedImage;
        const result = await organizations.insertOne(document as OrganizationDocument);
        imagePersisted = true;
        const created = await organizations.findOne({ _id: result.insertedId });
        return NextResponse.json(
            { organization: created ? displayOrganization(created) : null },
            { status: 201 },
        );
    } catch (error) {
        if (storedImage && !imagePersisted) {
            await removeOldManagementImage(storedImage);
        }
        const imageError = handleManagementImageError(error);
        if (imageError) return imageError;
        if (isDuplicateKey(error)) return errorResponse('Kode organisasi sudah digunakan.', 409);
        return reportManagementError('organization creation', error);
    }
}
