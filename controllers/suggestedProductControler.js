import suggestedProductModal from "../models/suggestedProductModal.js";

// Create a new suggested product
export const createSuggestedProduct = async (req, res) => {
  try {
    const { project, product } = req.body;
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
        });
        suggestedProducts.push(newSuggestedProduct);
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
      .findOne({
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
