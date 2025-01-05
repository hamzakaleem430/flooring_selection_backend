import projectModel from "../models/projectModel.js";
import dotenv from "dotenv";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../middleware/uploadFiles.js";
import userModel from "../models/userModel.js";
dotenv.config();

// Create Project
export const createProject = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      budget,
      totalPrice,
      dealer_quoted_price,
      price_difference,
      variance_budget,
      quality,
      total_area,
      sum_area,
    } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No thumbnail image provided.",
      });
    }
    const thumbnails = req.files.map((file) => file.location);

    // Verification
    if (!name || !budget || !totalPrice || !price_difference || !quality) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all fields.",
      });
    }
    if (budget < 0) {
      return res.status(400).json({
        success: false,
        message: "Budget must be greater than 0.",
      });
    }
    if (totalPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Total Price must be greater than 0.",
      });
    }

    const project = await projectModel.create({
      user: userId,
      name,
      budget,
      totalPrice,
      dealer_quoted_price,
      price_difference,
      variance_budget,
      quality,
      total_area,
      sum_area,
      thumbnails,
      connect_users: [userId],
    });

    res.status(200).send({
      success: true,
      message: "Project created successfully!",
      project,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error create project, please try again!",
      error: error,
    });
  }
};

// Update Project
export const updateProject = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = req.params.id;
    const {
      name,
      budget,
      totalPrice,
      dealer_quoted_price,
      price_difference,
      variance_budget,
      quality,
      total_area,
      sum_area,
      deletedImages,
    } = req.body;

    let deleteImages = [];
    if (deletedImages) {
      try {
        deleteImages = JSON.parse(deletedImages);
        if (!Array.isArray(deleteImages)) {
          return res.status(400).json({
            success: false,
            message: "Invalid format for deletedImages. Must be an array.",
          });
        }
      } catch (err) {
        deleteImages = deletedImages;
      }
    }

    const newThumbnails = req.files && req.files.map((file) => file.location);

    // Verification
    const project = await projectModel.findById(projectId);
    if (!project) {
      return res.status(400).json({
        success: false,
        message: "Project not found!",
      });
    }

    if (project.user.toString() !== userId) {
      return res.status(400).json({
        success: false,
        message: "You are not authorized to update this project.",
      });
    }

    // Handle deletion of old thumbnails
    if (deleteImages && deleteImages.length > 0) {
      const deleteKeys = deleteImages?.map((url) => url.split("/").pop());

      try {
        await Promise.all(
          deleteKeys.map((key) =>
            s3.send(
              new DeleteObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: key,
              })
            )
          )
        );
        console.log("Selected old thumbnails deleted from S3 successfully");
      } catch (error) {
        console.error("Error deleting old thumbnails from S3:", error);
        return res.status(500).json({
          success: false,
          message:
            "Error occurred while deleting thumbnails. Please try again.",
          error: error.message,
        });
      }

      // Remove deleted images from database
      project.thumbnails = project.thumbnails.filter(
        (url) => !deleteImages.includes(url)
      );
    }

    const updatedThumbnails = [
      ...project.thumbnails,
      ...(newThumbnails ? newThumbnails : []),
    ];

    const updatedProject = await projectModel.findByIdAndUpdate(
      { _id: projectId },
      {
        user: userId,
        name: name || project.name,
        budget: budget || project.budget,
        totalPrice: totalPrice || project.totalPrice,
        dealer_quoted_price: dealer_quoted_price || project.dealer_quoted_price,
        price_difference: price_difference || project.price_difference,
        variance_budget: variance_budget || project.variance_budget,
        quality: quality || project.quality,
        total_area: total_area || project.total_area,
        sum_area: sum_area || project.sum_area,
        thumbnails: updatedThumbnails,
      },
      { new: true }
    );

    res.status(200).send({
      success: true,
      message: "Project updated successfully!",
      project: updatedProject,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error update project, please try again!",
      error: error,
    });
  }
};

// Get All User's Projects
export const getAllUserProjects = async (req, res) => {
  try {
    const userId = req.user.id;

    const projects = await projectModel
      .find({ connect_users: { $in: [userId] } })
      .populate("user", "name email profileImage category experience")
      .populate("connect_users", "name email profileImage category experience");

    res.status(200).send({
      success: true,
      message: "All projects list!",
      projects: projects,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to get all projects. Please try again.",
      error: error.message,
    });
  }
};

// Get Single Project
export const getProjectDetail = async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await projectModel
      .findById(projectId)
      .populate("user", "name email profileImage category experience")
      .populate("connect_users", "name email profileImage category experience");

    res.status(200).send({
      success: true,
      message: "Project Detail",
      project: project,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to get project detail. Please try again.",
      error: error.message,
    });
  }
};

// Get All Admin's Projects
export const getAllAdminProjects = async (req, res) => {
  try {
    const projects = await projectModel
      .find({})
      .populate("user", "name email profileImage category experience")
      .populate("connect_users", "name email profileImage category experience");

    res.status(200).send({
      success: true,
      message: "All projects list!",
      projects: projects,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to get all projects. Please try again.",
      error: error.message,
    });
  }
};

// Delete Project
export const deleteProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    const project = await projectModel.findById(projectId);

    if (!project) {
      return res.status(400).json({
        success: false,
        message: "Project not found!",
      });
    }

    const user = await userModel.findById(userId);

    if (project.user.toString() !== req.user.id || user.role !== "admin") {
      return res.status(400).json({
        success: false,
        message: "You are not authorized to delete this project.",
      });
    }

    await projectModel.deleteOne({ _id: projectId });

    res.status(200).json({
      success: true,
      message: "Project deleted successfully!",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to delete project. Please try again.",
      error: error.message,
    });
  }
};

// Connect User to Project
export const connectUserToProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;

    const project = await projectModel.findById(projectId);

    if (!project) {
      return res.status(400).json({
        success: false,
        message: "Project not found!",
      });
    }

    if (project.connect_users.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "You are already connected to this project.",
      });
    }

    project.connect_users.push(userId);
    await project.save();

    res.status(200).json({
      success: true,
      message: "Connected to project successfully!",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to connect to project. Please try again.",
      error: error.message,
    });
  }
};

// Disconnect User from Project
export const disconnectUserFromProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;

    const project = await projectModel.findById(projectId);

    if (!project) {
      return res.status(400).json({
        success: false,
        message: "Project not found!",
      });
    }

    if (!project.connect_users.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "You are not connected to this project.",
      });
    }

    project.connect_users = project.connect_users.filter((id) => id !== userId);
    await project.save();

    res.status(200).json({
      success: true,
      message: "Disconnected from project successfully!",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to disconnect from project. Please try again.",
      error: error.message,
    });
  }
};
