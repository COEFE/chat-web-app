import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats bytes into a human-readable string (KB, MB, GB, etc.).
 * 
 * @param bytes - The number of bytes.
 * @param decimals - The number of decimal places (default: 2).
 * @returns A formatted string representing the size, or '-' if bytes is invalid.
 */
export function formatBytes(bytes: number | undefined | null, decimals = 2): string {
  if (bytes === undefined || bytes === null || bytes < 0 || isNaN(bytes)) {
    return '-'; // Return '-' for invalid or zero bytes
  }
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
