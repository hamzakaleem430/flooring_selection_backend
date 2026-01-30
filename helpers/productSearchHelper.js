import productModel from "../models/productModel.js";

/**
 * Search products from database based on user requirements
 * @param {Object} searchCriteria - Search parameters
 * @param {string} searchCriteria.keyword - Search keyword (searches in name, description, brand, category)
 * @param {string} searchCriteria.category - Filter by category
 * @param {string} searchCriteria.brand - Filter by brand
 * @param {string} searchCriteria.seriesName - Filter by series name
 * @param {number} searchCriteria.minPrice - Minimum price
 * @param {number} searchCriteria.maxPrice - Maximum price
 * @param {number} searchCriteria.limit - Maximum number of results (default: 10)
 * @returns {Promise<Array>} Array of matching products
 */
export const searchProducts = async (searchCriteria = {}) => {
  try {
    const {
      keyword,
      category,
      brand,
      seriesName,
      minPrice,
      maxPrice,
      limit = 10,
    } = searchCriteria;

    // Build query
    const query = {
      isActive: true,
    };

    // Keyword search (searches in multiple fields)
    if (keyword) {
      query.$or = [
        { name: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
        { brand: { $regex: keyword, $options: "i" } },
        { category: { $regex: keyword, $options: "i" } },
        { seriesName: { $regex: keyword, $options: "i" } },
      ];
    }

    // Category filter
    if (category) {
      query.category = { $regex: category, $options: "i" };
    }

    // Brand filter
    if (brand) {
      query.brand = { $regex: brand, $options: "i" };
    }

    // Series name filter
    if (seriesName) {
      query.seriesName = { $regex: seriesName, $options: "i" };
    }

    // Price range filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice !== undefined) {
        query.price.$gte = minPrice;
      }
      if (maxPrice !== undefined) {
        query.price.$lte = maxPrice;
      }
    }

    // Execute query
    const products = await productModel
      .find(query)
      .populate("user", "name email profileImage")
      .select("-__v")
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    return products.map((product) => ({
      _id: product._id,
      name: product.name,
      description: product.description,
      price: product.price,
      sellingPrice: product.sellingPrice || product.price,
      cost: product.cost,
      images: product.images,
      brand: product.brand,
      category: product.category,
      seriesName: product.seriesName,
      variations: product.variations,
      qr_code: product.qr_code,
      qr_code_image: product.qr_code_image,
      user: product.user,
      createdAt: product.createdAt,
    }));
  } catch (error) {
    console.error("Error searching products:", error);
    return [];
  }
};

/**
 * Get products by category with intelligent matching
 * @param {string} categoryKeyword - Category keyword (e.g., "vinyl", "laminate", "hardwood", "tile")
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>} Array of products
 */
export const getProductsByCategory = async (categoryKeyword, limit = 10) => {
  try {
    const categoryMap = {
      vinyl: ["vinyl", "lvp", "luxury vinyl", "luxury vinyl plank"],
      laminate: ["laminate", "laminate flooring"],
      hardwood: ["hardwood", "wood", "engineered wood"],
      tile: ["tile", "ceramic", "porcelain", "stone tile"],
      carpet: ["carpet", "rug"],
    };

    // Find matching category keywords
    const lowerKeyword = categoryKeyword.toLowerCase();
    let matchedCategory = null;

    for (const [cat, keywords] of Object.entries(categoryMap)) {
      if (keywords.some((kw) => lowerKeyword.includes(kw))) {
        matchedCategory = cat;
        break;
      }
    }

    const query = {
      isActive: true,
      $or: [
        { category: { $regex: categoryKeyword, $options: "i" } },
        { name: { $regex: categoryKeyword, $options: "i" } },
        { description: { $regex: categoryKeyword, $options: "i" } },
      ],
    };

    if (matchedCategory) {
      query.$or.push({ category: { $regex: matchedCategory, $options: "i" } });
    }

    const products = await productModel
      .find(query)
      .populate("user", "name email profileImage")
      .select("-__v")
      .limit(limit)
      .sort({ createdAt: -1 });

    return products.map((product) => ({
      _id: product._id,
      name: product.name,
      description: product.description,
      price: product.price,
      sellingPrice: product.sellingPrice || product.price,
      cost: product.cost,
      images: product.images,
      brand: product.brand,
      category: product.category,
      seriesName: product.seriesName,
      variations: product.variations,
      qr_code: product.qr_code,
      qr_code_image: product.qr_code_image,
      user: product.user,
      createdAt: product.createdAt,
    }));
  } catch (error) {
    console.error("Error getting products by category:", error);
    return [];
  }
};

/**
 * Get products by brand
 * @param {string} brandName - Brand name
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>} Array of products
 */
export const getProductsByBrand = async (brandName, limit = 10) => {
  try {
    const products = await productModel
      .find({
        isActive: true,
        brand: { $regex: brandName, $options: "i" },
      })
      .populate("user", "name email profileImage")
      .select("-__v")
      .limit(limit)
      .sort({ createdAt: -1 });

    return products.map((product) => ({
      _id: product._id,
      name: product.name,
      description: product.description,
      price: product.price,
      sellingPrice: product.sellingPrice || product.price,
      cost: product.cost,
      images: product.images,
      brand: product.brand,
      category: product.category,
      seriesName: product.seriesName,
      variations: product.variations,
      qr_code: product.qr_code,
      qr_code_image: product.qr_code_image,
      user: product.user,
      createdAt: product.createdAt,
    }));
  } catch (error) {
    console.error("Error getting products by brand:", error);
    return [];
  }
};
