import 'react';

declare module 'react' {
    interface InputHTMLAttributes<T> {
        passwordrules?: string;
    }
}
