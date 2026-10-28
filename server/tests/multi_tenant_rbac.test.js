// Comprehensive Multi-Tenant RBAC & Cross-Tenant Security Verification Suite
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

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

async function runRbacTests() {
  console.log('================================================================');
  console.log('   TaskFlow Multi-Tenant RBAC & Isolation Security Suite        ');
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

  try {
    const alreadyRunning = await isServerRunning();
    if (!alreadyRunning) {
      console.log('[Test Runner] Launching backend server...');
      spawnedServer = spawn('node', ['src/server.js'], {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'pipe'
      });

      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isServerRunning()) break;
      }
    }

    const uid = Math.floor(Math.random() * 1000000);

    // -------------------------------------------------------------
    // 1. Provision Org 1 Owner
    // -------------------------------------------------------------
    const ownerEmail = `owner${uid}@enterprise.com`;
    const regOwner = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Eve Owner', email: ownerEmail, password: 'Password123!' })
    });
    assert(regOwner.status === 201 && regOwner.data.organization, '1. Owner registered with tenant context');
    const ownerToken = regOwner.data.token;
    const org1Id = regOwner.data.organization._id;

    // Upgrade Org 1 to Business plan to allow enterprise team provisioning
    await request(`/organizations/${org1Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ownerToken}`, 'x-organization-id': org1Id },
      body: JSON.stringify({ plan: 'business' })
    });

    // -------------------------------------------------------------
    // 2. Workspaces: Create custom workspace in Org 1
    // -------------------------------------------------------------
    const wsRes = await request('/workspaces', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'x-organization-id': org1Id },
      body: JSON.stringify({ name: `Engineering-${uid}`, description: 'Core product engineering' })
    });
    assert(wsRes.status === 201 && wsRes.data.workspace.name === `Engineering-${uid}`, '2. Custom workspace created');
    const wsId = wsRes.data.workspace._id;

    // -------------------------------------------------------------
    // 3. Provision Team Members with Distinct Roles
    // -------------------------------------------------------------
    async function createMemberWithRole(name, role) {
      const email = `${role}${uid}@enterprise.com`;
      const reg = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password: 'Password123!' })
      });
      const userToken = reg.data.token;
      const userId = reg.data.user.id;

      // Owner invites user with specified role
      const inviteRes = await request(`/organizations/${org1Id}/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'x-organization-id': org1Id },
        body: JSON.stringify({ email, role })
      });
      const inviteToken = inviteRes.data.invitation.token;

      // User accepts invitation
      await request(`/organizations/invitations/${inviteToken}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` }
      });

      return { email, token: userToken, id: userId, role };
    }

    const adminUser = await createMemberWithRole('Alice Admin', 'admin');
    const managerUser = await createMemberWithRole('Bob Manager', 'manager');
    const memberUser = await createMemberWithRole('Charlie Member', 'member');
    const guestUser = await createMemberWithRole('Grace Guest', 'guest');
    const billingUser = await createMemberWithRole('Bill Billing', 'billing_admin');

    assert(adminUser.id && managerUser.id && memberUser.id && guestUser.id && billingUser.id, '3. All 5 tenant roles provisioned');

    // -------------------------------------------------------------
    // 4. RBAC: Member Cannot Invite or Update Roles (403 Forbidden)
    // -------------------------------------------------------------
    const memberInviteAttempt = await request(`/organizations/${org1Id}/invitations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberUser.token}`, 'x-organization-id': org1Id },
      body: JSON.stringify({ email: `intruder${uid}@hack.com`, role: 'member' })
    });
    assert(
      memberInviteAttempt.status === 403 && memberInviteAttempt.data.code === 'PERMISSION_DENIED',
      '4. Member role cannot invite users (403 PERMISSION_DENIED)'
    );

    // -------------------------------------------------------------
    // 5. Teams: Manager can create team and add members
    // -------------------------------------------------------------
    const teamRes = await request('/teams', {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerUser.token}`, 'x-organization-id': org1Id },
      body: JSON.stringify({
        name: `DevOps Squad-${uid}`,
        description: 'Infrastructure and automation',
        memberIds: [managerUser.id, memberUser.id]
      })
    });
    assert(teamRes.status === 201 && teamRes.data.team.name === `DevOps Squad-${uid}`, '5. Manager created team in organization');
    const teamId = teamRes.data.team._id;

    // -------------------------------------------------------------
    // 6. Cross-Tenant Task Assignment Prevention
    // -------------------------------------------------------------
    // Register User 7 in external organization (Org 2)
    const outsiderEmail = `outsider${uid}@othercorp.org`;
    const regOutsider = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Oliver Outsider', email: outsiderEmail, password: 'Password123!' })
    });
    const outsiderToken = regOutsider.data.token;
    const outsiderId = regOutsider.data.user.id;
    const org2Id = regOutsider.data.organization._id;

    // Attempt to assign Org 1 task to Org 2 user -> Must fail with 400 INVALID_ASSIGNEE
    const invalidAssign = await request('/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerUser.token}`, 'x-organization-id': org1Id },
      body: JSON.stringify({
        title: 'Task Assigned to Outsider',
        assignedTo: outsiderId
      })
    });
    assert(
      invalidAssign.status === 400 && invalidAssign.data.code === 'INVALID_ASSIGNEE',
      '6. Cross-tenant task assignment rejected (assigned user not in tenant)'
    );

    // -------------------------------------------------------------
    // 7. Collaborative Task: Valid Assignment & Team Association
    // -------------------------------------------------------------
    const validTaskRes = await request('/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerUser.token}`, 'x-organization-id': org1Id },
      body: JSON.stringify({
        title: 'Q4 Cloud Migration Plan',
        workspaceId: wsId,
        teamId,
        assignedTo: memberUser.id,
        isPrivate: false
      })
    });
    assert(
      validTaskRes.status === 201 && validTaskRes.data.task.assignedTo._id === memberUser.id,
      '7. Task created with valid in-tenant assignee, workspace, and team'
    );
    const org1SharedTaskId = validTaskRes.data.task._id;

    // -------------------------------------------------------------
    // 8. Comments: Member can add comment to task
    // -------------------------------------------------------------
    const commentRes = await request(`/tasks/${org1SharedTaskId}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberUser.token}`, 'x-organization-id': org1Id },
      body: JSON.stringify({ content: 'I have started analyzing the infrastructure requirements.' })
    });
    assert(
      commentRes.status === 201 && commentRes.data.comments.length >= 1,
      '8. Collaborative task comment added by assigned member'
    );

    // -------------------------------------------------------------
    // 9. Billing Admin Restriction: Cannot view private tasks
    // -------------------------------------------------------------
    // Create private executive task
    const privateTaskRes = await request('/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'x-organization-id': org1Id },
      body: JSON.stringify({
        title: 'Executive M&A Confidential Strategy',
        isPrivate: true
      })
    });
    const privateTaskId = privateTaskRes.data.task._id;

    const billingTaskGet = await request(`/tasks/${privateTaskId}`, {
      headers: { Authorization: `Bearer ${billingUser.token}`, 'x-organization-id': org1Id }
    });
    assert(
      billingTaskGet.status === 403 && billingTaskGet.data.code === 'BILLING_ADMIN_RESTRICTION',
      '9. Billing Admin denied access to private tasks (403 BILLING_ADMIN_RESTRICTION)'
    );

    // -------------------------------------------------------------
    // 10. Guest Restriction: Can only view explicitly assigned/shared tasks
    // -------------------------------------------------------------
    const guestTaskGetUnshared = await request(`/tasks/${org1SharedTaskId}`, {
      headers: { Authorization: `Bearer ${guestUser.token}`, 'x-organization-id': org1Id }
    });
    assert(
      guestTaskGetUnshared.status === 404,
      '10a. Guest denied access to unassigned/unshared tasks (returns 404)'
    );

    // Assign a new task specifically to Guest
    const guestTaskCreate = await request('/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerUser.token}`, 'x-organization-id': org1Id },
      body: JSON.stringify({
        title: 'Vendor Security Questionnaire',
        assignedTo: guestUser.id
      })
    });
    const guestTaskId = guestTaskCreate.data.task._id;

    const guestTaskGetShared = await request(`/tasks/${guestTaskId}`, {
      headers: { Authorization: `Bearer ${guestUser.token}`, 'x-organization-id': org1Id }
    });
    assert(
      guestTaskGetShared.status === 200 && guestTaskGetShared.data.task._id === guestTaskId,
      '10b. Guest successfully views explicitly assigned task'
    );

    // -------------------------------------------------------------
    // 11. Strict Cross-Tenant IDOR Protection
    // -------------------------------------------------------------
    // Outsider (Org 2) attempts to read, mutate, or delete Org 1 task
    const idorRead = await request(`/tasks/${org1SharedTaskId}`, {
      headers: { Authorization: `Bearer ${outsiderToken}`, 'x-organization-id': org2Id }
    });
    const idorUpdate = await request(`/tasks/${org1SharedTaskId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${outsiderToken}`, 'x-organization-id': org2Id },
      body: JSON.stringify({ title: 'Hacked by Outsider' })
    });
    const idorComment = await request(`/tasks/${org1SharedTaskId}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${outsiderToken}`, 'x-organization-id': org2Id },
      body: JSON.stringify({ content: 'Malicious comment' })
    });
    assert(
      idorRead.status === 404 && idorUpdate.status === 404 && idorComment.status === 404,
      '11. Cross-tenant IDOR protection verified: external tenant requests fail closed with 404'
    );

    // -------------------------------------------------------------
    // 12. Final Owner Protection
    // -------------------------------------------------------------
    // Admin attempts to remove or demote the owner
    const demoteOwner = await request(`/organizations/${org1Id}/members/${regOwner.data.user.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminUser.token}`, 'x-organization-id': org1Id },
      body: JSON.stringify({ role: 'member' })
    });
    const removeOwner = await request(`/organizations/${org1Id}/members/${regOwner.data.user.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminUser.token}`, 'x-organization-id': org1Id }
    });
    assert(
      demoteOwner.status === 400 &&
      demoteOwner.data.code === 'FINAL_OWNER_PROTECTION' &&
      removeOwner.status === 400 &&
      removeOwner.data.code === 'FINAL_OWNER_PROTECTION',
      '12. Final owner protection: demoting or removing owner is blocked'
    );

    // -------------------------------------------------------------
    // 13. Explicit Ownership Transfer
    // -------------------------------------------------------------
    const transferRes = await request(`/organizations/${org1Id}/transfer-ownership`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'x-organization-id': org1Id },
      body: JSON.stringify({ targetUserId: adminUser.id })
    });
    assert(
      transferRes.status === 200 && transferRes.data.newOwnerId === adminUser.id,
      '13. Ownership transferred successfully: Admin promoted to Owner'
    );

    // -------------------------------------------------------------
    // 14. Single-Use Invitation & Replay Prevention
    // -------------------------------------------------------------
    const newInvite = await request(`/organizations/${org1Id}/invitations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminUser.token}`, 'x-organization-id': org1Id },
      body: JSON.stringify({ email: `replayer${uid}@test.com`, role: 'member' })
    });
    const replayToken = newInvite.data.invitation.token;

    // First acceptance succeeds
    const accept1 = await request(`/organizations/invitations/${replayToken}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${outsiderToken}` }
    });
    // Second acceptance with same token must fail
    const accept2 = await request(`/organizations/invitations/${replayToken}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${outsiderToken}` }
    });
    assert(
      accept1.status === 200 && accept2.status === 400,
      '14. Invitation token single-use enforced: replay attempt rejected with 400'
    );

    // -------------------------------------------------------------
    // 15. Audit Logs Scoped to Tenant
    // -------------------------------------------------------------
    const auditRes = await request(`/organizations/${org1Id}/audit-logs`, {
      headers: { Authorization: `Bearer ${adminUser.token}`, 'x-organization-id': org1Id }
    });
    assert(
      auditRes.status === 200 && auditRes.data.total >= 5 && Array.isArray(auditRes.data.logs),
      '15. Tenant audit logs queryable with pagination and actor details'
    );

    console.log('\n================================================================');
    console.log(` RBAC & Security Test Suite Complete: ${passed} passed, ${failed} failed.`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('[RBAC Test Error]', err);
    process.exitCode = 1;
  } finally {
    if (spawnedServer) {
      try {
        spawnedServer.kill();
      } catch (e) {
        // ignore
      }
    }
  }
}

runRbacTests();
