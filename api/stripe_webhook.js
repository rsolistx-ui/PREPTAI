// api/stripe-webhook.js — PREPT AI
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => resolve(Buffer.from(data)));
    req.on("error", reject);
  });
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const rawBody  = await getRawBody(req);
  const signature = req.headers["stripe-signature"];
  if (!signature) return res.status(400).json({ error: "Missing signature" });

  // Verify the webhook is genuinely from Stripe
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  // Only handle events we care about — ignore everything else
  const allowed = [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
    "invoice.payment_succeeded",
    "customer.subscription.trial_will_end",
  ];
  if (!allowed.includes(event.type)) {
    return res.status(200).json({ received: true, ignored: true });
  }

  try {
    // ── SUBSCRIPTION CREATED OR UPDATED ──────────────────────────────────────
    if (["customer.subscription.created", "customer.subscription.updated"].includes(event.type)) {
      const sub = event.data.object;
      if (!["active", "trialing"].includes(sub.status)) {
        return res.status(200).json({ received: true });
      }
      const customer = await stripe.customers.retrieve(sub.customer);
      if (!customer || customer.deleted) return res.status(200).json({ received: true });

      const email = customer.email;
      if (!isValidEmail(email)) return res.status(200).json({ received: true });

      const priceId = sub.items.data[0]?.price?.id;
      const plan = priceId === process.env.STRIPE_CAREER_PRICE_ID ? "career" : "pro";

      const { error } = await supabase
        .from("subscribers")
        .upsert({ email, stripe_customer_id: sub.customer, plan }, { onConflict: "email" });
      if (error) { console.error("Supabase upsert error:", error); return res.status(500).json({ error: "Database error" }); }
      console.log(`✓ Upgraded ${email} to ${plan}`);
    }

    // ── SUBSCRIPTION CANCELLED ────────────────────────────────────────────────
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const customer = await stripe.customers.retrieve(sub.customer);
      const email = customer?.email;
      if (!isValidEmail(email)) return res.status(200).json({ received: true });
      await supabase.from("subscribers").update({ plan: "free" }).eq("email", email);
      console.log(`✓ Downgraded ${email} to free — subscription cancelled`);
    }

    // ── PAYMENT FAILED ────────────────────────────────────────────────────────
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const customer = await stripe.customers.retrieve(invoice.customer);
      const email = customer?.email;
      if (!isValidEmail(email)) return res.status(200).json({ received: true });
      // Only downgrade after 3 failed attempts — Stripe retries automatically before that
      if ((invoice.attempt_count || 1) >= 3) {
        await supabase.from("subscribers").update({ plan: "free" }).eq("email", email);
        console.log(`✓ Downgraded ${email} to free — payment failed 3x`);
      }
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.status(500).json({ error: "Processing failed" });
  }
}
