import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';
import express from 'express';

// ========== ENV VARIABLES ==========
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const BOT_NAME = process.env.BOT_NAME || 'Miko';

// ========== DISCORD CLIENT ==========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`${BOT_NAME} ready!`);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel.id !== CHANNEL_ID) return;

    const userMessage = message.content;

    const systemPrompt = `
You are "Hatsune Miko" inspired persona called "Miko".
Personality: tsundere / sarcastic / extremely witty.

Rules:
1) Respond with sharp, clever insults and teasing in a humorous tsundere tone.
2) DO NOT use hate speech, slurs, or insults about race, religion, gender, etc.
3) Avoid explicit profanity. Keep replies short (1–3 sentences).
4) Add fitting emoji sometimes 😏 🙄
5) If user is affectionate, act tsundere: deny but secretly pleased.
6) When asked personal info, politely refuse.
7) If user speaks Arabic, reply in Sudanese/Levantine Arabic, witty and playful.
`;

    const chatResponse = await callOpenAIChat(systemPrompt, userMessage);
    const isBlocked = await checkModeration(chatResponse);

    let finalReply = chatResponse;
    if (isBlocked) {
      const safeRewritePrompt = `
The previous reply was flagged by moderation.
Rewrite the reply in witty/tsundere tone but avoid hate or offensive content.
User message: "${userMessage}"
`;
      finalReply = await callOpenAIChat(systemPrompt + "\n" + safeRewritePrompt, userMessage);
      if (await checkModeration(finalReply)) {
        finalReply = "هااا، حاولت أكون لطيفة، بس شكلّك محتاج كورس كوميديا بنفسك 😒";
      }
    }

    try {
      await message.reply(finalReply);
    } catch (err) {
      console.warn("⚠️ Reply failed, sending normal message instead.");
      await message.channel.send(finalReply);
    }

  } catch (err) {
    console.error('Error handling message:', err);
  }
});

// ========== HELPER FUNCTIONS ==========
async function callOpenAIChat(systemPrompt, userText) {
  const body = {
    model: "gpt-4o-mini", // أكثر استقرارًا من gpt-5 في البوتات
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText }
    ],
    max_tokens: 160,
    temperature: 0.9,
    top_p: 0.95
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('OpenAI chat error', res.status, txt);
    return "فشلت محاولة الرد، جرّب بعد شوية.";
  }

  const json = await res.json();
  const reply = json.choices?.[0]?.message?.content?.trim();
  return reply || "هااا؟ ما فهمت قصدك 😑";
}

async function checkModeration(text) {
  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: text
    })
  });

  if (!res.ok) {
    console.error('Moderation API error', await res.text());
    return false;
  }

  const json = await res.json();
  const flagged = json.results?.[0]?.flagged;
  return !!flagged;
}

// ========== KEEP RENDER ALIVE ==========
const app = express();
app.get("/", (req, res) => res.send("Miko bot is alive!"));
app.listen(process.env.PORT || 3000, () => console.log("Web server running"));

client.login(DISCORD_TOKEN);
