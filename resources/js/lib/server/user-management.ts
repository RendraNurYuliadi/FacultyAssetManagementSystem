import 'server-only';
import type { ObjectId } from 'mongodb';
import {
    displayedBorrowerType,
    storedBorrowerType,
    type UserProfileInput,
} from './user-profile';

export type ManagedUserDocument = {
    _id: ObjectId;
    name: string;
    email: string;
    passwordHash?: string;
    phone?: string;
    role: 'admin' | 'pengelola' | 'peminjam';
    borrower_type?: string | null;
    identity_number?: string | null;
    faculty?: string | null;
    study_program?: string | null;
    enrollment_year?: number | null;
    unit_name?: string | null;
    position?: string | null;
    organization_name?: string | null;
    borrowing_context?: string | null;
    address?: string | null;
    avatar?: string;
    createdAt?: Date | string;
};

function readText(form: FormData, key: string) {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
}

export function readUserProfile(form: FormData): UserProfileInput {
    return {
        name: readText(form, 'name'),
        email: readText(form, 'email').toLowerCase(),
        phone: readText(form, 'phone'),
        borrower_type: readText(form, 'borrower_type'),
        identity_number: readText(form, 'identity_number'),
        faculty: readText(form, 'faculty'),
        study_program: readText(form, 'study_program'),
        enrollment_year: readText(form, 'enrollment_year'),
        unit_name: readText(form, 'unit_name'),
        position: readText(form, 'position'),
        organization_name: readText(form, 'organization_name'),
        borrowing_context: readText(form, 'borrowing_context'),
        address: readText(form, 'address'),
    };
}

export function userProfileFields(
    profile: UserProfileInput,
    role: ManagedUserDocument['role'],
) {
    if (role !== 'peminjam') {
        const fields: Record<string, unknown> = {
            borrower_type: null,
            borrowing_context: null,
        };
        for (const [key, value] of Object.entries({
            identity_number: profile.identity_number,
            faculty: profile.faculty,
            unit_name: profile.unit_name,
            position: profile.position,
            address: profile.address,
        })) {
            if (value) fields[key] = value;
        }
        return fields;
    }

    const fields: Record<string, unknown> = {
        borrower_type: storedBorrowerType(profile.borrower_type),
        borrowing_context: profile.borrowing_context,
    };
    for (const [key, value] of Object.entries({
        identity_number: profile.identity_number,
        faculty: profile.faculty,
        study_program: profile.study_program,
        unit_name: profile.unit_name,
        position: profile.position,
        organization_name: profile.organization_name,
        address: profile.address,
    })) {
        if (value) fields[key] = value;
    }
    if (profile.enrollment_year) {
        fields.enrollment_year = Number(profile.enrollment_year);
    }
    return fields;
}

function displayDate(value?: Date | string) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function displayManagedUser(user: ManagedUserDocument) {
    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone ?? '',
        role: user.role,
        borrowerType: displayedBorrowerType(user.borrower_type),
        identityNumber: user.identity_number ?? '',
        faculty: user.faculty ?? '',
        studyProgram: user.study_program ?? '',
        enrollmentYear: user.enrollment_year?.toString() ?? '',
        unitName: user.unit_name ?? '',
        position: user.position ?? '',
        organizationName: user.organization_name ?? '',
        borrowingContext: user.borrowing_context ?? '',
        address: user.address ?? '',
        avatar:
            typeof user.avatar === 'string' &&
            user.avatar.startsWith('/assets/uploads/management/users/')
                ? user.avatar
                : '',
        createdAt: displayDate(user.createdAt),
    };
}
