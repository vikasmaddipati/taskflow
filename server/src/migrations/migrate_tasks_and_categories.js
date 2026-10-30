/**
 * TaskFlow Database Migration: Tasks Soft-Delete & Persistent Categories
 *
 * Requirements:
 * 1. Safe to run against existing databases with zero downtime.
 * 2. Idempotent: Can be run multiple times safely without duplicate categories or corrupted flags.
 * 3. Populates missing isDeleted: false, deletedAt: null, deletedBy: null on legacy tasks.
 * 4. Extracts distinct categories across tasks per organization and creates persistent Category documents.
 * 5. Structured logging with detailed stats.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import Task from '../models/Task.js';
import Category from '../models/Category.js';
import Organization from '../models/Organization.js';

export const runMigration = async () => {
  console.log('----------------------------------------------------');
  console.log('[Migration] Starting Tasks and Categories Integrity Migration...');
  console.log('----------------------------------------------------');

  const stats = {
    tasksChecked: 0,
    tasksUpdatedWithSoftDelete: 0,
    organizationsChecked: 0,
    categoriesFound: 0,
    categoriesCreated: 0,
    categoriesExisting: 0
  };

  // 1. Backfill legacy tasks missing soft-delete fields
  const totalTasks = await Task.countDocuments({});
  stats.tasksChecked = totalTasks;

  const softDeleteBackfillResult = await Task.updateMany(
    {
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: null },
        { deletedAt: { $exists: false } }
      ]
    },
    {
      $set: {
        isDeleted: false,
        deletedAt: null,
        deletedBy: null
      }
    }
  );

  stats.tasksUpdatedWithSoftDelete = softDeleteBackfillResult.modifiedCount || 0;
  console.log(`[Migration] Soft-delete backfill complete: ${stats.tasksUpdatedWithSoftDelete} task(s) updated.`);

  // 2. Extract and persist categories per organization
  const organizations = await Organization.find({}).select('_id name owner');
  stats.organizationsChecked = organizations.length;
  console.log(`[Migration] Processing categories for ${organizations.length} organization(s)...`);

  for (const org of organizations) {
    const rawCategories = await Task.distinct('category', { organization: org._id });
    const cleanCategories = rawCategories
      .map((c) => (typeof c === 'string' ? c.trim() : ''))
      .filter((c) => c.length > 0);

    // Always ensure default 'General' category exists
    if (!cleanCategories.includes('General')) {
      cleanCategories.push('General');
    }

    stats.categoriesFound += cleanCategories.length;

    for (const catName of cleanCategories) {
      const normalized = catName.toLowerCase().trim();
      const existing = await Category.findOne({
        organization: org._id,
        normalizedName: normalized
      });

      if (!existing) {
        await Category.create({
          name: catName,
          normalizedName: normalized,
          organization: org._id,
          workspace: null, // Org-wide default
          createdBy: org.owner || null,
          color: '#3B82F6',
          description: `Imported from existing tasks in organization ${org.name}`,
          isArchived: false,
          position: 0
        });
        stats.categoriesCreated++;
      } else {
        stats.categoriesExisting++;
      }
    }
  }

  console.log('----------------------------------------------------');
  console.log('[Migration] Migration Summary:');
  console.log(`  - Total Tasks Checked:           ${stats.tasksChecked}`);
  console.log(`  - Tasks Backfilled (Soft-Delete): ${stats.tasksUpdatedWithSoftDelete}`);
  console.log(`  - Organizations Processed:       ${stats.organizationsChecked}`);
  console.log(`  - Distinct Categories Found:     ${stats.categoriesFound}`);
  console.log(`  - Categories Created:            ${stats.categoriesCreated}`);
  console.log(`  - Categories Already Existed:    ${stats.categoriesExisting}`);
  console.log('----------------------------------------------------');
  console.log('[Migration] Successfully finished tasks and categories migration.');

  return stats;
};

// Auto-run if executed directly via CLI
if (process.argv[1] && process.argv[1].endsWith('migrate_tasks_and_categories.js')) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/taskmanager';
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log(`[Migration CLI] Connected to MongoDB at ${mongoUri}`);
      await runMigration();
      await mongoose.disconnect();
      console.log('[Migration CLI] Database connection closed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration CLI] Error running migration:', err);
      process.exit(1);
    });
}
