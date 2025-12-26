import projectLogModel from "../models/projectLogModel.js";

// Create a project log entry
export const createProjectLog = async (projectId, userId, action, description, metadata = {}) => {
  try {
    await projectLogModel.create({
      project: projectId,
      user: userId,
      action,
      description,
      metadata,
    });
  } catch (error) {
    console.error("Error creating project log:", error);
  }
};

// Get logs for a project
export const getProjectLogs = async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const logs = await projectLogModel
      .find({ project: projectId })
      .populate("user", "name email profileImage")
      .sort({ createdAt: -1 })
      .limit(100); // Limit to last 100 logs

    res.status(200).json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error("Error fetching project logs:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

