import Workspace from '../models/Workspace.js';
import AuditLog from '../models/AuditLog.js';
import Task from '../models/Task.js';
import { checkQuota } from '../services/entitlementService.js';

// @desc    List all workspaces in active organization
// @route   GET /api/workspaces
// @access  Private
export const getWorkspaces = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const includeArchived = req.query.includeArchived === 'true';

    const filter = { organization: orgId };
    if (!includeArchived) {
      filter.isArchived = false;
    }

    const workspaces = await Workspace.find(filter)
      .sort({ isDefault: -1, createdAt: 1 })
      .populate('createdBy', 'name email avatar');

    res.status(200).json({
      success: true,
      count: workspaces.length,
      workspaces
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new workspace within organization
// @route   POST /api/workspaces
// @access  Private
export const createWorkspace = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Workspace name is required' });
    }

    // Enforce workspace quota
    const quotaCheck = await checkQuota(orgId, 'workspaces');
    if (!quotaCheck.allowed) {
      return res.status(403).json({
        success: false,
        code: 'QUOTA_EXCEEDED',
        metric: 'workspaces',
        currentUsage: quotaCheck.currentUsage,
        limit: quotaCheck.limit,
        message: `Workspace limit reached: Your ${quotaCheck.planName} plan allows up to ${quotaCheck.limit} workspace(s). Upgrade to Pro or Team to create more workspaces.`
      });
    }

    const cleanName = name.trim();
    const existing = await Workspace.findOne({ organization: orgId, name: cleanName });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A workspace with that name already exists in this organization'
      });
    }

    const workspace = await Workspace.create({
      organization: orgId,
      name: cleanName,
      description: description ? description.trim() : '',
      createdBy: req.user._id,
      isDefault: false
    });

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'workspace.created',
      targetType: 'Workspace',
      targetId: workspace._id.toString(),
      details: { name: workspace.name },
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Workspace created successfully',
      workspace
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get workspace details by ID
// @route   GET /api/workspaces/:id
// @access  Private
export const getWorkspaceById = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const workspace = await Workspace.findOne({
      _id: req.params.id,
      organization: orgId
    }).populate('createdBy', 'name email avatar');

    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found in this organization' });
    }

    const taskCount = await Task.countDocuments({
      organization: orgId,
      workspace: workspace._id,
      isDeleted: false
    });

    res.status(200).json({
      success: true,
      workspace: {
        ...workspace.toJSON(),
        taskCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update workspace settings
// @route   PATCH /api/workspaces/:id
// @access  Private
export const updateWorkspace = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { name, description } = req.body;

    const workspace = await Workspace.findOne({
      _id: req.params.id,
      organization: orgId
    });

    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found in this organization' });
    }

    if (name && name.trim()) {
      const cleanName = name.trim();
      const duplicate = await Workspace.findOne({
        organization: orgId,
        name: cleanName,
        _id: { $ne: workspace._id }
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: 'Another workspace with that name already exists'
        });
      }
      workspace.name = cleanName;
    }

    if (description !== undefined) {
      workspace.description = description.trim();
    }

    await workspace.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'workspace.updated',
      targetType: 'Workspace',
      targetId: workspace._id.toString(),
      details: { name: workspace.name },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Workspace updated successfully',
      workspace
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Archive or delete a workspace
// @route   DELETE /api/workspaces/:id
// @access  Private
export const deleteWorkspace = async (req, res, next) => {
  try {
    const orgId = req.organization._id;

    const workspace = await Workspace.findOne({
      _id: req.params.id,
      organization: orgId
    });

    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found in this organization' });
    }

    if (workspace.isDefault) {
      return res.status(400).json({
        success: false,
        message: 'The default workspace cannot be archived or deleted'
      });
    }

    workspace.isArchived = true;
    await workspace.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'workspace.archived',
      targetType: 'Workspace',
      targetId: workspace._id.toString(),
      details: { name: workspace.name },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Workspace archived successfully'
    });
  } catch (error) {
    next(error);
  }
};
