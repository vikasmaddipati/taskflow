// TaskFlow — Database & Data Integrity Hardening Automated Verification Suite
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Task from '../src/models/Task.js';
import Category from '../src/models/Category.js';
import Otp from '../src/models/Otp.js';
import { runMigration } from '../src/migrations/migrate_tasks_and_categories.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://127.0.0.1:5000/api';

async function isServerRunning() {
  try {
    const res = await fetch('http://127.0.0.1:5000/api/health', {
      signal: AbortSignal.timeout(1500)
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-test-mode': 'true',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function runDataIntegrityTests() {
  console.log('================================================================');
  console.log('   TaskFlow Database & Data Integrity Hardening Verification   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  let spawnedServer = null;

  function assert(condition, testName, extraInfo = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${extraInfo ? '- ' + extraInfo : ''}`);
      failed++;
    }
  }

  // Ensure server is running
  const serverAlreadyRunning = await isServerRunning();
  if (!serverAlreadyRunning) {
    console.log('[Setup] Launching background API server on port 5000...');
    spawnedServer = spawn('node', ['src/server.js'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'pipe',
      detached: false,
      env: { ...process.env, HOST: '127.0.0.1' }
    });
    spawnedServer.stdout.on('data', () => {});
    spawnedServer.stderr.on('data', () => {});

    let running = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 600));
      if (await isServerRunning()) {
        running = true;
        break;
      }
    }

    if (!running) {
      console.error('[Error] Could not connect to API server.');
      process.exit(1);
    }
    console.log('[Setup] Server running.\n');
  }

  // Connect Mongoose directly for deep data-integrity and index inspection
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/taskmanager';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const timestamp = Date.now();

  try {
    // -------------------------------------------------------------------------
    // Setup Test Tenancy
    // -------------------------------------------------------------------------
    console.log('--- TEST GROUP 0: Test Fixtures Setup ---');

    // Tenant Alpha (Primary User)
    const userAEmail = `alpha_data_${timestamp}@test.com`;
    const regResA = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Alpha Admin',
        email: userAEmail,
        password: 'Password123!'
      })
    });
    const tokenA = regResA.data.token;
    const orgAId = regResA.data.organization._id;

    // Tenant Beta (Isolated Secondary Tenant)
    const userBEmail = `beta_data_${timestamp}@test.com`;
    const regResB = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Beta Admin',
        email: userBEmail,
        password: 'Password123!'
      })
    });
    const tokenB = regResB.data.token;
    const orgBId = regResB.data.organization._id;

    assert(tokenA && orgAId && tokenB && orgBId, 'Test tenants Alpha and Beta created successfully');

    // Helpers bound to tenants Alpha and Beta
    const apiA = (endpoint, opts = {}) =>
      request(endpoint, {
        ...opts,
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'x-organization-id': orgAId,
          ...(opts.headers || {})
        }
      });

    const apiB = (endpoint, opts = {}) =>
      request(endpoint, {
        ...opts,
        headers: {
          Authorization: `Bearer ${tokenB}`,
          'x-organization-id': orgBId,
          ...(opts.headers || {})
        }
      });

    // -------------------------------------------------------------------------
    // Phase 1: Safe Task Deletion and Recovery (Trash)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 1: Soft-Delete & Trash Recovery ---');

    // 1. Create 3 tasks in Tenant A
    const t1Res = await apiA('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Task to Delete 1', priority: 'high', category: 'Backend' })
    });
    const t2Res = await apiA('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Task to Delete 2', priority: 'medium', category: 'Backend' })
    });
    const t3Res = await apiA('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Task to Keep Active', priority: 'low', category: 'Frontend' })
    });

    const task1Id = t1Res.data.task?._id;
    const task2Id = t2Res.data.task?._id;
    const task3Id = t3Res.data.task?._id;

    assert(task1Id && task2Id && task3Id, 'Created three active test tasks in Tenant Alpha');

    // 2. Soft delete Task 1
    const del1Res = await apiA(`/tasks/${task1Id}`, {
      method: 'DELETE'
    });
    assert(del1Res.status === 200, 'DELETE /api/tasks/:id returns 200 soft-delete confirmation');

    // 3. Inspect Task 1 directly in MongoDB
    const task1Doc = await Task.findById(task1Id).lean();
    assert(
      task1Doc.isDeleted === true && task1Doc.deletedAt !== null && task1Doc.deletedBy !== null,
      'Soft-deleted task in DB has isDeleted=true, deletedAt timestamp, and deletedBy reference'
    );

    // 4. Verify Task 1 is excluded from normal GET /api/tasks
    const activeTasksRes = await apiA('/tasks');
    const activeIds = (activeTasksRes.data.items || activeTasksRes.data.tasks || []).map((t) => t._id);
    assert(
      !activeIds.includes(task1Id) && activeIds.includes(task2Id) && activeIds.includes(task3Id),
      'GET /api/tasks excludes soft-deleted tasks'
    );

    // 5. Verify stats endpoint excludes soft-deleted tasks
    const statsRes = await apiA('/tasks/stats');
    assert(
      statsRes.data.stats?.total === 2,
      'GET /api/tasks/stats counts only active tasks (excludes soft-deleted)'
    );

    // 6. Verify Task 1 appears in GET /api/tasks/trash
    const trashRes = await apiA('/tasks/trash');
    const trashIds = (trashRes.data.items || trashRes.data.tasks || []).map((t) => t._id);
    assert(
      trashRes.status === 200 && trashIds.includes(task1Id) && !trashIds.includes(task2Id),
      'GET /api/tasks/trash returns soft-deleted task'
    );

    // 7. Cross-tenant isolation on trash: Tenant Beta cannot see Tenant Alpha trash
    const trashBetaRes = await apiB('/tasks/trash');
    const trashBetaIds = (trashBetaRes.data.items || trashBetaRes.data.tasks || []).map((t) => t._id);
    assert(
      !trashBetaIds.includes(task1Id),
      'Tenant Beta cannot see Tenant Alpha soft-deleted tasks in trash'
    );

    // 8. Cross-tenant restore rejection: Tenant Beta cannot restore Tenant Alpha task
    const crossRestoreRes = await apiB(`/tasks/${task1Id}/restore`, {
      method: 'PATCH'
    });
    assert(
      crossRestoreRes.status === 404,
      'Tenant Beta cannot restore Tenant Alpha task (returns 404)'
    );

    // 9. Restore Task 1 by Tenant Alpha
    const restoreRes = await apiA(`/tasks/${task1Id}/restore`, {
      method: 'PATCH'
    });
    assert(
      restoreRes.status === 200 && restoreRes.data.task?.isDeleted === false,
      'PATCH /api/tasks/:id/restore returns 200 and unsets isDeleted'
    );

    const task1RestoredDoc = await Task.findById(task1Id).lean();
    assert(
      task1RestoredDoc.isDeleted === false && task1RestoredDoc.deletedAt === null && task1RestoredDoc.deletedBy === null,
      'Restored task in DB has isDeleted=false, deletedAt=null, deletedBy=null'
    );

    // 10. Attempting to restore already restored task returns 404
    const repeatRestoreRes = await apiA(`/tasks/${task1Id}/restore`, {
      method: 'PATCH'
    });
    assert(
      repeatRestoreRes.status === 404,
      'Restoring an already-active task returns 404 (preventing invalid state transition)'
    );

    // 11. Soft-delete Task 2 and permanently delete it
    await apiA(`/tasks/${task2Id}`, {
      method: 'DELETE'
    });

    const permDelRes = await apiA(`/tasks/${task2Id}/permanent`, {
      method: 'DELETE'
    });
    assert(
      permDelRes.status === 200,
      'DELETE /api/tasks/:id/permanent returns 200'
    );

    const task2DocAfterPerm = await Task.findById(task2Id).lean();
    assert(
      task2DocAfterPerm === null,
      'Permanently deleted task is completely purged from MongoDB'
    );

    // 12. Soft-delete Task 1 again and test Empty Trash
    await apiA(`/tasks/${task1Id}`, {
      method: 'DELETE'
    });

    const emptyTrashRes = await apiA('/tasks/trash/empty', {
      method: 'DELETE'
    });
    assert(
      emptyTrashRes.status === 200 && emptyTrashRes.data.deletedCount >= 1,
      'DELETE /api/tasks/trash/empty permanently empties all trash for active tenant'
    );

    const trashAfterEmpty = await apiA('/tasks/trash');
    assert(
      (trashAfterEmpty.data.items || trashAfterEmpty.data.tasks).length === 0,
      'Trash is completely empty after emptyTrash operation'
    );

    // -------------------------------------------------------------------------
    // Phase 2: Bounded Pagination and Deterministic Sorting
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Bounded Pagination & Sorting Whitelist ---');

    // Create 25 tasks for pagination testing
    const batchTasks = [];
    for (let i = 1; i <= 25; i++) {
      batchTasks.push({
        user: regResA.data.user.id,
        organization: orgAId,
        title: `Pagination Task ${String(i).padStart(2, '0')}`,
        priority: i % 2 === 0 ? 'high' : 'medium',
        isDeleted: false
      });
    }
    await Task.insertMany(batchTasks);

    // 1. Test bounded pagination max limit clamp (request limit=500 -> clamped to 100)
    const clampRes = await apiA('/tasks?limit=500');
    assert(
      clampRes.data.limit === 100,
      'Requesting limit=500 is safely clamped to maximum of 100'
    );

    // 2. Standardized pagination envelope properties
    assert(
      Array.isArray(clampRes.data.items) &&
        clampRes.data.totalItems !== undefined &&
        clampRes.data.page === 1 &&
        clampRes.data.totalPages !== undefined &&
        clampRes.data.hasNextPage !== undefined &&
        clampRes.data.hasPreviousPage !== undefined &&
        Array.isArray(clampRes.data.tasks), // backward compatibility
      'Response provides both modern items/totalItems/hasNextPage and legacy tasks envelope'
    );

    // 3. Test pagination page slice: limit=10, page=2
    const page1Res = await apiA('/tasks?limit=10&page=1&sortBy=createdAt&sortOrder=asc');
    const page2Res = await apiA('/tasks?limit=10&page=2&sortBy=createdAt&sortOrder=asc');

    const p1Ids = page1Res.data.items.map((t) => t._id);
    const p2Ids = page2Res.data.items.map((t) => t._id);
    const overlap = p1Ids.filter((id) => p2Ids.includes(id));

    assert(
      page1Res.data.items.length === 10 &&
        page2Res.data.items.length === 10 &&
        overlap.length === 0,
      'Deterministic pagination produces disjoint sets across page=1 and page=2 without duplicates'
    );

    // 4. Test Sort Whitelist against arbitrary NoSQL injection
    const malformedSortRes = await apiA('/tasks?sortBy=$where&sortOrder=asc');
    assert(
      malformedSortRes.status === 200,
      'Arbitrary sort field safely defaults to whitelist without throwing NoSQL error'
    );

    // -------------------------------------------------------------------------
    // Phase 3: Persistent Categories
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Persistent Categories CRUD & Data Integrity ---');

    // 1. Create a persistent category
    const createCatRes = await apiA('/categories', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Design System',
        color: '#8B5CF6',
        description: 'UI/UX Guidelines'
      })
    });
    assert(
      createCatRes.status === 201 && createCatRes.data.category?.name === 'Design System',
      'POST /api/categories creates a new persistent category'
    );
    const designCatId = createCatRes.data.category?._id;

    // 2. Duplicate category in same tenant should be rejected
    const dupCatRes = await apiA('/categories', {
      method: 'POST',
      body: JSON.stringify({
        name: 'design system', // Case-insensitive collision
        color: '#000000'
      })
    });
    assert(
      dupCatRes.status === 400 || dupCatRes.status === 409,
      'Creating duplicate category name in same organization is rejected (case-insensitive collision check)'
    );

    // 3. Category persists even with 0 tasks referencing it
    const listCatRes = await apiA('/categories');
    const foundDesignCat = listCatRes.data.categories?.find((c) => c.name === 'Design System');
    assert(
      foundDesignCat && foundDesignCat.taskCount === 0,
      'Persistent category exists with 0 tasks and reports live taskCount=0'
    );

    // 4. Create a task referencing this persistent category
    const catTaskRes = await apiA('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Design Button Specs',
        category: 'Design System'
      })
    });
    const catTaskId = catTaskRes.data.task?._id;

    // Verify category taskCount updates to 1
    const listCatResAfter = await apiA('/categories');
    const foundDesignCatAfter = listCatResAfter.data.categories?.find((c) => c.name === 'Design System');
    assert(
      foundDesignCatAfter && foundDesignCatAfter.taskCount === 1,
      'Persistent category reflects updated live task count of active tasks'
    );

    // 5. Deleting category in use is rejected unless handled
    const deleteInUseRes = await apiA(`/categories/${designCatId}`, {
      method: 'DELETE'
    });
    assert(
      deleteInUseRes.status === 400 && deleteInUseRes.data.code === 'CATEGORY_IN_USE',
      'DELETE /api/categories/:id is safely blocked when category has active tasks (CATEGORY_IN_USE)'
    );

    // 6. Update category: renaming cascades to referencing tasks
    const updateCatRes = await apiA(`/categories/${designCatId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Design Ops',
        color: '#EC4899'
      })
    });
    assert(
      updateCatRes.status === 200 && updateCatRes.data.category?.name === 'Design Ops',
      'PUT /api/categories/:id renames category'
    );

    const taskWithRenamedCat = await Task.findById(catTaskId).lean();
    assert(
      taskWithRenamedCat.category === 'Design Ops',
      'Renaming persistent category automatically cascades to all referencing active tasks'
    );

    // 7. Delete with reassignment
    const deleteReassignRes = await apiA(`/categories/${designCatId}`, {
      method: 'DELETE',
      body: JSON.stringify({
        reassignCategory: 'General'
      })
    });
    assert(
      deleteReassignRes.status === 200,
      'DELETE /api/categories/:id succeeds when reassignCategory is provided'
    );

    const taskAfterReassign = await Task.findById(catTaskId).lean();
    assert(
      taskAfterReassign.category === 'General',
      'Tasks using deleted category are safely reassigned to fallback category'
    );

    // 8. Cross-tenant category isolation: Tenant Beta cannot see Tenant Alpha categories
    const betaCatListRes = await apiB('/categories');
    const betaCatNames = (betaCatListRes.data.categories || []).map((c) => c.name);
    assert(
      !betaCatNames.includes('Design Ops'),
      'Tenant Beta cannot see or access Tenant Alpha categories'
    );

    // -------------------------------------------------------------------------
    // Phase 4: Atomic Email OTP Operations
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Atomic OTP Transitions & Invalidation ---');

    const otpEmail = `atomic_otp_${timestamp}@test.com`;

    // 1. Request OTP 1
    const otp1Res = await request('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email: otpEmail })
    });
    assert(
      otp1Res.status === 200,
      'POST /api/auth/otp/request generates initial OTP'
    );

    const otp1Doc = await Otp.findOne({ email: otpEmail, isUsed: false }).lean();
    assert(
      otp1Doc && otp1Doc.isUsed === false,
      'Initial OTP stored in MongoDB as unused'
    );

    // Manually age the OTP lastSentAt to bypass the 60s cooldown for immediate re-request test
    await Otp.updateOne(
      { _id: otp1Doc._id },
      { $set: { lastSentAt: new Date(Date.now() - 70 * 1000) } }
    );

    // 2. Request OTP 2 (should atomically invalidate OTP 1)
    const otp2Res = await request('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email: otpEmail })
    });
    assert(
      otp2Res.status === 200,
      'Subsequent POST /api/auth/otp/request generates replacement OTP'
    );

    const allOtps = await Otp.find({ email: otpEmail }).sort({ createdAt: 1 }).lean();
    assert(
      allOtps.length === 2 && allOtps[0].isUsed === true && allOtps[1].isUsed === false,
      'Prior OTP was atomically invalidated (isUsed=true) when new OTP was created'
    );

    // -------------------------------------------------------------------------
    // Phase 5: Query and Index Optimization
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Query & Index Verification ---');

    // 1. Verify indexes on Task model
    const taskIndexes = await Task.collection.getIndexes();
    const hasOrgIsDeletedStatus = Object.keys(taskIndexes).some((idxName) =>
      idxName.includes('organization') && idxName.includes('isDeleted') && idxName.includes('status')
    );
    const hasTextIndex = Object.keys(taskIndexes).some((idxName) =>
      idxName.includes('text') || taskIndexes[idxName]?.some?.((f) => f[0] === '_fts')
    );

    assert(
      hasOrgIsDeletedStatus,
      'High-performance compound index { organization: 1, isDeleted: 1, status: 1 } exists on Task'
    );

    assert(
      hasTextIndex,
      'Full-text search index on { title: "text", description: "text" } exists on Task'
    );

    // 2. Verify query explain plan uses Index Scan (IXSCAN)
    const explainResult = await Task.find({
      organization: orgAId,
      isDeleted: false,
      status: 'pending'
    })
      .explain('executionStats');

    const winningPlan = explainResult.queryPlanner?.winningPlan;
    const stageStr = JSON.stringify(winningPlan);
    const usesIndexScan = stageStr.includes('IXSCAN');

    assert(
      usesIndexScan,
      'MongoDB query planner confirms index scan (IXSCAN) on multi-tenant soft-deleted queries'
    );

    // -------------------------------------------------------------------------
    // Phase 6: Data Migration and Idempotency
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Migration Script & Idempotency ---');

    const migrationStats1 = await runMigration();
    assert(
      migrationStats1.organizationsChecked > 0,
      'Migration script ran successfully and checked organizations'
    );

    const migrationStats2 = await runMigration();
    assert(
      migrationStats2.categoriesCreated === 0 && migrationStats2.tasksUpdatedWithSoftDelete === 0,
      'Second migration run created 0 categories and modified 0 tasks (100% idempotent)'
    );

  } catch (err) {
    console.error('[Unhandled Exception in Test Execution]', err);
    failed++;
  } finally {
    if (spawnedServer) {
      console.log('\n[Teardown] Shutting down spawned test server...');
      spawnedServer.kill();
    }
  }

  console.log('\n================================================================');
  console.log(`   Verification Finished: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runDataIntegrityTests();
