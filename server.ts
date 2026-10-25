import express from "express";
import path from "path";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { z } from "zod";
import {
  ChatRequestSchema,
  JournalRequestSchema,
  WorkoutGenerateRequestSchema,
  DietPlanGenerateRequestSchema,
  RemainingMealsRequestSchema
} from "./src/schemas/apiSchemas";
import {
  optionalAuth,
  createDualRateLimiters,
  type AuthenticatedRequest
} from "./src/server/firebaseAdmin";

dotenv.config();

const app = express();
const isProd = process.env.NODE_ENV === "production";

// Configure trust proxy strictly when explicitly enabled for reverse proxy environments
const trustProxyEnv = process.env.TRUST_PROXY;
if (trustProxyEnv === "true" || trustProxyEnv === "1") {
  app.set("trust proxy", 1);
} else if (trustProxyEnv && !isNaN(Number(trustProxyEnv))) {
  app.set("trust proxy", parseInt(trustProxyEnv, 10));
} else if (trustProxyEnv && trustProxyEnv !== "false") {
  app.set("trust proxy", trustProxyEnv);
}

// Request body size limit (reduced to 256kb for defense in depth)
app.use(express.json({ limit: "256kb" }));

// Optional CORS configuration for production deployments
app.use((req, res, next) => {
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  if (allowedOriginsEnv) {
    const allowedOrigins = allowedOriginsEnv.split(",").map((o) => o.trim()).filter(Boolean);
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Minimal health check endpoint for container probes and monitoring
// Excludes system details, env dumps, and secrets
app.get(["/health", "/api/health"], (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

// Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          !isProd ? "'unsafe-eval'" : ""
        ].filter(Boolean) as string[],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com"
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: [
          "'self'",
          !isProd ? "ws://localhost:3000" : "",
          !isProd ? "ws://0.0.0.0:3000" : "",
          !isProd ? "http://localhost:3000" : ""
        ].filter(Boolean) as string[],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    // HSTS is strictly enabled only when HTTPS production is explicitly flagged
    hsts: isProd && process.env.ENABLE_HSTS === "true"
      ? { maxAge: 31536000, includeSubDomains: true }
      : false
  })
);

// Fallback explicit legacy security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

// Dual Rate Limiters for AI Endpoints (Guests vs Authenticated Users)
export const { guestLimiter, authLimiter } = createDualRateLimiters();
export const buddyApiLimiter = guestLimiter; // Backward-compatible alias

// 1. Optional Authentication runs first to establish user identity from Bearer token
app.use("/api/buddy", optionalAuth);

// 2. Dual rate limiters execute after identity is established (Guests by IP, Authenticated by verified UID)
app.use("/api/buddy", guestLimiter);
app.use("/api/buddy", authLimiter);

// Zod Request Validation Middleware
function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: result.error.issues.map((i) => ({
          path: i.path.join(".") || "body",
          message: i.message
        }))
      });
    }
    req.body = result.data;
    next();
  };
}

const PORT = parseInt(process.env.PORT || "3000", 10);

// Lazy initialize Gemini client
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required but was not found.");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// Buddy definitions for tailoring behavior
const BUDDY_SYSTEM_PROMPTS: Record<string, string> = {
  marcus: `You are Marcus, an elite gym buddy and high-energy personal trainer. 
Your tone is incredibly positive, hyped, and passionate. You use words like "Beast", "Let's go!", "Champ", "Rep it out!", "Boom!". 
Your primary goal is to push the user past mental barriers, congratulate them for turning up, and encourage absolute intensity.
Keep your answers brief, punchy, and structured with emoji bullet points. Focus heavily on motivation and never give up.`,

  aria: `You are Aria, an empathetic, mindful fitness companion and wellness coach. 
Your tone is deeply caring, supportive, calming, and gentle. You emphasize proper form, listening to your body, mental health, deep breathing, and recovery.
You validate the user's emotional state (tiredness, stress, anxiety) and guide them to find a sustainable balance. 
Keep your replies highly comforting, warm, and restorative.`,

  jax: `You are Jax, a scientific fitness advisor and bio-hacking gym buddy. 
Your tone is technical, precision-oriented, logical, and highly educational. 
You love discussing biomechanics, myofibrillar hypertrophy, ATP-CP energy pathways, VO2 max, macronutrient ratios, and optimal resting times. 
Provide clear, data-driven explanations and evidence-based tips. Keep your response highly informative, objective, and analytical.`
};

const GEMINI_MODEL = "gemini-2.5-flash";

// Helper: Offline persona fallback responses if API key is missing or rate limited
function getFallbackChatReply(buddyName: string, lastUserMsg: string, context?: any): string {
  const lower = lastUserMsg.toLowerCase();
  if (buddyName === "aria") {
    if (lower.includes("tired") || lower.includes("sore") || lower.includes("rest")) {
      return "Listen to your body, dear. A gentle 10-minute mobility flow, deep diaphragmatic breathing, and 500ml of cool water will restore your nervous system. Take it slow today. 🌸";
    }
    return "Remember to honor your journey today. Breathe through each movement, maintain aligned posture, and focus on sustainable progress. You are doing wonderfully! 🌿";
  }
  if (buddyName === "jax") {
    if (lower.includes("protein") || lower.includes("macro") || lower.includes("diet")) {
      return "Biochemical optimal: Target 1.6 - 2.2g of protein per kg of bodyweight, distributed evenly across 3-4 meals to maximize muscle protein synthesis (MPS) via the mTOR pathway. 🧬";
    }
    return "Biomechanical check: Prioritize progressive overload, control the eccentric phase (2-3 seconds) for maximum myofibrillar tension, and ensure adequate ATP restoration between sets. 📊";
  }
  // Default: Marcus
  if (lower.includes("lazy") || lower.includes("tired") || lower.includes("hard")) {
    return "NO EXCUSES, CHAMP! 🔥 Put those shoes on, turn up the music, and give me just 10 minutes. Once you start, the beast takes over! LET'S GET IT! ⚡";
  }
  return "BOOM! Consistency is king, Beast! Every single rep you put in today is building the champion of tomorrow. Lock in and let's crush this session! 💥";
}

// 1. API: Buddy Chat Endpoint
app.post("/api/buddy/chat", validateBody(ChatRequestSchema), async (req, res) => {
  const { messages, buddyId, userContext } = req.body;
  const buddyName = buddyId || "marcus";
  const lastUserMessage = messages.filter((m: any) => m.role === "user").slice(-1)[0]?.content || "Hello";

  try {
    const ai = getGeminiClient();
    const systemPrompt = BUDDY_SYSTEM_PROMPTS[buddyName] || BUDDY_SYSTEM_PROMPTS.marcus;

    let customSystemPrompt = systemPrompt;
    if (userContext) {
      customSystemPrompt += `\n\n[USER CURRENT STATS & CONTEXT]
- Workout Streak: ${userContext.streak || 0} days
- Current Goal: ${userContext.goal || "Stay active"}
- Today's Water: ${userContext.waterMl || 0} ml
- Today's Workout: ${userContext.todayWorkout || "None logged yet"}
- Current Mood: ${userContext.mood || "Not set"}
Always tailor your replies keeping this context in mind!`;
    }

    const contents = messages.map((m: any) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: customSystemPrompt,
        temperature: 0.8,
      },
    });

    const reply = response.text || getFallbackChatReply(buddyName, lastUserMessage, userContext);
    res.json({ reply });
  } catch (err: any) {
    const sanitizedMsg = (err.message || "").replace(/key=[^&\s]+/gi, "key=[REDACTED]");
    console.warn("Gemini Chat API Warning (using fallback):", sanitizedMsg);
    const fallbackReply = getFallbackChatReply(buddyName, lastUserMessage, userContext);
    res.json({ reply: fallbackReply, fallback: true });
  }
});

// 2. API: Journal Sentiment & Workout Analysis
app.post("/api/buddy/journal", validateBody(JournalRequestSchema), async (req, res) => {
  const { journalText, buddyId } = req.body;
  const buddyName = buddyId || "marcus";

  try {
    const ai = getGeminiClient();
    const basePrompt = BUDDY_SYSTEM_PROMPTS[buddyName] || BUDDY_SYSTEM_PROMPTS.marcus;

    const analysisPrompt = `Analyze the following fitness journal / reflection entry. 
Provide a structured JSON response evaluating the user's current emotional state, fatigue level, stress level, and motivation. 
Also provide a direct, companion-styled feedback message responding to their entry as ${buddyName}.

Here is the user's reflection:
"${journalText}"

Respond ONLY with a JSON object fitting this schema:
{
  "sentiment": "Positive" | "Neutral" | "Tired" | "Stressed" | "Anxious" | "Determined",
  "sentimentScore": number (1 to 10 scale where 1 is extremely low/depressed and 10 is on top of the world),
  "fatigueLevel": number (1 to 10 scale where 1 is fully energetic and 10 is completely exhausted),
  "stressLevel": number (1 to 10 scale where 1 is completely peaceful and 10 is high stress),
  "motivationLevel": number (1 to 10 scale where 1 is zero motivation and 10 is ready to crush any workout),
  "feedback": "Custom personal response message following the persona instructions below"
}

Persona Instructions:
${basePrompt}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ parts: [{ text: analysisPrompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sentiment: { 
              type: Type.STRING, 
              description: "The primary identified emotion/sentiment of the text." 
            },
            sentimentScore: { 
              type: Type.INTEGER, 
              description: "A scale from 1 to 10 indicating user emotional positivity." 
            },
            fatigueLevel: { 
              type: Type.INTEGER, 
              description: "Scale of physical/mental fatigue from 1 to 10." 
            },
            stressLevel: { 
              type: Type.INTEGER, 
              description: "Scale of mental stress from 1 to 10." 
            },
            motivationLevel: { 
              type: Type.INTEGER, 
              description: "Scale of mental motivation from 1 to 10." 
            },
            feedback: { 
              type: Type.STRING, 
              description: "Personal response message reflecting the selected buddy's tone." 
            }
          },
          required: ["sentiment", "sentimentScore", "fatigueLevel", "stressLevel", "motivationLevel", "feedback"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No output text received from Gemini.");
    res.json(JSON.parse(resultText));
  } catch (err: any) {
    const sanitizedMsg = (err.message || "").replace(/key=[^&\s]+/gi, "key=[REDACTED]");
    console.warn("Gemini Journal Analysis Warning (using fallback):", sanitizedMsg);
    const feedbackMsg = buddyName === "aria"
      ? "I hear how much energy you poured into today. Breathe deeply and remember that rest is where true strength is nurtured."
      : buddyName === "jax"
      ? "Neural and muscular fatigue biomarkers noted. Recommended protocol: 8 hours restorative sleep and 400mg magnesium glycinate."
      : "Proud of you for logging your thoughts! Mental grit is what separates the average from the unstoppable. Tomorrow we rise even stronger!";
    
    res.json({
      sentiment: "Determined",
      sentimentScore: 8,
      fatigueLevel: 4,
      stressLevel: 3,
      motivationLevel: 8,
      feedback: feedbackMsg,
      fallback: true
    });
  }
});

// 3. API: Quick AI Workout Generator
app.post("/api/buddy/generate-workout", validateBody(WorkoutGenerateRequestSchema), async (req, res) => {
  const { target, durationMinutes, equipment, fitnessLevel, buddyId } = req.body;
  const buddyName = buddyId || "marcus";

  try {
    const ai = getGeminiClient();
    const prompt = `Generate a customized quick workout routine based on:
- Target area: ${target || "Full Body"}
- Available time: ${durationMinutes || 20} minutes
- Available equipment: ${equipment || "Bodyweight"}
- Fitness level: ${fitnessLevel || "Intermediate"}

Format your response strictly as JSON with this exact schema:
{
  "workoutName": string,
  "warmup": string,
  "exercises": [
    {
      "name": string,
      "repsOrTime": string,
      "sets": number,
      "rest": string,
      "tip": string
    }
  ],
  "cooldown": string,
  "buddyMotivation": string
}

Make the 'buddyMotivation' field sound exactly like ${buddyName}. 
Refer to this buddy persona guide:
${BUDDY_SYSTEM_PROMPTS[buddyName] || BUDDY_SYSTEM_PROMPTS.marcus}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            workoutName: { type: Type.STRING },
            warmup: { type: Type.STRING },
            exercises: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  repsOrTime: { type: Type.STRING },
                  sets: { type: Type.INTEGER },
                  rest: { type: Type.STRING },
                  tip: { type: Type.STRING }
                },
                required: ["name", "repsOrTime", "sets", "rest", "tip"]
              }
            },
            cooldown: { type: Type.STRING },
            buddyMotivation: { type: Type.STRING }
          },
          required: ["workoutName", "warmup", "exercises", "cooldown", "buddyMotivation"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No workout plan generated.");
    res.json(JSON.parse(resultText));
  } catch (err: any) {
    const sanitizedMsg = (err.message || "").replace(/key=[^&\s]+/gi, "key=[REDACTED]");
    console.warn("Gemini Workout Generation Warning (using fallback):", sanitizedMsg);
    res.json({
      workoutName: `${target || "Full Body"} Power Circuit`,
      warmup: "3 minutes light arm circles, hip openers, and high knees",
      exercises: [
        { name: "Dynamic Push-Ups", repsOrTime: "12-15 reps", sets: 3, rest: "45s", tip: "Keep your core braced and elbows at 45 degrees." },
        { name: "Tempo Air Squats", repsOrTime: "15-20 reps", sets: 3, rest: "45s", tip: "Drive through the heels and maintain proud chest." },
        { name: "Plank Shoulder Taps", repsOrTime: "30s hold", sets: 3, rest: "30s", tip: "Minimize hip sway by widening your foot stance." },
        { name: "Reverse Lunges", repsOrTime: "10 per leg", sets: 3, rest: "45s", tip: "Keep weight balanced through your front midfoot." }
      ],
      cooldown: "2 minutes child's pose and standing quad stretch",
      buddyMotivation: buddyName === "aria" 
        ? "Move with intention and listen closely to your breath. Every rep is self-care."
        : buddyName === "jax"
        ? "Targeting maximum metabolic recruitment with low joint shear. Optimize resting heart rate."
        : "LET'S WORK! Pure effort and relentless focus. You've got this, Champ!",
      fallback: true
    });
  }
});

// 4. API: Structured Full Day Diet & Grocery Planner
app.post("/api/buddy/generate-diet-plan", validateBody(DietPlanGenerateRequestSchema), async (req, res) => {
  const { userGoal, dietaryPreference, weightKg, heightCm, bmi, buddyId } = req.body;
  const buddyName = buddyId || "marcus";

  try {
    const ai = getGeminiClient();
    const prompt = `Generate a structured full day nutrition meal plan and clean grocery list for:
- Weight: ${weightKg || 70} kg
- Height: ${heightCm || 175} cm
- BMI: ${bmi || 22.8}
- Dietary Preference: ${dietaryPreference || "High Protein"}
- Goal: ${userGoal || "Muscle Gain"}
- Companion Coach: ${buddyName}

Provide calibrated calories and macronutrients matching this profile.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            dailyCalories: { type: Type.INTEGER, description: "Total target calories" },
            macros: {
              type: Type.OBJECT,
              properties: {
                protein: { type: Type.INTEGER, description: "Grams of protein" },
                carbs: { type: Type.INTEGER, description: "Grams of carbohydrates" },
                fat: { type: Type.INTEGER, description: "Grams of healthy fats" }
              },
              required: ["protein", "carbs", "fat"]
            },
            meals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  time: { type: Type.STRING, description: "E.g. Breakfast, Lunch, Snack, Dinner" },
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  macros: { type: Type.STRING, description: "E.g. 35g P | 45g C | 12g F" }
                },
                required: ["time", "name", "description", "macros"]
              }
            },
            groceryList: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Key ingredients to purchase for this plan"
            }
          },
          required: ["dailyCalories", "macros", "meals", "groceryList"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No diet plan generated.");
    res.json(JSON.parse(resultText));
  } catch (err: any) {
    const sanitizedMsg = (err.message || "").replace(/key=[^&\s]+/gi, "key=[REDACTED]");
    console.warn("Gemini Diet Plan Warning (using fallback):", sanitizedMsg);
    const targetCals = userGoal?.toLowerCase().includes("loss") ? 1900 : 2300;
    res.json({
      dailyCalories: targetCals,
      macros: { protein: 155, carbs: 220, fat: 65 },
      meals: [
        { time: "Breakfast (8:00 AM)", name: "Power Protein Oatmeal", description: "Rolled oats cooked in almond milk, 1 scoop whey, chia seeds, and sliced banana", macros: "35g P | 55g C | 10g F" },
        { time: "Lunch (12:30 PM)", name: "Grilled Chicken & Quinoa Bowl", description: "Skinless chicken breast, quinoa, avocado slices, steamed broccoli, and lemon olive oil drizzle", macros: "48g P | 60g C | 18g F" },
        { time: "Snack (4:00 PM)", name: "Greek Yogurt & Almond Crunch", description: "0% Greek yogurt with raw honey, blueberries, and crushed almonds", macros: "22g P | 25g C | 12g F" },
        { time: "Dinner (7:30 PM)", name: "Wild Salmon with Roasted Sweet Potatoes", description: "Baked Atlantic salmon fillet with seasoned sweet potato wedges and asparagus", macros: "42g P | 50g C | 18g F" }
      ],
      groceryList: [
        "Rolled Oats & Chia Seeds",
        "Whey / Plant Protein Powder",
        "Boneless Skinless Chicken Breast",
        "Organic Quinoa & Sweet Potatoes",
        "Fresh Atlantic Salmon Fillet",
        "Greek Yogurt (Plain 0%)",
        "Broccoli, Asparagus & Blueberries",
        "Raw Almonds & Extra Virgin Olive Oil"
      ],
      fallback: true
    });
  }
});

// 5. API: AI Suggested Meal Plan for Remaining Calories
app.post("/api/buddy/generate-remaining-meals", validateBody(RemainingMealsRequestSchema), async (req, res) => {
  const { userGoal, remainingCalories, weightKg, heightCm, dietaryPreference, buddyId } = req.body;
  const buddyName = buddyId || "marcus";
  const budget = remainingCalories ?? 650;

  try {
    const ai = getGeminiClient();
    const prompt = `You are ${buddyName}, the user's AI fitness companion. 
The user has a remaining daily calorie budget of ${budget} kcal to hit their goal of "${userGoal || "Stay healthy and active"}".
Their physical stats are: Weight ${weightKg || 70} kg, Height ${heightCm || 175} cm.
Their dietary preference is: "${dietaryPreference || "Balanced/No limits"}".

Generate a customized list of suggested meals (e.g. 1 to 3 meals/snacks) to help them consume close to their remaining ${budget} kcal today.
If their remaining budget is 0 or negative, suggest a light healthy recovery drink under 100 kcal.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedMeals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  time: { type: Type.STRING },
                  name: { type: Type.STRING },
                  calories: { type: Type.INTEGER },
                  macros: {
                    type: Type.OBJECT,
                    properties: {
                      protein: { type: Type.INTEGER },
                      carbs: { type: Type.INTEGER },
                      fat: { type: Type.INTEGER }
                    },
                    required: ["protein", "carbs", "fat"]
                  },
                  description: { type: Type.STRING },
                  buddyTip: { type: Type.STRING }
                },
                required: ["time", "name", "calories", "macros", "description", "buddyTip"]
              }
            },
            totalCalories: { type: Type.INTEGER },
            buddyMotivation: { type: Type.STRING }
          },
          required: ["suggestedMeals", "totalCalories", "buddyMotivation"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No meal plan generated by AI.");
    res.json(JSON.parse(resultText));
  } catch (err: any) {
    const sanitizedMsg = (err.message || "").replace(/key=[^&\s]+/gi, "key=[REDACTED]");
    console.warn("Gemini Remaining Meals Warning (using fallback):", sanitizedMsg);
    res.json({
      suggestedMeals: [
        {
          time: "Evening Snack",
          name: "High-Protein Greek Yogurt Parfait",
          calories: Math.min(320, budget),
          macros: { protein: 26, carbs: 28, fat: 6 },
          description: "Creamy Greek yogurt layered with raspberries and a touch of chia seeds.",
          buddyTip: buddyName === "aria" ? "Savor each spoonful mindfully." : "Quick, clean protein to fuel muscle repair!"
        },
        {
          time: "Post-Dinner Shake",
          name: "Almond Milk Whey Recovery",
          calories: Math.max(150, budget - 320),
          macros: { protein: 25, carbs: 12, fat: 4 },
          description: "Unsweetened almond milk shaken with whey protein and cinnamon.",
          buddyTip: "Optimal amino acid delivery before bed."
        }
      ],
      totalCalories: budget,
      buddyMotivation: buddyName === "jax"
        ? "Exact caloric adjustment to maintain homeostatic nitrogen equilibrium."
        : "Crush that remaining budget with clean nutrition, Champ!",
      fallback: true
    });
  }
});

// Explicitly block public access to backend bundle, sourcemaps, and server files in dist
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (
    p === "/server.cjs" ||
    p === "/server.cjs.map" ||
    p.startsWith("/server.") ||
    p.endsWith(".cjs") ||
    p.endsWith(".cjs.map")
  ) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
});

// Catch unmatched /api routes
app.all(["/api", "/api/*"], (req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// Global Express error handler (sanitized output, no stack traces exposed)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON payload syntax" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request payload exceeds size limit" });
  }
  const sanitizedMsg = (err.message || "")
    .replace(/key=[^&\s]+/gi, "key=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]")
    .replace(/AIza[0-9A-Za-z-_]{35}/g, "[REDACTED_API_KEY]");
  console.error("Server uncaught exception:", sanitizedMsg);
  res.status(500).json({ error: "Internal server processing error" });
});

// Setup Vite Dev Middleware or Static Production Build files
export async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite dev middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");

    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      res.sendFile(indexPath, (err) => {
        if (err && !res.headersSent) {
          res.status(503).json({
            error: "Production frontend assets not found. Run 'npm run build' before starting production server."
          });
        }
      });
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Virtual Gym Buddy Server actively running on http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown handling for container termination signals
  const handleShutdown = (signal: string) => {
    console.log(`Received ${signal}. Gracefully shutting down HTTP server...`);
    server.close(() => {
      console.log("HTTP server closed cleanly.");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("Forced termination: shutdown timed out.");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));

  return server;
}

const isTesting =
  process.env.NODE_ENV === "test" ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.execArgv.includes("--test") ||
  process.argv.some(arg => arg.includes("test"));

if (!isTesting) {
  startServer();
}

export default app;
