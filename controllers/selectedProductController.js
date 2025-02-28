import selectedProductsModel from "../models/selectedProductsModel.js";

// Create Selected Products
export const createSelectedProducts = async (req, res) => {
  try {
    const { user, products, project } = req.body;

    if (!user || !products || !project) {
      return res
        .status(400)
        .json({ message: "Please provide all required fields" });
    }

    const existingProject = await selectedProductsModel
      .findOne({ project: project })
      .populate("products");

    if (existingProject) {
      const existingProductIds = new Set(
        existingProject.products.map((prod) => prod._id.toString())
      );

      const newProducts = products.filter(
        (prod) => !existingProductIds.has(prod.toString())
      );

      if (newProducts.length > 0) {
        await selectedProductsModel.updateOne(
          { project },
          { $push: { products: { $each: newProducts } } }
        );

        return res.status(200).json({
          success: true,
          message: "Products added successfully",
        });
      } else {
        return res.status(200).json({
          success: true,
          message:
            "No new products added. All products already exist in the project.",
        });
      }
    } else {
      await selectedProductsModel.create({ user, products, project });

      return res.status(201).json({
        success: true,
        message: "New project created and products added successfully",
      });
    }
  } catch (error) {
    console.error("Error adding products:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// testing
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
      .findOne({
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
