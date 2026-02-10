import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true },
    country: { type: String, trim: true, default: "USA" },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    selectedVariations: {
      type: Map,
      of: String,
      default: {},
    },
    label: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projects",
      required: true,
    },
    selectedProducts: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SelectedProducts",
      required: true,
    },
    items: [orderItemSchema],
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    freight: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "awaiting_signature",
        "signed",
        "invoiced",
        "completed",
        "cancelled",
      ],
      default: "pending",
    },
    userSignature: {
      type: String, // Base64 image string
      default: null,
    },
    dealerSignature: {
      type: String, // Base64 image string
      default: null,
    },
    signatureDate: {
      type: Date,
      default: null,
    },
    billingAddress: {
      type: addressSchema,
      default: null,
    },
    shippingAddress: {
      type: addressSchema,
      default: null,
    },
    paymentTerms: {
      type: String,
      default: "",
    },
    notes: {
      type: String,
      default: "",
    },
    invoiceNumber: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
    },
    invoiceGeneratedAt: {
      type: Date,
      default: null,
    },
    invoicePdfUrl: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Generate unique order number before saving
orderSchema.pre("save", async function (next) {
  if (this.isNew && !this.orderNumber) {
    const count = await mongoose.model("Order").countDocuments();
    const timestamp = Date.now().toString().slice(-6);
    this.orderNumber = `ORD-${timestamp}-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

// Generate invoice number when invoice is generated
orderSchema.methods.generateInvoiceNumber = async function () {
  if (!this.invoiceNumber) {
    const count = await mongoose.model("Order").countDocuments({
      invoiceNumber: { $ne: null },
    });
    const timestamp = Date.now().toString().slice(-6);
    this.invoiceNumber = `INV-${timestamp}-${String(count + 1).padStart(4, "0")}`;
    this.invoiceGeneratedAt = new Date();
    await this.save();
  }
  return this.invoiceNumber;
};

export default mongoose.model("Order", orderSchema);
