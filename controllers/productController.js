import productModel from "../models/productModel.js";
import dotenv from "dotenv";
dotenv.config();
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../middleware/uploadFiles.js";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { Upload } from "@aws-sdk/lib-storage";

// Helper function to calculate selling price based on profit type
const calculateSellingPrice = (cost, marginValue, profitType = "markup") => {
  if (!cost || !marginValue) return 0;
  
  const costValue = parseFloat(cost);
  const margin = parseFloat(marginValue);
  
  if (profitType === "margin") {
    // Margin formula: sellingPrice = cost / (1 - margin / 100)
    // Example: $3 cost with 25% margin = $3 / (1 - 0.25) = $3 / 0.75 = $4
    return costValue / (1 - margin / 100);
  } else {
    // Markup formula (default): sellingPrice = cost + (cost * markup / 100)
    // Example: $3 cost with 10% markup = $3 + $0.30 = $3.30
    return costValue + (costValue * margin / 100);
  }
};

// Upload QR Code Image to S3
const uploadQRCodeToS3 = async (qrCodeBuffer, key) => {
  try {
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `qrcodes/${key}.png`,
      Body: qrCodeBuffer,
      ContentType: "image/png",
    };

    const AWS_REGION = "eu-north-1";

    // Return S3 URL in the required format
    const uploader = new Upload({
      client: s3,
      params: uploadParams,
    });

    await uploader.done();

    return `https://s3.${AWS_REGION}.amazonaws.com/${process.env.AWS_S3_BUCKET_NAME}/qrcodes/${key}.png`;
  } catch (error) {
    console.error("Error uploading QR Code to S3:", error);
    throw new Error("Failed to upload QR code.");
  }
};

// Create Product
export const createProduct = async (req, res) => {
  try {
    const { name, description, price, brand, category, seriesName, cost, margin, profitType, qr_code, qr_code_image, variationImagesCount } =
      req.body;

    const userId = req.user._id;

    let variations = req.body.variations;

    // Parse variations if it is a JSON string
    if (typeof variations === "string") {
      try {
        variations = JSON.parse(variations);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: "Invalid format for variations. Must be a valid JSON array.",
        });
      }
    }

    // Detailed validation
    const validationErrors = [];
    
    if (!name || name.trim().length < 3) {
      validationErrors.push("Product name is required (minimum 3 characters)");
    }
    
    if (!description || description.trim().length < 10) {
      validationErrors.push("Product description is required (minimum 10 characters)");
    }
    
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      validationErrors.push("Valid product price is required (must be greater than 0)");
    }

    if (!req.files || req.files.length === 0) {
      validationErrors.push("At least one product image is required");
    }
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: validationErrors.join(". "),
        errors: validationErrors,
      });
    }

    // Separate main product images from variation images
    const allFiles = req.files;
    let mainProductImages = [];
    let variationImagesByIndex = [];

    // Parse variation images count if provided
    let variationImagesCountArray = [];
    if (variationImagesCount) {
      try {
        variationImagesCountArray = JSON.parse(variationImagesCount);
      } catch (e) {
        console.log("Error parsing variationImagesCount", e);
      }
    }

    // If we have variation images count, split files accordingly
    // variationImagesCountArray is a 2D array: [[2,3,1], [1,2]] means:
    // - First variation: 3 options with 2, 3, and 1 images respectively
    // - Second variation: 2 options with 1 and 2 images respectively
    if (variationImagesCountArray.length > 0) {
      let fileIndex = 0;
      
      // Calculate total variation images to determine where main images end
      let totalVariationImages = 0;
      variationImagesCountArray.forEach(variationCounts => {
        variationCounts.forEach(count => {
          totalVariationImages += count;
        });
      });

      // Main product images come first
      const mainImageCount = allFiles.length - totalVariationImages;
      mainProductImages = allFiles.slice(0, mainImageCount).map(f => f.location);
      fileIndex = mainImageCount;

      // Then get variation images organized by variation and option
      for (let vIndex = 0; vIndex < variationImagesCountArray.length; vIndex++) {
        const optionCounts = variationImagesCountArray[vIndex];
        const variationImages = [];
        
        for (let oIndex = 0; oIndex < optionCounts.length; oIndex++) {
          const imageCount = optionCounts[oIndex];
          const optionImages = allFiles.slice(fileIndex, fileIndex + imageCount).map(f => f.location);
          variationImages.push(optionImages);
          fileIndex += imageCount;
        }
        
        variationImagesByIndex.push(variationImages);
      }
    } else {
      // Fallback: all files are main product images
      mainProductImages = allFiles.map((file) => file.location);
    }

    // Add images to variations
    if (variations && variationImagesByIndex.length > 0) {
      variations = variations.map((v, vIndex) => {
        return {
          ...v,
          images: variationImagesByIndex[vIndex] || []
        };
      });
    }

    // Calculate selling price if cost and margin are provided
    const costValue = cost ? parseFloat(cost) : 0;
    const marginValue = margin ? parseFloat(margin) : 0;
    const profitTypeValue = profitType || "markup";
    const sellingPrice = (costValue && marginValue) 
      ? calculateSellingPrice(costValue, marginValue, profitTypeValue)
      : 0;

    const newProduct = await productModel.create({
      user: userId,
      name,
      description,
      price,
      brand,
      category,
      seriesName,
      cost: costValue,
      margin: marginValue,
      profitType: profitTypeValue,
      sellingPrice: sellingPrice,
      variations,
      images: mainProductImages,
      qr_code: qr_code,
      qr_code_image: qr_code_image,
    });

    return res.status(200).json({
      success: true,
      message: "Product created successfully.",
      product: newProduct,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed: " + errors.join(", "),
        errors: errors,
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        message: `A product with this ${field} already exists.`,
      });
    }
    
    return res.status(500).json({
      success: false,
      message: error.message || "Error creating product, please try again later.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Update Product
export const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const { name, description, price, brand, category, seriesName, cost, margin, profitType, qrcode, isActive, deleteImage, deleteVariationImages, variationImagesCount } = req.body;

    console.log("Update Product Request Body:", {
      name,
      price,
      brand,
      hasFiles: !!req.files,
      filesCount: req.files?.length || 0,
      variationImagesCount,
      deleteVariationImages
    });

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required to update a product.",
      });
    }
    
    // Validate productId format
    if (!productId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format.",
      });
    }

    let deleteImages = [];

    if (deleteImage) {
      try {
        deleteImages = JSON.parse(deleteImage);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid format for deleteImage. Must be a valid JSON array.",
        });
      }
    }

    let variations = req.body.variations;

    console.log("variations", variations);

    // Parse variations if it is a JSON string
    if (typeof variations === "string") {
      try {
        variations = JSON?.parse(variations);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: "Invalid format for variations. Must be a valid JSON array.",
        });
      }
    }

    // Initialize newImagesURL as an empty array if no files are uploaded
    const newImagesURL = req?.files?.length
      ? req.files.map((file) => file.location)
      : [];

    const product = await productModel.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    // Handle deletion of old main images
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
        console.log("Selected old main images deleted from S3 successfully");
      } catch (error) {
        console.error("Error deleting old main images from S3:", error);
        return res.status(500).json({
          success: false,
          message:
            "Error occurred while deleting images. Please try again.",
          error: error.message,
        });
      }

      // Remove deleted images from database
      product.images = product.images.filter(
        (url) => !deleteImages.includes(url)
      );
    }

    // Handle deletion of variation images
    let deleteVariationImagesList = [];
    if (deleteVariationImages) {
      try {
        deleteVariationImagesList = JSON.parse(deleteVariationImages);
      } catch (parseError) {
        console.log("Error parsing deleteVariationImages", parseError);
      }
    }

    if (deleteVariationImagesList && deleteVariationImagesList.length > 0) {
      const deleteKeys = deleteVariationImagesList.map((url) => url.split("/").pop());

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
        console.log("Selected old variation images deleted from S3 successfully");
      } catch (error) {
        console.error("Error deleting old variation images from S3:", error);
        return res.status(500).json({
          success: false,
          message:
            "Error occurred while deleting variation images. Please try again.",
          error: error.message,
        });
      }

      // Remove deleted variation images from database
      if (product.variations) {
        product.variations = product.variations.map(v => {
          if (v.images && v.images.length > 0) {
            v.images = v.images.map(imgArray => 
              Array.isArray(imgArray) ? imgArray.filter(url => !deleteVariationImagesList.includes(url)) : []
            );
          }
          return v;
        });
      }
    }

    // Parse variation images count if provided
    let variationImagesCountArray = [];
    if (variationImagesCount) {
      try {
        variationImagesCountArray = JSON.parse(variationImagesCount);
      } catch (e) {
        console.log("Error parsing variationImagesCount", e);
      }
    }

    // Separate main product images from variation images
    let mainProductImages = [...product.images];
    let variationImagesByIndex = [];

    // variationImagesCountArray is a 2D array: [[2,3,1], [1,2]] means:
    // - First variation: 3 options with 2, 3, and 1 images respectively
    // - Second variation: 2 options with 1 and 2 images respectively
    if (newImagesURL.length > 0 && variationImagesCountArray.length > 0) {
      let fileIndex = 0;
      
      // Calculate total variation images to determine where main images end
      let totalVariationImages = 0;
      variationImagesCountArray.forEach(variationCounts => {
        variationCounts.forEach(count => {
          totalVariationImages += count;
        });
      });

      // New main product images come first
      const mainImageCount = newImagesURL.length - totalVariationImages;
      const newMainImages = newImagesURL.slice(0, mainImageCount);
      mainProductImages = [...mainProductImages, ...newMainImages];
      fileIndex = mainImageCount;

      // Then get new variation images organized by variation and option
      for (let vIndex = 0; vIndex < variationImagesCountArray.length; vIndex++) {
        const optionCounts = variationImagesCountArray[vIndex];
        const variationImages = [];
        
        for (let oIndex = 0; oIndex < optionCounts.length; oIndex++) {
          const imageCount = optionCounts[oIndex];
          const optionImages = newImagesURL.slice(fileIndex, fileIndex + imageCount);
          variationImages.push(optionImages);
          fileIndex += imageCount;
        }
        
        variationImagesByIndex.push(variationImages);
      }
    } else if (newImagesURL.length > 0) {
      // Fallback: all new files are main product images
      mainProductImages = [...mainProductImages, ...newImagesURL];
    }

    // Merge new variation images with existing ones
    if (variations) {
      variations = variations.map((v, vIndex) => {
        const newVarImages = variationImagesByIndex[vIndex] || [];
        const existingVarImages = product.variations?.[vIndex]?.images || [];
        
        // newVarImages is already organized as [[img1, img2], [img3], [img4, img5, img6]]
        // where each sub-array corresponds to one option
        // Merge new images with existing ones per option
        const imagesPerOption = [];
        const optionsCount = v.options.length;
        
        for (let i = 0; i < optionsCount; i++) {
          const existingImages = Array.isArray(existingVarImages[i]) ? existingVarImages[i] : [];
          const newImages = Array.isArray(newVarImages[i]) ? newVarImages[i] : [];
          imagesPerOption[i] = [...existingImages, ...newImages];
        }
        
        return {
          ...v,
          images: imagesPerOption
        };
      });
    }

    // Helper function to safely parse numbers
    const safeParseFloat = (value, defaultValue = 0) => {
      if (value === undefined || value === null || value === "") {
        return defaultValue;
      }
      const parsed = parseFloat(value);
      return isNaN(parsed) ? defaultValue : parsed;
    };

    // Parse numeric values safely
    const costValue = cost !== undefined 
      ? safeParseFloat(cost, product.cost || 0) 
      : (product.cost || 0);
    const marginValue = margin !== undefined
      ? safeParseFloat(margin, product.margin || 0)
      : (product.margin || 0);
    const priceValue = price !== undefined && price !== ""
      ? safeParseFloat(price, product.price)
      : product.price;
    
    const profitTypeValue = profitType || product.profitType || "markup";
    
    // Calculate selling price only if both cost and margin are valid numbers
    let sellingPrice = priceValue;
    if (costValue > 0 && marginValue > 0) {
      sellingPrice = calculateSellingPrice(costValue, marginValue, profitTypeValue);
    }

    // Validate required fields - ensure they're not empty strings
    if (name !== undefined && (!name || name.trim().length < 3)) {
      return res.status(400).json({
        success: false,
        message: "Product name is required and must be at least 3 characters long.",
      });
    }

    if (description !== undefined && (!description || description.trim().length < 10)) {
      return res.status(400).json({
        success: false,
        message: "Product description is required and must be at least 10 characters long.",
      });
    }

    if (price !== undefined && price !== "" && (isNaN(priceValue) || priceValue <= 0)) {
      return res.status(400).json({
        success: false,
        message: "Valid product price is required (must be greater than 0).",
      });
    }

    // Build update object - only update fields that are provided and valid
    const updateData = {
      name: name !== undefined && name.trim() ? name.trim() : product.name,
      description: description !== undefined && description.trim() ? description.trim() : product.description,
      price: priceValue,
      brand: brand !== undefined ? (brand.trim() || product.brand) : product.brand,
      category: category !== undefined ? (category.trim() || product.category) : product.category,
      seriesName: seriesName !== undefined ? (seriesName.trim() || product.seriesName) : product.seriesName,
      cost: costValue,
      margin: marginValue,
      profitType: profitTypeValue,
      sellingPrice: sellingPrice,
      variations: variations !== undefined ? variations : product.variations,
      images: mainProductImages,
    };

    // Update qrcode if provided
    if (qrcode !== undefined) {
      updateData.qr_code = qrcode;
    }

    // Update isActive if provided
    if (isActive !== undefined) {
      // Handle both boolean and string values from FormData
      updateData.isActive = isActive === true || isActive === "true" || (typeof isActive === "string" && isActive.toLowerCase() === "true");
    }

    const updatedProduct = await productModel.findByIdAndUpdate(
      productId,
      updateData,
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Product updated successfully.",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    console.error("Error stack:", error.stack);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed: " + errors.join(", "),
        errors: errors,
      });
    }
    
    // Handle cast errors (invalid ObjectId)
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID provided.",
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        message: `A product with this ${field} already exists.`,
      });
    }
    
    return res.status(500).json({
      success: false,
      message: error.message || "Error updating product, please try again later.",
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get Product - dealer
export const getDealerProducts = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required.",
      });
    }

    const products = await productModel
      .find({ user: userId })
      .populate("user", "name email profileImage");

    if (!products) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product list!",
      products,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving product, please try again later.",
      error: error,
    });
  }
};

// Get All Products
export const getAllProducts = async (req, res) => {
  try {
    const products = await productModel
      .find()
      .populate("user", "name email profileImage");

    if (!products) {
      return res.status(404).json({
        success: false,
        message: "No products found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Products found successfully.",
      products,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving products, please try again later.",
      error: error,
    });
  }
};

// Get Product Detail
export const getProductDetail = async (req, res) => {
  try {
    const productId = req.params.id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required.",
      });
    }

    const product = await productModel
      .findById(productId)
      .populate("user", "name email profileImage");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product found successfully.",
      product,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving product, please try again later.",
      error: error,
    });
  }
};

// Delete Product
export const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required.",
      });
    }

    const product = await productModel.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    await productModel.deleteOne({ _id: productId });

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error deleting product, please try again later.",
      error: error,
    });
  }
};

// Get product through qrcode scan
export const getProductByQRCode = async (req, res) => {
  try {
    const { name, price, qr_code } = req.query;

    if (qr_code) {
      const product = await productModel
        .findOne({ qr_code })
        .populate("user", "name email profileImage");

      if (!product) {
        return res
          .status(404)
          .json({ success: false, message: "Product not found." });
      }

      return res.status(200).json({ success: true, product });
    } else {
      const product = await productModel
        .findOne({
          name,
          price,
        })
        .populate("user", "name email profileImage");
      if (!product) {
        return res
          .status(404)
          .json({ success: false, message: "Product not found." });
      }

      return res.status(200).json({ success: true, product });
    }
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching product.", error });
  }
};

// User Scan Product
export const getUserProductByQRCode = async (req, res) => {
  try {
    const { name, price, qr_code, userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required.",
      });
    }

    if (qr_code) {
      const product = await productModel
        .findOne({ qr_code, user: userId })
        .populate("user", "name email profileImage");

      if (!product) {
        return res
          .status(404)
          .json({ success: false, message: "Product not found." });
      }

      return res.status(200).json({ success: true, product });
    } else {
      const product = await productModel
        .findOne({
          name,
          price,
          user: userId,
        })
        .populate("user", "name email profileImage");
      if (!product) {
        return res
          .status(404)
          .json({ success: false, message: "Product not found." });
      }

      return res.status(200).json({ success: true, product });
    }
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching product.", error });
  }
};

// Complete Coordinates
// export const getCompleteCoordinates = async (req, res) => {
//   try {
//     const { origin, destination, waypoints, key } = req.query;

//     const response = await axios.get(
//       `https://maps.googleapis.com/maps/api/directions/json`,
//       {
//         params: {
//           origin,
//           destination,
//           waypoints,
//           key,
//         },
//       }
//     );

//     if (response.data.status !== "OK") {
//       return res.status(400).json({
//         success: false,
//         message: "Failed to fetch directions.",
//         error: response.data.status,
//       });
//     }

//     const routes = response.data.routes;

//     // Extract all coordinates from the polyline in the routes
//     const allCoordinates = routes.flatMap((route) => {
//       const polyline = route.overview_polyline?.points;
//       return polyline ? decodePolyline(polyline) : [];
//     });

//     res.status(200).json({
//       success: true,
//       message: "Coordinates retrieved successfully.",
//       data: allCoordinates,
//     });
//   } catch (error) {
//     console.log(error);
//     return res.status(500).json({
//       success: false,
//       message: "Error retrieving coordinates, please try again later.",
//       error: error.message,
//     });
//   }
// };

// Bulk apply margin to products
export const bulkApplyMargin = async (req, res) => {
  try {
    const { margin, productIds, profitType } = req.body;

    if (margin === undefined || margin === null) {
      return res.status(400).json({
        success: false,
        message: "Margin value is required.",
      });
    }

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Product IDs array is required.",
      });
    }

    const profitTypeValue = profitType || "markup";

    // Find products that are not locked
    const products = await productModel.find({
      _id: { $in: productIds },
      marginLocked: { $ne: true }
    });

    if (products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No unlocked products found to update.",
      });
    }

    // Update margin and calculate selling price for unlocked products
    const updatePromises = products.map(async (product) => {
      const cost = product.cost || 0;
      const sellingPrice = calculateSellingPrice(cost, margin, profitTypeValue);
      
      return productModel.findByIdAndUpdate(
        product._id,
        { 
          margin,
          profitType: profitTypeValue,
          sellingPrice 
        },
        { new: true }
      );
    });

    const updatedProducts = await Promise.all(updatePromises);

    return res.status(200).json({
      success: true,
      message: `Margin applied to ${updatedProducts.length} products successfully.`,
      updatedCount: updatedProducts.length,
      lockedCount: productIds.length - updatedProducts.length,
    });
  } catch (error) {
    console.error("Error applying bulk margin:", error);
    return res.status(500).json({
      success: false,
      message: "Error applying margin, please try again later.",
      error: error.message,
    });
  }
};

// Lock/unlock margin for products
export const toggleMarginLock = async (req, res) => {
  try {
    const { productIds, locked } = req.body;

    if (locked === undefined || locked === null) {
      return res.status(400).json({
        success: false,
        message: "Lock status (locked) is required.",
      });
    }

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Product IDs array is required.",
      });
    }

    const result = await productModel.updateMany(
      { _id: { $in: productIds } },
      { marginLocked: locked }
    );

    return res.status(200).json({
      success: true,
      message: `Margin ${locked ? 'locked' : 'unlocked'} for ${result.modifiedCount} products.`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error toggling margin lock:", error);
    return res.status(500).json({
      success: false,
      message: "Error toggling margin lock, please try again later.",
      error: error.message,
    });
  }
};

// Toggle product activation (activate/deactivate)
export const toggleProductActivation = async (req, res) => {
  try {
    const { productIds, isActive } = req.body;

    if (isActive === undefined || isActive === null) {
      return res.status(400).json({
        success: false,
        message: "Activation status (isActive) is required.",
      });
    }

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Product IDs array is required.",
      });
    }

    const result = await productModel.updateMany(
      { _id: { $in: productIds } },
      { isActive: isActive }
    );

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} product(s) ${isActive ? 'activated' : 'deactivated'} successfully.`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error toggling product activation:", error);
    return res.status(500).json({
      success: false,
      message: "Error toggling product activation, please try again later.",
      error: error.message,
    });
  }
};

// Helper function to calculate average rating
const calculateAverageRating = (reviews) => {
  if (!reviews || reviews.length === 0) return 0;
  const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
  return (sum / reviews.length).toFixed(1);
};

// Create or Update Product Review
export const createOrUpdateReview = async (req, res) => {
  try {
    const productId = req.params.id;
    const { rating, comment } = req.body;
    const userId = req.user._id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required.",
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating is required and must be between 1 and 5.",
      });
    }

    const product = await productModel.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    // Check if user already reviewed this product
    const existingReviewIndex = product.reviews.findIndex(
      (review) => review.user.toString() === userId.toString()
    );

    const reviewData = {
      user: userId,
      rating: parseInt(rating),
      comment: comment || "",
      createdAt: new Date(),
    };

    if (existingReviewIndex !== -1) {
      // Update existing review
      product.reviews[existingReviewIndex] = reviewData;
    } else {
      // Add new review
      product.reviews.push(reviewData);
    }

    // Calculate average rating and total reviews
    product.averageRating = parseFloat(calculateAverageRating(product.reviews));
    product.totalReviews = product.reviews.length;

    await product.save();

    return res.status(200).json({
      success: true,
      message: existingReviewIndex !== -1 
        ? "Review updated successfully." 
        : "Review added successfully.",
      review: reviewData,
      averageRating: product.averageRating,
      totalReviews: product.totalReviews,
    });
  } catch (error) {
    console.error("Error creating/updating review:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating/updating review, please try again later.",
      error: error.message,
    });
  }
};

// Delete Product Review
export const deleteReview = async (req, res) => {
  try {
    const productId = req.params.id;
    const reviewId = req.params.reviewId;
    const userId = req.user._id;

    if (!productId || !reviewId) {
      return res.status(400).json({
        success: false,
        message: "Product ID and Review ID are required.",
      });
    }

    const product = await productModel.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    // Find and remove the review
    const reviewIndex = product.reviews.findIndex(
      (review) => 
        review._id.toString() === reviewId.toString() &&
        review.user.toString() === userId.toString()
    );

    if (reviewIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Review not found or you don't have permission to delete it.",
      });
    }

    product.reviews.splice(reviewIndex, 1);

    // Recalculate average rating and total reviews
    product.averageRating = parseFloat(calculateAverageRating(product.reviews));
    product.totalReviews = product.reviews.length;

    await product.save();

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully.",
      averageRating: product.averageRating,
      totalReviews: product.totalReviews,
    });
  } catch (error) {
    console.error("Error deleting review:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting review, please try again later.",
      error: error.message,
    });
  }
};

// Get Product Reviews
export const getProductReviews = async (req, res) => {
  try {
    const productId = req.params.id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required.",
      });
    }

    const product = await productModel
      .findById(productId)
      .populate("reviews.user", "name email profileImage")
      .select("reviews averageRating totalReviews");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    return res.status(200).json({
      success: true,
      reviews: product.reviews,
      averageRating: product.averageRating,
      totalReviews: product.totalReviews,
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching reviews, please try again later.",
      error: error.message,
    });
  }
};