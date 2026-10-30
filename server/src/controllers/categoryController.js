import Category from '../models/Category.js';
import Task from '../models/Task.js';
import AuditLog from '../models/AuditLog.js';

// @desc    List categories for active organization/workspace with active task counts
// @route   GET /api/categories
// @access  Private
export const getCategories = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { workspaceId, includeArchived = 'false' } = req.query;

    const query = {
      organization: orgId
    };

    if (includeArchived !== 'true') {
      query.isArchived = false;
    }

    const activeWorkspaceId = workspaceId || req.headers['x-workspace-id'];
    if (activeWorkspaceId && activeWorkspaceId.match(/^[0-9a-fA-F]{24}$/)) {
      query.$or = [{ workspace: activeWorkspaceId }, { workspace: null }];
    }

    const categories = await Category.find(query)
      .sort({ position: 1, name: 1 })
      .lean();

    // Compute task counts for each category in parallel
    const taskCountPromises = categories.map((cat) =>
      Task.countDocuments({
        organization: orgId,
        category: cat.name,
        isDeleted: false
      })
    );
    const counts = await Promise.all(taskCountPromises);

    const categoriesWithCounts = categories.map((cat, idx) => ({
      ...cat,
      taskCount: counts[idx] || 0
    }));

    res.status(200).json({
      success: true,
      count: categoriesWithCounts.length,
      categories: categoriesWithCounts
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new persistent category
// @route   POST /api/categories
// @access  Private
export const createCategory = async (req, res, next) => {
  try {
    const { name, color = '#6366f1', description = '', workspaceId } = req.body;
    const orgId = req.organization._id;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Category name cannot exceed 50 characters'
      });
    }

    const normalizedName = trimmedName.toLowerCase();
    const targetWorkspace = workspaceId && workspaceId.match(/^[0-9a-fA-F]{24}$/) ? workspaceId : null;

    // Check duplicate in same tenant & workspace scope
    const existing = await Category.findOne({
      organization: orgId,
      workspace: targetWorkspace,
      normalizedName
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        code: 'CATEGORY_ALREADY_EXISTS',
        message: `A category named '${trimmedName}' already exists in this scope`
      });
    }

    const category = await Category.create({
      name: trimmedName,
      normalizedName,
      organization: orgId,
      workspace: targetWorkspace,
      createdBy: req.user._id,
      color,
      description: description.trim()
    });

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'category.created',
      targetType: 'Category',
      targetId: category._id.toString(),
      details: { name: category.name }
    });

    res.status(201).json({
      success: true,
      message: `Category '${category.name}' created successfully`,
      category: {
        ...category.toJSON(),
        taskCount: 0
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update / rename a persistent category
// @route   PUT /api/categories/:id
// @access  Private
export const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, color, description, isArchived } = req.body;
    const orgId = req.organization._id;

    const category = await Category.findOne({
      _id: id,
      organization: orgId
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const previousName = category.name;

    if (name && name.trim()) {
      const trimmedName = name.trim();
      const normalizedName = trimmedName.toLowerCase();

      if (normalizedName !== category.normalizedName) {
        const conflict = await Category.findOne({
          _id: { $ne: category._id },
          organization: orgId,
          workspace: category.workspace,
          normalizedName
        });

        if (conflict) {
          return res.status(400).json({
            success: false,
            code: 'CATEGORY_ALREADY_EXISTS',
            message: `A category named '${trimmedName}' already exists in this scope`
          });
        }

        category.name = trimmedName;
        category.normalizedName = normalizedName;

        // Cascade rename across active tasks in this organization
        await Task.updateMany(
          { organization: orgId, category: previousName },
          { $set: { category: trimmedName } }
        );
      }
    }

    if (color && /^#([0-9a-fA-F]{3}){1,2}$/.test(color)) {
      category.color = color;
    }

    if (typeof description === 'string') {
      category.description = description.trim();
    }

    if (typeof isArchived === 'boolean') {
      category.isArchived = isArchived;
    }

    await category.save();

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      category
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a category with safety checks and optional task reassignment
// @route   DELETE /api/categories/:id
// @access  Private
export const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const reassignTo = body.reassignTo || body.reassignCategory;
    const orgId = req.organization._id;

    const category = await Category.findOne({
      _id: id,
      organization: orgId
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const referencingTasksCount = await Task.countDocuments({
      organization: orgId,
      category: category.name,
      isDeleted: false
    });

    if (referencingTasksCount > 0) {
      if (reassignTo && typeof reassignTo === 'string' && reassignTo.trim()) {
        const targetCategoryName = reassignTo.trim();

        // Reassign all active tasks referencing this category to target
        await Task.updateMany(
          { organization: orgId, category: category.name, isDeleted: false },
          { $set: { category: targetCategoryName } }
        );
      } else {
        return res.status(400).json({
          success: false,
          code: 'CATEGORY_IN_USE',
          message: `Cannot delete category '${category.name}' because ${referencingTasksCount} active task(s) reference it. Please reassign or delete these tasks first.`,
          referencingTasksCount
        });
      }
    }

    await Category.findByIdAndDelete(category._id);

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'category.deleted',
      targetType: 'Category',
      targetId: category._id.toString(),
      details: { name: category.name, reassignedTo: reassignTo || null }
    });

    res.status(200).json({
      success: true,
      message: `Category '${category.name}' deleted successfully`
    });
  } catch (error) {
    next(error);
  }
};
