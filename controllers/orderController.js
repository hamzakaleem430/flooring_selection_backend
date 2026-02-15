import mongoose from "mongoose";
import orderModel from "../models/orderModel.js";
import selectedProductsModel from "../models/selectedProductsModel.js";
import { createNotificationWithSocket } from "../helper/notificationHelper.js";

// Create Order from Selected Products
export const createOrder = async (req, res) => {
  try {
    const {
      selectedProductsId,
      tax = 0,
      discount = 0,
      freight = 0,
      billingAddress,
      shippingAddress,
      paymentTerms,
      notes,
    } = req.body;

    if (!selectedProductsId) {
      return res.status(400).json({
        success: false,
        message: "Selected products ID is required",
      });
    }

    const dealerId = req.user._id || req.user.id;

    // Get selected products with populated data
    let selectedProducts = await selectedProductsModel
      .findById(selectedProductsId)
      .populate("products.product")
      .populate("user")
      .populate("project");

    if (!selectedProducts) {
      return res.status(404).json({
        success: false,
        message: "Selected products not found",
      });
    }

    if (!selectedProducts.products || selectedProducts.products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No products selected",
      });
    }

    // Filter out invalid products (null after population means product was deleted)
    const validProducts = selectedProducts.products.filter((item) => {
      // Check if product exists - handle both populated objects and ObjectIds
      let hasProduct = false;
      if (item.product) {
        // Check if it's a populated object with _id
        if (typeof item.product === 'object' && item.product._id) {
          hasProduct = true;
        } 
        // Check if it's an ObjectId string
        else if (typeof item.product === 'string' || item.product instanceof mongoose.Types.ObjectId) {
          hasProduct = true;
        }
      }
      
      const hasQuantity = item.quantity && item.quantity > 0;
      
      if (!hasProduct || !hasQuantity) {
        console.warn(`Invalid product item found:`, {
          product: item.product,
          productType: typeof item.product,
          quantity: item.quantity,
          itemId: item._id
        });
        return false;
      }
      return true;
    });

    if (validProducts.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid products found. Some products may have been deleted. Please remove invalid products and try again.",
      });
    }

    // Build order items from valid selected products
    const items = validProducts.map((item) => {
      const product = item.product;
      // Handle both populated product objects and ObjectIds
      let productId;
      let productPrice = 0;
      let productName = "";
      let productImage = "";
      let sku = "";
      
      if (typeof product === 'object' && product._id) {
        // Populated product object
        productId = product._id;
        productPrice = product.price || product.sellingPrice || 0;
        productName = product.name || "";
        productImage = product.images && product.images.length > 0 ? product.images[0] : "";
        sku = product.sku || "";
      } else {
        // ObjectId (string or ObjectId instance)
        productId = product.toString();
        productPrice = 0;
      }
      
      const unitPrice = item.suggestedPrice || productPrice || 0;
      const quantity = item.quantity || 1;
      const totalPrice = unitPrice * quantity;

      return {
        product: productId,
        productName,
        productImage,
        quantity,
        unitPrice,
        totalPrice,
        total: totalPrice,
        selectedVariations: item.selectedVariations || {},
        label: item.label || "",
        sku,
        notes: "",
      };
    });

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const total = subtotal + tax - discount + freight;

    // Generate unique order number - ensure it's always set
    let orderNumber;
    try {
      const orderCount = await orderModel.countDocuments();
      const timestamp = Date.now().toString().slice(-6);
      orderNumber = `ORD-${timestamp}-${String(orderCount + 1).padStart(4, "0")}`;
    } catch (countError) {
      console.error("Error counting orders:", countError);
      // Fallback order number generation
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 10000);
      orderNumber = `ORD-${timestamp}-${String(random).padStart(4, "0")}`;
    }
    
    // Ensure orderNumber is set
    if (!orderNumber) {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 10000);
      orderNumber = `ORD-${timestamp}-${String(random).padStart(4, "0")}`;
    }

    // Create order - Don't explicitly set invoiceNumber to avoid duplicate key error
    // Let the schema's default value handle it (which is null by default)
    const orderData = {
      orderNumber,
      user: selectedProducts.user._id || selectedProducts.user,
      dealer: dealerId,
      project: selectedProducts.project._id || selectedProducts.project,
      selectedProducts: selectedProductsId,
      items,
      subtotal,
      tax,
      discount,
      freight,
      total,
      status: "pending",
      customerName: selectedProducts.user.name || "",
      customerEmail: selectedProducts.user.email || "",
      customerPhone: selectedProducts.user.phoneNumber || "",
      deliveryAddress: shippingAddress?.street || billingAddress?.street || "",
      billingAddress: billingAddress || null,
      shippingAddress: shippingAddress || null,
      paymentTerms: paymentTerms || "",
      notes: notes || "",
    };
    
    // Create order using save() instead of create() to better handle the sparse index
    const order = new orderModel(orderData);
    await order.save();

    // Populate order data
    await order.populate([
      { path: "user", select: "name email profileImage" },
      { path: "dealer", select: "name email profileImage" },
      { path: "project", select: "name" },
      { path: "items.product" },
    ]);

    // Send notification to user
    try {
      const userId = selectedProducts.user._id || selectedProducts.user;
      await createNotificationWithSocket({
        userId: userId.toString(),
        subject: "New Order Created",
        context: `A new order (${order.orderNumber}) has been created for your project. Please review and sign.`,
        type: "order",
        redirectLink: `/orders/${order._id}`,
      });
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
      // Don't fail order creation if notification fails
    }

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({
      success: false,
      message: "Error creating order",
      error: error.message,
    });
  }
};

// Get Single Order
export const getOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await orderModel
      .findById(id)
      .populate("user", "name email profileImage")
      .populate("dealer", "name email profileImage")
      .populate("project", "name")
      .populate("selectedProducts")
      .populate("items.product");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Error getting order:", error);
    res.status(500).json({
      success: false,
      message: "Error getting order",
      error: error.message,
    });
  }
};

// Get User Orders
export const getUserOrders = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { user: userId };
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await orderModel
      .find(query)
      .populate("dealer", "name email profileImage")
      .populate("project", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await orderModel.countDocuments(query);

    res.status(200).json({
      success: true,
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error getting user orders:", error);
    res.status(500).json({
      success: false,
      message: "Error getting user orders",
      error: error.message,
    });
  }
};

// Get Dealer Orders
export const getDealerOrders = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { dealer: dealerId };
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await orderModel
      .find(query)
      .populate("user", "name email profileImage")
      .populate("project", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await orderModel.countDocuments(query);

    res.status(200).json({
      success: true,
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error getting dealer orders:", error);
    res.status(500).json({
      success: false,
      message: "Error getting dealer orders",
      error: error.message,
    });
  }
};

// Update Order Status
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = [
      "pending",
      "confirmed",
      "awaiting_signature",
      "signed",
      "invoiced",
      "completed",
      "cancelled",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const order = await orderModel.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    order.status = status;
    await order.save();

    await order.populate([
      { path: "user", select: "name email profileImage" },
      { path: "dealer", select: "name email profileImage" },
      { path: "project", select: "name" },
      { path: "items.product" },
    ]);

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      order,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating order status",
      error: error.message,
    });
  }
};

// Add User Signature (Unified signature endpoint)
export const addUserSignature = async (req, res) => {
  try {
    const { id } = req.params;
    const { signature, signedBy } = req.body;

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Signature is required",
      });
    }

    const order = await orderModel.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Set unified signature fields
    order.signature = signature;
    order.signedBy = signedBy || "Customer";
    order.signedAt = new Date().toISOString();
    
    // Also set userSignature for backward compatibility
    order.userSignature = signature;

    // Update status
    order.status = "awaiting_signature";
    order.signatureDate = new Date();

    await order.save();

    await order.populate([
      { path: "user", select: "name email profileImage" },
      { path: "dealer", select: "name email profileImage" },
      { path: "project", select: "name" },
      { path: "items.product" },
    ]);
    
    // Send notification to dealer
    try {
      await createNotificationWithSocket({
        userId: order.dealer._id.toString(),
        subject: "Order Signed by Customer",
        context: `Order (${order.orderNumber}) has been signed by the customer.`,
        type: "order",
        redirectLink: `/orders/${order._id}`,
      });
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    res.status(200).json({
      success: true,
      message: "Signature added successfully",
      order,
    });
  } catch (error) {
    console.error("Error adding signature:", error);
    res.status(500).json({
      success: false,
      message: "Error adding signature",
      error: error.message,
    });
  }
};

// Add Dealer Signature
export const addDealerSignature = async (req, res) => {
  try {
    const { id } = req.params;
    const { signature } = req.body;

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Signature is required",
      });
    }

    const order = await orderModel.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    order.dealerSignature = signature;

    // Update status if both signatures exist
    if (order.userSignature && order.dealerSignature) {
      order.status = "signed";
      order.signatureDate = new Date();
    } else {
      order.status = "awaiting_signature";
    }

    await order.save();

    await order.populate([
      { path: "user", select: "name email profileImage" },
      { path: "dealer", select: "name email profileImage" },
      { path: "project", select: "name" },
      { path: "items.product" },
    ]);

    res.status(200).json({
      success: true,
      message: "Dealer signature added successfully",
      order,
    });
  } catch (error) {
    console.error("Error adding dealer signature:", error);
    res.status(500).json({
      success: false,
      message: "Error adding dealer signature",
      error: error.message,
    });
  }
};

// Generate Invoice (PDF will be generated on frontend, this just marks it as invoiced)
export const generateInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await orderModel.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if both signatures exist
    if (!order.userSignature || !order.dealerSignature) {
      return res.status(400).json({
        success: false,
        message: "Both signatures are required to generate invoice",
      });
    }

    // Generate invoice number if not exists
    if (!order.invoiceNumber) {
      await order.generateInvoiceNumber();
    }

    order.status = "invoiced";
    order.invoiceGeneratedAt = new Date();
    await order.save();

    await order.populate([
      { path: "user", select: "name email profileImage" },
      { path: "dealer", select: "name email profileImage" },
      { path: "project", select: "name" },
      { path: "items.product" },
    ]);

    res.status(200).json({
      success: true,
      message: "Invoice generated successfully",
      order,
    });
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).json({
      success: false,
      message: "Error generating invoice",
      error: error.message,
    });
  }
};

// Update Order
export const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tax,
      discount,
      billingAddress,
      shippingAddress,
      paymentTerms,
      notes,
    } = req.body;

    const order = await orderModel.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Update fields
    if (tax !== undefined) order.tax = tax;
    if (discount !== undefined) order.discount = discount;
    if (billingAddress) order.billingAddress = billingAddress;
    if (shippingAddress) order.shippingAddress = shippingAddress;
    if (paymentTerms !== undefined) order.paymentTerms = paymentTerms;
    if (notes !== undefined) order.notes = notes;

    // Recalculate total
    order.total = order.subtotal + order.tax - order.discount;

    await order.save();

    await order.populate([
      { path: "user", select: "name email profileImage" },
      { path: "dealer", select: "name email profileImage" },
      { path: "project", select: "name" },
      { path: "items.product" },
    ]);

    res.status(200).json({
      success: true,
      message: "Order updated successfully",
      order,
    });
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({
      success: false,
      message: "Error updating order",
      error: error.message,
    });
  }
};

// Confirm Order (Dealer Action)
export const confirmOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await orderModel.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order is in pending status
    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending orders can be confirmed",
      });
    }

    order.status = "confirmed";
    await order.save();

    await order.populate([
      { path: "user", select: "name email profileImage" },
      { path: "dealer", select: "name email profileImage" },
      { path: "project", select: "name" },
      { path: "items.product" },
    ]);

    // Send notification to user
    try {
      await createNotificationWithSocket({
        userId: order.user._id.toString(),
        subject: "Order Confirmed",
        context: `Your order (${order.orderNumber}) has been confirmed by the dealer.`,
        type: "order",
        redirectLink: `/orders/${order._id}`,
      });
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    res.status(200).json({
      success: true,
      message: "Order confirmed successfully",
      order,
    });
  } catch (error) {
    console.error("Error confirming order:", error);
    res.status(500).json({
      success: false,
      message: "Error confirming order",
      error: error.message,
    });
  }
};

// Cancel Order
export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await orderModel.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order can be cancelled (not completed or already cancelled)
    if (["completed", "cancelled", "invoiced"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status: ${order.status}`,
      });
    }

    order.status = "cancelled";
    await order.save();

    await order.populate([
      { path: "user", select: "name email profileImage" },
      { path: "dealer", select: "name email profileImage" },
      { path: "project", select: "name" },
      { path: "items.product" },
    ]);

    // Send notification
    try {
      const recipientId = req.user._id.toString() === order.user._id.toString() 
        ? order.dealer._id.toString() 
        : order.user._id.toString();
      
      await createNotificationWithSocket({
        userId: recipientId,
        subject: "Order Cancelled",
        context: `Order (${order.orderNumber}) has been cancelled.`,
        type: "order",
        redirectLink: `/orders/${order._id}`,
      });
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      order,
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({
      success: false,
      message: "Error cancelling order",
      error: error.message,
    });
  }
};

// Delete Order
export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await orderModel.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order can be deleted (only pending or cancelled orders)
    if (
      !["pending", "cancelled"].includes(order.status) &&
      order.status !== "pending"
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete order with status: " + order.status,
      });
    }

    await orderModel.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting order",
      error: error.message,
    });
  }
};
