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
    if (variationImagesCountArray.length > 0) {
      let fileIndex = 0;
      
      // First, get main product images (count is first element)
      const mainImageCount = variationImagesCountArray[0] || 0;
      mainProductImages = allFiles.slice(fileIndex, fileIndex + mainImageCount).map(f => f.location);
      fileIndex += mainImageCount;

      // Then get variation images
      for (let i = 1; i < variationImagesCountArray.length; i++) {
        const count = variationImagesCountArray[i] || 0;
        const varImages = allFiles.slice(fileIndex, fileIndex + count).map(f => f.location);
        variationImagesByIndex.push(varImages);
        fileIndex += count;
      }
    } else {
      // Fallback: all files are main product images
      mainProductImages = allFiles.map((file) => file.location);
    }

    // Add images to variations
    if (variations && variationImagesByIndex.length > 0) {
      variations = variations.map((v, vIndex) => {
        const varImages = variationImagesByIndex[vIndex] || [];
        // Split images by options count
        const imagesPerOption = [];
        const optionsCount = v.options.length;
        const imagesPerOptionCount = Math.ceil(varImages.length / optionsCount);
        
        for (let i = 0; i < optionsCount; i++) {
          const start = i * imagesPerOptionCount;
          const end = start + imagesPerOptionCount;
          imagesPerOption.push(varImages.slice(start, end));
        }
        
        return {
          ...v,
          images: imagesPerOption
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
    const { name, description, price, brand, qrcode, deleteImage, variationImagesCount } = req.body;

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

      // Remove deleted images from database (both main and variation images)
      product.images = product.images.filter(
        (url) => !deleteImages.includes(url)
      );
      
      // Also remove from variation images
      if (product.variations) {
        product.variations = product.variations.map(v => {
          if (v.images && v.images.length > 0) {
            v.images = v.images.map(imgArray => 
              imgArray.filter(url => !deleteImages.includes(url))
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

    if (newImagesURL.length > 0 && variationImagesCountArray.length > 0) {
      let fileIndex = 0;
      
      // First, get new main product images
      const mainImageCount = variationImagesCountArray[0] || 0;
      const newMainImages = newImagesURL.slice(fileIndex, fileIndex + mainImageCount);
      mainProductImages = [...mainProductImages, ...newMainImages];
      fileIndex += mainImageCount;

      // Then get new variation images
      for (let i = 1; i < variationImagesCountArray.length; i++) {
        const count = variationImagesCountArray[i] || 0;
        const varImages = newImagesURL.slice(fileIndex, fileIndex + count);
        variationImagesByIndex.push(varImages);
        fileIndex += count;
      }
    } else if (newImagesURL.length > 0) {
      // Fallback: all new files are main product images
      mainProductImages = [...mainProductImages, ...newImagesURL];
    }

    // Merge new variation images with existing ones
    if (variations && variationImagesByIndex.length > 0) {
      variations = variations.map((v, vIndex) => {
        const newVarImages = variationImagesByIndex[vIndex] || [];
        const existingVarImages = product.variations?.[vIndex]?.images || [];
        
        // Split new images by options count
        const imagesPerOption = [...existingVarImages];
        const optionsCount = v.options.length;
        const imagesPerOptionCount = Math.ceil(newVarImages.length / optionsCount);
        
        for (let i = 0; i < optionsCount; i++) {
          if (!imagesPerOption[i]) {
            imagesPerOption[i] = [];
          }
          const start = i * imagesPerOptionCount;
          const end = start + imagesPerOptionCount;
          const newImages = newVarImages.slice(start, end);
          imagesPerOption[i] = [...imagesPerOption[i], ...newImages];
        }
        
        return {
          ...v,
          images: imagesPerOption
        };
      });
    } else if (variations && product.variations) {
      // Preserve existing variation images if no new ones
      variations = variations.map((v, vIndex) => ({
        ...v,
        images: product.variations[vIndex]?.images || []
      }));
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

    return res.status(200).json({
      success: true,
      message: "Product updated successfully.",
      updatedProduct,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error updating product, please try again later.",
      error: error,
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
