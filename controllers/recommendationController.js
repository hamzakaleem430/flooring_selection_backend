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
import https from "https";
import http from "http";

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

## Product Database Integration - CRITICAL

**YOU MUST ALWAYS SEARCH FOR AND RECOMMEND PRODUCTS FROM THE DATABASE**

You have access to a product database with real flooring products. **ALWAYS use the available tools to search for products:**

1. **search_products_from_database** - Search products by keyword, category, brand, price range
   - Use this when user mentions room types (bedroom, kitchen, etc.), styles, or requirements
   - Search by keywords from user message (e.g., "bedroom", "waterproof", "modern")
   - Search in product name, description, and category fields

2. **get_products_by_category** - Get products from specific categories (vinyl, laminate, hardwood, tile)
   - Use when user mentions flooring types

3. **get_products_by_brand** - Get products from specific brands (Shaw, Mohawk, Pergo, etc.)
   - Use when user mentions brand names

**CRITICAL RULES:**
- **ALWAYS search for products FIRST** before giving recommendations
- **ALWAYS recommend specific products from the database** - never just give general advice
- If user says "bedroom" or uploads a bedroom image, search for products with "bedroom" in name, description, or category
- If user mentions requirements (waterproof, pet-friendly), search for products matching those
- Include product details: name, brand, price, description, images from database
- Reference products by their actual names from the database
- Rank products by how well they match user needs
- If database has products, you MUST recommend them - do not say "no products available"

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

// Helper function to validate image URL accessibility
const validateImageUrl = async (imageUrl) => {
  if (!imageUrl) return { valid: false, error: "No image URL provided" };
  
  try {
    return new Promise((resolve) => {
      const url = new URL(imageUrl);
      const client = url.protocol === "https:" ? https : http;
      
      // For S3 URLs, disable strict SSL checking (common issue with custom S3 domains)
      const options = {
        timeout: 5000,
        rejectUnauthorized: false, // Disable SSL certificate validation for S3 URLs
      };
      
      const request = client.get(url.href, options, (response) => {
        // Check if response is successful and is an image
        if (response.statusCode >= 200 && response.statusCode < 300) {
          const contentType = response.headers["content-type"] || "";
          if (contentType.startsWith("image/")) {
            response.destroy(); // Close the connection
            resolve({ valid: true });
          } else {
            response.destroy();
            resolve({ valid: false, error: "URL does not point to an image" });
          }
        } else {
          response.destroy();
          resolve({ valid: false, error: `HTTP ${response.statusCode}` });
        }
      });
      
      request.on("error", (error) => {
        resolve({ valid: false, error: error.message });
      });
      
      request.on("timeout", () => {
        request.destroy();
        resolve({ valid: false, error: "Request timeout" });
      });
    });
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

// Helper function to convert image URL to base64 (fallback if URL not accessible)
const imageUrlToBase64 = async (imageUrl) => {
  try {
    return new Promise((resolve, reject) => {
      const url = new URL(imageUrl);
      const client = url.protocol === "https:" ? https : http;
      
      // For S3 URLs, disable strict SSL checking
      const options = {
        rejectUnauthorized: false, // Disable SSL certificate validation for S3 URLs
        timeout: 10000,
      };
      
      const request = client.get(url.href, options, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to fetch image: ${response.statusCode}`));
          return;
        }
        
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const base64 = buffer.toString("base64");
          const contentType = response.headers["content-type"] || "image/jpeg";
          resolve(`data:${contentType};base64,${base64}`);
        });
        response.on("error", reject);
      });
      
      request.on("error", reject);
      request.on("timeout", () => {
        request.destroy();
        reject(new Error("Request timeout"));
      });
    });
  } catch (error) {
    throw new Error(`Failed to convert image to base64: ${error.message}`);
  }
};

// LangGraph Workflow for Product Recommendations
// Using a simple state object approach for compatibility
const createRecommendationGraph = () => {
  // Node 1: Analyze User Requirements
  const analyzeRequirements = async (state) => {
    const { userMessage, conversationContext } = state;
    
    const analysisPrompt = `Analyze the following user request and extract key requirements for product recommendations.

User Message: ${userMessage}
${conversationContext ? `Context: ${conversationContext}` : ''}

IMPORTANT: If the user mentions a room type (bedroom, kitchen, living room, bathroom, dining room, office, basement, attic, hallway, entryway), you MUST extract it as roomType.

Extract and return a JSON object with:
- category: flooring type mentioned (vinyl, laminate, hardwood, tile, carpet, or null)
- brand: any brand names mentioned (or null)
- budget: price range if mentioned (min/max or null)
- roomType: type of room mentioned (bedroom, kitchen, living room, bathroom, dining room, office, basement, attic, hallway, entryway, or null). If user says "bedroom" or "bedrooms", set roomType to "bedroom"
- preferences: array of key requirements (e.g., ["waterproof", "pet-friendly", "durable"])

Examples:
- "bedroom" → {"roomType": "bedroom"}
- "I want to redesign bedroom" → {"roomType": "bedroom"}
- "kitchen flooring" → {"roomType": "kitchen", "category": null}

Return ONLY valid JSON, no other text.`;

    const model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.3,
      apiKey: apiKey,
    });

    const response = await model.invoke([{ role: "user", content: analysisPrompt }]);
    
    // Helper function to extract JSON from markdown code blocks or plain text
    const extractJSON = (text) => {
      if (!text) return null;
      
      // Try to find JSON in markdown code blocks (```json ... ```)
      const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonBlockMatch) {
        return jsonBlockMatch[1].trim();
      }
      
      // Try to find JSON object in curly braces
      const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        return jsonObjectMatch[0];
      }
      
      // Return the text as-is if no pattern matches
      return text.trim();
    };
    
    try {
      const jsonString = extractJSON(response.content);
      if (!jsonString) {
        console.error("No JSON found in response");
        return { requirements: {} };
      }
      
      const requirements = JSON.parse(jsonString);
      
      // Fallback: Extract roomType directly from user message if AI didn't extract it
      let roomType = requirements.roomType || null;
      if (!roomType && userMessage) {
        const roomTypes = ['bedroom', 'kitchen', 'living room', 'bathroom', 'dining room', 'office', 'basement', 'attic', 'hallway', 'entryway'];
        const userMessageLower = userMessage.toLowerCase();
        for (const rt of roomTypes) {
          if (userMessageLower.includes(rt)) {
            roomType = rt;
            console.log(`Fallback: Extracted roomType "${rt}" directly from user message`);
            break;
          }
        }
      }
      
      return {
        requirements: {
          category: requirements.category || null,
          brand: requirements.brand || null,
          budget: requirements.budget || null,
          roomType: roomType,
          preferences: requirements.preferences || [],
        },
      };
    } catch (error) {
      console.error("Error parsing requirements:", error);
      console.error("Response content:", response.content);
      return { requirements: {} };
    }
  };

  // Node 2: Search Products Based on Requirements
  const searchProductsNode = async (state) => {
    const { requirements, userMessage } = state;
    const allProducts = [];

    try {
      console.log("Search Products Node - Requirements:", JSON.stringify(requirements));
      console.log("Search Products Node - User Message:", userMessage);
      
      // Build comprehensive search keywords from user message and requirements
      const searchKeywords = [];
      
      // Extract room types and keywords from user message FIRST (before requirements)
      const roomTypes = ['bedroom', 'kitchen', 'living room', 'bathroom', 'dining room', 'office', 'basement', 'attic', 'hallway', 'entryway', 'bedrooms'];
      const userMessageLower = (userMessage || '').toLowerCase().trim();
      
      // Always extract room types from user message directly
      roomTypes.forEach(roomType => {
        if (userMessageLower.includes(roomType) && !searchKeywords.includes(roomType)) {
          searchKeywords.push(roomType);
          console.log(`Found room type in message: ${roomType}`);
        }
      });
      
      // Add room type from requirements if not already added
      if (requirements?.roomType && !searchKeywords.includes(requirements.roomType)) {
        searchKeywords.push(requirements.roomType);
      }
      
      // Add category to search keywords
      if (requirements?.category) {
        searchKeywords.push(requirements.category);
      }
      
      // Add preferences to search keywords
      if (requirements?.preferences && requirements.preferences.length > 0) {
        searchKeywords.push(...requirements.preferences);
      }
      
      // Combine all keywords into a single search string
      const combinedKeyword = searchKeywords.join(' ').trim();
      console.log("Combined search keyword:", combinedKeyword);
      
      // Strategy 1: ALWAYS search with user message keywords if available (highest priority)
      if (userMessage && userMessage.trim().length > 0) {
        // Extract meaningful words from user message
        const commonWords = ['i', 'want', 'to', 'redesign', 'need', 'looking', 'for', 'the', 'a', 'an', 'my', 'me', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must', 'please', 'help', 'show', 'give', 'recommend', 'suggest'];
        const words = userMessageLower.split(/\s+/).filter(word => 
          word.length > 2 && !commonWords.includes(word)
        );
        
        if (words.length > 0) {
          const userMessageKeyword = words.join(' ');
          console.log("Searching with user message keywords:", userMessageKeyword);
          const userMessageProducts = await searchProducts({
            keyword: userMessageKeyword,
            limit: 20,
          });
          console.log(`Found ${userMessageProducts.length} products with user message keywords`);
          allProducts.push(...userMessageProducts);
        }
      }
      
      // Strategy 2: Search by category if specified
      if (requirements?.category) {
        const categoryProducts = await getProductsByCategory(requirements.category, 10);
        console.log(`Found ${categoryProducts.length} products by category`);
        allProducts.push(...categoryProducts);
      }

      // Strategy 3: Search by brand if specified
      if (requirements?.brand) {
        const brandProducts = await getProductsByBrand(requirements.brand, 10);
        console.log(`Found ${brandProducts.length} products by brand`);
        allProducts.push(...brandProducts);
      }

      // Strategy 4: Comprehensive keyword search (searches in name, description, category)
      // This will find products matching room type, preferences, or any keywords
      if (combinedKeyword) {
        console.log("Searching with combined keyword:", combinedKeyword);
        const keywordProducts = await searchProducts({
          keyword: combinedKeyword,
          category: requirements?.category, // Also filter by category if specified
          limit: 15,
        });
        console.log(`Found ${keywordProducts.length} products with combined keyword`);
        allProducts.push(...keywordProducts);
      }
      
      // Strategy 5: If roomType is specified, search specifically for it (even if already in combinedKeyword)
      if (requirements?.roomType) {
        const roomTypeProducts = await searchProducts({
          keyword: requirements.roomType,
          limit: 10,
        });
        console.log(`Found ${roomTypeProducts.length} products with roomType: ${requirements.roomType}`);
        allProducts.push(...roomTypeProducts);
      }
      
      // Strategy 6: Search for each individual room type found in message (await all)
      const roomTypeSearches = [];
      for (const roomType of roomTypes) {
        if (userMessageLower.includes(roomType)) {
          roomTypeSearches.push(
            searchProducts({
              keyword: roomType,
              limit: 10,
            }).then(products => {
              if (products.length > 0) {
                console.log(`Found ${products.length} products for room type: ${roomType}`);
              }
              return products;
            }).catch(err => {
              console.error(`Error searching for ${roomType}:`, err);
              return [];
            })
          );
        }
      }
      
      // Wait for all room type searches to complete
      if (roomTypeSearches.length > 0) {
        const roomTypeResults = await Promise.all(roomTypeSearches);
        roomTypeResults.forEach(products => {
          allProducts.push(...products);
        });
      }

      console.log(`Total products found before deduplication: ${allProducts.length}`);

      // Remove duplicates based on product ID
      const uniqueProducts = Array.from(
        new Map(allProducts.map((p) => [p._id.toString(), p])).values()
      );
      
      console.log(`Unique products after deduplication: ${uniqueProducts.length}`);

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

  // Node 3: Generate AI Recommendations with Products (AI actively searches and recommends)
  const generateRecommendations = async (state) => {
    const { userMessage, conversationContext, requirements, searchedProducts, imageUrl } = state;
    
    // Format products for AI analysis
    const productsContext = searchedProducts && searchedProducts.length > 0
        ? `\n\n## Available Products from Database (${searchedProducts.length} products found):\n${JSON.stringify(searchedProducts.slice(0, 15), null, 2)}\n\nIMPORTANT: You MUST recommend specific products from this list. Include product names, brands, prices, and explain why each product fits the user's needs.`
        : "\n\n## Note: No products found in database. You should still provide general recommendations with material types, colors, and styles that would work.";

    // Build image analysis context if image is provided
    const imageAnalysisContext = imageUrl 
      ? `\n\n## USER UPLOADED IMAGE
The user has uploaded a room image. Analyze this image carefully to understand:
- Room type and size
- Existing flooring/floor condition
- Wall colors and furniture style
- Overall design theme (modern, traditional, rustic, etc.)
- Lighting conditions
- Any visible constraints or requirements

Use this visual information to recommend products that will match the room's aesthetic and functional needs.

Image URL: ${imageUrl}`
      : "";

    const recommendationPrompt = `You are an expert interior designer and flooring consultant. Your task is to analyze the user's requirements ${imageUrl ? 'and uploaded image' : ''} and provide intelligent product recommendations.

## User Information:
${imageAnalysisContext}

## User Requirements Extracted:
- Category: ${requirements?.category || "Not specified (analyze from image/message)"}
- Brand: ${requirements?.brand || "Not specified"}
- Room Type: ${requirements?.roomType || "Not specified (analyze from image/message)"}
- Preferences: ${requirements?.preferences?.join(", ") || "None specified"}
${conversationContext ? `\n## Conversation Context:\n${conversationContext}` : ""}

## User Message:
${userMessage}
${productsContext}

## Your Task:

1. **Analyze Requirements** (from image, message, and extracted requirements):
   - If image provided: Analyze room type, style, colors, size, and existing conditions
   - Identify flooring needs based on room type and usage
   - Determine style preferences (modern, traditional, etc.)
   - Note any specific requirements (waterproof, pet-friendly, etc.)

2. **Intelligently Match Products**:
   - Review ALL products from the database
   - Select the BEST 3-5 products that match the user's needs
   - Rank them by how well they fit (best match first)
   - Explain WHY each product is recommended

3. **Provide Detailed Recommendations**:
   For each recommended product, include:
   - Product Name (from database)
   - Brand
   - Price
   - Why it fits (room type, style, requirements)
   - Key features that match user needs
   - Design tips for using this product

4. **Format Your Response**:
   Use markdown with these sections:
   - ## Quick Summary
   - ## Room Analysis (what you see/understand)
   - ## Recommended Products (3-5 products with details)
   - ## Design Suggestions
   - ## Why These Products Work

**CRITICAL RULES:**
1. **If products are available in the database list above, you MUST recommend them by name**
2. **Do NOT say "no products available" if products are listed above**
3. **Always include product names, brands, and prices from the database**
4. **Explain why each recommended product fits the user's needs**
5. **Rank products by how well they match (best match first)**

**Example Format for Product Recommendations:**
\`\`\`
## Recommended Products

### 1. [Product Name from Database]
- **Brand:** [Brand from database]
- **Price:** $[Price from database]
- **Why it fits:** [Explain based on user's room/image/requirements]
- **Key Features:** [Features that match user needs]

### 2. [Product Name from Database]
- **Brand:** [Brand from database]
- **Price:** $[Price from database]
- **Why it fits:** [Explain]
\`\`\`

Format your response in markdown with clear sections.`;

    // Use GPT-4o with vision if image is provided, otherwise use GPT-4o
    // Bind tools so AI can actively search for more products if needed
    const model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.7,
      apiKey: apiKey,
    });
    
    const modelWithTools = model.bindTools(tools);

    // Prepare messages for vision API if image is provided
    let messagesToSend = [];
    let useImage = false;
    let imageContent = null;
    
    if (imageUrl) {
      try {
        // Validate image URL first
        console.log("Validating image URL:", imageUrl);
        const validation = await validateImageUrl(imageUrl);
        
        if (validation.valid) {
          console.log("Image URL is valid, using it for vision analysis");
          useImage = true;
          imageContent = {
            type: "image_url",
            image_url: {
              url: imageUrl,
              detail: "high",
            },
          };
        } else {
          console.warn("Image URL validation failed:", validation.error);
          // Try to convert to base64 as fallback
          try {
            console.log("Attempting to convert image to base64...");
            const base64Image = await imageUrlToBase64(imageUrl);
            useImage = true;
            imageContent = {
              type: "image_url",
              image_url: {
                url: base64Image,
                detail: "high",
              },
            };
            console.log("Successfully converted image to base64");
          } catch (base64Error) {
            console.error("Failed to convert image to base64:", base64Error.message);
            // Continue without image - user message should be enough
            useImage = false;
          }
        }
      } catch (error) {
        console.error("Error validating image URL:", error);
        // Continue without image
        useImage = false;
      }
    }
    
    // Build messages with or without image
    if (useImage && imageContent) {
      messagesToSend = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: recommendationPrompt,
            },
            imageContent,
          ],
        },
      ];
    } else {
      // If image validation failed, mention it in the prompt but continue
      const promptWithImageNote = imageUrl 
        ? recommendationPrompt + `\n\nNote: An image was provided but could not be analyzed. Please provide recommendations based on the user's message and requirements.`
        : recommendationPrompt;
      messagesToSend = [{ role: "user", content: promptWithImageNote }];
    }

    // Invoke model with tools - AI can search for more products if needed
    let response;
    try {
      response = await modelWithTools.invoke(messagesToSend);
    } catch (visionError) {
      // If vision API fails, retry without image
      if (useImage && (visionError.code === "invalid_image_url" || visionError.message?.includes("image"))) {
        console.warn("Vision API error, retrying without image:", visionError.message);
        const promptWithoutImage = recommendationPrompt + `\n\nNote: Image analysis was not available. Please provide recommendations based on the user's message and requirements.`;
        messagesToSend = [{ role: "user", content: promptWithoutImage }];
        response = await modelWithTools.invoke(messagesToSend);
      } else {
        throw visionError;
      }
    }
    
    // If AI wants to call tools to search for more products, execute them
    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolResults = [];
      for (const toolCall of response.tool_calls) {
        const tool = tools.find((t) => t.name === toolCall.name);
        if (tool) {
          try {
            const result = await tool.invoke(toolCall.args);
            toolResults.push({
              tool_call_id: toolCall.id,
              name: toolCall.name,
              result: result,
            });
            
            // Parse product results and add to searchedProducts if not already there
            try {
              const parsedResult = JSON.parse(result);
              if (parsedResult.products && Array.isArray(parsedResult.products)) {
                // Add new products to the state (they'll be merged in finalizeResponse)
                console.log(`AI found ${parsedResult.products.length} additional products via tool call`);
              }
            } catch (e) {
              // Not JSON, continue
            }
          } catch (error) {
            console.error(`Error executing tool ${toolCall.name}:`, error);
            toolResults.push({
              tool_call_id: toolCall.id,
              name: toolCall.name,
              result: `Error: ${error.message}`,
            });
          }
        }
      }
      
      // Get final response after tool execution
      const followUpMessages = [
        ...messagesToSend,
        response,
        ...toolResults.map((tr) => ({
          role: "tool",
          content: tr.result,
          tool_call_id: tr.tool_call_id,
          name: tr.name,
        })),
      ];
      
      response = await model.invoke(followUpMessages);
    }
    
    return { aiAnalysis: response.content };
  };

  // Node 4: Finalize Response with High-Level Results
  const finalizeResponse = async (state) => {
    const { aiAnalysis, searchedProducts, requirements } = state;

    // Select top products - prioritize products that match requirements
    let topProducts = searchedProducts || [];
    
    // If we have products, rank them by relevance
    if (topProducts.length > 0) {
      // Sort by relevance: products matching roomType, category, or preferences get higher priority
      topProducts = topProducts.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;
        
        // Check roomType match in name, description, or category
        if (requirements?.roomType) {
          const roomTypeLower = requirements.roomType.toLowerCase();
          if (a.name?.toLowerCase().includes(roomTypeLower) || 
              a.description?.toLowerCase().includes(roomTypeLower) ||
              a.category?.toLowerCase().includes(roomTypeLower)) {
            scoreA += 3;
          }
          if (b.name?.toLowerCase().includes(roomTypeLower) || 
              b.description?.toLowerCase().includes(roomTypeLower) ||
              b.category?.toLowerCase().includes(roomTypeLower)) {
            scoreB += 3;
          }
        }
        
        // Check category match
        if (requirements?.category && a.category?.toLowerCase().includes(requirements.category.toLowerCase())) {
          scoreA += 2;
        }
        if (requirements?.category && b.category?.toLowerCase().includes(requirements.category.toLowerCase())) {
          scoreB += 2;
        }
        
        // Prefer products with images
        if (a.images && a.images.length > 0) scoreA += 1;
        if (b.images && b.images.length > 0) scoreB += 1;
        
        return scoreB - scoreA; // Higher score first
      });
    }
    
    // Take top 5-8 products for recommendations
    const recommendedProducts = topProducts.slice(0, 8);
    
    const summary = {
      category: requirements?.category || "General",
      roomType: requirements?.roomType || "Not specified",
      productCount: recommendedProducts.length,
      priceRange: recommendedProducts.length > 0
        ? {
            min: Math.min(...recommendedProducts.map((p) => p.price || 0)),
            max: Math.max(...recommendedProducts.map((p) => p.price || 0)),
          }
        : null,
    };

    return {
      finalResponse: aiAnalysis,
      recommendedProducts: recommendedProducts,
      summary: summary,
    };
  };

  // Build the graph with simple state object
  const workflow = new StateGraph({
    channels: {
      userMessage: { reducer: (x, y) => y ?? x },
      conversationContext: { reducer: (x, y) => y ?? x },
      imageUrl: { reducer: (x, y) => y ?? x },
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
const runProductRecommendationWorkflow = async (userMessage, conversationContext = null, imageUrl = null) => {
  try {
    const graph = createRecommendationGraph();
    const result = await graph.invoke({
      userMessage,
      conversationContext: conversationContext || "",
      imageUrl: imageUrl || "",
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
    let processedImageUrl = imageUrl; // Use a separate variable to avoid const reassignment
    
    if (processedImageUrl) {
      try {
        // Validate image URL before adding to messages
        const validation = await validateImageUrl(processedImageUrl);
        let imageUrlToUse = processedImageUrl;
        
        if (!validation.valid) {
          console.warn("Image URL validation failed, trying base64 conversion:", validation.error);
          try {
            imageUrlToUse = await imageUrlToBase64(processedImageUrl);
            console.log("Successfully converted image to base64 for apiMessages");
          } catch (base64Error) {
            console.error("Failed to convert image to base64:", base64Error.message);
            // Continue without image - don't add it to apiMessages
            processedImageUrl = null;
            imageUrlToUse = null;
          }
        }
        
        // Only add image if we have a valid URL (original or base64)
        if (processedImageUrl && imageUrlToUse) {
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
                    url: imageUrlToUse,
                    detail: "high",
                  },
                },
              ],
            };
          }
        }
      } catch (error) {
        console.error("Error processing image URL for apiMessages:", error);
        // Continue without image
        processedImageUrl = null;
      }
    }

    // Use LangGraph workflow for product recommendations
    let assistantResponse;
    let recommendedProducts = [];
    let workflowSummary = null;

    try {
      // Run LangGraph workflow to get product recommendations (pass imageUrl for analysis)
      const workflowResult = await runProductRecommendationWorkflow(
        message,
        summarizedContext || null,
        imageUrl || null
      );

      assistantResponse = workflowResult.finalResponse;
      recommendedProducts = workflowResult.recommendedProducts || [];
      workflowSummary = workflowResult.summary;
      
      // Ensure products are always returned if found, even if AI didn't mention them
      if (recommendedProducts.length > 0 && !assistantResponse.includes("Recommended Products") && !assistantResponse.includes("Product")) {
        // Add product section to response if AI didn't include it
        const productSection = `\n\n## Recommended Products from Database\n\nI found ${recommendedProducts.length} products that match your requirements:\n\n${recommendedProducts.slice(0, 5).map((product, idx) => 
          `${idx + 1}. **${product.name}** (${product.brand}) - $${product.price?.toFixed(2) || '0.00'}\n   ${product.description ? product.description.substring(0, 100) + '...' : ''}`
        ).join('\n\n')}`;
        
        assistantResponse = assistantResponse + productSection;
        console.log("Added product section to AI response as AI didn't mention products");
      }

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
      // Handle image URL validation for fallback too
      let fallbackMessages = [...apiMessages];
      
      if (imageUrl) {
        try {
          const validation = await validateImageUrl(imageUrl);
          if (!validation.valid) {
            console.warn("Image URL invalid in fallback, trying base64 conversion...");
            try {
              const base64Image = await imageUrlToBase64(imageUrl);
              // Update the last user message to use base64
              const lastMessageIndex = fallbackMessages.length - 1;
              if (fallbackMessages[lastMessageIndex]?.role === "user") {
                const lastMsg = fallbackMessages[lastMessageIndex];
                if (Array.isArray(lastMsg.content)) {
                  // Update image_url to use base64
                  const imageIndex = lastMsg.content.findIndex(item => item.type === "image_url");
                  if (imageIndex !== -1) {
                    fallbackMessages[lastMessageIndex].content[imageIndex].image_url.url = base64Image;
                  }
                }
              }
            } catch (base64Error) {
              console.error("Base64 conversion failed in fallback:", base64Error);
              // Remove image from messages and continue
              const lastMessageIndex = fallbackMessages.length - 1;
              if (fallbackMessages[lastMessageIndex]?.role === "user") {
                const lastMsg = fallbackMessages[lastMessageIndex];
                if (Array.isArray(lastMsg.content)) {
                  fallbackMessages[lastMessageIndex].content = lastMsg.content.filter(
                    item => item.type !== "image_url"
                  );
                  // Add note about image
                  if (fallbackMessages[lastMessageIndex].content.length > 0) {
                    fallbackMessages[lastMessageIndex].content[0].text += 
                      "\n\nNote: Image analysis was not available. Please provide recommendations based on the user's message.";
                  }
                }
              }
            }
          }
        } catch (validationError) {
          console.error("Image validation error in fallback:", validationError);
          // Continue without image
        }
      }
      
      const modelToUse = imageUrl ? "gpt-4o" : (type === "style_access" ? "gpt-4o-mini" : "gpt-4o");
      
      try {
        const completion = await openai.chat.completions.create({
          model: modelToUse,
          messages: fallbackMessages,
          temperature: 0.7,
          max_tokens: 2500,
        });
        assistantResponse = completion.choices[0].message.content;
      } catch (openaiError) {
        // If still fails with image, retry without image
        if (imageUrl && (openaiError.code === "invalid_image_url" || openaiError.message?.includes("image"))) {
          console.warn("OpenAI API error with image, retrying without image...");
          const messagesWithoutImage = fallbackMessages.map(msg => {
            if (msg.role === "user" && Array.isArray(msg.content)) {
              return {
                ...msg,
                content: msg.content.filter(item => item.type !== "image_url").map(item => 
                  item.type === "text" ? { ...item, text: item.text + "\n\nNote: Image analysis was not available." } : item
                ),
              };
            }
            return msg;
          });
          
          const completion = await openai.chat.completions.create({
            model: modelToUse,
            messages: messagesWithoutImage,
            temperature: 0.7,
            max_tokens: 2500,
          });
          assistantResponse = completion.choices[0].message.content;
        } else {
          throw openaiError;
        }
      }
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
