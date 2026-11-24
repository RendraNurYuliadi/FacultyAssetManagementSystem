import 'server-only';
import { MongoClient, type Db } from 'mongodb';

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'FAMS';

type MongoCache = typeof globalThis & {
    famsMongoClient?: MongoClient;
    famsMongoPromise?: Promise<MongoClient>;
    famsMongoDb?: Db;
    famsLocationIndexPromise?: Promise<void>;
    famsRoomIndexPromise?: Promise<void>;
    famsItemIndexPromise?: Promise<void>;
    famsAssetIndexPromise?: Promise<void>;
};

const cache = globalThis as MongoCache;

function ensureLocationCodeIndex(db: Db) {
    cache.famsLocationIndexPromise ??= db
        .collection('locations')
        .createIndex(
            { code: 1 },
            { unique: true, name: 'locations_code_unique' },
        )
        .then(() => undefined)
        .catch((error: unknown) => {
            cache.famsLocationIndexPromise = undefined;
            throw error;
        });
    return cache.famsLocationIndexPromise;
}

function ensureRoomIndexes(db: Db) {
    cache.famsRoomIndexPromise ??= Promise.all([
        db.collection('rooms').createIndex(
            { code: 1 },
            { unique: true, name: 'rooms_code_unique' },
        ),
        db.collection('rooms').createIndex(
            { rfidCode: 1 },
            { unique: true, name: 'rooms_rfid_code_unique' },
        ),
        db.collection('rooms').createIndex(
            { locationId: 1, roomNumber: 1 },
            { unique: true, name: 'rooms_location_room_number_unique' },
        ),
    ])
        .then(() => undefined)
        .catch((error: unknown) => {
            cache.famsRoomIndexPromise = undefined;
            throw error;
        });
    return cache.famsRoomIndexPromise;
}

function ensureItemIndexes(db: Db) {
    cache.famsItemIndexPromise ??= Promise.all([
        db.collection('items').createIndex(
            { code: 1 },
            { unique: true, name: 'items_code_unique' },
        ),
        db.collection('items').createIndex(
            { rfidCode: 1 },
            { unique: true, name: 'items_rfid_code_unique' },
        ),
        db.collection('items').createIndex(
            { locationId: 1 },
            { name: 'items_location_id' },
        ),
    ])
        .then(() => undefined)
        .catch((error: unknown) => {
            cache.famsItemIndexPromise = undefined;
            throw error;
        });
    return cache.famsItemIndexPromise;
}

function ensureAssetIndexes(db: Db) {
    cache.famsAssetIndexPromise ??= Promise.all([
        db.collection('assets').createIndex(
            { code: 1 },
            { unique: true, name: 'assets_code_unique' },
        ),
        db.collection('assets').createIndex(
            { itemId: 1 },
            { name: 'assets_item_id' },
        ),
        db.collection('assets').createIndex(
            { roomId: 1 },
            { name: 'assets_room_id' },
        ),
    ])
        .then(() => undefined)
        .catch((error: unknown) => {
            cache.famsAssetIndexPromise = undefined;
            throw error;
        });
    return cache.famsAssetIndexPromise;
}

export async function getDb(): Promise<Db> {
    if (cache.famsMongoDb) {
        await Promise.all([
            ensureLocationCodeIndex(cache.famsMongoDb),
            ensureRoomIndexes(cache.famsMongoDb),
            ensureItemIndexes(cache.famsMongoDb),
            ensureAssetIndexes(cache.famsMongoDb),
        ]);
        return cache.famsMongoDb;
    }
    if (!uri) throw new Error('MONGODB_URI belum dikonfigurasi.');

    cache.famsMongoPromise ??= (async () => {
        const client =
            cache.famsMongoClient ??
            new MongoClient(uri, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 5000,
            });
        cache.famsMongoClient = client;
        await client.connect();
        return client;
    })().catch((error: unknown) => {
        cache.famsMongoPromise = undefined;
        cache.famsMongoClient = undefined;
        throw error;
    });

    const client = await cache.famsMongoPromise;
    const db = client.db(databaseName);
    await Promise.all([
        db.collection('users').createIndex(
            { email: 1 },
            { unique: true, name: 'users_email_unique' },
        ),
        db.collection('users').createIndex(
            { identity_number: 1 },
            {
                unique: true,
                partialFilterExpression: {
                    identity_number: { $type: 'string' },
                },
                name: 'users_identity_number_unique',
            },
        ),
        db.collection('password_reset_codes').createIndex(
            { email: 1 },
            { unique: true, name: 'password_reset_email_unique' },
        ),
        db.collection('password_reset_codes').createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0, name: 'password_reset_expiry' },
        ),
        db.collection('auth_sessions').createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0, name: 'auth_session_expiry' },
        ),
        db.collection('profile_photo_uploads').createIndex(
            { uploadId: 1, index: 1 },
            { unique: true, name: 'profile_photo_chunk_unique' },
        ),
        db.collection('profile_photo_uploads').createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0, name: 'profile_photo_upload_expiry' },
        ),
        db.collection('auth_rate_limits').createIndex(
            { updatedAt: 1 },
            { expireAfterSeconds: 86400, name: 'auth_rate_limit_expiry' },
        ),
        db.collection('organizations').createIndex(
            { code: 1 },
            { unique: true, name: 'organizations_code_unique' },
        ),
        db.collection('locations').createIndex(
            { code: 1 },
            { unique: true, name: 'locations_code_unique' },
        ),
        db.collection('rooms').createIndex(
            { code: 1 },
            { unique: true, name: 'rooms_code_unique' },
        ),
        db.collection('rooms').createIndex(
            { rfidCode: 1 },
            { unique: true, name: 'rooms_rfid_code_unique' },
        ),
        db.collection('rooms').createIndex(
            { locationId: 1, roomNumber: 1 },
            { unique: true, name: 'rooms_location_room_number_unique' },
        ),
        db.collection('items').createIndex(
            { code: 1 },
            { unique: true, name: 'items_code_unique' },
        ),
        db.collection('items').createIndex(
            { rfidCode: 1 },
            { unique: true, name: 'items_rfid_code_unique' },
        ),
        db.collection('items').createIndex(
            { locationId: 1 },
            { name: 'items_location_id' },
        ),
        db.collection('assets').createIndex(
            { code: 1 },
            { unique: true, name: 'assets_code_unique' },
        ),
        db.collection('assets').createIndex(
            { itemId: 1 },
            { name: 'assets_item_id' },
        ),
        db.collection('assets').createIndex(
            { roomId: 1 },
            { name: 'assets_room_id' },
        ),
    ]);
    cache.famsMongoDb = db;
    cache.famsLocationIndexPromise = Promise.resolve();
    cache.famsRoomIndexPromise = Promise.resolve();
    cache.famsItemIndexPromise = Promise.resolve();
    cache.famsAssetIndexPromise = Promise.resolve();
    return db;
}
