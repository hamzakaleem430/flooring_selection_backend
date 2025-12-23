import productModel from "../models/productModel.js";
import dotenv from "dotenv";
dotenv.config();
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../middleware/uploadFiles.js";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { Upload } from "@aws-sdk/lib-storage";

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
    const { name, description, price, brand, qr_code, qr_code_image, variationImagesCount } =
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

    if (!name || !description || !price) {
      return res.status(400).json({
        success: false,
        message: "Please provide all the required fields.",
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Product image is required.",
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

    const newProduct = await productModel.create({
      user: userId,
      name,
      description,
      price,
      brand,
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
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error creating product, please try again later.",
      error: error,
    });
  }
};

// Update Product
export const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const { name, description, price, brand, qrcode, deleteImage, deleteVariationImages, variationImagesCount } = req.body;

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
        message: "Product ID is required.",
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

    const updatedProduct = await productModel.findByIdAndUpdate(
      productId,
      {
        name: name || product.name,
        description: description || product.description,
        price: price || product.price,
        brand: brand || product.brand,
        variations: variations || product.variations,
        qrcode: qrcode || product.qrcode,
        images: mainProductImages,
      },
      { new: true }
    );

    console.log("Product updated successfully:", updatedProduct._id);

    return res.status(200).json({
      success: true,
      message: "Product updated successfully.",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    console.error("Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: "Error updating product, please try again later.",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
    const { margin, productIds } = req.body;

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

    // Update margin and calculate price (selling price) for unlocked products
    const updatePromises = products.map(async (product) => {
      const cost = product.cost || 0;
      const price = cost + (cost * margin / 100);
      
      return productModel.findByIdAndUpdate(
        product._id,
        { 
          margin,
          price 
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
