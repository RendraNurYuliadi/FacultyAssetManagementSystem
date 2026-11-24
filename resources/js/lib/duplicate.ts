export function nextNumberedUniqueValue(
    value: string,
    existingValues: string[],
    maxLength = 255,
) {
    const base = value.trim().replace(/\s+\(\d+\)$/, '').trim();
    if (!base) return '';

    const existing = new Set(
        existingValues.map((item) => item.trim().toLowerCase()),
    );
    for (let number = 1; ; number += 1) {
        const suffix = ` (${number})`;
        const prefix = base
            .slice(0, Math.max(0, maxLength - suffix.length))
            .trimEnd();
        const candidate = `${prefix}${suffix}`;
        if (!existing.has(candidate.toLowerCase())) return candidate;
    }
}

export function nextNumberedEmail(email: string, existingEmails: string[]) {
    const separator = email.lastIndexOf('@');
    if (separator <= 0) return nextNumberedUniqueValue(email, existingEmails);

    const localPart = email.slice(0, separator).replace(/\+\d+$/, '');
    const domain = email.slice(separator + 1);
    const existing = new Set(
        existingEmails.map((item) => item.trim().toLowerCase()),
    );
    for (let number = 1; ; number += 1) {
        const suffix = `+${number}`;
        const maxLocalPrefix = Math.min(
            64 - suffix.length,
            254 - domain.length - suffix.length,
        );
        if (maxLocalPrefix < 0) {
            throw new Error('Email terlalu panjang untuk dibuatkan duplikat.');
        }
        const candidate = `${localPart.slice(0, maxLocalPrefix)}${suffix}@${domain}`;
        if (!existing.has(candidate.toLowerCase())) return candidate;
    }
}
