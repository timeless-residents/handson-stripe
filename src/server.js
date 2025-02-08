require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const path = require("path");
const cors = require("cors");
const helmet = require("helmet"); // helmet import を追加

const app = express();

// 基本的なミドルウェア設定
app.use(cors());
app.use(express.static("public"));

// helmetの設定
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'", "https://*.stripe.com"],
        fontSrc: [
          "'self'",
          "https://*.stripe.com",
          "data:",
          "https://js.stripe.com",
        ],
        scriptSrc: [
          "'self'",
          "https://*.stripe.com",
          "'unsafe-inline'",
          "'unsafe-eval'",
        ],
        styleSrc: ["'self'", "https://*.stripe.com", "'unsafe-inline'"],
        imgSrc: ["'self'", "https://*.stripe.com", "data:"],
        frameSrc: ["'self'", "https://*.stripe.com", "https://js.stripe.com"],
        connectSrc: [
          "'self'",
          "https://*.stripe.com",
          "https://api.stripe.com",
        ],
        formAction: ["'self'", "https://*.stripe.com"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
  })
);


// 設定エンドポイント
app.get("/config", (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

// チェックアウトセッション作成エンドポイント
app.post("/create-checkout-session", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price:
            process.env.STRIPE_PRICE_ID || "price_1Qq4KNFwy2jHgB7D1oNdZJEK",
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${
        process.env.NODE_ENV === "production"
          ? process.env.PRODUCTION_URL
          : `${req.protocol}://${req.get("host")}`
      }/success.html`,
      cancel_url: `${
        process.env.NODE_ENV === "production"
          ? process.env.PRODUCTION_URL
          : `${req.protocol}://${req.get("host")}`
      }/cancel.html`,
      locale: "ja",
      // payment_method_optionsを修正
      payment_method_options: {
        card: {
          setup_future_usage: "on_session", // 'off'から'on_session'に変更
        },
      },
    });
    res.json({ id: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.post(
  "/webhook",
  express.raw({ type: "application/json" }), // この行が重要
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.WEBHOOK_SECRET
      );

      // イベントタイプに基づいて処理
      switch (event.type) {
        case "charge.succeeded":
          const charge = event.data.object;
          console.log("支払い成功:", charge.id);
          break;

        case "checkout.session.completed":
          const session = event.data.object;
          console.log("チェックアウト完了:", session.id);
          // ここで注文処理など
          break;

        case "payment_intent.succeeded":
          const paymentIntent = event.data.object;
          console.log("決済意図成功:", paymentIntent.id);
          break;

        case "payment_intent.created":
          console.log("決済意図作成:", event.data.object.id);
          break;

        case "charge.updated":
          console.log("支払い情報更新:", event.data.object.id);
          break;

        default:
          console.log(`未処理のイベントタイプ: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      console.error("Webhook エラー:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

// JSONパーサーの設定
app.use((req, res, next) => {
  if (req.originalUrl === "/webhook") {
    next();
  } else {
    express.json()(req, res, next);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Webhook endpoint ready at /webhook");
});
