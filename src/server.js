require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const path = require("path"); // pathモジュールを追加

// 静的ファイルの提供
app.use(express.static("public"));

const helmet = require("helmet");

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false
}));

// カスタムCSPヘッダーを設定
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy-Report-Only',
    "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'; " +
    "font-src 'self' https: data: js.stripe.com *.stripe.com; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' js.stripe.com *.stripe.com; " +
    "style-src 'self' 'unsafe-inline' *.stripe.com; " +
    "img-src 'self' data: https: *.stripe.com; " +
    "connect-src 'self' *.stripe.com; " +
    "frame-src 'self' js.stripe.com *.stripe.com;"
  );
  next();
});

// favicon.icoのルートを追加
app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "favicon.ico"));
});
app.get('/config', (req, res) => {
    res.json({
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
  });
// CORSの設定を修正
const cors = require("cors");
app.use(cors());

// JSONパーサーの設定を修正
app.use((req, res, next) => {
  if (req.originalUrl === "/webhook") {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// チェックアウトセッション作成エンドポイント
app.post("/create-checkout-session", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: "price_1Qq4KNFwy2jHgB7D1oNdZJEK",
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url:
        process.env.NODE_ENV === "production"
          ? "https://handson-stripe.onrender.com/success.html"
          : `${req.protocol}://${req.get("host")}/success.html`,
      cancel_url:
        process.env.NODE_ENV === "production"
          ? "https://handson-stripe.onrender.com/cancel.html"
          : `${req.protocol}://${req.get("host")}/cancel.html`,
      locale: "ja",
    });
    res.json({ id: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Webhookハンドラー
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.WEBHOOK_SECRET
      );

      console.log("Webhook event type:", event.type);

      switch (event.type) {
        case "checkout.session.completed":
          const session = event.data.object;
          console.log("Payment successful for session:", session.id);
          // ここで支払い完了時の処理を実装
          break;

        case "payment_intent.payment_failed":
          const paymentIntent = event.data.object;
          console.log("Payment failed for intent:", paymentIntent.id);
          // ここで支払い失敗時の処理を実装
          break;
      }

      res.json({ received: true });
    } catch (err) {
      console.error("Webhook error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  console.log("Webhook endpoint ready at /webhook");
});
