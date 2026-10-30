import fs from 'fs';
import path from 'path';

const uploadDir = path.resolve(process.cwd(), 'uploads/attachments');

/**
 * Ensures the physical upload directory exists on disk
 */
export const ensureStorageDirectory = () => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
};

/**
 * Deletes a physical file from storage
 *
 * @param {string} filename - Stored filename
 * @returns {boolean} - Whether the file was successfully deleted or didn't exist
 */
export const deleteStoredFile = async (filename) => {
  if (!filename) return true;
  try {
    const filePath = path.join(uploadDir, path.basename(filename));
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
  } catch (err) {
    console.warn(`[Storage Warning] Could not delete file ${filename}:`, err.message);
  }
  return false;
};

/**
 * Deletes multiple physical files from storage
 *
 * @param {Array<string>} filenames - Array of filenames
 */
export const deleteMultipleStoredFiles = async (filenames = []) => {
  if (!Array.isArray(filenames) || filenames.length === 0) return;
  await Promise.allSettled(filenames.map((f) => deleteStoredFile(f)));
};

/**
 * Returns the absolute path of a stored file
 *
 * @param {string} filename - Stored filename
 * @returns {string} - Absolute file path
 */
export const getStoredFilePath = (filename) => {
  return path.join(uploadDir, path.basename(filename));
};
