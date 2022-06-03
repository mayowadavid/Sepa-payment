const express = require("express");
const app = express();
const { resolve } = require("path");
// Replace if using a different env file or config
const env = require("dotenv").config({ path: ".env" });
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(express.static(process.env.STATIC_DIR));
app.use(
  express.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify: function(req, res, buf) {
      if (req.originalUrl.startsWith("/webhook")) {
        req.rawBody = buf.toString();
      }
    }
  })
);

app.get("/config", (req, res) => {
  res.send({
    publicKey: process.env.STRIPE_PUBLISHABLE_KEY,
    amount: process.env.AMOUNT,
    currency: process.env.CURRENCY
  });
});

app.get("/allProduct", async (req, res) => {
  const products = await stripe.products.list({
    limit: 3,
  });
  res.send({products});
});

app.get("/allPrices", async (req, res) => {
  const prices = await stripe.prices.list({
    limit: 3,
  });
  res.send({prices});
});

app.get("/", (req, res) => {
  // Display checkout page
  const path = resolve(process.env.STATIC_DIR + "/index.html");
  res.sendFile(path);
});

const calculateOrderAmount = items => {
  // Replace this constant with a calculation of the order's amount
  // Calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  return process.env.AMOUNT;
};

// // Create a customer account
// app.get('/create-customer', async (req, res) => {
//   const {name, email} = req.body;
//   const customer = await stripe.customers.create({
//     name,
//     email
//   });
//   res.send({customerId: customer.id});
// });


// // Setup payment Intent
// app.get('/setup-intent', async (req, res) => {
//   const {customerId} = req.body;
//   const setupIntent = await stripe.setupIntents.create({
//     payment_method_types: ['sepa_debit'],
//     customer: customerId,
//   });
//   const clientSecret = setupIntent.client_secret;
//   res.send({clientSecret});
// });


// // Update customer subscription
// app.get('/update-customer', async (req, res) => {
//   const {customerId, payment_method_id} = req.body;
//   const customer = await stripe.customers.update(
//     customerId,
//     {invoice_settings: {default_payment_method: payment_method_id}}
//   );
//   res.send({customer});
// });

// // Create a subscriptions
// app.get('/setup-customer-subscription', async (req, res) => {
//   const {customerId} = req.body;
//   const price = process.env.PRICES;
//   const subscription = await stripe.subscriptions.create({
//     customer: customerId,
//     items: [{price}],
//     expand: ['latest_invoice.payment_intent'],
//   });
//   res.send({subscription});
// });


app.post("/create-payment-intent", async (req, res) => {
  const { items } = req.body;
  // Create a PaymentIntent with the order amount and currency
  const paymentIntent = await stripe.paymentIntents.create({
    payment_method_types: ["sepa_debit"],
    amount: calculateOrderAmount(items),
    currency: process.env.CURRENCY
  });

  // Send publishable key and PaymentIntent details to client
  res.send({
    publicKey: process.env.STRIPE_PUBLISHABLE_KEY,
    clientSecret: paymentIntent.client_secret
  });
});


// Expose a endpoint as a webhook handler for asynchronous events.
// Configure your webhook in the stripe developer dashboard
// https://dashboard.stripe.com/test/webhooks
app.post("/webhook", async (req, res) => {
  let data, eventType;

  // Check if webhook signing is configured.
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers["stripe-signature"];
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.js`,
    // we can retrieve the event data directly from the request body.
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === "payment_intent.succeeded") {
    // Funds have been captured
    // Fulfill any orders, e-mail receipts, etc
    // To cancel the payment you will need to issue a Refund (https://stripe.com/docs/api/refunds)
    console.log("💰 Payment received!");
  } else if (eventType === "payment_intent.payment_failed") {
    console.log("❌ Payment failed.");
  }
  res.sendStatus(200);
});

app.listen(4242, () => console.log(`Node server listening on port ${4242}!`));
