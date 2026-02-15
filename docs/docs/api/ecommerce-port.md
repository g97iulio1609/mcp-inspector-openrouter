---
sidebar_position: 10
---

# IEcommercePort

E-commerce platform interactions for Shopify, WooCommerce, Wix, and Webflow.

## Interface

```typescript
type EcommercePlatform = 'shopify' | 'woocommerce' | 'wix' | 'webflow' | 'unknown';

interface IEcommercePort {
  // Platform detection
  detectPlatform(): EcommercePlatform;
  isEcommerce(): boolean;
  isAdminPage(): boolean;

  // Product browsing
  getProductInfo(): Promise<ProductInfo | null>;
  addToCart(quantity?: number, variant?: string): Promise<void>;
  selectVariant(variant: string): Promise<void>;
  setQuantity(qty: number): Promise<void>;

  // Cart
  viewCart(): Promise<void>;
  getCartItems(): Promise<CartItem[]>;
  removeFromCart(itemName: string): Promise<void>;
  updateCartQuantity(itemName: string, quantity: number): Promise<void>;
  goToCheckout(): Promise<void>;

  // Search & navigation
  searchProducts(query: string): Promise<void>;
  filterByCategory(category: string): Promise<void>;
  sortProducts(by: 'price-asc' | 'price-desc' | 'newest' | 'popular'): Promise<void>;

  // Order management
  getOrders(): Promise<OrderSummary[]>;
  getOrderDetails(orderId: string): Promise<OrderDetails | null>;
  trackOrder(orderId: string): Promise<OrderTracking | null>;

  // Inventory (admin)
  getInventoryStatus(): Promise<InventoryItem[]>;
  updateInventory(productId: string, quantity: number): Promise<void>;

  // Product CRUD (admin)
  createProduct(data: ProductCreateData): Promise<void>;
  updateProduct(productId: string, data: Partial<ProductCreateData>): Promise<void>;
  deleteProduct(productId: string): Promise<void>;
}
```

## Supported Platforms

| Platform | Detection | Browsing | Cart | Orders | Admin |
|----------|-----------|----------|------|--------|-------|
| Shopify | ✅ `window.Shopify` | ✅ | ✅ | ✅ | ✅ |
| WooCommerce | ✅ `.woocommerce` class | ✅ | ✅ | ✅ | ✅ |
| Wix | ✅ `wixBiSession` | ✅ | ✅ | ✅ | ✅ |
| Webflow | ✅ `data-wf-site` | ✅ | ✅ | ✅ | ✅ |

## Adapter

`EcommerceAdapter` — DOM-based with platform-specific selector chains and fallbacks.
