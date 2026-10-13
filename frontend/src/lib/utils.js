import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Legacy predefined classes for backwards compatibility
const LEGACY_CATEGORY_CLASSES = {
  Web: 'badge-web',
  Crypto: 'badge-crypto',
  Forensics: 'badge-forensics',
  OSINT: 'badge-osint',
  Misc: 'badge-misc',
  Reverse: 'badge-reverse',
  Pwn: 'badge-pwn'
};

/**
 * Get CSS class for category badge
 * Supports legacy hardcoded categories and dynamic ones
 * For dynamic categories, generates a fallback class
 */
export function getCategoryClass(category) {
  // Check if it's a legacy predefined category
  if (LEGACY_CATEGORY_CLASSES[category]) {
    return LEGACY_CATEGORY_CLASSES[category];
  }
  
  // For dynamic categories, use a generic fallback class
  // The color will be applied via inline styles from context
  return 'badge-dynamic';
}

export function getDifficultyClass(difficulty) {
  const classes = {
    Easy: 'badge-easy',
    Medium: 'badge-medium',
    Hard: 'badge-hard'
  };
  return classes[difficulty] || 'badge-medium';
}

export function formatDate(date) {
  if (date === null || date === undefined || date === '') return 'Date unavailable';

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return 'Date unavailable';

  return parsedDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
