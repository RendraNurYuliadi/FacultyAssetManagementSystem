export async function managementRequest<T>(
    url: string,
    init: RequestInit = {},
): Promise<T> {
    const response = await fetch(url, {
        cache: 'no-store',
        ...init,
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
        const message =
            typeof payload === 'object' &&
            payload !== null &&
            'message' in payload &&
            typeof payload.message === 'string'
                ? payload.message
                : 'Permintaan gagal. Silakan coba lagi.';
        throw new Error(message);
    }
    if (payload === null) {
        throw new Error('Respons server tidak dapat dibaca.');
    }
    return payload as T;
}

export function managementErrorMessage(error: unknown) {
    return error instanceof Error
        ? error.message
        : 'Terjadi kesalahan. Silakan coba lagi.';
}
