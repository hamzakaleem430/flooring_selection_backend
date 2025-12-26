import selectedProductsModel from "../models/selectedProductsModel.js";
import productModel from "../models/productModel.js";

// Create Selected Products
export const createSelectedProducts = async (req, res) => {
  try {
    const { user, products, project, quantity, suggestedPrice, label } = req.body;

    if (!user || !products || !project) {
      return res
        .status(400)
        .json({ message: "Please provide all required fields" });
    }

    // Validate that all products are active
    const productDocs = await productModel.find({ _id: { $in: products } });
    const deactivatedProducts = productDocs.filter(p => p.isActive === false);
    
    if (deactivatedProducts.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot add deactivated products to selected list. Some products may be out of stock.",
        deactivatedProducts: deactivatedProducts.map(p => p.name),
      });
    }

    let existingProject = await selectedProductsModel
      .findOne({ project: project });

    if (existingProject) {
      // Handle backward compatibility: Check if products array has old format
      if (existingProject.products && existingProject.products.length > 0) {
        const firstProduct = existingProject.products[0];
        
        // Old format: products is array of ObjectIds (no nested 'product' field)
        if (!firstProduct.product && !firstProduct.quantity) {
          console.log('Migrating old format selected products to new format...');
          // Migrate to new format
          const oldProducts = existingProject.products;
          existingProject.products = oldProducts.map(productId => ({
            product: productId,
            quantity: 1
          }));
          await existingProject.save();
          console.log('Migration complete for project:', project);
        }
      }

      // Now populate
      existingProject = await selectedProductsModel
        .findById(existingProject._id)
        .populate("products.product");

      const existingProductIds = new Set(
        existingProject.products.map((item) => {
          const prodId = item.product?._id || item.product;
          return prodId ? prodId.toString() : null;
        }).filter(id => id !== null)
      );

      // Convert products array to objects with quantity, suggestedPrice, and label
      const productsToAdd = products
        .filter((prodId) => !existingProductIds.has(prodId.toString()))
        .map((prodId) => ({
          product: prodId,
          quantity: quantity || 1,
          suggestedPrice: suggestedPrice || null,
          label: label || "",
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
        suggestedPrice: suggestedPrice || null,
        label: label || "",
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
    let selectedProductsList = await selectedProductsModel
      .find({
        user: userId,
      })
      .populate("user", "name email profileImage ratings")
      .populate("project");

    // Handle backward compatibility for each document
    for (let i = 0; i < selectedProductsList.length; i++) {
      let doc = selectedProductsList[i];
      
      if (doc.products && doc.products.length > 0) {
        const firstProduct = doc.products[0];
        
        // Old format: products is array of ObjectIds (no nested 'product' field)
        if (!firstProduct.product && !firstProduct.quantity) {
          console.log('Migrating old format selected products to new format for user:', userId);
          // Migrate to new format
          const oldProducts = doc.products;
          doc.products = oldProducts.map(productId => ({
            product: productId,
            quantity: 1
          }));
          await doc.save();
        }
      }
    }

    // Re-fetch with proper population
    selectedProductsList = await selectedProductsModel
      .find({
        user: userId,
      })
      .populate("products.product")
      .populate("user", "name email profileImage ratings")
      .populate("project");

    res.status(200).json({
      success: true,
      message: "All selected products fetched successfully",
      products: selectedProductsList,
    });
  } catch (error) {
    console.error("Error in getAllSelectedProductsByUser:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get All Selected Products - Dealer
export const getAllSelectedProductsByDealer = async (req, res) => {
  try {
    const projectId = req.params.id;
    let selectedProducts = await selectedProductsModel
      .findOne({
        project: projectId,
      })
      .populate("user", "name email profileImage ratings")
      .populate("project");

    if (!selectedProducts) {
      return res.status(200).json({
        success: true,
        products: null,
      });
    }

    // Handle backward compatibility: Check if products array has old format (direct IDs) or new format (objects)
    if (selectedProducts.products && selectedProducts.products.length > 0) {
      const firstProduct = selectedProducts.products[0];
      
      // Old format: products is array of ObjectIds (no nested 'product' field)
      if (!firstProduct.product && !firstProduct.quantity) {
        console.log('Migrating old format selected products to new format for project:', projectId);
        // Migrate to new format
        const oldProducts = selectedProducts.products;
        selectedProducts.products = oldProducts.map(productId => ({
          product: productId,
          quantity: 1
        }));
        await selectedProducts.save();
        console.log('Migration complete');
      }
    }

    // Now populate with the correct path
    selectedProducts = await selectedProductsModel
      .findById(selectedProducts._id)
      .populate("products.product")
      .populate("user", "name email profileImage ratings")
      .populate("project");

    res.status(200).json({
      success: true,
      products: selectedProducts,
    });
  } catch (error) {
    console.error("Error in getAllSelectedProductsByDealer:", error);
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

// Remove Product from Selected List
export const removeSelectedProduct = async (req, res) => {
  try {
    const { projectId, productId } = req.params;

    let selectedProducts = await selectedProductsModel.findOne({
      project: projectId,
    });

    if (!selectedProducts) {
      return res.status(404).json({
        success: false,
        message: "Selected products not found",
      });
    }

    // Handle backward compatibility first
    if (selectedProducts.products && selectedProducts.products.length > 0) {
      const firstProduct = selectedProducts.products[0];
      
      // Old format: products is array of ObjectIds (no nested 'product' field)
      if (!firstProduct.product && !firstProduct.quantity) {
        console.log('Migrating old format before removing product...');
        // Migrate to new format
        const oldProducts = selectedProducts.products;
        selectedProducts.products = oldProducts.map(prodId => ({
          product: prodId,
          quantity: 1
        }));
        await selectedProducts.save();
      }
    }

    // Remove the product from the array (with null check)
    selectedProducts.products = selectedProducts.products.filter(
      (item) => item && item.product && item.product.toString() !== productId
    );

    await selectedProducts.save();

    // Re-fetch with proper population
    selectedProducts = await selectedProductsModel
      .findById(selectedProducts._id)
      .populate("products.product")
      .populate("user", "name email profileImage ratings")
      .populate("project");

    res.status(200).json({
      success: true,
      message: "Product removed from selected list",
      products: selectedProducts,
    });
  } catch (error) {
    console.error("Error in removeSelectedProduct:", error);
    res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};

// Update Selected Product Suggested Price
export const updateSelectedProductSuggestedPrice = async (req, res) => {
  try {
    const { projectId, productId } = req.params;
    const { suggestedPrice } = req.body;

    if (suggestedPrice !== null && suggestedPrice !== undefined && suggestedPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Suggested price cannot be negative",
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
      (item) => item && item.product && item.product.toString() === productId
    );

    if (productIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Product not found in selected list",
      });
    }

    selectedProducts.products[productIndex].suggestedPrice = suggestedPrice === "" ? null : suggestedPrice;
    await selectedProducts.save();

    await selectedProducts.populate("products.product");

    res.status(200).json({
      success: true,
      message: "Suggested price updated successfully",
      products: selectedProducts,
    });
  } catch (error) {
    console.error("Error in updateSelectedProductSuggestedPrice:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Update Selected Product Label
export const updateSelectedProductLabel = async (req, res) => {
  try {
    const { projectId, productId } = req.params;
    const { label } = req.body;

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
      (item) => item && item.product && item.product.toString() === productId
    );

    if (productIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Product not found in selected list",
      });
    }

    selectedProducts.products[productIndex].label = label || "";
    await selectedProducts.save();

    await selectedProducts.populate("products.product");

    res.status(200).json({
      success: true,
      message: "Label updated successfully",
      products: selectedProducts,
    });
  } catch (error) {
    console.error("Error in updateSelectedProductLabel:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
