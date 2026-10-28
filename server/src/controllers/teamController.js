import Team from '../models/Team.js';
import Membership from '../models/Membership.js';
import AuditLog from '../models/AuditLog.js';
import { getEffectiveEntitlements } from '../services/entitlementService.js';

// @desc    List all teams in active organization
// @route   GET /api/teams
// @access  Private
export const getTeams = async (req, res, next) => {
  try {
    const orgId = req.organization._id;

    const teams = await Team.find({ organization: orgId })
      .populate('leader', 'name email avatar')
      .populate('members', 'name email avatar')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: teams.length,
      teams
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new team in active organization
// @route   POST /api/teams
// @access  Private (Owner / Admin / Manager)
export const createTeam = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { name, description, leaderId, memberIds = [] } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Team name is required' });
    }

    // Feature Gate: Team collaboration requires Team or Enterprise plan
    const entitlements = await getEffectiveEntitlements(orgId);
    if (!entitlements.features['teams.collaboration']) {
      return res.status(403).json({
        success: false,
        code: 'FEATURE_GATED',
        feature: 'teams.collaboration',
        currentPlan: entitlements.plan.name,
        message: 'Team squads and cross-functional grouping require the Team or Enterprise plan. Upgrade to unlock squads.'
      });
    }

    const cleanName = name.trim();
    const existing = await Team.findOne({ organization: orgId, name: cleanName });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A team with that name already exists in this organization'
      });
    }

    // Verify leader belongs to organization if provided
    let leader = null;
    if (leaderId) {
      const leaderMembership = await Membership.findOne({ organization: orgId, user: leaderId });
      if (!leaderMembership) {
        return res.status(400).json({
          success: false,
          message: 'Selected team leader is not an active member of this organization'
        });
      }
      leader = leaderId;
    }

    // Verify all initial members belong to organization
    let validMembers = [];
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      const memberships = await Membership.find({
        organization: orgId,
        user: { $in: memberIds }
      });
      validMembers = memberships.map((m) => m.user);
    }

    // Add leader to members if not present
    if (leader && !validMembers.some((m) => m.toString() === leader.toString())) {
      validMembers.push(leader);
    }

    const team = await Team.create({
      organization: orgId,
      name: cleanName,
      description: description ? description.trim() : '',
      leader,
      members: validMembers
    });

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'team.created',
      targetType: 'Team',
      targetId: team._id.toString(),
      details: { name: team.name, membersCount: validMembers.length },
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      team
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get team details by ID
// @route   GET /api/teams/:id
// @access  Private
export const getTeamById = async (req, res, next) => {
  try {
    const orgId = req.organization._id;

    const team = await Team.findOne({
      _id: req.params.id,
      organization: orgId
    })
      .populate('leader', 'name email avatar')
      .populate('members', 'name email avatar');

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found in this organization' });
    }

    res.status(200).json({
      success: true,
      team
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update team details
// @route   PATCH /api/teams/:id
// @access  Private (Owner / Admin / Manager)
export const updateTeam = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { name, description, leaderId } = req.body;

    const team = await Team.findOne({
      _id: req.params.id,
      organization: orgId
    });

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found in this organization' });
    }

    if (name && name.trim()) {
      const cleanName = name.trim();
      const duplicate = await Team.findOne({
        organization: orgId,
        name: cleanName,
        _id: { $ne: team._id }
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: 'Another team with that name already exists'
        });
      }
      team.name = cleanName;
    }

    if (description !== undefined) {
      team.description = description.trim();
    }

    if (leaderId !== undefined) {
      if (leaderId) {
        const leaderMembership = await Membership.findOne({ organization: orgId, user: leaderId });
        if (!leaderMembership) {
          return res.status(400).json({
            success: false,
            message: 'Selected team leader is not an active member of this organization'
          });
        }
        team.leader = leaderId;
      } else {
        team.leader = null;
      }
    }

    await team.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'team.updated',
      targetType: 'Team',
      targetId: team._id.toString(),
      details: { name: team.name },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Team updated successfully',
      team
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a team
// @route   DELETE /api/teams/:id
// @access  Private (Owner / Admin / Manager)
export const deleteTeam = async (req, res, next) => {
  try {
    const orgId = req.organization._id;

    const team = await Team.findOneAndDelete({
      _id: req.params.id,
      organization: orgId
    });

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found in this organization' });
    }

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'team.deleted',
      targetType: 'Team',
      targetId: team._id.toString(),
      details: { name: team.name },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Team deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add member to a team
// @route   POST /api/teams/:id/members
// @access  Private (Owner / Admin / Manager)
export const addTeamMember = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const team = await Team.findOne({ _id: req.params.id, organization: orgId });
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found in this organization' });
    }

    // Verify target user is in the organization
    const membership = await Membership.findOne({ organization: orgId, user: userId });
    if (!membership) {
      return res.status(400).json({
        success: false,
        message: 'Cannot add user to team: user is not an active member of this organization'
      });
    }

    if (!team.members.some((m) => m.toString() === userId.toString())) {
      team.members.push(userId);
      await team.save();
    }

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'team.member_added',
      targetType: 'Team',
      targetId: team._id.toString(),
      details: { userId },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Member added to team successfully',
      team
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove member from a team
// @route   DELETE /api/teams/:id/members/:userId
// @access  Private (Owner / Admin / Manager)
export const removeTeamMember = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { id: teamId, userId } = req.params;

    const team = await Team.findOne({ _id: teamId, organization: orgId });
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found in this organization' });
    }

    team.members = team.members.filter((m) => m.toString() !== userId.toString());
    if (team.leader && team.leader.toString() === userId.toString()) {
      team.leader = null;
    }
    await team.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'team.member_removed',
      targetType: 'Team',
      targetId: team._id.toString(),
      details: { userId },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Member removed from team successfully',
      team
    });
  } catch (error) {
    next(error);
  }
};
