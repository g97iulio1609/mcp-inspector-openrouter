/**
 * IEcommercePort — contract for e-commerce platform interactions.
 */

export type EcommercePlatform = 'shopify' | 'woocommerce' | 'wix' | 'webflow' | 'unknown';

export interface ProductInfo {
  name: string;
  price: string;
  currency: string;
  inStock: boolean;
  quantity?: number;
  variants?: string[];
}

export interface CartItem {
  name: string;
  quantity: number;
  price: string;
}

export interface OrderSummary {
  orderId: string;
  date: string;
  total: string;
  status: string;
}

export interface OrderDetails extends OrderSummary {
  items: CartItem[];
  shippingAddress?: string;
  trackingNumber?: string;
}

export interface OrderTracking {
  orderId: string;
  carrier?: string;
  trackingNumber?: string;
  status: string;
  estimatedDelivery?: string;
  events: TrackingEvent[];
}

export interface TrackingEvent {
  date: string;
  description: string;
  location?: string;
}

export interface InventoryItem {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface ProductCreateData {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  sku?: string;
  quantity?: number;
  images?: string[];
  variants?: { name: string; options: string[] }[];
  category?: string;
}

export interface IEcommercePort {
  // Platform detection
  detectPlatform(): EcommercePlatform;
  isEcommerce(): boolean;

  // Product actions
  getProductInfo(): Promise<ProductInfo | null>;
  addToCart(quantity?: number, variant?: string): Promise<void>;
  selectVariant(variant: string): Promise<void>;
  setQuantity(qty: number): Promise<void>;

  // Cart
  viewCart(): Promise<void>;
  getCartItems(): Promise<CartItem[]>;
  removeFromCart(itemName: string): Promise<void>;
  updateCartQuantity(itemName: string, quantity: number): Promise<void>;

  // Checkout
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

  // Admin detection
  isAdminPage(): boolean;
}
