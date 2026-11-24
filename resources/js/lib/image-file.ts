const supportedImageTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);
const maxImageSize = 5 * 1024 * 1024;

export async function copyStoredImage(source: string, filename: string) {
    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error('Foto sumber tidak dapat dibaca untuk diduplikasi.');
    }

    const blob = await response.blob();
    if (
        !supportedImageTypes.has(blob.type) ||
        blob.size < 1 ||
        blob.size > maxImageSize
    ) {
        throw new Error('Foto sumber tidak valid atau melebihi 5 MB.');
    }

    const extension = blob.type === 'image/jpeg'
        ? 'jpg'
        : blob.type === 'image/png'
          ? 'png'
          : 'webp';
    return new File([blob], `${filename}.${extension}`, { type: blob.type });
}
