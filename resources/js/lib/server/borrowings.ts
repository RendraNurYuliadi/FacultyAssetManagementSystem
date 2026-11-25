import 'server-only';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Collection, ObjectId } from 'mongodb';

export type BorrowingAssetType = 'Barang' | 'Ruangan' | 'Campuran';
export type BorrowingApprovalStatus =
    | 'Menunggu Persetujuan'
    | 'Disetujui'
    | 'Tidak Disetujui'
    | 'Dibatalkan';

export type BorrowingAssetSnapshot = {
    id: string;
    code: string;
    name: string;
    type: 'Barang' | 'Ruangan';
    image: string;
    location: string;
    condition: string;
    availableQuantity: number;
    summary: string;
    quantity: number;
};

export type BorrowingDocument = {
    _id: ObjectId;
    userId: ObjectId;
    code: string;
    borrower: string;
    identity: string;
    borrowerType: string;
    faculty: string;
    studyProgram: string;
    position: string;
    phone: string;
    email: string;
    address: string;
    organization: string;
    borrowingCategory: string;
    activityName: string;
    activityPosition: string;
    responsiblePerson: string;
    responsiblePhone: string;
    assets: BorrowingAssetSnapshot[];
    asset: string;
    assetType: BorrowingAssetType;
    quantity: number;
    purpose: string;
    usageLocation: string;
    participantCount: string;
    borrowDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    returnDate: string;
    status?: string;
    approvalStatus?: BorrowingApprovalStatus;
    submittedAt: string;
    notes: string;
    documents: Record<string, string>;
    createdAt: Date;
    updatedAt?: Date;
    reviewedBy?: ObjectId;
    reviewedAt?: Date;
};

let approvalStatusMigration: Promise<void> | null = null;

export async function ensureBorrowingApprovalStatuses(
    borrowings: Collection<BorrowingDocument>,
) {
    if (!approvalStatusMigration) {
        approvalStatusMigration = (async () => {
            await Promise.all([
                borrowings.updateMany(
                    {
                        approvalStatus: { $exists: false },
                        status: 'Menunggu',
                    },
                    { $set: { approvalStatus: 'Menunggu Persetujuan' } },
                ),
                borrowings.updateMany(
                    {
                        approvalStatus: { $exists: false },
                        status: { $in: ['Disetujui', 'Dipinjam', 'Selesai'] },
                    },
                    { $set: { approvalStatus: 'Disetujui' } },
                ),
                borrowings.updateMany(
                    {
                        approvalStatus: { $exists: false },
                        status: 'Ditolak',
                    },
                    { $set: { approvalStatus: 'Tidak Disetujui' } },
                ),
                borrowings.updateMany(
                    {
                        approvalStatus: { $exists: false },
                        status: 'Dibatalkan',
                    },
                    { $set: { approvalStatus: 'Dibatalkan' } },
                ),
            ]);
            await borrowings.updateMany(
                { status: { $exists: true } },
                { $unset: { status: '' } },
            );
        })().catch((error: unknown) => {
            approvalStatusMigration = null;
            throw error;
        });
    }

    await approvalStatusMigration;
}

export class InvalidBorrowingUploadError extends Error {}

const maxUploadSize = 10 * 1024 * 1024;
const uploadRoot = path.join(
    process.cwd(),
    'public',
    'assets',
    'uploads',
    'borrowings',
);

function isValidFileContents(extension: string, contents: Buffer) {
    if (extension === '.pdf') {
        return contents.toString('ascii', 0, 5) === '%PDF-';
    }
    if (extension === '.jpg' || extension === '.jpeg') {
        return (
            contents[0] === 0xff &&
            contents[1] === 0xd8 &&
            contents[2] === 0xff
        );
    }
    if (extension === '.png') {
        return contents
            .subarray(0, 8)
            .equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            );
    }
    return false;
}

export async function storeBorrowingUpload(file: File, isPhoto = false) {
    if (file.size < 1 || file.size > maxUploadSize) {
        throw new InvalidBorrowingUploadError(
            'File harus berukuran maksimal 10 MB.',
        );
    }

    const extension = path.extname(file.name).toLowerCase();
    const validExtensions = isPhoto
        ? ['.jpg', '.jpeg', '.png']
        : ['.pdf', '.jpg', '.jpeg', '.png'];
    const expectedMime =
        extension === '.pdf'
            ? 'application/pdf'
            : extension === '.png'
              ? 'image/png'
              : 'image/jpeg';
    if (
        !validExtensions.includes(extension) ||
        (file.type && file.type !== expectedMime)
    ) {
        throw new InvalidBorrowingUploadError(
            isPhoto
                ? 'Foto harus berformat JPG atau PNG.'
                : 'Dokumen harus berformat PDF, JPG, atau PNG.',
        );
    }

    const contents = Buffer.from(await file.arrayBuffer());
    if (!isValidFileContents(extension, contents)) {
        throw new InvalidBorrowingUploadError(
            'Isi file tidak sesuai dengan format yang dipilih.',
        );
    }

    const filename = `${randomUUID()}${extension}`;
    await mkdir(uploadRoot, { recursive: true });
    await writeFile(path.join(uploadRoot, filename), contents, {
        flag: 'wx',
        mode: 0o644,
    });

    return `/assets/uploads/borrowings/${filename}`;
}

export async function removeBorrowingUpload(value: string) {
    const filename = value.replace('/assets/uploads/borrowings/', '');
    if (!/^[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$/i.test(filename)) return;

    try {
        await unlink(path.join(uploadRoot, filename));
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

function dateOnly(value: Date | string | undefined) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') return value.slice(0, 10);
    return '';
}

export function displayBorrowing(borrowing: BorrowingDocument) {
    const approvalStatus =
        borrowing.approvalStatus ??
        (borrowing.status === 'Menunggu'
            ? 'Menunggu Persetujuan'
            : borrowing.status === 'Ditolak'
              ? 'Tidak Disetujui'
              : borrowing.status === 'Dibatalkan'
                ? 'Dibatalkan'
                : 'Disetujui');

    return {
        id: borrowing._id.toString(),
        code: borrowing.code,
        borrower: borrowing.borrower,
        identity: borrowing.identity,
        borrowerType: borrowing.borrowerType,
        phone: borrowing.phone ?? '',
        email: borrowing.email ?? '',
        faculty: borrowing.faculty ?? '',
        studyProgram: borrowing.studyProgram ?? '',
        position: borrowing.position ?? '',
        address: borrowing.address ?? '',
        organization: borrowing.organization,
        borrowingCategory: borrowing.borrowingCategory ?? '',
        asset: borrowing.asset,
        assets: Array.isArray(borrowing.assets) ? borrowing.assets : [],
        assetType: borrowing.assetType,
        quantity: borrowing.quantity,
        purpose: borrowing.purpose,
        usageLocation: borrowing.usageLocation,
        participantCount: borrowing.participantCount,
        borrowDate: borrowing.borrowDate,
        startTime: borrowing.startTime,
        endDate: borrowing.endDate,
        endTime: borrowing.endTime,
        returnDate: borrowing.returnDate,
        approvalStatus,
        submittedAt: dateOnly(borrowing.submittedAt),
        notes: borrowing.notes,
        activityName: borrowing.activityName,
        activityPosition: borrowing.activityPosition ?? '',
        responsiblePerson: borrowing.responsiblePerson,
        responsiblePhone: borrowing.responsiblePhone,
        reviewedAt: dateOnly(borrowing.reviewedAt),
        documents: borrowing.documents ?? {},
    };
}
