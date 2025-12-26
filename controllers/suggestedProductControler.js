import suggestedProductModal from "../models/suggestedProductModal.js";
import productModel from "../models/productModel.js";
import { createProjectLog } from "./projectLogController.js";

// Create a new suggested product
export const createSuggestedProduct = async (req, res) => {
  try {
    const { project, product, quantity } = req.body;
    const user = req.user._id;

    if (!Array.isArray(product) || product.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Product array is required and should not be empty",
      });
    }

    // Validate that all products are active
    const products = await productModel.find({ _id: { $in: product } });
    const deactivatedProducts = products.filter(p => p.isActive === false);
    
    if (deactivatedProducts.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot suggest deactivated products. Some products may be out of stock.",
        deactivatedProducts: deactivatedProducts.map(p => p.name),
      });
    }

    const suggestedProducts = [];

    for (const productId of product) {
      const existingProduct = await suggestedProductModal.findOne({
        user,
        project,
        product: productId,
      });

      if (!existingProduct) {
        const newSuggestedProduct = await suggestedProductModal.create({
          user,
          project,
          product: productId,
          quantity: quantity || 1,
        });
        suggestedProducts.push(newSuggestedProduct);
        
        // Log product suggestion
        const productData = await productModel.findById(productId);
        await createProjectLog(
          project,
          user,
          "product_suggested",
          `Product "${productData?.name || 'Unknown'}" suggested`,
          { productId, productName: productData?.name, quantity: quantity || 1 }
        );
      } else {
        // Update quantity if product already exists
        existingProduct.quantity = (existingProduct.quantity || 1) + (quantity || 1);
        await existingProduct.save();
        suggestedProducts.push(existingProduct);
      }
    }

    res.status(201).json({
      success: true,
      message: "Suggested products added successfully",
      data: suggestedProducts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get Suggested Products
export const getSuggestedProducts = async (req, res) => {
  try {
    const projectId = req.params.id;
    const suggestedProducts = await suggestedProductModal
      .find({
        project: projectId,
      })
      .populate("product")
      .populate("user", "name, email")
      .populate("project", "name");

    res.status(200).json({
      success: true,
      message: "Suggested products fetched successfully",
      data: suggestedProducts,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Internal server error", error: error });
  }
};

// Update Suggested Product Quantity
export const updateSuggestedProductQuantity = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be at least 1",
      });
    }

    const suggestedProduct = await suggestedProductModal
      .findByIdAndUpdate(
        id,
        { quantity },
        { new: true }
      )
      .populate("product");

    if (!suggestedProduct) {
      return res.status(404).json({
        success: false,
        message: "Suggested product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Quantity updated successfully",
      data: suggestedProduct,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Delete Suggested Product
export const deleteSuggestedProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const suggestedProduct = await suggestedProductModal.findById(id).populate("product");

    if (!suggestedProduct) {
      return res.status(404).json({
        success: false,
        message: "Suggested product not found",
      });
    }

    // Log product removal
    await createProjectLog(
      suggestedProduct.project,
      req.user._id,
      "product_removed_from_suggestions",
      `Product "${suggestedProduct.product?.name || 'Unknown'}" removed from suggestions`,
      { productId: suggestedProduct.product?._id, productName: suggestedProduct.product?.name }
    );

    await suggestedProductModal.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Suggested product removed successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Update Suggested Product Price
export const updateSuggestedPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const { suggestedPrice } = req.body;

    if (suggestedPrice !== null && suggestedPrice !== undefined && suggestedPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Suggested price cannot be negative",
      });
    }

    const suggestedProduct = await suggestedProductModal
      .findByIdAndUpdate(
        id,
        { suggestedPrice: suggestedPrice === "" ? null : suggestedPrice },
        { new: true }
      )
      .populate("product");

    if (!suggestedProduct) {
      return res.status(404).json({
        success: false,
        message: "Suggested product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Suggested price updated successfully",
      data: suggestedProduct,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Update Suggested Product Label
export const updateSuggestedLabel = async (req, res) => {
  try {
    const { id } = req.params;
    const { label } = req.body;

    const suggestedProduct = await suggestedProductModal
      .findByIdAndUpdate(
        id,
        { label: label || "" },
        { new: true }
      )
      .populate("product");

    if (!suggestedProduct) {
      return res.status(404).json({
        success: false,
        message: "Suggested product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Label updated successfully",
      data: suggestedProduct,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
