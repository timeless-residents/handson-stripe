require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const fs = require("fs");
// Ensure icons directory exists
const iconsDir = path.join(__dirname, "../public/icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Configure multer for icon uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Save favicon.ico to public root, other icons to icons directory
    const dest = file.originalname === 'favicon.ico' ? path.join(__dirname, '../public') : iconsDir;
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

const app = express();

// Webhook endpoint must be defined before any middleware
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
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
});

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


// 基本的なミドルウェア設定
app.use(cors());

// JSONパーサーの設定
app.use(express.json());

// Static files
app.use(express.static("public"));

// Icon saving endpoint
app.post("/save-icon", upload.single("icon"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  res.json({ success: true, filename: req.file.filename });
});

// Configure cookie settings
app.use((req, res, next) => {
  res.cookie('stripe.csrf', 'your-csrf-token', {
    secure: true,
    sameSite: 'Strict',
    httpOnly: true
  });
  next();
});

// Enhanced Helmet configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'", "https://*.stripe.com", "https://*.stripe.network"],
        fontSrc: ["'self'", "https://*.stripe.com", "https://js.stripe.com", "data:", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
        scriptSrc: [
          "'self'",
          "https://*.stripe.com",
          "https://*.stripe.network",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://pay.google.com",
        ],
        styleSrc: ["'self'", "https://*.stripe.com", "'unsafe-inline'"],
        imgSrc: ["'self'", "https://*.stripe.com", "https://*.stripe.network", "data:", "https://pay.google.com"],
        frameSrc: [
          "'self'", 
          "https://*.stripe.com", 
          "https://js.stripe.com",
          "https://*.stripe.network",
          "https://pay.google.com",
          "https://*.google.com"
        ],
        connectSrc: [
          "'self'",
          "https://*.stripe.com",
          "https://*.stripe.network",
          "https://api.stripe.com",
          "https://pay.google.com"
        ],
        formAction: ["'self'", "https://*.stripe.com", "https://pay.google.com"],
        frameAncestors: ["'self'"],
        manifestSrc: ["'self'", "https://pay.google.com"],
        workerSrc: ["'self'", "blob:"],
        prefetchSrc: ["'self'", "https://*.stripe.com", "https://pay.google.com"]
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
  })
);
const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Webhook endpoint ready at /webhook");
});
