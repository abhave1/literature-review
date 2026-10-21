import type { ButtonHTMLAttributes } from 'react';

const variants = {
  primary: 'border-gray-900 bg-gray-900 text-white hover:enabled:bg-gray-700',
  secondary: 'border-gray-300 bg-white text-gray-700 hover:enabled:border-gray-900 hover:enabled:text-gray-900',
  danger: 'border-red-700 bg-red-700 text-white hover:enabled:bg-red-800',
} as const;
const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-[13px]' } as const;

export default function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: keyof typeof sizes }) {
  return <button type={type} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}
