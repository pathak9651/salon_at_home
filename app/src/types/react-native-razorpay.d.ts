declare module "react-native-razorpay" {
  type RazorpayOptions = {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description?: string;
    order_id: string;
    prefill?: {
      name?: string | null;
      email?: string | null;
      contact?: string | null;
    };
    theme?: { color?: string };
  };

  type RazorpaySuccess = {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };

  const RazorpayCheckout: {
    open(options: RazorpayOptions): Promise<RazorpaySuccess>;
  };

  export default RazorpayCheckout;
}
