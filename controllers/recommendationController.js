import OpenAI from "openai";
import dotenv from "dotenv";
import recommendationModel from "../models/recommendationModel.js";
import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { StateGraph, END } from "@langchain/langgraph";
import {
  searchProducts,
  getProductsByCategory,
  getProductsByBrand,
} from "../helpers/productSearchHelper.js";

dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY || process.env.OPENAI_API_KEY,
});

// Valid retailer links mapping - VERIFIED WORKING URLs (searched and confirmed)
const VALID_PRODUCT_LINKS = {
  // Home Depot - ONLY category pages (NO /s/ search URLs - they get blocked)
  homeDepot: {
    main: "https://www.homedepot.com/b/Flooring/N-5yc1vZaq7r",
    lvp: "https://www.homedepot.com/b/Flooring-Vinyl-Flooring-Vinyl-Plank-Flooring/N-5yc1vZbzjz",
    vinyl: "https://www.homedepot.com/b/Flooring-Vinyl-Flooring-Vinyl-Plank-Flooring/N-5yc1vZbzjz",
    laminate: "https://www.homedepot.com/b/Flooring-Laminate-Flooring/N-5yc1vZare1",
    hardwood: "https://www.homedepot.com/b/Flooring-Hardwood-Flooring/N-5yc1vZaq8x",
    tile: "https://www.homedepot.com/b/Flooring-Tile/N-5yc1vZar0y",
  },
  // Lowe's - verified category pages
  lowes: {
    main: "https://www.lowes.com/c/Flooring",
    lvp: "https://www.lowes.com/pl/vinyl-flooring/vinyl-plank/4294608591",
    vinyl: "https://www.lowes.com/c/Vinyl-flooring-Flooring",
    laminate: "https://www.lowes.com/c/Laminate-Flooring",
    hardwood: "https://www.lowes.com/pl/flooring/wood/4294934373-4294965554",
    tile: "https://www.lowes.com/pl/flooring/tile/4294934373-4294965418",
  },
  // Floor & Decor - verified URLs
  floorAndDecor: {
    main: "https://www.flooranddecor.com/",
    lvp: "https://www.flooranddecor.com/luxury-vinyl-plank-and-tile",
    vinyl: "https://www.flooranddecor.com/vinyl",
    laminate: "https://www.flooranddecor.com/laminate-flooring",
    hardwood: "https://www.flooranddecor.com/hardwood-flooring",
    tile: "https://www.flooranddecor.com/tile",
    waterproof: "https://www.flooranddecor.com/waterproof",
  },
  // Wayfair - verified URLs
  wayfair: {
    main: "https://www.wayfair.com/home-improvement/cat/flooring-c215832.html",
    lvp: "https://www.wayfair.com/home-improvement/sb1/plank-vinyl-flooring-c431626-a151129~494673.html",
    vinyl: "https://www.wayfair.com/home-improvement/sb0/vinyl-flooring-c431626.html",
    laminate: "https://www.wayfair.com/home-improvement/sb0/laminate-flooring-c218242.html",
    hardwood: "https://www.wayfair.com/home-improvement/cat/flooring-c215832.html",
    tile: "https://www.wayfair.com/home-improvement/cat/flooring-c215832.html",
  },
};

// Helper function to detect flooring category from URL or text
const detectFlooringCategory = (text) => {
  const lowerText = text.toLowerCase();
  if (lowerText.includes("vinyl") || lowerText.includes("lvp") || lowerText.includes("luxury")) {
    return "lvp";
  } else if (lowerText.includes("laminate")) {
    return "laminate";
  } else if (lowerText.includes("hardwood") || lowerText.includes("wood")) {
    return "hardwood";
  } else if (lowerText.includes("tile") || lowerText.includes("ceramic") || lowerText.includes("porcelain")) {
    return "tile";
  }
  return "main";
};

// Helper function to fix broken/invalid links in AI response
const fixProductLinks = (response) => {
  let fixedResponse = response;

  // Fix Home Depot /s/ search URLs (these get blocked with Access Denied)
  const homeDepotSearchPattern = /https?:\/\/(?:www\.)?homedepot\.com\/s\/[^\s\)"\]>]+/gi;
  fixedResponse = fixedResponse.replace(homeDepotSearchPattern, (match) => {
    const category = detectFlooringCategory(match);
    return VALID_PRODUCT_LINKS.homeDepot[category] || VALID_PRODUCT_LINKS.homeDepot.main;
  });

  // Fix ALL Home Depot /b/ URLs with potentially wrong N- codes (replace with verified ones)
  const homeDepotCategoryPattern = /https?:\/\/(?:www\.)?homedepot\.com\/b\/[^\s\)"\]>]+/gi;
  fixedResponse = fixedResponse.replace(homeDepotCategoryPattern, (match) => {
   
    const goodCodes = ["N-5yc1vZbzjz", "N-5yc1vZare1", "N-5yc1vZaq8x", "N-5yc1vZar0y", "N-5yc1vZaq7r"];
    const hasGoodCode = goodCodes.some((code) => match.includes(code));
    if (hasGoodCode) {
      return match; 
    }
    // Replace bad URLs based on detected category
    const category = detectFlooringCategory(match);
    return VALID_PRODUCT_LINKS.homeDepot[category] || VALID_PRODUCT_LINKS.homeDepot.main;
  });

  // Fix broken Lowe's URLs with old category IDs
  const lowesOldPattern = /https?:\/\/(?:www\.)?lowes\.com\/pl\/[^\s\)"\]>]*4294858[0-9]+[^\s\)"\]>]*/gi;
  fixedResponse = fixedResponse.replace(lowesOldPattern, (match) => {
    const category = detectFlooringCategory(match);
    return VALID_PRODUCT_LINKS.lowes[category] || VALID_PRODUCT_LINKS.lowes.main;
  });

  // Fix Lowe's /c/ URLs that might be wrong
  const lowesCPattern = /https?:\/\/(?:www\.)?lowes\.com\/c\/[^\s\)"\]>]+/gi;
  fixedResponse = fixedResponse.replace(lowesCPattern, (match) => {
    // Keep known good patterns
    if (match.includes("Flooring") || match.includes("flooring") || match.includes("Laminate") || match.includes("Vinyl")) {
      return match;
    }
    const category = detectFlooringCategory(match);
    return VALID_PRODUCT_LINKS.lowes[category] || VALID_PRODUCT_LINKS.lowes.main;
  });

  // Fix Floor & Decor URLs with typos or wrong paths
  const floorDecorPattern = /https?:\/\/(?:www\.)?flooranddecor\.com\/[^\s\)"\]>]+/gi;
  fixedResponse = fixedResponse.replace(floorDecorPattern, (match) => {
    // Check for common typos/wrong paths
    if (match.includes("luxury-vinyl-plank-and-tile-floor")) {
      return VALID_PRODUCT_LINKS.floorAndDecor.lvp; 
    }
    if (match.includes("vinyl-flooring")) {
      return VALID_PRODUCT_LINKS.floorAndDecor.vinyl;
    }
    // Keep URLs that look correct
    const validPaths = ["/luxury-vinyl-plank-and-tile", "/vinyl", "/laminate-flooring", "/hardwood-flooring", "/tile", "/waterproof"];
    if (validPaths.some((path) => match.includes(path))) {
      return match;
    }
    const category = detectFlooringCategory(match);
    return VALID_PRODUCT_LINKS.floorAndDecor[category] || VALID_PRODUCT_LINKS.floorAndDecor.main;
  });

  // Fix example.com placeholder links
  const examplePattern = /https?:\/\/(?:www\.)?example\.com[^\s\)"\]>]*/gi;
  fixedResponse = fixedResponse.replace(examplePattern, VALID_PRODUCT_LINKS.floorAndDecor.main);

  // Fix placeholder text links
  const placeholderPattern = /\[(?:product[- ]?link|link|url|click here|insert link)\]/gi;
  fixedResponse = fixedResponse.replace(placeholderPattern, VALID_PRODUCT_LINKS.floorAndDecor.main);

  return fixedResponse;
};

// System prompts for different roles
const INTERIOR_DESIGN_SYSTEM_PROMPT = `You are an expert interior designer and flooring consultant with deep knowledge of residential and commercial flooring, room aesthetics, lighting, color theory, and space planning.

## CRITICAL INSTRUCTION - ALWAYS PROVIDE RECOMMENDATIONS IMMEDIATELY

**DO NOT ask the user multiple questions before giving recommendations.**
**ALWAYS provide recommendations in your FIRST response.**

When a user sends a message (with or without an image):
1. If an image is provided: Analyze it and provide recommendations IMMEDIATELY
2. If no image: Make reasonable assumptions based on their description and provide recommendations IMMEDIATELY
3. NEVER respond with only questions - always include actionable recommendations

You may ask 1-2 brief clarifying questions AT THE END of your response AFTER providing initial recommendations.

## Analysis Guidelines

### 1. Image Analysis (When Image Provided)
Quickly analyze the room image and identify:
- Room type (bedroom, living room, kitchen, office, etc.)
- Room size estimation (small, medium, large)
- Existing floor type and condition
- Wall colors, furniture style, and overall theme
- Any visible constraints

### 2. Making Assumptions (When Details Missing)
**Instead of asking questions, make reasonable assumptions and state them:**
- "Based on what I can see, this appears to be a medium-sized bedroom..."
- "Assuming a mid-range budget..."
- "Given the modern furniture style visible..."

Then proceed with recommendations based on those assumptions.

## Recommendation Strategy

### 3. Flooring Recommendations
Provide:
- 2–4 suitable flooring options ranked by best fit
- Explain WHY each option works for this specific room and user need
- Mention:
  - Material type (vinyl, laminate, SPC, hardwood, ceramic, marble, etc.)
  - Color suggestions
  - Texture/finish (matte, glossy, wood-grain, stone-look)
  - Pros & cons (durability, maintenance, cost level)

### 4. Room Redesign Suggestions
Include optional but valuable enhancements:
- Wall color or wallpaper suggestions
- Furniture or rug compatibility
- Lighting improvements
- Room spacing or visual balance tips

## Product Database Integration

**IMPORTANT: You have access to a product database with real flooring products. Use the available tools to search for products:**

1. **search_products_from_database** - Search products by keyword, category, brand, price range
2. **get_products_by_category** - Get products from specific categories (vinyl, laminate, hardwood, tile)
3. **get_products_by_brand** - Get products from specific brands (Shaw, Mohawk, Pergo, etc.)

**When recommending products:**
- ALWAYS use the product search tools to find actual products from the database
- Include product details: name, brand, price, description, images
- Reference products by their actual names and IDs from the database
- If no products match, provide general recommendations with external links

## Product References - USE ONLY THESE EXACT VERIFIED LINKS

**CRITICAL: Copy these URLs exactly - do NOT modify or create your own URLs**

**Home Depot (NEVER use /s/ search URLs - they cause Access Denied errors):**
- Vinyl Plank: https://www.homedepot.com/b/Flooring-Vinyl-Flooring-Vinyl-Plank-Flooring/N-5yc1vZbzjz
- Laminate: https://www.homedepot.com/b/Flooring-Laminate-Flooring/N-5yc1vZare1
- Hardwood: https://www.homedepot.com/b/Flooring-Hardwood-Flooring/N-5yc1vZaq8x
- Tile: https://www.homedepot.com/b/Flooring-Tile/N-5yc1vZar0y
- All Flooring: https://www.homedepot.com/b/Flooring/N-5yc1vZaq7r

**Lowe's:**
- Vinyl Plank: https://www.lowes.com/pl/vinyl-flooring/vinyl-plank/4294608591
- Vinyl Flooring: https://www.lowes.com/c/Vinyl-flooring-Flooring
- Laminate: https://www.lowes.com/c/Laminate-Flooring
- Hardwood: https://www.lowes.com/pl/flooring/wood/4294934373-4294965554
- Tile: https://www.lowes.com/pl/flooring/tile/4294934373-4294965418
- All Flooring: https://www.lowes.com/c/Flooring

**Floor & Decor (most reliable - use these when unsure):**
- Luxury Vinyl: https://www.flooranddecor.com/luxury-vinyl-plank-and-tile
- Vinyl: https://www.flooranddecor.com/vinyl
- Laminate: https://www.flooranddecor.com/laminate-flooring
- Hardwood: https://www.flooranddecor.com/hardwood-flooring
- Tile: https://www.flooranddecor.com/tile
- Waterproof: https://www.flooranddecor.com/waterproof

**Wayfair:**
- Vinyl Plank: https://www.wayfair.com/home-improvement/sb1/plank-vinyl-flooring-c431626-a151129~494673.html
- Vinyl: https://www.wayfair.com/home-improvement/sb0/vinyl-flooring-c431626.html
- Laminate: https://www.wayfair.com/home-improvement/sb0/laminate-flooring-c218242.html
- All Flooring: https://www.wayfair.com/home-improvement/cat/flooring-c215832.html

**ABSOLUTE RULES:**
1. NEVER create Home Depot /s/ search URLs - they cause "Access Denied" errors
2. ONLY use the exact URLs listed above - copy them exactly as shown
3. Do NOT try to create product-specific URLs - use category pages only
4. NEVER use placeholder links like example.com
5. When unsure, use Floor & Decor links - they are the most reliable

**Product Information Requirements:**
- Use real brand names (Shaw, Mohawk, Armstrong, Pergo, Lifeproof, Coretec, Karndean, etc.)
- Provide actual product series/collection names when possible
- Include real product categories and specifications

**Example Format (Using VERIFIED WORKING Links):**
- **Product Name:** Lifeproof Rigid Core Luxury Vinyl Plank Flooring
- **Category:** Luxury Vinyl Plank (LVP)
- **Brand:** Lifeproof (Home Depot exclusive)
- **Reference Link:** [View Vinyl Plank at Home Depot](https://www.homedepot.com/b/Flooring-Vinyl-Flooring-Vinyl-Plank-Flooring/N-5yc1vZbzjz)

- **Product Name:** Pergo XP Laminate Flooring
- **Category:** Laminate Flooring
- **Brand:** Pergo
- **Reference Link:** [View Laminate Flooring at Lowe's](https://www.lowes.com/c/Laminate-Flooring)

- **Product Name:** Shaw Floorte Pro Luxury Vinyl
- **Category:** Luxury Vinyl Plank
- **Brand:** Shaw
- **Reference Link:** [View at Floor & Decor](https://www.flooranddecor.com/luxury-vinyl-plank-and-tile)

**Image Quality Requirements:**
- All referenced product images must be genuine, high-resolution images
- Images should be from official manufacturer websites or major retailer product pages
- Reference images that show actual product samples, not renderings or mockups when possible
- Product images should clearly show color, texture, and finish details

## Output Format - ALWAYS USE THIS STRUCTURE IN FIRST RESPONSE

**Your FIRST response MUST include ALL of these sections with actual recommendations:**

1. **Quick Summary** - Brief overview of your analysis and top recommendation
2. **What I See in Your Room** - Your observations/assumptions about the space
3. **Best Flooring Options (Ranked)** - 2-4 specific flooring recommendations with pros/cons
4. **Design & Decor Suggestions** - Wall colors, furniture, lighting tips
5. **Recommended Products & Reference Links** - Specific products with working URLs
6. **Final Expert Tip** - One actionable piece of advice

**NEVER respond with only questions.** If you need more info, ask 1-2 questions AT THE END after providing recommendations.

## Tone & Constraints
- ALWAYS provide actionable recommendations in EVERY response
- Make reasonable assumptions when details are missing (state your assumptions clearly)
- Be professional, helpful, and easy to understand
- Avoid overly technical jargon unless necessary
- Do NOT claim measurements or prices unless provided
- ALWAYS use real brand names and real product links from major retailers
- Focus on high-level recommendations, not low-level installation steps
- Use markdown formatting for your responses
- Use proper headings (\`#\`, \`##\`, \`###\`) to structure your reply
- Use bullet points (\`-\`, \`*\`) to list items concisely
- Emphasize key points using bold (\`**\`) or italics (\`*\`)
- Include hyperlinks where necessary in \`[text](URL)\` format
- ALL product links MUST be real, working URLs from Home Depot, Lowe's, Wayfair, Floor & Decor, Build.com, or Amazon
- NEVER use placeholder or dummy links
- NEVER ask multiple questions without providing recommendations first`;

const KELSEY_SYSTEM_PROMPT = `You are Kelsey, a Style Access Representative specializing in tile products. You provide accurate, concise, and friendly responses. Don't mention that you are an AI.

## CRITICAL INSTRUCTION - ALWAYS PROVIDE RECOMMENDATIONS IMMEDIATELY

**DO NOT ask multiple questions before giving recommendations.**
**ALWAYS provide tile recommendations in your FIRST response.**

When a user describes their project or uploads an image:
1. Analyze what they need and provide 3-5 tile recommendations IMMEDIATELY
2. Make reasonable assumptions if details are missing (state your assumptions)
3. Include product links to https://style-access.com
4. You may ask 1-2 brief follow-up questions AT THE END, AFTER providing recommendations

## Response Structure (ALWAYS USE THIS)

Your FIRST response MUST include:

### 1. Quick Summary
Brief overview of your understanding and top recommendation

### 2. My Assessment
What you observe/assume about the project (room type, style, usage)

### 3. Recommended Tiles (3-5 options)
For each recommendation include:
- **Product Name** - Brief description
- **Best For:** Why it fits this project
- **Colors/Sizes:** Available options
- **Key Features:** Water absorption, slip resistance, durability
- **Link:** [View Product](https://style-access.com/products/[product-name])

### 4. Design Tips
Brief styling suggestions

### 5. Next Steps (Optional)
1-2 follow-up questions if needed, AFTER providing recommendations

## Making Assumptions
Instead of asking questions first, make reasonable assumptions:
- "Based on your modern bedroom, I'm assuming you want a clean, contemporary look..."
- "For a residential space, I'm recommending mid-range options..."
- "Given the high-traffic area mentioned, durability is prioritized..."

## Tone & Style
- Professional and friendly
- Expert guidance, not servant-like
- Use markdown formatting
- Include hyperlinks in \`[text](URL)\` format
- NEVER respond with only questions - always include recommendations first`;


// Initialize LangChain Chat Model
const apiKey = process.env.OPEN_AI_API_KEY || process.env.OPENAI_API_KEY;
const langchainModel = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.7,
  apiKey: apiKey,
});

// Create LangChain tools for product search
const productSearchTool = new DynamicStructuredTool({
  name: "search_products_from_database",
  description: `Search for flooring products from the database based on user requirements. 
  Use this tool when the user asks for specific product recommendations, mentions product types (vinyl, laminate, hardwood, tile), 
  brands, categories, or price ranges. Returns full product details including images, prices, and specifications.`,
  schema: z.object({
    keyword: z.string().optional().describe("Search keyword for product name, description, or general search"),
    category: z.string().optional().describe("Product category: vinyl, laminate, hardwood, tile, carpet, etc."),
    brand: z.string().optional().describe("Product brand name (e.g., Shaw, Mohawk, Pergo, Lifeproof)"),
    seriesName: z.string().optional().describe("Product series or collection name"),
    minPrice: z.number().optional().describe("Minimum price filter"),
    maxPrice: z.number().optional().describe("Maximum price filter"),
    limit: z.number().optional().default(10).describe("Maximum number of products to return (default: 10)"),
  }),
  func: async ({ keyword, category, brand, seriesName, minPrice, maxPrice, limit }) => {
    try {
      const products = await searchProducts({
        keyword,
        category,
        brand,
        seriesName,
        minPrice,
        maxPrice,
        limit,
      });

      if (products.length === 0) {
        return JSON.stringify({
          message: "No products found matching the criteria",
          products: [],
        });
      }

      // Format products for AI consumption
      const formattedProducts = products.map((product) => ({
        id: product._id.toString(),
        name: product.name,
        description: product.description,
        price: product.price,
        sellingPrice: product.sellingPrice,
        brand: product.brand || "Unknown",
        category: product.category || "Uncategorized",
        seriesName: product.seriesName || null,
        images: product.images || [],
        variations: product.variations || [],
        qrCode: product.qr_code || null,
      }));

      return JSON.stringify({
        message: `Found ${formattedProducts.length} products matching your criteria`,
        products: formattedProducts,
        count: formattedProducts.length,
      });
    } catch (error) {
      console.error("Error in product search tool:", error);
      return JSON.stringify({
        message: "Error searching products",
        products: [],
        error: error.message,
      });
    }
  },
});

const productCategoryTool = new DynamicStructuredTool({
  name: "get_products_by_category",
  description: `Get products from a specific flooring category. Use when user mentions flooring types like vinyl, laminate, hardwood, tile, or carpet.`,
  schema: z.object({
    categoryKeyword: z.string().describe("Category keyword: vinyl, laminate, hardwood, tile, carpet, etc."),
    limit: z.number().optional().default(10).describe("Maximum number of products to return"),
  }),
  func: async ({ categoryKeyword, limit }) => {
    try {
      const products = await getProductsByCategory(categoryKeyword, limit);

      if (products.length === 0) {
        return JSON.stringify({
          message: `No products found in category: ${categoryKeyword}`,
          products: [],
        });
      }

      const formattedProducts = products.map((product) => ({
        id: product._id.toString(),
        name: product.name,
        description: product.description,
        price: product.price,
        sellingPrice: product.sellingPrice,
        brand: product.brand || "Unknown",
        category: product.category || "Uncategorized",
        seriesName: product.seriesName || null,
        images: product.images || [],
        variations: product.variations || [],
      }));

      return JSON.stringify({
        message: `Found ${formattedProducts.length} products in ${categoryKeyword} category`,
        products: formattedProducts,
        count: formattedProducts.length,
      });
    } catch (error) {
      console.error("Error in product category tool:", error);
      return JSON.stringify({
        message: "Error getting products by category",
        products: [],
        error: error.message,
      });
    }
  },
});

const productBrandTool = new DynamicStructuredTool({
  name: "get_products_by_brand",
  description: `Get products from a specific brand. Use when user mentions brand names like Shaw, Mohawk, Pergo, Lifeproof, Coretec, etc.`,
  schema: z.object({
    brandName: z.string().describe("Brand name to search for"),
    limit: z.number().optional().default(10).describe("Maximum number of products to return"),
  }),
  func: async ({ brandName, limit }) => {
    try {
      const products = await getProductsByBrand(brandName, limit);

      if (products.length === 0) {
        return JSON.stringify({
          message: `No products found for brand: ${brandName}`,
          products: [],
        });
      }

      const formattedProducts = products.map((product) => ({
        id: product._id.toString(),
        name: product.name,
        description: product.description,
        price: product.price,
        sellingPrice: product.sellingPrice,
        brand: product.brand || "Unknown",
        category: product.category || "Uncategorized",
        seriesName: product.seriesName || null,
        images: product.images || [],
        variations: product.variations || [],
      }));

      return JSON.stringify({
        message: `Found ${formattedProducts.length} products from ${brandName}`,
        products: formattedProducts,
        count: formattedProducts.length,
      });
    } catch (error) {
      console.error("Error in product brand tool:", error);
      return JSON.stringify({
        message: "Error getting products by brand",
        products: [],
        error: error.message,
      });
    }
  },
});

// Array of available tools
const tools = [productSearchTool, productCategoryTool, productBrandTool];

// LangGraph Workflow for Product Recommendations
// Using a simple state object approach for compatibility
const createRecommendationGraph = () => {
  // Node 1: Analyze User Requirements
  const analyzeRequirements = async (state) => {
    const { userMessage, conversationContext } = state;
    
    const analysisPrompt = `Analyze the following user request and extract key requirements for product recommendations.

User Message: ${userMessage}
${conversationContext ? `Context: ${conversationContext}` : ''}

Extract and return a JSON object with:
- category: flooring type mentioned (vinyl, laminate, hardwood, tile, carpet, or null)
- brand: any brand names mentioned (or null)
- budget: price range if mentioned (min/max or null)
- roomType: type of room (bedroom, kitchen, living room, bathroom, etc. or null)
- preferences: array of key requirements (e.g., ["waterproof", "pet-friendly", "durable"])

Return ONLY valid JSON, no other text.`;

    const model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.3,
      apiKey: apiKey,
    });

    const response = await model.invoke([{ role: "user", content: analysisPrompt }]);
    
    try {
      const requirements = JSON.parse(response.content);
      return {
        requirements: {
          category: requirements.category || null,
          brand: requirements.brand || null,
          budget: requirements.budget || null,
          roomType: requirements.roomType || null,
          preferences: requirements.preferences || [],
        },
      };
    } catch (error) {
      console.error("Error parsing requirements:", error);
      return { requirements: {} };
    }
  };

  // Node 2: Search Products Based on Requirements
  const searchProductsNode = async (state) => {
    const { requirements } = state;
      const allProducts = [];

      try {
        // Search by category if specified
        if (requirements?.category) {
          const categoryProducts = await getProductsByCategory(requirements.category, 10);
          allProducts.push(...categoryProducts);
        }

        // Search by brand if specified
        if (requirements?.brand) {
          const brandProducts = await getProductsByBrand(requirements.brand, 10);
          allProducts.push(...brandProducts);
        }

        // General search if no specific category/brand
        if (!requirements?.category && !requirements?.brand) {
          const searchKeyword = requirements?.preferences?.join(" ") || "";
          const generalProducts = await searchProducts({
            keyword: searchKeyword,
            limit: 15,
          });
          allProducts.push(...generalProducts);
        }

        // Remove duplicates based on product ID
        const uniqueProducts = Array.from(
          new Map(allProducts.map((p) => [p._id.toString(), p])).values()
        );

        // Format products
        const formattedProducts = uniqueProducts.slice(0, 10).map((product) => ({
          id: product._id.toString(),
          name: product.name,
          description: product.description,
          price: product.price,
          sellingPrice: product.sellingPrice || product.price,
          brand: product.brand || "Unknown",
          category: product.category || "Uncategorized",
          seriesName: product.seriesName || null,
          images: product.images || [],
          variations: product.variations || [],
          qrCode: product.qr_code || null,
        }));

        return { searchedProducts: formattedProducts };
    } catch (error) {
      console.error("Error searching products:", error);
      return { searchedProducts: [] };
    }
  };

  // Node 3: Generate AI Recommendations with Products
  const generateRecommendations = async (state) => {
    const { userMessage, conversationContext, requirements, searchedProducts } = state;
      const productsContext = searchedProducts && searchedProducts.length > 0
        ? `\n\n## Available Products from Database:\n${JSON.stringify(searchedProducts.slice(0, 8), null, 2)}`
        : "\n\n## Note: No products found in database. Provide general recommendations.";

      const recommendationPrompt = `You are an expert interior designer. Based on the user's requirements and available products, provide comprehensive recommendations.

User Requirements:
- Category: ${requirements?.category || "Not specified"}
- Brand: ${requirements?.brand || "Not specified"}
- Room Type: ${requirements?.roomType || "Not specified"}
- Preferences: ${requirements?.preferences?.join(", ") || "None specified"}
${conversationContext ? `\nConversation Context: ${conversationContext}` : ""}

User Message: ${userMessage}
${productsContext}

Provide a detailed recommendation that:
1. Analyzes the user's needs
2. Recommends 2-4 flooring options (use products from database if available)
3. Explains why each option fits
4. Includes product details (name, brand, price) from the database
5. Provides design suggestions

Format your response in markdown with clear sections.`;

      const model = new ChatOpenAI({
        modelName: "gpt-4o",
        temperature: 0.7,
        apiKey: apiKey,
      });

    const response = await model.invoke([{ role: "user", content: recommendationPrompt }]);
    
    return { aiAnalysis: response.content };
  };

  // Node 4: Finalize Response with High-Level Results
  const finalizeResponse = async (state) => {
    const { aiAnalysis, searchedProducts, requirements } = state;

    const topProducts = searchedProducts?.slice(0, 5) || [];
    const summary = {
      category: requirements?.category || "General",
      roomType: requirements?.roomType || "Not specified",
      productCount: topProducts.length,
      priceRange: topProducts.length > 0
        ? {
            min: Math.min(...topProducts.map((p) => p.price)),
            max: Math.max(...topProducts.map((p) => p.price)),
          }
        : null,
    };

    return {
      finalResponse: aiAnalysis,
      recommendedProducts: topProducts,
      summary: summary,
    };
  };

  // Build the graph with simple state object
  const workflow = new StateGraph({
    channels: {
      userMessage: { reducer: (x, y) => y ?? x },
      conversationContext: { reducer: (x, y) => y ?? x },
      requirements: { reducer: (x, y) => y ?? x },
      searchedProducts: { reducer: (x, y) => y ?? x },
      aiAnalysis: { reducer: (x, y) => y ?? x },
      finalResponse: { reducer: (x, y) => y ?? x },
      recommendedProducts: { reducer: (x, y) => y ?? x },
      summary: { reducer: (x, y) => y ?? x },
    },
  })
    .addNode("analyze_requirements", analyzeRequirements)
    .addNode("search_products", searchProductsNode)
    .addNode("generate_recommendations", generateRecommendations)
    .addNode("finalize_response", finalizeResponse)
    .addEdge("analyze_requirements", "search_products")
    .addEdge("search_products", "generate_recommendations")
    .addEdge("generate_recommendations", "finalize_response")
    .addEdge("finalize_response", END)
    .setEntryPoint("analyze_requirements");

  return workflow.compile();
};

// Run the LangGraph workflow
const runProductRecommendationWorkflow = async (userMessage, conversationContext = null) => {
  try {
    const graph = createRecommendationGraph();
    const result = await graph.invoke({
      userMessage,
      conversationContext: conversationContext || "",
    });
    return result;
  } catch (error) {
    console.error("Error in recommendation workflow:", error);
    throw error;
  }
};

// Helper function to create prompt based on type and context
const createPrompt = (currentInput, summarizedContext, type) => {
  const systemPrompt =
    type === "style_access" ? KELSEY_SYSTEM_PROMPT : INTERIOR_DESIGN_SYSTEM_PROMPT;

  if (!summarizedContext) {
    // Phase 1: First message
    return {
      system: systemPrompt,
      user: currentInput,
    };
  } else {
    // Phase 2 or beyond: Continue conversation with summarized context
    return {
      system: systemPrompt,
      user: `### Conversation Context\n${summarizedContext}\n\n### Current Interaction\n- **User Input**: ${currentInput}\n\n#### Your Task:\nThoughtfully respond to the user's input while considering the context. Provide tailored recommendations, clarifications, and suggestions in markdown format, ensuring relevance to the user's needs.`,
    };
  }
};

// Helper function to summarize conversation history
const summarizeConversation = async (conversationHistory) => {
  if (conversationHistory.length <= 3) {
    return null; 
  }

  try {
    const summaryPrompt = `Please provide a concise summary of the following conversation, focusing on:
- User's project requirements and preferences
- Key decisions or selections made
- Important context that should be remembered
- Current stage of the consultation

Conversation:
${conversationHistory
  .map((msg) => `${msg.role}: ${msg.content}`)
  .join("\n\n")}

Provide a brief summary (2-3 paragraphs maximum):`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that summarizes conversations concisely.",
        },
        {
          role: "user",
          content: summaryPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error summarizing conversation:", error);
    return null;
  }
};

// Create or update recommendation
export const createRecommendation = async (req, res) => {
  try {
    const {
      message,
      type = "interior_design",
      projectName,
      imageUrl,
      recommendationId,
      metadata,
    } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    let recommendation;
    let conversationHistory = [];

    // Check if we're continuing an existing conversation
    if (recommendationId) {
      recommendation = await recommendationModel.findById(recommendationId);
      if (!recommendation || recommendation.user.toString() !== userId.toString()) {
        return res.status(404).json({
          success: false,
          message: "Recommendation not found or access denied",
        });
      }
      conversationHistory = recommendation.conversationHistory || [];
    } else {
      // Create new recommendation
      recommendation = new recommendationModel({
        user: userId,
        type,
        projectName: projectName || "",
        imageUrl: imageUrl || "",
        metadata: metadata || {},
        conversationHistory: [],
      });
    }

    // Add user message to conversation history
    conversationHistory.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    // Get summarized context if conversation is long
    let summarizedContext = recommendation.summarizedContext;
    if (conversationHistory.length > 10) {
      // Summarize older messages (keep last 5 messages)
      const recentMessages = conversationHistory.slice(-5);
      const olderMessages = conversationHistory.slice(0, -5);
      summarizedContext = await summarizeConversation(olderMessages);
      conversationHistory = recentMessages;
    }

    // Create prompt based on type
    const prompt = createPrompt(message, summarizedContext, type);

    // Prepare messages for OpenAI
    const messages = [
      {
        role: "system",
        content: prompt.system,
      },
    ];

    // Add conversation history (or summarized context + recent messages)
    if (summarizedContext && conversationHistory.length > 1) {
      messages.push({
        role: "user",
        content: `### Conversation Context\n${summarizedContext}\n\n### Recent Messages\n${conversationHistory
          .slice(0, -1)
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join("\n\n")}\n\n### Current User Input\n${message}`,
      });
    } else {
      // Add all conversation history
      conversationHistory.slice(0, -1).forEach((msg) => {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      });
      messages.push({
        role: "user",
        content: message,
      });
    }

    // Call OpenAI API with enhanced instructions for real product links
    const enhancedMessages = [...messages];

    // Always add critical reminders for interior design recommendations
    if (type === "interior_design") {
      enhancedMessages.push({
        role: "system",
        content: `CRITICAL INSTRUCTIONS:

1. PROVIDE RECOMMENDATIONS IMMEDIATELY - Do NOT just ask questions. Give actual flooring recommendations with product links in your response.

2. Make reasonable assumptions if details are missing. State your assumptions clearly, then provide recommendations.

3. Your response MUST include:
   - Quick Summary
   - What I See/Assume about the room
   - 2-4 Flooring Options with pros/cons
   - **Product recommendations from database** - Use the product search tools to find actual products
   - Design suggestions

4. **PRODUCT DATABASE TOOLS** - You have access to search_products_from_database, get_products_by_category, and get_products_by_brand tools. 
   ALWAYS use these tools to find real products from the database when making recommendations.
   Include product details: name, brand, price, description, and images from the database results.

5. USE ONLY THESE VERIFIED LINKS (for external references if database doesn't have products):

HOME DEPOT (NEVER use /s/ search URLs):
- Vinyl Plank: https://www.homedepot.com/b/Flooring-Vinyl-Flooring-Vinyl-Plank-Flooring/N-5yc1vZbzjz
- Laminate: https://www.homedepot.com/b/Flooring-Laminate-Flooring/N-5yc1vZare1
- Hardwood: https://www.homedepot.com/b/Flooring-Hardwood-Flooring/N-5yc1vZaq8x
- Tile: https://www.homedepot.com/b/Flooring-Tile/N-5yc1vZar0y

FLOOR & DECOR (most reliable):
- LVP: https://www.flooranddecor.com/luxury-vinyl-plank-and-tile
- Laminate: https://www.flooranddecor.com/laminate-flooring
- Hardwood: https://www.flooranddecor.com/hardwood-flooring
- Tile: https://www.flooranddecor.com/tile

LOWE'S:
- Vinyl Plank: https://www.lowes.com/pl/vinyl-flooring/vinyl-plank/4294608591
- Laminate: https://www.lowes.com/c/Laminate-Flooring

You may ask 1-2 follow-up questions AT THE END of your response, AFTER providing recommendations.`,
      });
    }

    // Add critical reminders for style_access (Kelsey) recommendations
    if (type === "style_access") {
      enhancedMessages.push({
        role: "system",
        content: `CRITICAL INSTRUCTIONS FOR KELSEY:

1. PROVIDE TILE RECOMMENDATIONS IMMEDIATELY - Do NOT just ask questions first.

2. Your FIRST response MUST include:
   - Quick Summary of the project
   - Your assessment/assumptions about the space
   - 3-5 Tile Recommendations with product details
   - Each recommendation should have: name, description, colors, sizes, key features
   - Links to https://style-access.com products
   - Brief design tips

3. Make reasonable assumptions if details are missing:
   - "Based on your modern bedroom, I'm assuming..."
   - "For a residential project, I recommend..."
   - "Given the style shown, these tiles would complement..."

4. You may ask 1-2 brief follow-up questions AT THE END, AFTER providing recommendations.

NEVER respond with only questions. Always provide tile recommendations first.`,
      });
    }

    // Handle image analysis for both interior_design and style_access types
    let apiMessages = enhancedMessages;
    if (imageUrl) {
      // Modify the last user message to include the image for Vision API
      const lastMessageIndex = apiMessages.length - 1;
      const lastMessage = apiMessages[lastMessageIndex];

      if (lastMessage.role === "user") {
        apiMessages[lastMessageIndex] = {
          role: "user",
          content: [
            {
              type: "text",
              text: lastMessage.content,
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high",
              },
            },
          ],
        };
      }
    }

    // Use LangGraph workflow for product recommendations
    let assistantResponse;
    let recommendedProducts = [];
    let workflowSummary = null;

    try {
      // Run LangGraph workflow to get product recommendations
      const workflowResult = await runProductRecommendationWorkflow(
        message,
        summarizedContext || null
      );

      assistantResponse = workflowResult.finalResponse;
      recommendedProducts = workflowResult.recommendedProducts || [];
      workflowSummary = workflowResult.summary;

      // If workflow didn't return products, try fallback with tools
      if (recommendedProducts.length === 0) {
        console.log("No products from workflow, trying tool-based search...");
        
        // Fallback: Use LangChain tools directly
        const langchainMessages = [];
        for (const msg of apiMessages) {
          if (msg.role === "system") continue;
          if (msg.role === "user") {
            langchainMessages.push({
              role: "user",
              content: Array.isArray(msg.content) ? msg.content : msg.content,
            });
          } else if (msg.role === "assistant") {
            langchainMessages.push({
              role: "assistant",
              content: msg.content,
            });
          }
        }

        const systemMessage = apiMessages.find((m) => m.role === "system");
        if (systemMessage) {
          langchainMessages.unshift({
            role: "system",
            content: systemMessage.content,
          });
        }

        const modelWithTools = langchainModel.bindTools(tools);
        const response = await modelWithTools.invoke(langchainMessages);

        if (response.tool_calls && response.tool_calls.length > 0) {
          for (const toolCall of response.tool_calls) {
            const tool = tools.find((t) => t.name === toolCall.name);
            if (tool) {
              try {
                const result = await tool.invoke(toolCall.args);
                const parsedResult = JSON.parse(result);
                if (parsedResult.products && Array.isArray(parsedResult.products)) {
                  recommendedProducts.push(...parsedResult.products);
                }
              } catch (error) {
                console.error(`Error executing tool ${toolCall.name}:`, error);
              }
            }
          }
        }
      }
    } catch (workflowError) {
      console.error("LangGraph workflow error, falling back to OpenAI:", workflowError);
      // Fallback to direct OpenAI API if workflow fails
      const modelToUse = imageUrl ? "gpt-4o" : (type === "style_access" ? "gpt-4o-mini" : "gpt-4o");
      const completion = await openai.chat.completions.create({
        model: modelToUse,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 2500,
      });
      assistantResponse = completion.choices[0].message.content;
    }

    // Apply link fixing for interior design responses
    if (type === "interior_design") {
      assistantResponse = fixProductLinks(assistantResponse);
    }

    // Add assistant response to conversation history
    conversationHistory.push({
      role: "assistant",
      content: assistantResponse,
      timestamp: new Date(),
    });

    // Update recommendation
    recommendation.conversationHistory = conversationHistory;
    recommendation.summarizedContext = summarizedContext || recommendation.summarizedContext;
    recommendation.recommendations = assistantResponse;
    if (projectName && !recommendation.projectName) {
      recommendation.projectName = projectName;
    }
    if (imageUrl && !recommendation.imageUrl) {
      recommendation.imageUrl = imageUrl;
    }
    if (metadata) {
      recommendation.metadata = { ...recommendation.metadata, ...metadata };
    }

    await recommendation.save();

    return res.status(200).json({
      success: true,
      message: "Recommendation generated successfully",
      data: {
        recommendationId: recommendation._id,
        response: assistantResponse,
        conversationHistory: conversationHistory,
        projectName: recommendation.projectName,
        recommendedProducts: recommendedProducts.length > 0 ? recommendedProducts : undefined,
        summary: workflowSummary || undefined,
      },
    });
  } catch (error) {
    console.error("Error creating recommendation:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating recommendation",
      error: error.message,
    });
  }
};

// Get all recommendations for a user (with pagination)
export const getUserRecommendations = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const {
      type,
      projectName,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const query = { user: userId, isActive: true };
    if (type) {
      query.type = type;
    }
    if (projectName) {
      query.projectName = { $regex: projectName, $options: "i" };
    }

    const [recommendations, totalCount] = await Promise.all([
      recommendationModel
        .find(query)
        .sort({ [sortBy]: sortDirection })
        .select("-conversationHistory -summarizedContext")
        .skip(skip)
        .limit(limitNum),
      recommendationModel.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    return res.status(200).json({
      success: true,
      message: "Recommendations retrieved successfully",
      data: recommendations,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching recommendations",
      error: error.message,
    });
  }
};

// Get single recommendation with full conversation
export const getRecommendation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const recommendation = await recommendationModel.findOne({
      _id: id,
      user: userId,
      isActive: true,
    });

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        message: "Recommendation not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Recommendation retrieved successfully",
      data: recommendation,
    });
  } catch (error) {
    console.error("Error fetching recommendation:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching recommendation",
      error: error.message,
    });
  }
};

// Delete recommendation
export const deleteRecommendation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const recommendation = await recommendationModel.findOneAndUpdate(
      {
        _id: id,
        user: userId,
      },
      {
        isActive: false,
      },
      {
        new: true,
      }
    );

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        message: "Recommendation not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Recommendation deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting recommendation:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting recommendation",
      error: error.message,
    });
  }
};

// Update recommendation (project name, metadata, etc.)
export const updateRecommendation = async (req, res) => {
  try {
    const { id } = req.params;
    const { projectName, metadata, imageUrl } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const updateData = {};
    if (projectName !== undefined) updateData.projectName = projectName;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (metadata) updateData.metadata = metadata;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No update data provided",
      });
    }

    const recommendation = await recommendationModel.findOneAndUpdate(
      {
        _id: id,
        user: userId,
        isActive: true,
      },
      updateData,
      { new: true }
    );

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        message: "Recommendation not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Recommendation updated successfully",
      data: recommendation,
    });
  } catch (error) {
    console.error("Error updating recommendation:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating recommendation",
      error: error.message,
    });
  }
};

// Clear conversation history (start fresh within same recommendation)
export const clearConversationHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const recommendation = await recommendationModel.findOneAndUpdate(
      {
        _id: id,
        user: userId,
        isActive: true,
      },
      {
        conversationHistory: [],
        summarizedContext: null,
        recommendations: "",
      },
      { new: true }
    );

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        message: "Recommendation not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Conversation history cleared successfully",
      data: {
        recommendationId: recommendation._id,
        projectName: recommendation.projectName,
      },
    });
  } catch (error) {
    console.error("Error clearing conversation history:", error);
    return res.status(500).json({
      success: false,
      message: "Error clearing conversation history",
      error: error.message,
    });
  }
};

// Search recommendations by keyword
export const searchRecommendations = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const { keyword, type } = req.query;

    if (!keyword || !keyword.trim()) {
      return res.status(400).json({
        success: false,
        message: "Search keyword is required",
      });
    }

    const query = {
      user: userId,
      isActive: true,
      $or: [
        { projectName: { $regex: keyword, $options: "i" } },
        { recommendations: { $regex: keyword, $options: "i" } },
        { "conversationHistory.content": { $regex: keyword, $options: "i" } },
      ],
    };

    if (type) {
      query.type = type;
    }

    const recommendations = await recommendationModel
      .find(query)
      .sort({ updatedAt: -1 })
      .select("projectName type recommendations createdAt updatedAt")
      .limit(20);

    return res.status(200).json({
      success: true,
      message: "Search completed successfully",
      data: recommendations,
      count: recommendations.length,
    });
  } catch (error) {
    console.error("Error searching recommendations:", error);
    return res.status(500).json({
      success: false,
      message: "Error searching recommendations",
      error: error.message,
    });
  }
};
