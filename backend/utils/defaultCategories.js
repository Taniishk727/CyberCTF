import { Category } from '../models/index.js';

const DEFAULT_CATEGORIES = [
  { name: 'Cryptography', description: 'Ciphers, encryption, and cryptographic analysis.', color: '#8b5cf6' },
  { name: 'Digital Forensics', description: 'Analyze files, devices, memory, and digital evidence.', color: '#06b6d4' },
  { name: 'OSINT', description: 'Investigate publicly available information and sources.', color: '#f59e0b' }
];

export async function ensureDefaultCategories(eventId) {
  try {
    await Category.bulkWrite(
      DEFAULT_CATEGORIES.map((category) => ({
        updateOne: {
          filter: { eventId, name: category.name },
          update: { $setOnInsert: { ...category, eventId } },
          upsert: true
        }
      })),
      { ordered: false }
    );
  } catch (error) {
    const writeErrors = error.writeErrors || [];
    const onlyDuplicateKeyErrors = writeErrors.length > 0 && writeErrors.every((item) => item.code === 11000);
    if (error.code !== 11000 && !onlyDuplicateKeyErrors) throw error;
  }
}
