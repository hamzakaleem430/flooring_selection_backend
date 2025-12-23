/**
 * Centralized error handling utilities
 */

/**
 * Handle Mongoose validation errors
 */
export const handleValidationError = (error) => {
  const errors = Object.values(error.errors).map(err => err.message);
  return {
    status: 400,
    message: "Validation failed: " + errors.join(", "),
    errors: errors,
  };
};

/**
 * Handle MongoDB duplicate key errors
 */
export const handleDuplicateKeyError = (error) => {
  const field = Object.keys(error.keyPattern || {})[0] || 'field';
  return {
    status: 409,
    message: `A record with this ${field} already exists.`,
  };
};

/**
 * Handle MongoDB Cast errors (invalid ObjectId)
 */
export const handleCastError = (error) => {
  return {
    status: 400,
    message: `Invalid ${error.path}: ${error.value}`,
  };
};

/**
 * Send standardized error response
 */
export const sendErrorResponse = (res, error, defaultMessage = "An error occurred") => {
  console.error("Error:", error);
  
  let status = 500;
  let message = defaultMessage;
  let errors = undefined;
  
  // Handle Mongoose validation errors
  if (error.name === 'ValidationError') {
    const result = handleValidationError(error);
    status = result.status;
    message = result.message;
    errors = result.errors;
  }
  // Handle MongoDB duplicate key errors
  else if (error.code === 11000) {
    const result = handleDuplicateKeyError(error);
    status = result.status;
    message = result.message;
  }
  // Handle MongoDB Cast errors
  else if (error.name === 'CastError') {
    const result = handleCastError(error);
    status = result.status;
    message = result.message;
  }
  // Handle JWT errors
  else if (error.name === 'JsonWebTokenError') {
    status = 401;
    message = "Invalid authentication token.";
  }
  else if (error.name === 'TokenExpiredError') {
    status = 401;
    message = "Authentication token has expired. Please log in again.";
  }
  // Use custom error message if provided
  else if (error.message) {
    message = error.message;
  }
  
  return res.status(status).json({
    success: false,
    message,
    errors,
    error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });
};

/**
 * Validate required fields
 */
export const validateRequiredFields = (fields, data) => {
  const missing = [];
  
  fields.forEach(field => {
    if (typeof field === 'object') {
      const { name, minLength } = field;
      if (!data[name] || (minLength && data[name].toString().trim().length < minLength)) {
        missing.push(`${name} is required${minLength ? ` (minimum ${minLength} characters)` : ''}`);
      }
    } else {
      if (!data[field]) {
        missing.push(`${field} is required`);
      }
    }
  });
  
  return missing;
};

