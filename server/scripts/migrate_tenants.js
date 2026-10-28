import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Task from '../src/models/Task.js';
import Organization from '../src/models/Organization.js';
import Workspace from '../src/models/Workspace.js';
import Membership from '../src/models/Membership.js';

async function migrate() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/taskmanager';
  console.log(`[Migration] Connecting to MongoDB: ${uri}`);
  await mongoose.connect(uri);

  console.log('[Migration] Starting Multi-Tenancy Data Migration...');
  const users = await User.find({});
  console.log(`[Migration] Found ${users.length} users to inspect.`);

  let createdOrgs = 0;
  let migratedTasks = 0;

  for (const user of users) {
    // Check if user has an organization
    let membership = await Membership.findOne({ user: user._id }).populate('organization');
    let org = membership ? membership.organization : null;

    if (!org) {
      const slugBase = (user.name || 'user').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const slug = `org-${user._id.toString().slice(-6)}-${slugBase}`;

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

      await Workspace.create({
        organization: org._id,
        name: 'General',
        isDefault: true,
        createdBy: user._id
      });

      user.currentOrganization = org._id;
      await user.save({ validateBeforeSave: false });
      createdOrgs++;
    }

    // Migrate all tasks belonging to this user that lack organization
    const tasksToMigrate = await Task.find({
      user: user._id,
      $or: [{ organization: { $exists: false } }, { organization: null }]
    });

    for (const task of tasksToMigrate) {
      task.organization = org._id;
      if (task.dueDate && !task.dueDateString) {
        task.dueDateString = new Date(task.dueDate).toISOString().slice(0, 10);
      }
      task.isDeleted = task.isDeleted || false;
      await task.save();
      migratedTasks++;
    }
  }

  console.log(`[Migration] Migration Complete!`);
  console.log(`[Migration] Organizations Created: ${createdOrgs}`);
  console.log(`[Migration] Tasks Migrated to Tenants: ${migratedTasks}`);

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('[Migration Error]', err);
  process.exit(1);
});
