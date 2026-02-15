# Backend Changes for Order System

## Overview
Updated the Node.js/Express backend to fully support the mobile app's order management system with customer signatures.

## Changes Made

### 1. **Order Routes** (`routes/orderRoutes.js`)

#### New/Updated Endpoints:
```javascript
POST   /api/v1/order/                    // Create order (updated from /create)
GET    /api/v1/order/:id                 // Get single order
GET    /api/v1/order/user/:userId        // Get user's orders
GET    /api/v1/order/dealer/:dealerId    // Get dealer's orders
PUT    /api/v1/order/:id/status          // Update order status
PUT    /api/v1/order/:id/signature       // Add signature (new unified endpoint)
PUT    /api/v1/order/:id/confirm         // Confirm order (new)
PUT    /api/v1/order/:id/cancel          // Cancel order (new)
PUT    /api/v1/order/:id                 // Update order details
DELETE /api/v1/order/:id                 // Delete order
```

#### Legacy Endpoints (backward compatibility):
```javascript
PUT    /api/v1/order/:id/user-signature    // Add user signature (old)
PUT    /api/v1/order/:id/dealer-signature  // Add dealer signature (old)
POST   /api/v1/order/:id/generate-invoice  // Generate invoice
```

### 2. **Order Model** (`models/orderModel.js`)

#### New Fields Added:
```javascript
{
  // Customer Information (for mobile app)
  customerName: String,      // Customer's name
  customerEmail: String,     // Customer's email
  customerPhone: String,     // Customer's phone number
  deliveryAddress: String,   // Simple delivery address string
  
  // Unified Signature Fields (for mobile app)
  signature: String,         // Base64 signature image
  signedBy: String,         // Who signed (e.g., "Customer", user name)
  signedAt: String,         // ISO date string when signed
  
  // Status Updates
  status: "in_progress",     // Added new status option
}
```

#### Updated Status Enum:
```javascript
[
  "pending",           // Initial order state
  "confirmed",         // Dealer confirmed
  "in_progress",      // NEW - Order in progress
  "awaiting_signature", // Waiting for signatures
  "signed",            // Fully signed
  "invoiced",          // Invoice generated
  "completed",         // Order completed
  "cancelled"          // Order cancelled
]
```

### 3. **Order Controller** (`controllers/orderController.js`)

#### New Functions Added:

##### `confirmOrder(req, res)`
- Dealer confirms a pending order
- Changes status from "pending" to "confirmed"
- Sends notification to customer
- Returns updated order object

##### `cancelOrder(req, res)`
- User or dealer can cancel order
- Only allows cancelling non-completed/non-invoiced orders
- Sends notification to other party
- Returns updated order object

#### Updated Functions:

##### `createOrder(req, res)`
- Now populates `customerName`, `customerEmail`, `customerPhone` from user data
- Sets `deliveryAddress` from shipping or billing address
- Adds product details to items:
  - `productName`
  - `productImage`
  - `sku`
  - `total` (same as `totalPrice`)
- Creates notification with proper link format: `/orders/${orderId}`

##### `addUserSignature(req, res)`
- Now unified signature endpoint
- Accepts `signature` and `signedBy` fields
- Sets both new unified fields and legacy `userSignature` field
- Updates status to "awaiting_signature"
- Sets `signedAt` with ISO date string
- Sends notification to dealer

### 4. **Response Format**

#### Order Object Response:
```json
{
  "success": true,
  "message": "Order created successfully",
  "order": {
    "_id": "order-id",
    "orderNumber": "ORD-123456-0001",
    "user": { "name": "John Doe", "email": "john@example.com" },
    "dealer": { "name": "Dealer Name", "email": "dealer@example.com" },
    "project": { "name": "Project Name" },
    "items": [
      {
        "product": "product-id",
        "productName": "Product Name",
        "productImage": "url",
        "quantity": 2,
        "unitPrice": 50.00,
        "totalPrice": 100.00,
        "total": 100.00,
        "sku": "SKU123",
        "notes": ""
      }
    ],
    "subtotal": 100.00,
    "tax": 8.00,
    "discount": 0,
    "freight": 0,
    "total": 108.00,
    "status": "pending",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "customerPhone": "+1234567890",
    "deliveryAddress": "123 Main St",
    "signature": null,
    "signedBy": null,
    "signedAt": null,
    "notes": "",
    "createdAt": "2024-02-15T...",
    "updatedAt": "2024-02-15T..."
  }
}
```

#### Orders List Response:
```json
{
  "success": true,
  "orders": [ /* array of order objects */ ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

### 5. **Notifications**

Orders now trigger notifications with proper routing:

#### Order Created:
```javascript
{
  userId: "customer-id",
  subject: "New Order Created",
  context: "A new order (ORD-123456-0001) has been created...",
  type: "order",
  redirectLink: "/orders/order-id"  // Mobile app uses this
}
```

#### Order Confirmed:
```javascript
{
  userId: "customer-id",
  subject: "Order Confirmed",
  context: "Your order (ORD-123456-0001) has been confirmed...",
  type: "order",
  redirectLink: "/orders/order-id"
}
```

#### Order Signed:
```javascript
{
  userId: "dealer-id",
  subject: "Order Signed by Customer",
  context: "Order (ORD-123456-0001) has been signed...",
  type: "order",
  redirectLink: "/orders/order-id"
}
```

#### Order Cancelled:
```javascript
{
  userId: "other-party-id",
  subject: "Order Cancelled",
  context: "Order (ORD-123456-0001) has been cancelled.",
  type: "order",
  redirectLink: "/orders/order-id"
}
```

## API Usage Examples

### Create Order
```bash
POST /api/v1/order/
Headers: { Authorization: "Bearer <token>" }
Body: {
  "selectedProductsId": "selected-products-id",
  "tax": 8.00,
  "discount": 0,
  "freight": 0,
  "notes": "Please deliver ASAP"
}
```

### Get User Orders
```bash
GET /api/v1/order/user/:userId?status=pending&page=1&limit=10
Headers: { Authorization: "Bearer <token>" }
```

### Add Signature
```bash
PUT /api/v1/order/:orderId/signature
Headers: { Authorization: "Bearer <token>" }
Body: {
  "signature": "data:image/png;base64,...",
  "signedBy": "John Doe"
}
```

### Confirm Order (Dealer)
```bash
PUT /api/v1/order/:orderId/confirm
Headers: { Authorization: "Bearer <token>" }
```

### Update Status
```bash
PUT /api/v1/order/:orderId/status
Headers: { Authorization: "Bearer <token>" }
Body: {
  "status": "in_progress"
}
```

### Cancel Order
```bash
PUT /api/v1/order/:orderId/cancel
Headers: { Authorization: "Bearer <token>" }
```

## Database Migration Notes

The new fields (`customerName`, `customerEmail`, `customerPhone`, `deliveryAddress`, `signature`, `signedBy`, `signedAt`) are optional with default values, so existing orders will work without migration.

To update existing orders (optional):
```javascript
// Run this in MongoDB shell or migration script
db.orders.updateMany(
  { customerName: { $exists: false } },
  { 
    $set: { 
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      deliveryAddress: "",
      signature: null,
      signedBy: null,
      signedAt: null
    }
  }
);
```

## Testing

### Test Order Creation:
1. Create selected products for a project
2. Call create order endpoint
3. Verify notification sent to customer
4. Check order appears in customer's orders list

### Test Signature:
1. Get order by ID
2. Add signature with base64 image
3. Verify signature saved
4. Check notification sent to dealer

### Test Order Workflow:
```
pending → confirmed → in_progress → completed
   ↓
cancelled (at any stage before completed)
```

## Backward Compatibility

✅ All legacy endpoints still work
✅ Old `userSignature`/`dealerSignature` fields maintained
✅ New fields have defaults, won't break existing data
✅ Response format extended, not changed

## Files Modified

- ✅ `routes/orderRoutes.js` - Added new endpoints
- ✅ `models/orderModel.js` - Added customer & signature fields
- ✅ `controllers/orderController.js` - Added confirm/cancel, updated signature handling

## Ready to Deploy

All changes are backward compatible and ready for production! 🚀
