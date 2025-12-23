import selectedProductsModel from "../models/selectedProductsModel.js";

// Create Selected Products
export const createSelectedProducts = async (req, res) => {
  try {
    const { user, products, project, quantity } = req.body;

    if (!user || !products || !project) {
      return res
        .status(400)
        .json({ message: "Please provide all required fields" });
    }

    const existingProject = await selectedProductsModel
      .findOne({ project: project })
      .populate("products.product");

    if (existingProject) {
      const existingProductIds = new Set(
        existingProject.products.map((item) => item.product._id.toString())
      );

      // Convert products array to objects with quantity
      const productsToAdd = products
        .filter((prodId) => !existingProductIds.has(prodId.toString()))
        .map((prodId) => ({
          product: prodId,
          quantity: quantity || 1,
        }));

      if (productsToAdd.length > 0) {
        await selectedProductsModel.updateOne(
          { project },
          { $push: { products: { $each: productsToAdd } } }
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
      // Create new with products as objects
      const formattedProducts = products.map((prodId) => ({
        product: prodId,
        quantity: quantity || 1,
      }));

      await selectedProductsModel.create({ 
        user, 
        products: formattedProducts, 
        project 
      });

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
      .populate("products.product")
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
      .populate("products.product")
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

// Update Selected Product Quantity
export const updateSelectedProductQuantity = async (req, res) => {
  try {
    const { projectId, productId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be at least 1",
      });
    }

    const selectedProducts = await selectedProductsModel.findOne({
      project: projectId,
    });

    if (!selectedProducts) {
      return res.status(404).json({
        success: false,
        message: "Selected products not found",
      });
    }

    const productIndex = selectedProducts.products.findIndex(
      (item) => item.product.toString() === productId
    );

    if (productIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Product not found in selected list",
      });
    }

    selectedProducts.products[productIndex].quantity = quantity;
    await selectedProducts.save();

    await selectedProducts.populate("products.product");

    res.status(200).json({
      success: true,
      message: "Quantity updated successfully",
      products: selectedProducts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
