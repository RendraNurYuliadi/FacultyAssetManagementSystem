'use client';

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type AnchorHTMLAttributes,
    type FormEvent,
    type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

type SessionUser = {
    id: string;
    name: string;
    email: string;
    role: string;
    avatar?: string;
};

type PageState = {
    auth: { user: SessionUser | null };
    name: string;
    sidebarOpen: boolean;
};

const PageContext = createContext<PageState>({
    auth: { user: null },
    name: 'FAMS',
    sidebarOpen: true,
});

export function LegacyPageContext({
    pathname,
    user,
    children,
}: {
    pathname: string;
    user: SessionUser | null;
    children: ReactNode;
}) {
    return (
        <PageContext.Provider
            value={{
                auth: { user },
                name: 'FAMS',
                sidebarOpen: true,
            }}
        >
            {children}
        </PageContext.Provider>
    );
}

export function usePage<T = PageState>() {
    const props = useContext(PageContext);
    const pathname = usePathname();
    return { url: pathname ?? '/', props: props as T };
}

export function Link({
    href,
    method,
    as,
    ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    method?: string;
    as?: 'a' | 'button';
}) {
    if (as === 'button') {
        return (
            <button
                type="button"
                className={props.className}
                aria-label={props['aria-label']}
                onClick={() => {
                    if (method === 'post') void router.post(href);
                    else window.location.assign(href);
                }}
            >
                {props.children}
            </button>
        );
    }
    return <a href={href} {...props} />;
}

export function Head({ title }: { title?: string }) {
    useEffect(() => {
        if (title) document.title = title;
    }, [title]);
    return null;
}

type FormOptions = {
    forceFormData?: boolean;
    preserveScroll?: boolean;
    onSuccess?: (result: ApiResponse) => void;
    onError?: (errors: Record<string, string>) => void;
    onFinish?: () => void;
};

const apiPaths: Record<string, string> = {
    '/login': '/api/auth/login',
    '/register': '/api/auth/register',
    '/forgot-password': '/api/auth/password-request',
    '/forgot-password/verify': '/api/auth/password-verify',
    '/reset-password': '/api/auth/password-reset',
    '/email/verification-notification':
        '/api/auth/verification-notification',
    '/logout': '/api/auth/logout',
};

type ApiResponse = {
    redirect?: string;
    errors?: Record<string, string>;
    message?: string;
};

type SetFormData<T extends Record<string, unknown>> = {
    <K extends keyof T>(key: K, value: T[K]): void;
    (value: T | ((previous: T) => T)): void;
};

export function useForm<T extends Record<string, unknown>>(initialData: T) {
    const [data, setFormData] = useState(initialData);
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const setData: SetFormData<T> = ((
        keyOrValue: keyof T | T | ((previous: T) => T),
        value?: T[keyof T],
    ) => {
        if (typeof keyOrValue === 'string') {
            setFormData((previous) => ({
                ...previous,
                [keyOrValue]: value,
            }));
        } else {
            setFormData(keyOrValue as T | ((previous: T) => T));
        }
    }) as SetFormData<T>;

    function reset(...keys: (keyof T)[]) {
        setFormData((previous) => {
            const next = { ...previous };
            const fields = keys.length ? keys : Object.keys(initialData);
            for (const key of fields) next[key] = initialData[key];
            return next;
        });
    }

    async function post(url: string, options: FormOptions = {}) {
        setProcessing(true);
        setErrors({});
        try {
            let photoUploadId: string | undefined;
            const photo = data.photo;
            if (photo instanceof File && photo.size > 3 * 1024 * 1024) {
                photoUploadId = crypto.randomUUID();
                const chunkSize = 1024 * 1024;
                const parts = Math.ceil(photo.size / chunkSize);

                for (let index = 0; index < parts; index += 1) {
                    const upload = new FormData();
                    upload.append('upload_id', photoUploadId);
                    upload.append('index', String(index));
                    upload.append('parts', String(parts));
                    upload.append('mime', photo.type);
                    upload.append(
                        'chunk',
                        photo.slice(index * chunkSize, (index + 1) * chunkSize),
                        photo.name,
                    );

                    const uploadResponse = await fetch(
                        '/api/auth/photo-upload',
                        {
                            method: 'POST',
                            headers: { Accept: 'application/json' },
                            body: upload,
                        },
                    );
                    const uploadResult =
                        (await uploadResponse.json()) as ApiResponse;
                    if (!uploadResponse.ok) {
                        const uploadErrors = uploadResult.errors ?? {
                            photo: uploadResult.message ?? 'Foto gagal diunggah.',
                        };
                        setErrors(uploadErrors);
                        options.onError?.(uploadErrors);
                        return;
                    }
                }
            }

            const body = new FormData();
            for (const [key, value] of Object.entries(data)) {
                if (key === 'photo' && photoUploadId) continue;
                if (value !== null && value !== undefined) {
                    body.append(
                        key,
                        value instanceof File ? value : String(value),
                    );
                }
            }
            if (photoUploadId) body.append('photo_upload_id', photoUploadId);

            const response = await fetch(apiPaths[url] ?? url, {
                method: 'POST',
                headers: { Accept: 'application/json' },
                body,
            });
            const result = (await response.json()) as ApiResponse;

            if (!response.ok) {
                const nextErrors = result.errors ?? {
                    _form: result.message ?? 'Permintaan gagal diproses.',
                };
                setErrors(nextErrors);
                options.onError?.(nextErrors);
                return;
            }

            options.onSuccess?.(result);
            if (result.redirect) window.location.assign(result.redirect);
        } catch {
            const networkError = {
                email: 'Tidak dapat terhubung ke server. Coba lagi.',
            };
            setErrors(networkError);
            options.onError?.(networkError);
        } finally {
            setProcessing(false);
            options.onFinish?.();
        }
    }

    return { data, setData, post, processing, errors, reset };
}

export const router = {
    visit(url: string) {
        window.location.assign(url);
    },
    async post(url: string) {
        const response = await fetch(apiPaths[url] ?? url, {
            method: 'POST',
            headers: { Accept: 'application/json' },
        });
        const result = (await response.json()) as ApiResponse;
        if (!response.ok) {
            throw new Error(result.message ?? 'Permintaan gagal diproses.');
        }
        window.location.assign(result.redirect ?? '/login');
    },
};

export function preventDefault(event: FormEvent) {
    event.preventDefault();
}
