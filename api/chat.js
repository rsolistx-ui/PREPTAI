import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const FREE_LIMITS = {
  chat: 3,
  match: 1,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, mode, userEmail } = req.body;

    if (!message || !mode) {
      return res.status(400).json({ error: "Missing message or mode" });
    }

    let plan = "free";

    if (userEmail) {
      const { data: subscriber } = await supabase
        .from("subscribers")
        .select("plan")
        .eq("email", userEmail)
        .single();

      if (subscriber) {
        plan = subscriber.plan;
      }
    }

    if (plan === "free") {
      const sessionCount = parseInt(
        req.headers["x-session-count"] || "0", 10
      );
      const limit = mode === "match" ? FREE_LIMITS.match : FREE_LIMITS.chat;

      if (sessionCount >= limit) {
        return res.status(403).json({
          error: "free_limit_reached",
          message: "You have reached your free limit. Upgrade to Pro to continue.",
          upgradeUrl: "https://preptai.co/#pricing",
        });
      }
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: message }],
    });

    const answer = response.content[0].text;

    return res.status(200).json({
      answer,
      plan,
      remaining:
        plan === "free"
          ? Math.max(0, FREE_LIMITS[mode] - (parseInt(req.headers["x-session-count"] || "0", 10) + 1))
          : "unlimited",
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({
      error: "Something went wrong. Please try again.",
    });
  }
}
