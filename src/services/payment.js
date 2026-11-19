'use strict';
/**
 * Payment gateway wrapper — Razorpay when keys are configured, otherwise a
 * clearly-labelled demo gateway so the settlement flow is demonstrable.
 */
const crypto = require('crypto');
const config = require('../config');

function isDemo() {
  return !config.razorpay.enabled;
}

function newOrderId() {
  return `order_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

/** Create an order (real Razorpay REST call, or local demo order). */
async function createOrder({ amount, receipt, notes = {} }) {
  const amountPaise = Math.round(Number(amount) * 100);
  if (isDemo()) {
    return {
      id: newOrderId(),
      amount: amountPaise,
      currency: 'INR',
      receipt,
      status: 'created',
      gateway: 'demo',
      notes,
    };
  }

  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay order failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const order = await res.json();
  return { ...order, gateway: 'razorpay' };
}

/** Verify the checkout signature returned by Razorpay Checkout. */
function verifySignature({ orderId, paymentId, signature }) {
  if (isDemo()) return true;
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}

function newPaymentId() {
  return `pay_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

module.exports = { isDemo, createOrder, verifySignature, newPaymentId, newOrderId };
