import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import User from '../src/models/User.js';
import Task from '../src/models/Task.js';
import Organization from '../src/models/Organization.js';
import Workspace from '../src/models/Workspace.js';
import Membership from '../src/models/Membership.js';
import Team from '../src/models/Team.js';
import { config } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const isDryRun = process.argv.includes('--dry-run');
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/taskmanager';

  console.log('================================================================');
  console.log(` TaskFlow SaaS Multi-Tenancy & Workspace Migration Script`);
  console.log(` Mode: ${isDryRun ? 'DRY RUN (No database mutations will be made)' : 'LIVE EXECUTION'}`);
  console.log(` Target URI: ${uri}`);
  console.log('================================================================\n');

  await mongoose.connect(uri);

  const users = await User.find({});
  console.log(`[Scan] Discovered ${users.length} total users in database.`);

  let createdOrgs = 0;
  let createdWorkspaces = 0;
  let migratedTasks = 0;
  let orphanedTasksFound = 0;

  for (const user of users) {
    // 1. Check or create primary organization membership
    let membership = await Membership.findOne({ user: user._id }).populate('organization');
    let org = membership ? membership.organization : null;

    if (!org) {
      const slugBase = (user.name || 'user').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const slug = `org-${user._id.toString().slice(-6)}-${slugBase}`;

      if (!isDryRun) {
        org = await Organization.create({
          name: `${user.name || 'Personal'}'s Workspace`,
          slug,
          owner: user._id,
          isPersonal: true,
          plan: 'free'
        });

        await Membership.create({
          organization: org._id,
          user: user._id,
          role: 'owner'
        });

        user.currentOrganization = org._id;
        await user.save({ validateBeforeSave: false });
      }
      createdOrgs++;
    }

    // 2. Ensure default workspace exists for this organization
    let defaultWorkspace = null;
    if (org) {
      defaultWorkspace = await Workspace.findOne({ organization: org._id, isDefault: true });
      if (!defaultWorkspace) {
        if (!isDryRun) {
          defaultWorkspace = await Workspace.create({
            organization: org._id,
            name: 'General',
            isDefault: true,
            createdBy: user._id
          });
        }
        createdWorkspaces++;
      }
    }

    // 3. Migrate tasks belonging to this user that lack organization or workspace
    const tasksToMigrate = await Task.find({
      user: user._id,
      $or: [
        { organization: { $exists: false } },
        { organization: null },
        { workspace: { $exists: false } },
        { workspace: null }
      ]
    });

    for (const task of tasksToMigrate) {
      if (!isDryRun && org) {
        if (!task.organization) {
          task.organization = org._id;
        }
        if (!task.workspace && defaultWorkspace) {
          task.workspace = defaultWorkspace._id;
        }
        if (task.dueDate && !task.dueDateString) {
          task.dueDateString = new Date(task.dueDate).toISOString().slice(0, 10);
        }
        if (task.isDeleted === undefined) {
          task.isDeleted = false;
        }
        await task.save();
      }
      migratedTasks++;
    }
  }

  // 4. Verify no orphaned tasks exist (tasks with no valid user)
  const allTasks = await Task.find({});
  const userIds = new Set(users.map((u) => u._id.toString()));
  for (const t of allTasks) {
    if (!t.user || !userIds.has(t.user.toString())) {
      orphanedTasksFound++;
      console.warn(`[Warning] Orphaned task detected without valid user owner: Task ID ${t._id}`);
    }
  }

  // 5. Ensure critical database compound indexes are built
  if (!isDryRun) {
    console.log('\n[Indexes] Synchronizing database indexes...');
    await Promise.all([
      Task.syncIndexes(),
      Organization.syncIndexes(),
      Workspace.syncIndexes(),
      Membership.syncIndexes(),
      Team.syncIndexes()
    ]);
    console.log('[Indexes] All compound tenant indexes successfully built.');
  }

  console.log('\n================================================================');
  console.log(' Migration Summary:');
  console.log(` - Organizations to Create: ${createdOrgs}`);
  console.log(` - Workspaces to Create:    ${createdWorkspaces}`);
  console.log(` - Tasks to Migrate:        ${migratedTasks}`);
  console.log(` - Orphaned Tasks:          ${orphanedTasksFound}`);
  console.log(` - Execution Result:        ${isDryRun ? 'DRY RUN COMPLETED' : 'SUCCESSFULLY APPLIED'}`);
  console.log('================================================================\n');

  await mongoose.disconnect();
}

runMigration().catch((err) => {
  console.error('[Migration Error]', err);
  process.exit(1);
});
