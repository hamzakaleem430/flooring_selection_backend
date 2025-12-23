import suggestedProductModal from "../models/suggestedProductModal.js";

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

    const suggestedProduct = await suggestedProductModal.findByIdAndDelete(id);

    if (!suggestedProduct) {
      return res.status(404).json({
        success: false,
        message: "Suggested product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Suggested product removed successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
