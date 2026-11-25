import { useState } from 'react';
import {
    managementErrorMessage,
    managementRequest,
} from '../../lib/management-client';

type Props = {
    endpoint: string;
    dataLabel: string;
    warning: string;
    onCleared: () => void;
};

export default function ClearManagementDataButton({
    endpoint,
    dataLabel,
    warning,
    onCleared,
}: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [confirmation, setConfirmation] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    async function clearData() {
        setIsSubmitting(true);
        setError('');
        setSuccess('');
        try {
            const result = await managementRequest<{ deletedCount: number }>(
                endpoint,
                {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confirmation }),
                },
            );
            onCleared();
            setSuccess(`${result.deletedCount} data ${dataLabel} dihapus.`);
            setIsOpen(false);
            setConfirmation('');
        } catch (requestError) {
            setError(managementErrorMessage(requestError));
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() => {
                    setError('');
                    setSuccess('');
                    setConfirmation('');
                    setIsOpen(true);
                }}
                className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
            >
                Hapus Semua
            </button>

            {success && (
                <p role="status" className="text-sm text-emerald-700">
                    {success}
                </p>
            )}

            {isOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="clear-management-data-title"
                        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
                    >
                        <h2
                            id="clear-management-data-title"
                            className="text-lg font-bold text-neutral-950"
                        >
                            Hapus semua {dataLabel}?
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-neutral-600">
                            Seluruh data {dataLabel} akan dihapus permanen. Tindakan
                            ini tidak dapat dibatalkan.
                        </p>
                        <p className="mt-2 text-sm leading-6 text-neutral-600">
                            {warning}
                        </p>

                        <label
                            htmlFor="clear-management-data-confirmation"
                            className="mt-5 block text-sm font-medium text-neutral-800"
                        >
                            Ketik <span className="font-bold">HAPUS</span> untuk
                            melanjutkan
                        </label>
                        <input
                            id="clear-management-data-confirmation"
                            value={confirmation}
                            onChange={(event) =>
                                setConfirmation(event.target.value)
                            }
                            autoComplete="off"
                            className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500"
                        />

                        {error && (
                            <p
                                role="alert"
                                className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
                            >
                                {error}
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                disabled={isSubmitting}
                                className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={() => void clearData()}
                                disabled={
                                    confirmation !== 'HAPUS' || isSubmitting
                                }
                                className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSubmitting ? 'Menghapus...' : 'Hapus Permanen'}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </>
    );
}
