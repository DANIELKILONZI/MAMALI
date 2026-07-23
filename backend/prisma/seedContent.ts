/**
 * Default storefront content pages.
 *
 * These are complete, ready-to-use templates. The owner edits them from the
 * admin CMS (Content). Text in [square brackets] is a placeholder to fill in
 * with real business details (phone, email, delivery areas, etc.).
 */
export const defaultContentPages = [
  {
    slug: 'about',
    title: 'About Us',
    isActive: true,
    content: `
<p>Welcome to <strong>MAMALI</strong> — your trusted online shop. We bring quality products to your doorstep across Kenya, with fast delivery and secure M-Pesa payments.</p>
<h2>Who we are</h2>
<p>[Tell your story here — when the business started, what you sell, and what makes you different. A sentence or two is enough to start.]</p>
<h2>Why shop with us</h2>
<ul>
  <li><strong>Genuine products</strong> — carefully selected and quality-checked.</li>
  <li><strong>Pay with M-Pesa</strong> — quick, secure checkout with an STK push to your phone.</li>
  <li><strong>Fast delivery</strong> — we deliver to [your delivery areas].</li>
  <li><strong>Real support</strong> — reach a real person when you need help.</li>
</ul>
<h2>Get in touch</h2>
<p>Questions? Visit our <a href="/contact">Contact page</a> or message us on WhatsApp at [your phone number].</p>
`.trim(),
  },
  {
    slug: 'contact',
    title: 'Contact Us',
    isActive: true,
    content: `
<p>We're here to help. Reach us through any of the channels below and we'll get back to you as soon as we can.</p>
<h2>Talk to us</h2>
<ul>
  <li><strong>Phone / WhatsApp:</strong> [your phone number]</li>
  <li><strong>Email:</strong> [your email address]</li>
  <li><strong>Hours:</strong> [e.g. Mon–Sat, 8:00am – 6:00pm]</li>
</ul>
<h2>Find us</h2>
<p>[Your shop location or town. Add a landmark to make it easy to find, or note that you are online-only with delivery.]</p>
<h2>Track your order</h2>
<p>Already placed an order? You can <a href="/orders">track it here</a> using your order number from the confirmation SMS.</p>
`.trim(),
  },
  {
    slug: 'faq',
    title: 'Frequently Asked Questions',
    isActive: true,
    content: `
<h2>How do I pay?</h2>
<p>We use M-Pesa. At checkout you'll enter your phone number and receive an STK push prompt — enter your M-Pesa PIN to complete payment. You'll get a confirmation SMS from M-Pesa.</p>
<h2>How long does delivery take?</h2>
<p>[Describe your delivery timelines, e.g. "Same-day within [town], 1–3 days for other areas."]</p>
<h2>How much is delivery?</h2>
<p>[Describe delivery fees, e.g. "Free above KSh [amount]", or a flat rate per area.]</p>
<h2>Can I return an item?</h2>
<p>Yes. See our returns process below and on the <a href="/terms">Terms &amp; Conditions</a> page. To request a refund, contact us with your order number — refunds are reviewed and approved by the shop before any money is returned.</p>
<h2>Do I need an account to shop?</h2>
<p>No. You can check out as a guest. Creating an account simply lets you see all your past orders in one place.</p>
<h2>I have another question</h2>
<p>Reach us any time via the <a href="/contact">Contact page</a>.</p>
`.trim(),
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    isActive: true,
    content: `
<p>This policy explains what information MAMALI collects and how we use it. [Review this with the specifics of your business; this is a starting template, not legal advice.]</p>
<h2>What we collect</h2>
<ul>
  <li><strong>Order details</strong> — your name, phone number, delivery location, and the items you buy.</li>
  <li><strong>Payment information</strong> — processed securely through Safaricom M-Pesa. We do not store your M-Pesa PIN.</li>
  <li><strong>Usage data</strong> — basic information about how our site is used, to improve the experience.</li>
</ul>
<h2>How we use it</h2>
<ul>
  <li>To process and deliver your orders.</li>
  <li>To send you order and payment updates.</li>
  <li>To provide support and improve our service.</li>
</ul>
<h2>Sharing</h2>
<p>We share information only as needed to fulfil your order (for example, with our delivery partners) and as required by law. We do not sell your personal information.</p>
<h2>Your choices</h2>
<p>To ask what we hold about you, or to request deletion, contact us at [your email address].</p>
`.trim(),
  },
  {
    slug: 'terms',
    title: 'Terms & Conditions',
    isActive: true,
    content: `
<p>By shopping with MAMALI you agree to the following terms. [Review and adjust these to fit your business; this is a starting template, not legal advice.]</p>
<h2>Orders &amp; pricing</h2>
<p>All prices are in Kenyan Shillings (KES) and include applicable taxes unless stated otherwise. We may correct pricing errors and cancel affected orders with a full refund.</p>
<h2>Payment</h2>
<p>Payment is made via M-Pesa at checkout. Orders are confirmed once payment is received. Unpaid orders expire automatically after [30] minutes.</p>
<h2>Delivery</h2>
<p>We deliver to [your delivery areas] within [your timelines]. Delivery fees, if any, are shown at checkout.</p>
<h2>Returns &amp; refunds</h2>
<p>If something is wrong with your order, contact us within [e.g. 7 days] with your order number. Approved returns may be refunded or replaced. <strong>Refunds are reviewed and approved by the shop before any money is returned</strong>, and are sent to the M-Pesa number used for payment.</p>
<h2>Contact</h2>
<p>Questions about these terms? Reach us via the <a href="/contact">Contact page</a>.</p>
`.trim(),
  },
];
