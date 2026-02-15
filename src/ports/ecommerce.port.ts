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
}
