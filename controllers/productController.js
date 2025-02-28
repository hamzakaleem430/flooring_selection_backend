import productModel from "../models/productModel.js";
import dotenv from "dotenv";
dotenv.config();
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../middleware/uploadFiles.js";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";

// Upload QR Code Image to S3
const uploadQRCodeToS3 = async (qrCodeBuffer, key) => {
  try {
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `qrcodes/${key}.png`,
      Body: qrCodeBuffer,
      ContentType: "image/png",
      ACL: "public-read",
    };

    await s3.send(new PutObjectCommand(uploadParams));

    const AWS_REGION = "eu-north-1";

    // Return S3 URL
    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/qrcodes/${key}.png`;
  } catch (error) {
    console.error("Error uploading QR Code to S3:", error);
    throw new Error("Failed to upload QR code.");
  }
};

// Create Product
export const createProduct = async (req, res) => {
  try {
    const { name, description, price, brand } = req.body;

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

    const images = req.files?.map((file) => file.location);

    // Generate a unique QR Code UUID
    const qrCodeUUID = uuidv4();

    // Generate QR Code as Buffer
    const qrCodeBuffer = await QRCode.toBuffer(qrCodeUUID);

    // Upload QR Code Image to S3
    const qrCodeS3Url = await uploadQRCodeToS3(qrCodeBuffer, qrCodeUUID);

    const newProduct = await productModel.create({
      user: userId,
      name,
      description,
      price,
      brand,
      variations,
      images,
      qr_code: qrCodeUUID,
      qr_code_image: qrCodeS3Url,
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
    const { name, description, price, brand, qrcode, deleteImage } = req.body;

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

      // Remove deleted images from database
      product.images = product.images.filter(
        (url) => !deleteImages.includes(url)
      );
    }

    // Add new images to thumbnails array
    const updatedImages = [...product.images, ...newImagesURL];

    const updatedProduct = await productModel.findByIdAndUpdate(
      productId,
      {
        name: name || product.name,
        description: description || product.description,
        price: price || product.price,
        brand: brand || product.brand,
        variations: variations || product.variations,
        qrcode: qrcode || product.qrcode,
        images: updatedImages,
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
    const { qr_code } = req.params;

    const product = await productModel.findOne({ qr_code });
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found." });
    }

    return res.status(200).json({ success: true, product });
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
