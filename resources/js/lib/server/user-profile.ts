import 'server-only';

export type BorrowerType =
    | 'mahasiswa'
    | 'dosen'
    | 'staf'
    | 'eksternal'
    | 'lainnya';

export type UserProfileInput = {
    name: string;
    email: string;
    phone: string;
    borrower_type: string;
    identity_number: string;
    faculty: string;
    study_program: string;
    enrollment_year: string;
    unit_name: string;
    position: string;
    organization_name: string;
    borrowing_context: string;
    address: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const borrowerTypes: BorrowerType[] = [
    'mahasiswa',
    'dosen',
    'staf',
    'eksternal',
    'lainnya',
];

export const optionalUserProfileKeys = [
    'identity_number',
    'faculty',
    'study_program',
    'enrollment_year',
    'unit_name',
    'position',
    'organization_name',
    'address',
] as const;

export function validateUserBasics(profile: UserProfileInput) {
    const errors: Record<string, string> = {};
    if (!profile.name || profile.name.length > 255) {
        errors.name = 'Nama lengkap wajib diisi.';
    }
    if (!emailPattern.test(profile.email) || profile.email.length > 255) {
        errors.email = 'Email harus berupa alamat email yang valid.';
    }
    if (!profile.phone || profile.phone.length > 30) {
        errors.phone = 'Nomor handphone wajib diisi.';
    }
    return errors;
}

function validateBorrowerProfile(profile: UserProfileInput) {
    const errors: Record<string, string> = {};
    const external =
        profile.borrower_type === 'eksternal' ||
        profile.borrower_type === 'lainnya';
    if (!borrowerTypes.includes(profile.borrower_type as BorrowerType)) {
        errors.borrower_type = 'Kategori peminjam tidak valid.';
    }
    if (!external && (!profile.identity_number || profile.identity_number.length > 50)) {
        errors.identity_number = 'NIM/NIP/NIK wajib diisi.';
    }
    if (profile.identity_number.length > 50) {
        errors.identity_number = 'NIM/NIP/NIK maksimal 50 karakter.';
    }
    for (const [key, value] of Object.entries({
        faculty: profile.faculty,
        study_program: profile.study_program,
        unit_name: profile.unit_name,
        position: profile.position,
        organization_name: profile.organization_name,
    })) {
        if (value.length > 255) {
            errors[key] = 'Nilai maksimal 255 karakter.';
        }
    }
    if (['mahasiswa', 'dosen'].includes(profile.borrower_type)) {
        if (!profile.faculty) errors.faculty = 'Fakultas wajib diisi.';
        if (!profile.study_program) {
            errors.study_program = 'Program studi wajib diisi.';
        }
    }
    if (profile.borrower_type === 'mahasiswa') {
        const year = Number(profile.enrollment_year);
        if (
            !Number.isInteger(year) ||
            year < 1900 ||
            year > new Date().getFullYear() + 1
        ) {
            errors.enrollment_year = 'Angkatan tidak valid.';
        }
        if (!['pribadi', 'organisasi'].includes(profile.borrowing_context)) {
            errors.borrowing_context = 'Konteks peminjaman wajib dipilih.';
        }
    }
    if (
        profile.borrowing_context &&
        !['pribadi', 'organisasi'].includes(profile.borrowing_context)
    ) {
        errors.borrowing_context = 'Konteks peminjaman tidak valid.';
    }
    if (profile.borrower_type === 'staf' && !profile.unit_name) {
        errors.unit_name = 'Unit kerja wajib diisi.';
    }
    if (['dosen', 'staf'].includes(profile.borrower_type) || external) {
        if (!profile.position) errors.position = 'Jabatan wajib diisi.';
    }
    if (
        external ||
        (profile.borrower_type === 'mahasiswa' &&
            profile.borrowing_context === 'organisasi')
    ) {
        if (!profile.organization_name) {
            errors.organization_name =
                'Nama organisasi/instansi wajib diisi.';
        }
    }
    if (profile.address.length > 2000) {
        errors.address = 'Alamat maksimal 2000 karakter.';
    }
    return errors;
}

export function validateUserProfile(profile: UserProfileInput) {
    return {
        ...validateUserBasics(profile),
        ...validateBorrowerProfile(profile),
    };
}

export function validateManagedUserProfile(
    profile: UserProfileInput,
    role: string,
) {
    if (role === 'peminjam') return validateUserProfile(profile);

    const errors = validateUserBasics(profile);
    if (profile.identity_number.length > 50) {
        errors.identity_number = 'NIM/NIP/NIK maksimal 50 karakter.';
    }
    for (const [key, value] of Object.entries({
        faculty: profile.faculty,
        unit_name: profile.unit_name,
        position: profile.position,
    })) {
        if (value.length > 255) {
            errors[key] = 'Nilai maksimal 255 karakter.';
        }
    }
    if (profile.address.length > 2000) {
        errors.address = 'Alamat maksimal 2000 karakter.';
    }
    return errors;
}

export function storedBorrowerType(value: string) {
    return value === 'eksternal' ? 'lainnya' : value;
}

export function displayedBorrowerType(value?: string | null) {
    return value === 'lainnya' ? 'eksternal' : value ?? '';
}
