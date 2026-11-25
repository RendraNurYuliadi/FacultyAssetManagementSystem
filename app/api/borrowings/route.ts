import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getSessionUser } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';
import {
    displayBorrowing,
    ensureBorrowingApprovalStatuses,
    InvalidBorrowingUploadError,
    removeBorrowingUpload,
    storeBorrowingUpload,
    type BorrowingAssetSnapshot,
    type BorrowingDocument,
} from '@/lib/server/borrowings';
import {
    ensureAssetDataModel,
    listAssetDisplays,
    type AssetDocument,
} from '@/lib/server/assets';
import type { ManagedUserDocument } from '@/lib/server/user-management';
import { reportManagementError } from '@/lib/server/management';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const activeApprovalStatuses = ['Menunggu Persetujuan', 'Disetujui'];

const documentFields = [
    'photo',
    'identityDocument',
    'applicationLetter',
    'proposalDocument',
    'organizationLetter',
    'otherDocument',
] as const;

type BorrowingAssetOption = Omit<BorrowingAssetSnapshot, 'quantity'>;
type SelectedBorrowingAsset = { id: string; quantity: number };
type ValidatedRequest =
    | { ok: false; error: string }
    | {
          ok: true;
          assets: SelectedBorrowingAsset[];
          borrower: string;
          identity: string;
          borrowerType: string;
          phone: string;
          email: string;
          category: string;
          organization: string;
          activityName: string;
          responsiblePerson: string;
          responsiblePhone: string;
          purpose: string;
          borrowDate: string;
          startTime: string;
          endDate: string;
          endTime: string;
          returnDate: string;
          participantCount: string;
          usageLocation: string;
      };

function errorResponse(message: string, status = 422) {
    return NextResponse.json({ message }, { status });
}

function readText(form: FormData, key: string) {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
}

function isValidDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

function formatBorrowerType(value: string | null | undefined) {
    switch (value) {
        case 'mahasiswa':
            return 'Mahasiswa';
        case 'dosen':
            return 'Dosen';
        case 'staf':
            return 'Staff';
        case 'eksternal':
        case 'lainnya':
            return 'Pihak Eksternal';
        default:
            return 'Pihak Eksternal';
    }
}

async function getBorrowableAssets(
    db: Awaited<ReturnType<typeof getDb>>,
    dateRange?: { start: string; end: string },
): Promise<BorrowingAssetOption[]> {
    await ensureAssetDataModel(db);
    const borrowingCollection =
        db.collection<BorrowingDocument>('borrowings');
    await ensureBorrowingApprovalStatuses(borrowingCollection);
    const reservationQuery: Record<string, unknown> = {
        approvalStatus: { $in: activeApprovalStatuses },
    };
    if (dateRange) {
        reservationQuery.borrowDate = { $lte: dateRange.end };
        reservationQuery.$or = [
            { returnDate: { $gte: dateRange.start } },
            { endDate: { $gte: dateRange.start } },
        ];
    }

    const [assetDocuments, reservations, locations] = await Promise.all([
        db.collection<AssetDocument>('assets').find({}).toArray(),
        dateRange
            ? db
                  .collection<BorrowingDocument>('borrowings')
                  .find(reservationQuery)
                  .toArray()
            : Promise.resolve([] as BorrowingDocument[]),
        db
            .collection<{ _id: ObjectId; name?: string }>('locations')
            .find({}, { projection: { name: 1 } })
            .toArray(),
    ]);

    const reservedQuantity = new Map<string, number>();
    for (const reservation of reservations) {
        for (const asset of reservation.assets ?? []) {
            reservedQuantity.set(
                asset.id,
                (reservedQuantity.get(asset.id) ?? 0) + asset.quantity,
            );
        }
    }

    const locationNames = new Map(
        locations.map((location) => [
            location._id.toString(),
            location.name ?? '',
        ]),
    );
    const displayedAssets = await listAssetDisplays(db, assetDocuments);

    return displayedAssets.flatMap((asset) => {
        if (asset.status !== 'Tersedia') return [];
        const availableQuantity =
            asset.category === 'Ruangan'
                ? Math.max(
                      0,
                      1 - (reservedQuantity.get(asset.id) ?? 0),
                  )
                : Math.max(
                      0,
                      asset.quantity -
                          (reservedQuantity.get(asset.id) ?? 0),
                  );
        if (availableQuantity < 1) return [];

        return [
            {
                id: asset.id,
                code: asset.code,
                name: asset.name,
                type: asset.category,
                image: asset.images[0] ?? '',
                location: locationNames.get(asset.locationId) ?? '',
                condition: asset.condition,
                availableQuantity,
                summary: asset.description,
            },
        ];
    });
}

function parseSelectedAssets(form: FormData) {
    const value = form.get('assets');
    if (typeof value !== 'string') return null;

    try {
        const parsed: unknown = JSON.parse(value);
        if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 20) {
            return null;
        }

        const selections = parsed.map((item) => {
            if (
                typeof item !== 'object' ||
                item === null ||
                !('id' in item) ||
                typeof item.id !== 'string' ||
                !ObjectId.isValid(item.id) ||
                !('quantity' in item) ||
                typeof item.quantity !== 'number' ||
                !Number.isSafeInteger(item.quantity) ||
                item.quantity < 1
            ) {
                return null;
            }
            return { id: item.id, quantity: item.quantity };
        });

        if (selections.some((item) => item === null)) return null;
        const validSelections = selections.filter(
            (item): item is SelectedBorrowingAsset => item !== null,
        );
        if (
            new Set(validSelections.map((item) => item.id)).size !==
            validSelections.length
        ) {
            return null;
        }
        return validSelections;
    } catch {
        return null;
    }
}

function readUpload(form: FormData, field: string) {
    const value = form.get(field);
    if (value === null || (value instanceof File && value.size === 0)) {
        return null;
    }
    return value instanceof File ? value : null;
}

function validateRequest(form: FormData): ValidatedRequest {
    const borrower = readText(form, 'borrower');
    const identity = readText(form, 'identity');
    const borrowerType = readText(form, 'borrowerType');
    const phone = readText(form, 'phone');
    const email = readText(form, 'email');
    const category = readText(form, 'borrowingCategory');
    const organization = readText(form, 'organization');
    const activityName = readText(form, 'activityName');
    const responsiblePerson = readText(form, 'responsiblePerson');
    const responsiblePhone = readText(form, 'responsiblePhone');
    const purpose = readText(form, 'purpose');
    const borrowDate = readText(form, 'borrowDate');
    const startTime = readText(form, 'startTime');
    const endDate = readText(form, 'endDate');
    const endTime = readText(form, 'endTime');
    const returnDate = readText(form, 'returnDate');
    const participantCount = readText(form, 'participantCount');
    const usageLocation = readText(form, 'usageLocation');
    const assets = parseSelectedAssets(form);

    if (!borrower || borrower.length > 255) {
        return { ok: false, error: 'Nama lengkap wajib diisi.' };
    }
    if (!identity || identity.length > 50) {
        return { ok: false, error: 'NIM/NIP/NIK wajib diisi (maksimal 50 karakter).' };
    }
    if (
        !['Mahasiswa', 'Dosen', 'Staff', 'Pihak Eksternal'].includes(
            borrowerType,
        )
    ) {
        return { ok: false, error: 'Tipe peminjam tidak valid.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
        return { ok: false, error: 'Email peminjam tidak valid.' };
    }
    if (!phone || phone.length > 30) {
        return { ok: false, error: 'Nomor HP peminjam wajib diisi.' };
    }
    if (!['Individu', 'Organisasi', 'Kepanitiaan'].includes(category)) {
        return { ok: false, error: 'Jenis peminjaman tidak valid.' };
    }
    if (category !== 'Individu' && !organization) {
        return { ok: false, error: 'Nama organisasi atau kepanitiaan wajib diisi.' };
    }
    if (!activityName || !responsiblePerson || !responsiblePhone) {
        return { ok: false, error: 'Lengkapi nama kegiatan dan data penanggung jawab.' };
    }
    if (!assets) {
        return { ok: false, error: 'Pilih minimal satu aset yang valid.' };
    }
    if (!purpose || purpose.length > 2000) {
        return { ok: false, error: 'Tujuan penggunaan wajib diisi (maksimal 2000 karakter).' };
    }
    if (
        !isValidDate(borrowDate) ||
        !isValidDate(endDate) ||
        !/^\d{2}:\d{2}$/.test(startTime) ||
        !/^\d{2}:\d{2}$/.test(endTime) ||
        endDate < borrowDate ||
        (endDate === borrowDate && endTime <= startTime)
    ) {
        return { ok: false, error: 'Jadwal peminjaman tidak valid.' };
    }
    if (!isValidDate(returnDate) || returnDate < endDate) {
        return { ok: false, error: 'Tanggal pengembalian tidak valid.' };
    }
    if (
        participantCount &&
        (!/^\d+$/.test(participantCount) ||
            Number(participantCount) > 100000)
    ) {
        return { ok: false, error: 'Jumlah peserta tidak valid.' };
    }
    if (readText(form, 'agreement') !== 'true') {
        return { ok: false, error: 'Persetujuan peminjaman wajib diberikan.' };
    }
    if (!readUpload(form, 'photo')) {
        return { ok: false, error: 'Foto profil peminjam wajib diunggah.' };
    }
    if (!readUpload(form, 'identityDocument')) {
        return { ok: false, error: 'Kartu identitas wajib diunggah.' };
    }
    if (!readUpload(form, 'applicationLetter')) {
        return { ok: false, error: 'Surat pengajuan peminjaman wajib diunggah.' };
    }
    if (category !== 'Individu' && !readUpload(form, 'organizationLetter')) {
        return { ok: false, error: 'Surat pengantar organisasi wajib diunggah.' };
    }

    return {
        ok: true,
        assets,
        borrower,
        identity,
        borrowerType,
        phone,
        email,
        category,
        organization,
        activityName,
        responsiblePerson,
        responsiblePhone,
        purpose,
        borrowDate,
        startTime,
        endDate,
        endTime,
        returnDate,
        participantCount,
        usageLocation,
    };
}

function codeForToday() {
    return `PJM-${new Date().getFullYear()}-${randomBytes(3)
        .toString('hex')
        .toUpperCase()}`;
}

export async function GET() {
    try {
        const user = await getSessionUser();
        if (!user) {
            return errorResponse(
                'Sesi tidak valid. Silakan masuk kembali.',
                401,
            );
        }

        const db = await getDb();
        await ensureAssetDataModel(db);
        const borrowingCollection =
            db.collection<BorrowingDocument>('borrowings');
        await ensureBorrowingApprovalStatuses(borrowingCollection);
        const userId = new ObjectId(user.id);
        const [profile, borrowings, borrowableAssets] = await Promise.all([
            db
                .collection<ManagedUserDocument>('users')
                .findOne(
                    { _id: userId },
                    {
                        projection: {
                            name: 1,
                            email: 1,
                            phone: 1,
                            borrower_type: 1,
                            identity_number: 1,
                            faculty: 1,
                            study_program: 1,
                            position: 1,
                            organization_name: 1,
                            borrowing_context: 1,
                            address: 1,
                        },
                    },
                ),
            borrowingCollection
                .find({ userId })
                .sort({ createdAt: -1 })
                .toArray(),
            getBorrowableAssets(db),
        ]);

        if (!profile) {
            return errorResponse('Data akun tidak ditemukan.', 404);
        }

        return NextResponse.json({
            profile: {
                name: profile.name,
                email: profile.email,
                phone: profile.phone ?? '',
                borrowerType: formatBorrowerType(profile.borrower_type),
                identity: profile.identity_number ?? '',
                faculty: profile.faculty ?? '',
                studyProgram: profile.study_program ?? '',
                position: profile.position ?? '',
                organizationName: profile.organization_name ?? '',
                borrowingContext: profile.borrowing_context ?? '',
                address: profile.address ?? '',
            },
            borrowings: borrowings.map(displayBorrowing),
            borrowableAssets,
        });
    } catch (error) {
        return reportManagementError('borrowing listing', error);
    }
}

export async function POST(request: Request) {
    const storedUploads: string[] = [];
    try {
        const user = await getSessionUser();
        if (!user) {
            return errorResponse(
                'Sesi tidak valid. Silakan masuk kembali.',
                401,
            );
        }

        const form = await request.formData();
        const validated = validateRequest(form);
        if (!validated.ok) return errorResponse(validated.error);

        const rangeEnd =
            validated.returnDate || validated.endDate;
        const db = await getDb();
        const availableAssets = await getBorrowableAssets(db, {
            start: validated.borrowDate,
            end: rangeEnd,
        });
        const selectedAssets: BorrowingAssetSnapshot[] = [];

        for (const selection of validated.assets) {
            const availableAsset = availableAssets.find(
                (asset) => asset.id === selection.id,
            );
            if (!availableAsset) {
                return errorResponse(
                    'Salah satu aset tidak tersedia untuk jadwal yang dipilih.',
                    409,
                );
            }
            if (selection.quantity > availableAsset.availableQuantity) {
                return errorResponse(
                    `Jumlah ${availableAsset.name} melebihi stok yang tersedia (${availableAsset.availableQuantity}).`,
                    409,
                );
            }
            if (
                availableAsset.type === 'Ruangan' &&
                selection.quantity !== 1
            ) {
                return errorResponse(
                    'Jumlah peminjaman setiap ruangan harus 1.',
                );
            }
            selectedAssets.push({
                ...availableAsset,
                quantity: selection.quantity,
            });
        }
        if (
            selectedAssets.some((asset) => asset.type === 'Ruangan') &&
            !validated.usageLocation
        ) {
            return errorResponse('Lokasi penggunaan ruangan wajib diisi.');
        }

        const documents: Record<string, string> = {};
        for (const field of documentFields) {
            const file = readUpload(form, field);
            if (!file) continue;
            const path = await storeBorrowingUpload(file, field === 'photo');
            documents[field] = path;
            storedUploads.push(path);
        }

        const assetTypes = Array.from(
            new Set(selectedAssets.map((asset) => asset.type)),
        );
        const assetType =
            assetTypes.length > 1
                ? 'Campuran'
                : assetTypes[0] ?? 'Barang';
        const quantity = selectedAssets.reduce(
            (total, asset) => total + asset.quantity,
            0,
        );
        const borrowings =
            db.collection<BorrowingDocument>('borrowings');
        await borrowings.createIndex({ code: 1 }, { unique: true });

        let code = codeForToday();
        while (await borrowings.findOne({ code }, { projection: { _id: 1 } })) {
            code = codeForToday();
        }

        const now = new Date();
        const document: BorrowingDocument = {
            _id: new ObjectId(),
            userId: new ObjectId(user.id),
            code,
            borrower: validated.borrower,
            identity: validated.identity,
            borrowerType: validated.borrowerType,
            faculty: readText(form, 'faculty'),
            studyProgram: readText(form, 'studyProgram'),
            position: readText(form, 'position'),
            phone: validated.phone,
            email: validated.email,
            address: readText(form, 'address'),
            organization:
                validated.category === 'Individu'
                    ? 'Individu'
                    : validated.organization,
            borrowingCategory: validated.category,
            activityName: validated.activityName,
            activityPosition: readText(form, 'activityPosition'),
            responsiblePerson: validated.responsiblePerson,
            responsiblePhone: validated.responsiblePhone,
            assets: selectedAssets,
            asset: selectedAssets
                .map(
                    (asset) =>
                        `${asset.name} (${asset.quantity} ${
                            asset.type === 'Barang' ? 'unit' : 'ruangan'
                        })`,
                )
                .join(', '),
            assetType,
            quantity,
            purpose: validated.purpose,
            usageLocation: validated.usageLocation,
            participantCount: validated.participantCount,
            borrowDate: validated.borrowDate,
            startTime: validated.startTime,
            endDate: validated.endDate,
            endTime: validated.endTime,
            returnDate: validated.returnDate,
            approvalStatus: 'Menunggu Persetujuan',
            submittedAt: now.toISOString().slice(0, 10),
            notes: readText(form, 'notes'),
            documents,
            createdAt: now,
            updatedAt: now,
        };

        await borrowings.insertOne(document);
        storedUploads.length = 0;
        return NextResponse.json(
            { borrowing: displayBorrowing(document) },
            { status: 201 },
        );
    } catch (error) {
        await Promise.all(
            storedUploads.map(async (path) => {
                try {
                    await removeBorrowingUpload(path);
                } catch (cleanupError) {
                    console.error(
                        'FAMS could not remove a failed borrowing upload:',
                        cleanupError,
                    );
                }
            }),
        );
        if (error instanceof InvalidBorrowingUploadError) {
            return errorResponse(error.message);
        }
        return reportManagementError('borrowing submission', error);
    }
}
