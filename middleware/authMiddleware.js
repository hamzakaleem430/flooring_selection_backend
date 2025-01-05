import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";

export const isAuthenticated = async (req, res, next) => {
  const token = req.headers.authorization;

  // console.log("access_token", token);

  if (!token) {
    return res.status(401).send({
      success: false,
      message: "JWT Token must be provided!",
    });
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  if (!decoded) {
    return res.status(401).send({
      success: false,
      message: "Access token is not valid!",
    });
  }

  const user = await userModel.findById({ _id: decoded.id });

  if (!user) {
    return res.status(401).send({
      success: false,
      message: "User not found!",
    });
  }

  req.user = user;
  next();
};

// is Admin
export const isAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized Access! User not authenticated.",
    });
  }

  try {
    const user = await userModel.findById(req.user._id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized Access! User not found.",
      });
    }
    if (user.role !== "admin") {
      return res.status(401).send({
        success: false,
        message: "Forbidden! User does not have admin privileges.!",
      });
    } else {
      next();
    }
  } catch (error) {
    console.log(error);
    return res.status(401).send({
      success: false,
      message: "Invalid JWT Token",
    });
  }
};
