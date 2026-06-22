import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function idealInk(color: string | { r: number; g: number; b: number }) {
  let r: number, g: number, b: number;
  if (typeof color === 'string') {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
    if (!result) {
      return '#0C0C0D';
    }
    r = parseInt(result[1], 16);
    g = parseInt(result[2], 16);
    b = parseInt(result[3], 16);
  } else {
    ({ r, g, b } = color);
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#0C0C0D' : '#FFFFFF';
}

export function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 212, g: 255, b: 79 };
}
