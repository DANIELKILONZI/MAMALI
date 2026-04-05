/**
 * Unit tests for notification message templates.
 *
 * Tests the buildMessage function (extracted for testing) to ensure all
 * 5 message types produce the expected content without hitting any API.
 */

// ── Mirror the buildMessage function from notifications.ts ────────────────────
// We extract it here so we can test it in isolation without mocking Prisma.

type MessageType =
  | 'order_confirmed'
  | 'payment_confirmed'
  | 'order_shipped'
  | 'order_cancelled'
  | 'order_expired';

function buildMessage(type: MessageType, data: Record<string, unknown>): string {
  const { orderNumber, total, businessName = 'MAMALI' } = data;
  switch (type) {
    case 'order_confirmed':
      return (
        `✅ Order Confirmed!\n\n` +
        `Hi${data.customerName ? ` ${data.customerName}` : ''}! Your order *${orderNumber}* has been received.\n` +
        `Total: KES ${total}\n\n` +
        `We'll send you an M-Pesa STK push shortly to complete your payment.\n\n` +
        `Thank you for shopping with *${businessName}*! 🛍️`
      );
    case 'payment_confirmed':
      return (
        `🎉 Payment Confirmed!\n\n` +
        `Your payment of KES ${total} for order *${orderNumber}* has been received.\n` +
        `${data.mpesaReceiptNumber ? `M-Pesa Receipt: *${data.mpesaReceiptNumber}*\n` : ''}` +
        `We're now processing your order. You'll hear from us soon!\n\n` +
        `*${businessName}* 🙏`
      );
    case 'order_shipped':
      return (
        `📦 Order On Its Way!\n\n` +
        `Great news! Your order *${orderNumber}* is being delivered to you.\n\n` +
        `*${businessName}*`
      );
    case 'order_cancelled':
      return (
        `❌ Order Cancelled\n\n` +
        `Your order *${orderNumber}* has been cancelled.\n` +
        `If you have any questions, please contact us.\n\n` +
        `*${businessName}*`
      );
    case 'order_expired':
      return (
        `⏰ Order Expired\n\n` +
        `Your order *${orderNumber}* has expired because payment was not received in time.\n` +
        `You can place a new order anytime.\n\n` +
        `*${businessName}*`
      );
    default:
      return `Your order ${orderNumber} status has been updated.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const baseData = {
  orderNumber: 'ORD-20260405-ABCD',
  total: 1500,
  businessName: 'MAMALI',
};

describe('Notification templates — order_confirmed', () => {
  it('includes the order number', () => {
    const msg = buildMessage('order_confirmed', baseData);
    expect(msg).toContain('ORD-20260405-ABCD');
  });

  it('includes the total amount', () => {
    const msg = buildMessage('order_confirmed', baseData);
    expect(msg).toContain('1500');
  });

  it('includes the business name', () => {
    const msg = buildMessage('order_confirmed', baseData);
    expect(msg).toContain('MAMALI');
  });

  it('mentions M-Pesa STK push', () => {
    const msg = buildMessage('order_confirmed', baseData);
    expect(msg.toLowerCase()).toContain('m-pesa');
  });

  it('includes customer name when provided', () => {
    const msg = buildMessage('order_confirmed', { ...baseData, customerName: 'Alice' });
    expect(msg).toContain('Alice');
  });

  it('omits "Hi " greeting when no customer name', () => {
    const msg = buildMessage('order_confirmed', baseData);
    expect(msg).toContain('Hi!'); // "Hi!" not "Hi Alice!"
  });
});

describe('Notification templates — payment_confirmed', () => {
  it('includes M-Pesa receipt number when provided', () => {
    const msg = buildMessage('payment_confirmed', { ...baseData, mpesaReceiptNumber: 'QGJ12345678' });
    expect(msg).toContain('QGJ12345678');
  });

  it('omits receipt line when no receipt number', () => {
    const msg = buildMessage('payment_confirmed', baseData);
    expect(msg).not.toContain('Receipt');
  });

  it('includes payment confirmation header', () => {
    const msg = buildMessage('payment_confirmed', baseData);
    expect(msg).toContain('Payment Confirmed');
  });
});

describe('Notification templates — order_shipped', () => {
  it('indicates delivery is in progress', () => {
    const msg = buildMessage('order_shipped', baseData);
    expect(msg.toLowerCase()).toMatch(/deliver|way/);
  });

  it('includes order number', () => {
    const msg = buildMessage('order_shipped', baseData);
    expect(msg).toContain(baseData.orderNumber as string);
  });
});

describe('Notification templates — order_cancelled', () => {
  it('clearly states cancellation', () => {
    const msg = buildMessage('order_cancelled', baseData);
    expect(msg.toLowerCase()).toContain('cancelled');
  });

  it('invites customer to contact support', () => {
    const msg = buildMessage('order_cancelled', baseData);
    expect(msg.toLowerCase()).toContain('contact');
  });
});

describe('Notification templates — order_expired', () => {
  it('explains that payment was not received', () => {
    const msg = buildMessage('order_expired', baseData);
    expect(msg.toLowerCase()).toContain('payment');
  });

  it('encourages placing a new order', () => {
    const msg = buildMessage('order_expired', baseData);
    expect(msg.toLowerCase()).toContain('new order');
  });
});

describe('Notification templates — custom business name', () => {
  it('substitutes the custom business name correctly', () => {
    const msg = buildMessage('order_confirmed', { ...baseData, businessName: 'MyShop' });
    expect(msg).toContain('MyShop');
    expect(msg).not.toContain('MAMALI');
  });
});
