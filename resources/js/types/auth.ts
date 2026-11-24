export type UserRole = 'admin' | 'pengelola' | 'peminjam';

export type User = {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    avatar?: string;
    phone?: string;
    borrower_type?: string;
    identity_number?: string;
    faculty?: string;
    study_program?: string;
    enrollment_year?: number;
    unit_name?: string;
    position?: string;
    organization_name?: string;
    borrowing_context?: string;
    address?: string;
};

export type Auth = {
    user: User | null;
};
