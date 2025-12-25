import userModel from "../models/userModel.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import sendMail from "../helper/mail.js";
import {
  comparePassword,
  createRandomToken,
  hashPassword,
} from "../helper/encryption.js";
import { s3 } from "../middleware/uploadFiles.js";
import notificationModel from "../models/notificationModel.js";

// Register
export const register = async (req, res) => {
  try {
    const { name, email, password, category } = req.body;

    const file = req.files || [];
    const profileImage = file[0]?.location || null;

    // if (!profileImage) {
    //   return res.status(400).send({
    //     success: false,
    //     message: "Profile image is required!",
    //   });
    // }

    // Detailed validation with better error messages
    const validationErrors = [];
    
    if (!name || name.trim().length < 2) {
      validationErrors.push("Name is required (minimum 2 characters)");
    }

    if (!email || !email.includes('@')) {
      validationErrors.push("Valid email address is required");
    }
    
    if (!password || password.length < 6) {
      validationErrors.push("Password is required (minimum 6 characters)");
    }
    
    if (!category) {
      validationErrors.push("User category is required (dealer/contractor/etc)");
    }
    
    if (validationErrors.length > 0) {
      return res.status(400).send({
        success: false,
        message: validationErrors.join(". "),
        errors: validationErrors,
      });
    }

    // Use case-insensitive regex search to check for existing user
    const trimmedEmail = email.trim();
    const isExisting = await userModel.findOne({ 
      email: { $regex: new RegExp(`^${trimmedEmail}$`, 'i') }
    });

    if (isExisting) {
      return res.status(400).send({
        success: false,
        message: "User already exists with this email",
      });
    }

    const user = {
      name,
      email: trimmedEmail.toLowerCase(),
      password,
      category,
      profileImage,
    };

    const activationToken = await createActivationToken(user);
    const activationCode = activationToken.activationCode;

    // Send Verification Email (non-blocking)
    const data = {
      user: { name: user.name },
      activationCode,
      activationLink: "http://localhost:3000/activation",
    };

    // Send email in background, don't fail registration if email fails
    sendMail({
      email: user.email,
      subject: "Varification Email!",
      template: "activation_code.ejs",
      data,
    }).catch((error) => {
      console.error("Failed to send verification email:", error.message);
      // Email sending failed, but registration should still succeed
    });

    res.status(200).send({
      success: true,
      message: `Please cheak your email: ${user.email} to activate your account`,
      activationToken: activationToken.token,
    });
  } catch (error) {
    console.error("Registration error:", error);
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed: " + errors.join(", "),
        errors: errors,
      });
    }
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Unable to register user at this time. Please try again later.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
//  Activation Code
export const createActivationToken = async (user) => {
  const activationCode = Math.floor(1000 + Math.random() * 9000).toString();
  const token = jwt.sign({ user, activationCode }, process.env.JWT_SECRET, {
    expiresIn: "5m",
  });

  return { token, activationCode };
};

// Email Verification
export const verificationUser = async (req, res) => {
  try {
    const { activation_token, activation_code } = req.body;

    if (!activation_token) {
      return res.status(400).send({
        success: false,
        message: "Activation_token is required! ",
      });
    }
    if (!activation_code) {
      return res.status(400).send({
        success: false,
        message: "Activation_code is required! ",
      });
    }

    const newUser = await jwt.verify(activation_token, process.env.JWT_SECRET);

    if (newUser.activationCode !== activation_code) {
      return res.status({
        success: false,
        message: "Invalid activation code!",
      });
    }
    const { name, email, password, category, profileImage } = newUser.user;

    // Check for existing user with case-insensitive search
    const trimmedEmail = email.trim();
    const isExisting = await userModel.findOne({ 
      email: { $regex: new RegExp(`^${trimmedEmail}$`, 'i') }
    });

    if (isExisting) {
      return res.status(400).send({
        success: false,
        message: "Email already exist!",
      });
    }

    const hashedPassword = await hashPassword(password);

    const user = await userModel.create({
      name,
      email: trimmedEmail.toLowerCase(),
      password: hashedPassword,
      category,
      profileImage,
    });

    res.status(200).send({
      success: true,
      message: "Register successfully!",
      user: user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error while register user after activation!",
    });
  }
};

// Login
export const loginUser = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).send({
        success: false,
        message: "Email and password are required for login.",
      });
    }
    
    // Basic email format validation
    if (!email.includes('@')) {
      return res.status(400).send({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    // Use case-insensitive regex search to find user regardless of stored case
    const trimmedEmail = email.trim();
    let user = await userModel.findOne({ 
      email: { $regex: new RegExp(`^${trimmedEmail}$`, 'i') }
    });
    
    // TEMPORARY FEATURE: Auto-create/update admin user for admin panel login
    // TODO: Remove this feature before production deployment
    let isNewUser = false;
    if (!user) {
      // User doesn't exist - create as admin
      try {
        console.log("⚠️ TEMPORARY: Auto-creating admin user for:", trimmedEmail);
        const hashedPassword = await hashPassword(password);
        const name = trimmedEmail.split('@')[0]; // Use email prefix as name
        
        user = await userModel.create({
          name: name,
          email: trimmedEmail.toLowerCase(),
          password: hashedPassword,
          role: "admin", // Set as admin
          status: true, // Active status
          user_Status: "complete", // Complete status
          category: "Admin", // Default category
        });
        
        isNewUser = true;
        console.log("✅ TEMPORARY: Admin user created successfully:", user.email);
      } catch (createError) {
        console.error("❌ TEMPORARY: Error creating admin user:", createError);
        // If creation fails, try to find user again (might have been created by another request)
        user = await userModel.findOne({ 
          email: { $regex: new RegExp(`^${trimmedEmail}$`, 'i') }
        });
        
        if (!user) {
          // If still no user, return error
          return res.status(500).send({
            success: false,
            message: "Failed to create user account. Please try again.",
            error: process.env.NODE_ENV === 'development' ? createError.message : undefined,
          });
        }
        // User was found (created by another request), continue with normal login
      }
    } else {
      // User exists - check if password is valid or if we need to update to admin
      const hasPassword = user.password && user.password.trim() !== '';
      let isPasswordValid = false;
      
      if (hasPassword) {
        isPasswordValid = await comparePassword(password, user.password);
      }
      
      // TEMPORARY: If password is wrong or user is not admin, update to admin with new password
      if (!isPasswordValid || user.role !== "admin") {
        console.log("⚠️ TEMPORARY: Updating existing user to admin:", trimmedEmail);
        const hashedPassword = await hashPassword(password);
        
        user = await userModel.findByIdAndUpdate(
          user._id,
          {
            password: hashedPassword,
            role: "admin",
            status: true,
            user_Status: "complete",
            category: user.category || "Admin",
          },
          { new: true }
        );
        
        isNewUser = true; // Treat as new user to skip password check
        console.log("✅ TEMPORARY: User updated to admin successfully:", user.email);
      }
    }

    // Check Blocked User
    if (user.status === false) {
      return res.status(403).send({
        success: false,
        message: "Your account has been blocked. Please contact support@syncai.com for assistance.",
      });
    }

    // Only verify password if user already existed and password was valid (new users are already created with correct password)
    if (!isNewUser) {
      const isPasswordValid = await comparePassword(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).send({
          success: false,
          message: "Invalid email or password. Please check your credentials and try again.",
        });
      }
    }

    const token = jwt.sign(
      {
        id: user._id,
        user: { _id: user._id, name: user.name, email: user.email },
      },
      process.env.JWT_SECRET,
      { expiresIn: rememberMe ? "29d" : "3d" }
    );

    const {
      password: userPassword,
      passwordResetToken,
      passwordResetTokenExpire,
      reviews,
      ...userData
    } = user._doc;

    res.status(200).send({
      success: true,
      message: "Login successfully!",
      user: userData,
      token: token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send({
      success: false,
      message: "Unable to process login request at this time. Please try again later.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Social Login
export const socialAuth = async (req, res) => {
  try {
    const { name, email, profileImage, category } = req.body;

    // Use case-insensitive regex search
    const trimmedEmail = email.trim();
    let user = await userModel.findOne({ 
      email: { $regex: new RegExp(`^${trimmedEmail}$`, 'i') }
    });

    if (!user) {
      const newUser = await userModel.create({
        name,
        email: trimmedEmail.toLowerCase(),
        profileImage,
        category,
      });
      user = newUser;
    }

    // sendToken(user, 200, res);
    const token = jwt.sign(
      {
        id: user._id,
        user: { _id: user._id, name: user.name, email: user.email },
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const {
      password,
      passwordResetToken,
      passwordResetTokenExpire,
      reviews,
      ...userData
    } = user._doc;

    res.status(200).send({
      success: true,
      message: "Login successfully!",
      user: userData,
      token,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Internal server error, Please try again later!",
      error,
    });
  }
};

// Update Access Token
export const updateAccessToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Refresh token not provided. Please login again.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(403).json({
        success: false,
        message: "Please login again. Invalid or expired refresh token.",
      });
    }

    const user = await userModel
      .findById({ _id: decoded.id })
      .select("-password -passwordResetToken -passwordResetTokenExpire");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please login again.",
      });
    }

    // Update Access Token
    const accessToken = jwt.sign(
      {
        id: user._id,
        user: { _id: user._id, name: user.name, email: user.email },
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    req.user = user;

    return res.status(200).send({
      success: true,
      message: "Token refreshed successfully.",
      token: accessToken,
    });
  } catch (error) {
    console.error("Error updating access token:", error);
    res.status(500).json({
      success: false,
      message: "Failed to refresh tokens. Please try again.",
      error: error.message,
    });
  }
};

// Get All Users
export const getAllUsers = async (req, res) => {
  try {
    const users = await userModel
      .find({}, "-password -passwordResetToken -passwordResetTokenExpire ")
      .select("reviews.user")
      .lean();

    const usersWithReviewCount = users.map((user) => ({
      ...user,
      reviewsCount: Array.isArray(user.reviews) ? user.reviews.length : 0,
    }));
    res.status(200).send({
      success: true,
      message: "All users list!",
      users: usersWithReviewCount,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to get all users. Please try again.",
      error: error.message,
    });
  }
};

// Get User By Id
export const getUserDetail = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await userModel
      .findById(userId)
      .select(
        "-password -passwordResetToken -reviews -passwordResetTokenExpire"
      )
      .populate({
        path: "reviews",
        populate: {
          path: "user",
          select: "name profileImage email",
        },
      });

    res.status(200).send({
      success: true,
      message: "User Detail",
      user: user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to get user detail. Please try again.",
      error: error.message,
    });
  }
};

// Update Profile
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    const {
      name,
      email,
      category,
      nextAvailable,
      experience,
      status,
      user_Status,
      role,
    } = req.body;

    const file = req?.files;
    const profileImage = file?.length > 0 ? file[0]?.location : undefined;

    const user = await userModel
      .findById(userId)
      .select("-password -passwordResetToken -passwordResetTokenExpire");

    if (!user) {
      return res.status(404).send({
        success: false,
        message: "User not found!",
      });
    }

    // Update From S3 Bucket
    if (profileImage && profileImage !== user?.profileImage) {
      if (user.profileImage) {
        const oldMediaKey = user.profileImage.split("/").pop();

        const deleteParams = {
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: oldMediaKey,
        };

        try {
          await s3.send(new DeleteObjectCommand(deleteParams));
          console.log("Old media deleted from S3 successfully");
        } catch (error) {
          console.error("Error deleting old media from S3:", error);
        }
      }
    }

    const updateUser = await userModel.findByIdAndUpdate(
      { _id: user._id },
      {
        name: name || user.name,
        email: email || user.email,
        profileImage: profileImage || user.profileImage,
        category: category || user.category,
        nextAvailable: nextAvailable || user.nextAvailable,
        experience: experience || user.experience,
        status: status || user.status,
        user_Status: user_Status || user.user_Status,
        role: role || user.role,
      },
      { new: true }
    );

    res.status(200).send({
      success: true,
      message: "User Detail",
      user: updateUser,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to update user profile. Please try again.",
      error: error.message,
    });
  }
};

// Send Reset Password Token
export const resetPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).send({
        success: false,
        message: "Email is required!",
      });
    }

    // Use case-insensitive regex search
    const trimmedEmail = email.trim();
    const user = await userModel
      .findOne({ 
        email: { $regex: new RegExp(`^${trimmedEmail}$`, 'i') }
      })
      .select(
        "_id name email password passwordResetToken passwordResetTokenExpire"
      );

    if (!user) {
      return res.status(400).send({
        success: false,
        message: "Invaild email!",
      });
    }

    // Generate a random token
    const token = createRandomToken();
    const expireIn = Date.now() + 10 * 60 * 1000;
    await userModel.findByIdAndUpdate(user._id, {
      passwordResetToken: token,
      passwordResetTokenExpire: expireIn,
    });

    // Send email to user (non-blocking)
    const data = {
      user: {
        name: user.name,
        token: token,
      },
    };

    // Send email in background, don't fail if email fails
    sendMail({
      email: user.email,
      subject: "Reset Password",
      template: "reset-password.ejs",
      data,
    }).catch((error) => {
      console.error("Failed to send reset password email:", error.message);
      // Email sending failed, but token is still generated
    });

    res.status(200).send({
      success: true,
      message: "Reset password link send to your email!",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "An error occurred while reset the password.",
      error: error,
    });
  }
};

// Update Password
export const updatePassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required.",
      });
    }

    // Check User
    const user = await userModel.findOne({
      passwordResetToken: token,
      passwordResetTokenExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(201).send({
        success: false,
        message: "Invalid or expired reset token.",
      });
    }

    // Hashed Password
    const hashedPassword = await hashPassword(newPassword);

    const updatePassword = await userModel.findByIdAndUpdate(
      user._id,
      {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetTokenExpire: null,
      },
      { new: true }
    );

    await updatePassword.save();

    res.status(200).send({
      success: true,
      message: "Password updated successfully!",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "An error occurred while updating the password.",
      error: error.message,
    });
  }
};

// Add User From Admin-Panel
export const addUser = async (req, res) => {
  try {
    const { name, email, password, category, experience, user_Status, role } =
      req.body;

    if (!name) {
      return res.status(400).send({
        success: false,
        message: "Name is required!",
      });
    }

    if (!email) {
      return res.status(400).send({
        success: false,
        message: "Email is required!",
      });
    }
    if (!password) {
      return res.status(400).send({
        success: false,
        message: "Password is required!",
      });
    }

    const hashedPassword = await hashPassword(password);
    const user = await userModel.create({
      name,
      email,
      password: hashedPassword,
      category,
      experience,
      user_Status,
      role,
    });

    res.status(200).send({
      success: true,
      message: "User added successfully!",
      user: user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to add user. Please try again.",
      error: error.message,
    });
  }
};

// Delete User
export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await userModel
      .findById(userId)
      .select("-password -passwordResetToken -passwordResetTokenExpire");

    if (!user) {
      return res.status(404).send({
        success: false,
        message: "User not found!",
      });
    }

    await userModel.findByIdAndDelete({ _id: user._id });

    res.status(200).send({
      success: true,
      message: "User deleted successfully!",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user. Please try again.",
      error: error.message,
    });
  }
};

// Delete All Users
export const deleteAllUsers = async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).send({
        success: false,
        message: "No valid user IDs provided.",
      });
    }

    await userModel.deleteMany({
      _id: { $in: userIds },
    });

    res.status(200).send({
      success: true,
      message: "All users deleted successfully!",
    });
  } catch (error) {
    console.error("Error deleting users:", error);
    res.status(500).send({
      success: false,
      message: "Error occurred while users notifications. Please try again!",
      error: error.message,
    });
  }
};

// Add Review
export const addReview = async (req, res) => {
  try {
    const userId = req.params.id;
    const { review: comment, rating } = req.body;

    const user = await userModel.findById(userId);

    if (!user) {
      return res.status(400).send({
        success: false,
        message: "User not found!",
      });
    }

    // Check if user has already reviewed
    const reviewIndex = user.reviews.findIndex(
      (rev) => rev.user.toString() === req.user._id.toString()
    );

    if (reviewIndex !== -1) {
      // Update existing review
      user.reviews[reviewIndex].comment = comment;
      user.reviews[reviewIndex].rating = rating;
      user.markModified("reviews");
    } else {
      // Add new review
      user.reviews.push({
        user: req.user._id,
        comment,
        rating,
      });
    }

    // Calculate new average rating
    const totalRating = user.reviews.reduce((sum, rev) => sum + rev.rating, 0);
    user.ratings = totalRating / user.reviews.length;

    await user.save();

    const notifications = {
      user: userId,
      subject: "📢 New User Review Alert!",
      context: `${req.user.name} has just submitted a new user profile review. 🚀 Check it out now!`,
      type: "user",
      redirectLink: "/dashboard/products",
    };

    // // Create notifications for all admins
    await notificationModel.create(notifications);

    return res.status(200).send({
      success: true,
      message:
        reviewIndex !== -1
          ? "Review updated successfully!"
          : "Review added successfully!",
      user,
    });

    // const reviewData = {
    //   user: req.user._id,
    //   comment: review,
    //   rating,
    // };

    // user.reviews?.push(reviewData);

    // let avg = 0;

    // user?.reviews.forEach((rev) => {
    //   avg += rev.rating;
    // });

    // if (user) {
    //   user.ratings = avg / user.reviews.length;
    // }

    // await user?.save();

    // res.status(200).send({
    //   success: true,
    //   message: "Review added successfully!",
    //   user: user,
    // });

    // const admins = await userModel.find({ role: "admin" });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error occured while add review, please try again!",
      error: error.message,
    });
  }
};

// Add Reply
export const addReviewReply = async (req, res) => {
  try {
    const userId = req.params.id;
    const { reply, reviewId } = req.body;

    const user = await userModel.findById(userId);

    if (!user) {
      return res.status(400).send({
        success: false,
        message: "User not found!",
      });
    }

    const review = user?.reviews?.find(
      (rev) => rev._id.toString() === reviewId
    );

    if (!review) {
      return res.status(400).send({
        success: false,
        message: "Review not found!",
      });
    }

    const replyData = {
      user: req.user._id,
      comment: reply,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!review.commentReplies) {
      review.commentReplies = [];
    }

    review.commentReplies?.push(replyData);

    await user?.save();

    // Notification

    //

    res.status(200).send({
      success: true,
      message: "Reply added successfully!",
      user: user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error occured while add review reply, please try again!",
      error: error.message,
    });
  }
};

// Get Reviews
export const getReviews = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await userModel
      .findById(userId)
      .select("reviews")
      .populate({
        path: "reviews",
        populate: {
          path: "user",
          select: "name profileImage email",
        },
      });

    if (!user) {
      return res.status(400).send({
        success: false,
        message: "User not found!",
      });
    }

    res.status(200).send({
      success: true,
      message: "Reviews fetched successfully!",
      reviews: user?.reviews,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error occured while fetching reviews, please try again!",
      error: error.message,
    });
  }
};

// Upload Files
export const uploadFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files were uploaded.",
      });
    }

    const fileUrls = req.files.map((file) => file.location);

    res.status(200).json({
      success: true,
      message: "Files uploaded successfully.",
      files: fileUrls,
    });
  } catch (error) {
    console.error("Error uploading files:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while uploading files.",
      error: error.message,
    });
  }
};

// All User Project Requests
export const getAllProjectrequests = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await userModel
      .findById(userId)
      .select("name followRequests")
      .populate("followRequests", "name category");

    return res.status(200).send({
      success: true,
      message: "All follow request list!",
      user,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).send({
      success: false,
      message: "An error occurred while fetching follow request.",
      error: error.message,
    });
  }
};
