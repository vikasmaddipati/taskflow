import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
      index: true
    },
    provider: {
      type: String,
      enum: ['razorpay', 'stripe', 'manual'],
      default: 'razorpay'
    },
    providerPaymentId: {
      type: String,
      default: null,
      index: true
    },
    providerOrderId: {
      type: String,
      default: null,
      index: true
    },
    providerInvoiceId: {
      type: String,
      default: null,
      index: true
    },
    amount: {
      type: Number,
      required: true // amount in standard units (e.g. ₹799)
    },
    currency: {
      type: String,
      default: 'INR'
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
      index: true
    },
    paidAt: {
      type: Date,
      default: null
    },
    receiptUrl: {
      type: String,
      default: null
    },
    failureCode: {
      type: String,
      default: null
    },
    failureReason: {
      type: String,
      default: null
    },
    description: {
      type: String,
      default: 'SaaS Subscription'
    }
  },
  {
    timestamps: true
  }
);

invoiceSchema.index({ organization: 1, createdAt: -1 });

invoiceSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;
