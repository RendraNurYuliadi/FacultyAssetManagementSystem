import 'server-only';
import { ObjectId, type Db } from 'mongodb';

export type LocationDocument = {
    _id: ObjectId;
    code: string;
    name: string;
    type: string;
    address: string;
    area: string;
    responsible: string;
    phone: string;
    description: string;
    images: string[];
    createdAt?: Date | string;
    updatedAt?: Date | string;
};

export type LocationDisplay = {
    id: string;
    code: string;
    name: string;
    type: string;
    address: string;
    area: string;
    responsible: string;
    phone: string;
    description: string;
    images: string[];
    createdAt: string;
    updatedAt: string;
};

function dateOnly(value: Date | string | undefined) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') return value.slice(0, 10);
    return '';
}

export function displayLocation(location: LocationDocument): LocationDisplay {
    return {
        id: location._id.toString(),
        code: location.code ?? '',
        name: location.name ?? '',
        type: location.type ?? '',
        address: location.address ?? '',
        area: location.area ?? '',
        responsible: location.responsible ?? '',
        phone: location.phone ?? '',
        description: location.description ?? '',
        images: Array.isArray(location.images)
            ? location.images.filter(
                  (image) =>
                      typeof image === 'string' &&
                      /^\/assets\/uploads\/management\/locations\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(
                          image,
                      ),
              )
            : [],
        createdAt: dateOnly(location.createdAt),
        updatedAt: dateOnly(location.updatedAt),
    };
}

export async function getLocationDisplays(
    db: Db,
    ids: string[],
): Promise<Map<string, LocationDisplay>> {
    const objectIds = [
        ...new Set(ids.filter((id) => typeof id === 'string' && ObjectId.isValid(id))),
    ].map((id) => new ObjectId(id));
    if (objectIds.length === 0) return new Map();

    const locations = await db
        .collection<LocationDocument>('locations')
        .find({ _id: { $in: objectIds } })
        .toArray();
    return new Map(
        locations.map((location) => [
            location._id.toString(),
            displayLocation(location),
        ]),
    );
}

export async function getLocationDisplay(
    db: Db,
    id: string,
): Promise<LocationDisplay | null> {
    return (await getLocationDisplays(db, [id])).get(id) ?? null;
}
