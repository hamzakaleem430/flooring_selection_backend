import selectedProductsModel from "../models/selectedProductsModel.js";

// Create Selected Products
export const createSelectedProducts = async (req, res) => {
  try {
    const { user, products, project } = req.body;
    if (!user || !products || !project) {
      return res
        .status(400)
        .json({ message: "Please provide all the required fields" });
    }
    const selectedProducts = await selectedProductsModel.create({
      user,
      products,
      project,
    });

    res.status(200).json({
      success: true,
      message: "Products added successfully",
      products: selectedProducts,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get All Selected Products
export const getAllSelectedProductsByUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const selectedProducts = await selectedProductsModel
      .find({
        user: userId,
      })
      .populate("products")
      .populate("user", "name email profileImage ratings")
      .populate("project");

    res.status(200).json({
      success: true,
      message: "All selected products fetched successfully",
      products: selectedProducts,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get All Selected Products - Dealer
export const getAllSelectedProductsByDealer = async (req, res) => {
  try {
    const projectId = req.params.id;
    const selectedProducts = await selectedProductsModel
      .find({
        project: projectId,
      })
      .populate("products")
      .populate("user", "name email profileImage ratings")
      .populate("project");

    res.status(200).json({
      success: true,
      products: selectedProducts,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};
