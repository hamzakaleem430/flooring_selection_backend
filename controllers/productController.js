import productModel from "../models/productModel.js";
import dotenv from "dotenv";
dotenv.config();
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../middleware/uploadFiles.js";

// Create Product
export const createProduct = async (req, res) => {
  try {
    const { name, description, price, brand, qr_code } = req.body;

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

    const product = await productModel.create({
      user: userId,
      name,
      description,
      price,
      brand,
      variations,
      qr_code,
      images,
    });

    return res.status(200).json({
      success: true,
      message: "Product created successfully.",
      product,
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
    const { name, description, price, brand, qr_code, deleteImage } = req.body;

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
        qr_code: qr_code || product.qr_code,
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
