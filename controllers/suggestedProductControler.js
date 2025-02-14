import suggestedProductModal from "../models/suggestedProductModal.js";

// Create a new suggested product
export const createSuggestedProduct = async (req, res) => {
  try {
    const { project, product } = req.body;
    const user = req.user._id;
    const suggestedProduct = await suggestedProductModal.create({
      user,
      project,
      product,
    });

    res.status(201).json({
      success: true,
      message: "Suggested product added successfully",
      data: suggestedProduct,
    });
  } catch (error) {
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
