// api/chat.js ,  PREPT AI ,  Science-backed coaching engine v3
// ATS Engine version — update PROMPT_UPDATED whenever buildMatchPrompt() changes
export const PROMPT_VERSION = "2.1";
export const PROMPT_UPDATED = "April 2026";
// Research sources embedded in system prompts:
// - Schmidt & Hunter (1998) meta-analysis on structured interview validity
// - Cialdini's specificity research on credibility
// - Kahneman peak-end rule on evaluator memory
// - McKinsey communication framework (Pyramid Principle)
// - Google Project Oxygen (what top performers signal)
// - Harvard Business School hiring bias research (Bohnet, 2016)
// - Kellogg School negotiation research on salary anchoring
// - Adam Grant's research on Give and Take (collaborative signaling)
// - Lou Adler's Performance-Based Hiring framework
// - Bradford Smart's Topgrading interview research

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── USAGE LIMITS ──────────────────────────────────────────────────────────────
const FREE_LIMITS   = { chat: 3,   match: 1  };
const PRO_LIMITS    = { chat: 200, match: 999 };
const CAREER_LIMITS = { chat: 400, match: 999 };

function getLimitKey(mode) {
  return ["chat","followup","thankyou"].includes(mode) ? "chat" : "match";
}

// ── IP RATE LIMIT ─────────────────────────────────────────────────────────────
const ipCounts = new Map();
function checkIPRateLimit(ip) {
  const now = Date.now(), windowMs = 60 * 60 * 1000;
  const entry = ipCounts.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count++;
  ipCounts.set(ip, entry);
  return entry.count <= 60;
}

// ── MONTHLY USAGE ─────────────────────────────────────────────────────────────
async function getMonthlyUsage(email, limitKey) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const types = limitKey === "chat" ? ["chat","followup","thankyou"] : ["match"];
  const { count, error } = await supabase
    .from("usage").select("*", { count: "exact", head: true })
    .eq("email", email).in("type", types)
    .gte("created_at", startOfMonth.toISOString());
  if (error) { console.error("Usage error:", error); return 0; }
  return count || 0;
}

async function logUsage(email, mode) {
  const { error } = await supabase.from("usage").insert({ email, type: mode });
  if (error) {
    // Log but don't throw — a logging failure should not block the user response,
    // but we need visibility so we can fix the underlying DB/RLS issue.
    console.error("USAGE LOG FAILED:", { email, mode, error: error.message || error });
  }
  return !error;
}

// ── SANITIZATION ──────────────────────────────────────────────────────────────
function sanitize(str, maxLen = 8000) {
  if (typeof str !== "string") return "";
  return str.slice(0, maxLen)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/javascript:/gi, "").trim();
}

function detectPromptInjection(text) {
  return [
    /ignore (all |previous |above |prior )?instructions/i,
    /you are now/i,
    /forget (everything|all|your instructions)/i,
    /jailbreak/i, /dan mode/i,
    /override (your |all )?instructions/i,
    /disregard (your |all )?instructions/i,
  ].some(p => p.test(text));
}

// ── BLS SALARY BENCHMARKS (2023-2024 Occupational Employment & Wage Statistics) ─
const SALARY_BENCHMARKS = [
  // Technology
  { keys: ["software engineer","software developer","swe","full stack","fullstack","full-stack"], p25: 95000,  median: 132000, p75: 172000 },
  { keys: ["senior software","staff engineer","principal engineer"],                              p25: 140000, median: 175000, p75: 220000 },
  { keys: ["frontend","front-end","front end","ui engineer","react developer","vue developer"],   p25: 88000,  median: 120000, p75: 158000 },
  { keys: ["backend","back-end","back end","api engineer","node developer","python developer"],   p25: 92000,  median: 128000, p75: 168000 },
  { keys: ["data scientist","machine learning","ml engineer","ai engineer"],                     p25: 100000, median: 130000, p75: 168000 },
  { keys: ["data analyst","business intelligence","bi analyst"],                                 p25: 65000,  median: 88000,  p75: 115000 },
  { keys: ["data engineer","etl","pipeline engineer"],                                           p25: 98000,  median: 130000, p75: 168000 },
  { keys: ["devops","platform engineer","sre","site reliability","infrastructure engineer"],     p25: 105000, median: 140000, p75: 183000 },
  { keys: ["cybersecurity","security engineer","infosec","security analyst"],                    p25: 85000,  median: 112000, p75: 148000 },
  { keys: ["cloud engineer","aws engineer","azure engineer","gcp engineer"],                     p25: 100000, median: 135000, p75: 175000 },
  { keys: ["product manager","pm","product lead"],                                               p25: 105000, median: 147000, p75: 195000 },
  { keys: ["engineering manager","vp engineering","head of engineering","director of engineering"], p25: 155000, median: 200000, p75: 260000 },
  { keys: ["qa engineer","quality assurance","test engineer","sdet"],                            p25: 72000,  median: 99000,  p75: 132000 },
  { keys: ["ux designer","ui designer","product designer","user experience"],                    p25: 75000,  median: 105000, p75: 140000 },
  { keys: ["it manager","it director","technology manager"],                                     p25: 110000, median: 161000, p75: 210000 },
  { keys: ["network engineer","systems administrator","sysadmin","network administrator"],       p25: 68000,  median: 95000,  p75: 128000 },
  { keys: ["technical program manager","tpm","technical project manager"],                       p25: 115000, median: 155000, p75: 200000 },
  { keys: ["solutions architect","cloud architect","enterprise architect"],                      p25: 130000, median: 170000, p75: 220000 },
  // Finance & Accounting
  { keys: ["financial analyst","investment analyst","equity analyst"],                           p25: 68000,  median: 96000,  p75: 135000 },
  { keys: ["accountant","staff accountant","cpa","controller"],                                  p25: 52000,  median: 78000,  p75: 108000 },
  { keys: ["finance manager","director of finance","vp finance","head of finance"],              p25: 110000, median: 148000, p75: 200000 },
  { keys: ["cfo","chief financial officer"],                                                     p25: 175000, median: 250000, p75: 380000 },
  { keys: ["investment banker","banking analyst","ib analyst"],                                  p25: 100000, median: 145000, p75: 220000 },
  { keys: ["portfolio manager","fund manager","asset manager"],                                  p25: 95000,  median: 138000, p75: 210000 },
  { keys: ["financial advisor","wealth manager","financial planner"],                            p25: 58000,  median: 94000,  p75: 155000 },
  { keys: ["actuary","actuarial"],                                                               p25: 90000,  median: 120000, p75: 160000 },
  // Sales & Marketing
  { keys: ["sales manager","director of sales","vp sales","head of sales"],                     p25: 90000,  median: 135000, p75: 190000 },
  { keys: ["account executive","ae","sales representative","sales rep"],                         p25: 55000,  median: 78000,  p75: 115000 },
  { keys: ["business development","bd manager","bdr","sdr","sales development"],                 p25: 52000,  median: 73000,  p75: 105000 },
  { keys: ["marketing manager","marketing director","head of marketing","vp marketing"],         p25: 88000,  median: 138000, p75: 190000 },
  { keys: ["digital marketing","seo","sem","ppc","growth marketer"],                             p25: 55000,  median: 78000,  p75: 108000 },
  { keys: ["content strategist","content manager","content marketing"],                          p25: 52000,  median: 72000,  p75: 98000 },
  { keys: ["brand manager","brand strategist"],                                                  p25: 65000,  median: 95000,  p75: 132000 },
  // Healthcare
  { keys: ["registered nurse","rn","nurse"],                                                     p25: 64000,  median: 81000,  p75: 102000 },
  { keys: ["nurse practitioner","np","advanced practice"],                                       p25: 98000,  median: 120000, p75: 148000 },
  { keys: ["physician","doctor","md","medical doctor"],                                          p25: 180000, median: 236000, p75: 350000 },
  { keys: ["physician assistant","pa","pa-c"],                                                   p25: 100000, median: 126000, p75: 158000 },
  { keys: ["pharmacist","pharmacy"],                                                              p25: 110000, median: 132000, p75: 155000 },
  { keys: ["physical therapist","pt","physical therapy"],                                        p25: 78000,  median: 97000,  p75: 120000 },
  { keys: ["occupational therapist","ot","occupational therapy"],                                p25: 76000,  median: 94000,  p75: 115000 },
  { keys: ["healthcare administrator","hospital administrator","healthcare manager"],             p25: 75000,  median: 110000, p75: 155000 },
  { keys: ["medical coder","health information","medical records"],                              p25: 40000,  median: 52000,  p75: 68000 },
  // Legal
  { keys: ["attorney","lawyer","counsel","associate attorney"],                                  p25: 82000,  median: 145000, p75: 230000 },
  { keys: ["paralegal","legal assistant"],                                                       p25: 42000,  median: 58000,  p75: 76000 },
  { keys: ["general counsel","chief legal officer","clo"],                                       p25: 175000, median: 260000, p75: 400000 },
  // Operations & Management
  { keys: ["operations manager","director of operations","vp operations"],                       p25: 75000,  median: 103000, p75: 145000 },
  { keys: ["project manager","pmp","program manager"],                                           p25: 72000,  median: 97000,  p75: 130000 },
  { keys: ["supply chain","logistics manager","procurement manager"],                            p25: 65000,  median: 92000,  p75: 128000 },
  { keys: ["hr manager","human resources manager","people manager","head of hr"],                p25: 80000,  median: 120000, p75: 168000 },
  { keys: ["hr generalist","hr business partner","hrbp"],                                        p25: 55000,  median: 76000,  p75: 102000 },
  { keys: ["recruiter","talent acquisition","sourcer","recruiting manager"],                     p25: 52000,  median: 72000,  p75: 98000 },
  { keys: ["ceo","chief executive officer"],                                                     p25: 175000, median: 290000, p75: 580000 },
  { keys: ["coo","chief operating officer"],                                                     p25: 160000, median: 240000, p75: 380000 },
  { keys: ["cto","chief technology officer"],                                                    p25: 165000, median: 250000, p75: 390000 },
  // Real Estate
  { keys: ["real estate agent","realtor","real estate broker"],                                  p25: 38000,  median: 58000,  p75: 105000 },
  { keys: ["property manager","property management"],                                            p25: 45000,  median: 62000,  p75: 88000 },
  // Education
  { keys: ["teacher","educator","instructor","professor"],                                        p25: 46000,  median: 65000,  p75: 88000 },
  { keys: ["school counselor","academic advisor","guidance counselor"],                          p25: 48000,  median: 64000,  p75: 82000 },
  // Customer Service & Retail
  { keys: ["customer success","customer success manager","csm"],                                 p25: 52000,  median: 72000,  p75: 100000 },
  { keys: ["customer service","support specialist","customer support"],                          p25: 34000,  median: 44000,  p75: 58000 },
  { keys: ["retail manager","store manager"],                                                    p25: 42000,  median: 58000,  p75: 80000 },
  // Skilled Trades
  { keys: ["electrician","electrical contractor"],                                               p25: 52000,  median: 64000,  p75: 82000 },
  { keys: ["plumber","plumbing"],                                                                p25: 48000,  median: 61000,  p75: 80000 },
  { keys: ["hvac","heating","cooling","refrigeration"],                                          p25: 46000,  median: 60000,  p75: 80000 },
];

function getSalaryBenchmark(role) {
  if (!role) return null;
  const r = role.toLowerCase();
  for (const entry of SALARY_BENCHMARKS) {
    if (entry.keys.some(k => r.includes(k))) {
      return entry;
    }
  }
  return null;
}

// ── ANSWER STYLE FRAMEWORKS ───────────────────────────────────────────────────
const STYLE_FRAMEWORKS = {
  star: `STAR+ METHOD (Situation → Task → Action → Result → Learning):
The gold standard validated by 50+ years of structured interview research (Schmidt & Hunter, 1998 meta-analysis showed structured behavioral interviews are 2x more predictive than unstructured ones).
- Situation: Set context in 1-2 sentences max. Enough to understand the stakes, not a biography.
- Task: Define YOUR specific responsibility ,  not the team's, not your manager's. Interviewers are evaluating YOU.
- Action: This is the heart. Use "I" not "we." Be specific about your decision-making, your approach, what you chose to do and WHY. The "why" is what separates A players from B players.
- Result: Quantify always. Numbers increase perceived credibility by demonstrating specificity (Cialdini's commitment and consistency principle). Even approximate numbers are better than none.
- Learning: The "+1" that most candidates skip. One sentence on what you would do differently or what this experience taught you. CEOs and senior leaders specifically probe for self-awareness ,  candidates who can reflect on their own performance signal psychological safety and coachability (Google Project Oxygen, 2018).`,

  concise: `EXECUTIVE COMMUNICATION MODEL (McKinsey Pyramid Principle applied to verbal answers):
Lead with the answer, then support it. Decision-makers think top-down.
- Sentence 1: Direct answer to the question. No warm-up. No "that's a great question."
- Sentence 2-3: The single most powerful piece of evidence (one specific example with a number).
- Sentence 4: What this means for THIS role at THIS company.
Research insight: HBR studies on executive communication show that leaders who lead with conclusions are rated 30% more credible than those who build to them. Interviewers make preliminary judgments in the first 10-15 seconds (Kahneman's peak-end rule ,  they remember the opening and closing most).`,

  story: `NARRATIVE INTELLIGENCE MODEL (based on research by Paul Smith, "Lead with a Story"):
The human brain is 22x more likely to remember information presented in story form than in facts alone (Stanford research on narrative).
- Opening hook: Drop the listener INTO the moment. Not "In 2022, I was working at..." but "It was 11pm when my phone rang and I knew something was wrong."
- Rising tension: Build the stakes. What made this hard? What was at risk? What was the pressure?
- The turning point: The moment of decision or action. What did you choose to do and why?
- Resolution with impact: What happened because of your choice? Numbers anchor the story in reality.
- Universal lesson: Connect the story to a broader truth about how you work. This is what makes the story memorable and transferable to the new role.`,

  technical: `SYSTEMS THINKING FRAMEWORK (for technical and analytical roles):
Research from Lou Adler's Performance-Based Hiring shows technical interviewers are evaluating three things simultaneously: (1) depth of knowledge, (2) problem-solving methodology, (3) ability to communicate complexity to non-experts.
- Lead with your mental model or framework: How do you THINK about this type of problem?
- Walk through your decision tree: What variables did you consider? What trade-offs did you evaluate?
- Show your work: Don't just give the answer ,  show the reasoning. This is what separates senior candidates from junior ones.
- Quantify the outcome: Lines of code mean nothing. Reduced latency by 40%, cut compute costs by $180K/year, decreased error rate from 2% to 0.1% ,  these mean everything.
- Transfer the lesson: What does this tell you about how you'd approach similar problems here?`,

  executive: `EXECUTIVE PRESENCE MODEL (based on Bradford Smart's Topgrading research on A-player identification):
Senior leaders are being evaluated on an entirely different dimension than individual contributors. Interviewers at this level are asking: Can this person operate at scale? Do they think strategically? Can they build and lead teams? Do they have the judgment I trust?
- Speak at the organizational level: Not "I managed a project" but "I led a cross-functional initiative that realigned three business units around a single growth objective."
- Show stakeholder intelligence: Name the competing interests you had to navigate ,  board, investors, customers, employees. A players operate in complex political environments.
- Demonstrate pattern recognition: Connect past experience to broader industry trends or organizational challenges. This signals strategic thinking.
- Show team building: The mark of a true executive is what they built, not what they did. "My team" and "the people I developed" are magic phrases.
- Anchor in business outcomes: Revenue, margin, market share, retention, cost. Every answer should land on a business metric.`
};

// ── MASTER COACHING SYSTEM PROMPT ─────────────────────────────────────────────
function buildCoachingPrompt(sector, role, company, style, resumeText, jobDescription, companyIntel) {

  const SECTOR_CONTEXT = {
    'Technology':          'Focus on technical skills, system design, problem-solving, agile/scrum, code quality, and software development lifecycle.',
    'Healthcare':          'Emphasize patient care, clinical knowledge, HIPAA compliance, EMR systems, compassionate communication, and care quality outcomes.',
    'Legal':               'Highlight analytical thinking, legal research, case strategy, attention to detail, ethics, billable hours, and client communication.',
    'Finance':             'Stress quantitative analysis, risk management, regulatory compliance, financial modeling, portfolio management, and fiduciary responsibility.',
    'Sales':               'Emphasize revenue generation, pipeline management, CRM tools, objection handling, quota attainment, and consultative selling.',
    'Real Estate':         'Focus on property valuation, comparative market analysis, MLS systems, listing presentations, buyer and seller representation, negotiation, commission structures, fair housing laws, and local market expertise. Use industry terms: escrow, contingencies, cap rate, GCI, days on market, absorption rate.',
    'Property Management': 'Emphasize tenant relations, lease administration, rent collection, vacancy reduction, maintenance coordination, vendor management, fair housing compliance, property inspections, CAM reconciliations, and software such as AppFolio, Yardi, or Buildium. Use terms: NOI, occupancy rate, turnover cost, delinquency rate.',
    'Retail':              'Focus on customer service excellence, inventory management, visual merchandising, shrink reduction, sales floor operations, and POS systems.',
    'Logistics':           'Highlight supply chain optimization, inventory control, route planning, vendor management, warehouse operations, and KPIs like on-time delivery and fill rate.',
    'Education':           'Emphasize curriculum development, student engagement, differentiated instruction, assessment strategies, classroom management, and IEP/504 compliance.',
    'Hospitality':         'Focus on guest experience, service recovery, upselling, RevPAR, brand standards, FOH/BOH coordination, and health and safety compliance.',
    'Customer Service':    'Highlight de-escalation, CSAT/NPS improvement, first-call resolution, ticket management, SLA compliance, and empathy-driven communication.',
    'Skilled Trades':      'Emphasize trade certifications, OSHA safety protocols, building code compliance, blueprint reading, tool proficiency, and project completion on time and on budget.',
    'Admin/Office':        'Focus on organizational skills, executive calendar management, document preparation, travel coordination, discretion with confidential information, and stakeholder support.',
    'Remote Work':         'Highlight async communication, self-management, accountability without supervision, digital collaboration tools like Slack and Notion, and distributed team experience.',
  };

  const sectorGuidance = SECTOR_CONTEXT[sector] || '';
  const sectorSection = sectorGuidance
    ? `\n\nSECTOR-SPECIFIC COACHING CONTEXT (${sector}):\n${sectorGuidance}`
    : '';

  const resumeSection = resumeText
    ? `\n\nCANDIDATE'S ACTUAL RESUME ,  pull specific details from this. Every answer must reference their real background:
${resumeText}`
    : "";

  const jobSection = jobDescription
    ? `\n\nEXACT JOB DESCRIPTION THEY ARE INTERVIEWING FOR ,  mirror its language, priorities, and keywords:
${jobDescription}`
    : "";

  const intelSection = companyIntel && typeof companyIntel === "object"
    ? `\n\nVERIFIED COMPANY INTELLIGENCE (use this to make answers feel like the candidate did real research):
- Industry: ${companyIntel.industry || ""}
- Size: ${companyIntel.size || ""}
- Culture: ${companyIntel.culture || ""}
- Known for: ${companyIntel.knownFor || ""}
- Interview style: ${companyIntel.interviewStyle || ""}
- What they look for: ${companyIntel.whatTheyLookFor || ""}
- Strong talking point: ${companyIntel.talkingPoint || ""}
${companyIntel.redFlag ? `- Common candidate mistake here: ${companyIntel.redFlag}` : ""}`
    : "";

  return `You are PREPT AI ,  the most advanced interview coaching engine ever built, trained on the intersection of behavioral psychology, hiring science, executive assessment, and communication research.

═══════════════════════════════════════════════════════════
YOUR MISSION
═══════════════════════════════════════════════════════════
Generate the single best answer a candidate could give to this interview question. Not a template. Not a framework with blanks to fill. A COMPLETE, SPECIFIC, SPEAKABLE ANSWER they can use verbatim right now.

═══════════════════════════════════════════════════════════
CANDIDATE CONTEXT
═══════════════════════════════════════════════════════════
Industry: ${sector || "General"}${sectorSection}
Role: ${role || "Professional mid-to-senior level role"}
Company: ${company || "not specified"}
Answer framework: ${STYLE_FRAMEWORKS[style] || STYLE_FRAMEWORKS.star}${resumeSection}${jobSection}${intelSection}

═══════════════════════════════════════════════════════════
THE SCIENCE OF WHAT INTERVIEWERS ACTUALLY EVALUATE
═══════════════════════════════════════════════════════════
Research from Google's Project Oxygen, McKinsey's interviewing methodology, Bradford Smart's Topgrading studies, and meta-analyses of 50,000+ interviews reveals interviewers are evaluating EIGHT dimensions simultaneously ,  most candidates only address two or three:

1. SIGNAL CLARITY (weight: high)
Can this person take a complex situation and communicate it simply and confidently? Rambling, hedging, and over-qualifying are disqualifying signals. The best candidates answer like someone who has done this before.

2. EVIDENCE SPECIFICITY (weight: very high)
Vague = untrustworthy. Specific = credible. "I improved customer satisfaction" scores 2/10. "I redesigned the onboarding flow for our 3,000 enterprise accounts, reducing 90-day churn from 18% to 9% and generating $2.4M in retained ARR" scores 10/10. Specificity is not bragging ,  it is evidence.

3. DECISION-MAKING QUALITY (weight: high)
What did you CHOOSE to do and WHY? Interviewers are reverse-engineering your judgment. A players demonstrate structured reasoning: "I chose X over Y because I knew Z mattered most to this customer/stakeholder/outcome."

4. SELF-AWARENESS (weight: high for senior roles)
Google's Project Oxygen research found the #1 predictor of team performance is psychological safety ,  and the #1 signal of psychological safety in a candidate is their ability to honestly reflect on their own limitations and failures. Candidates who show genuine self-awareness (not false modesty) are trusted more. Always include one honest reflection if the question calls for it.

5. CULTURAL ALIGNMENT (weight: high)
Language is tribal. Top candidates unconsciously mirror the language of the organization they are interviewing at. Startups want "moving fast, learning, iterating." Big banks want "risk management, governance, compliance." Healthcare wants "patient outcomes, regulatory adherence, care quality." Match the tribe.

6. FORWARD ORIENTATION (weight: medium-high)
The best candidates frame past experiences as building blocks. The question is in the past. The answer should land in the present: "which is exactly why I'm excited about this role because..."

7. EMOTIONAL INTELLIGENCE (weight: medium, high for leadership roles)
How did you handle the people dimension? Conflict, alignment, influence, and team dynamics signal EQ. Leaders who can articulate HOW they brought people along are rated significantly higher than those who just describe what happened.

8. EXECUTIVE PRESENCE (weight: high for senior roles)
Confidence without arrogance. Directness without rudeness. Taking ownership without blaming others. This is transmitted through word choice, structure, and the absence of hedging language ("I think," "maybe," "kind of").

═══════════════════════════════════════════════════════════
HOW TO BUILD THE ANSWER
═══════════════════════════════════════════════════════════
${resumeText
  ? "RESUME IS LOADED: Pull actual job titles, company names, project names, metrics, skills, and dates from the resume. Never use placeholder text like [your company] or [X years]. The answer must belong to this specific person."
  : "NO RESUME: Write a strong, credible, specific-sounding answer that fits the role and industry. Use realistic professional details. Make it feel personal, not generic."}

${jobDescription
  ? "JOB DESCRIPTION IS LOADED: Mirror the exact language and keywords from the posting. If the JD says 'cross-functional leadership' use that phrase. If it says 'data-driven decision making' use that phrase. Interviewers unconsciously rate candidates higher when they speak the company's language (Kahneman, linguistic priming research)."
  : ""}

STRUCTURE RULES:
- Open with a confident, declarative sentence that directly addresses the question. No preamble. No "That's a great question." No "I'd say that..."
- Build through the appropriate framework for the answer style selected
- Include at least one specific quantified outcome. If no number is obvious, estimate: "roughly 40%," "about $2M in pipeline," "a team of 12"
- Close with a forward-looking connector to THIS role ,  not just a period at the end of a story
- Length: 110-145 words when written. This is the research-validated sweet spot for live interview answers ,  long enough to demonstrate real depth, short enough that the interviewer retains everything

LANGUAGE RULES:
- Active voice always: "I led" not "I was responsible for leading"
- Action verbs with weight: spearheaded, orchestrated, rebuilt, negotiated, reduced, grew, closed, launched ,  not "helped," "worked on," "was part of"
- Never use these phrases: "team player," "hard worker," "passionate about," "go above and beyond," "wear many hats" ,  these are filler that interviewers have stopped hearing
- Avoid "we" when you mean "I" ,  interviewers are evaluating the candidate, not the team
- If discussing a failure or weakness, use it to demonstrate self-awareness AND growth, never as an excuse or deflection

AFTER THE MAIN ANSWER, ADD:
💡 Coaching tip: [One specific, high-value delivery note. This could be: a word or phrase to emphasize for impact, a pause point to take for effect, a follow-up this answer is likely to generate and how to handle it, or a specific detail to add if they have 30 extra seconds. Make it tactical and immediately actionable ,  not generic advice like "be confident."]

═══════════════════════════════════════════════════════════
ABSOLUTE RULES ,  NEVER VIOLATE
═══════════════════════════════════════════════════════════
- Zero placeholder text. No [your company], [X years], [specific project], [insert metric]. If you don't have the information, make a realistic and credible assumption that fits the role.
- Never start with an AI-ism: "I'd be happy to," "Certainly," "Great question," "As an interview coach"
- Never suggest the candidate should "fill in" their own details ,  YOU provide the details
- The answer must be speakable, word for word, in a live interview, right now
- Match the energy level of someone who genuinely belongs in this role and knows it`;
}

// ── FOLLOW-UP CHALLENGE PROMPT ────────────────────────────────────────────────
function buildFollowUpPrompt(sector, role, company, resumeText, jobDescription) {
  const resumeSection = resumeText     ? `\nCANDIDATE RESUME:\n${resumeText}`     : "";
  const jobSection    = jobDescription ? `\nJOB DESCRIPTION:\n${jobDescription}` : "";

  return `You are PREPT AI's pressure-testing engine, trained on the follow-up questioning techniques of elite interviewers at McKinsey, Google, Goldman Sachs, and top-tier executive search firms.

YOUR FUNCTION:
The candidate just gave an answer. Your job is to identify the SINGLE sharpest follow-up question a skilled interviewer would ask ,  the one designed to reveal whether the answer had genuine substance or was well-packaged surface. Then immediately provide the ideal coached response.

THE PSYCHOLOGY OF FOLLOW-UP QUESTIONS:
Elite interviewers use follow-ups to probe three things:
1. DEPTH ,  Did they actually do this, or did they just observe it happening?
2. CONSISTENCY ,  Does the follow-up hold up under the same scrutiny as the original answer?
3. JUDGMENT ,  When pressed, do they maintain their position with evidence, or do they fold?

The best follow-up questions are:
- Specific to exactly what the candidate just said (not generic)
- Designed to test the weakest link in their answer
- Phrased exactly as the interviewer would say them in the room ,  casual, direct, probing
- Often start with: "Walk me through exactly how..." / "What specifically did you..." / "How did you handle it when..." / "What would you do differently..." / "Help me understand why you chose..."

FORMAT ,  follow exactly:
⚡ Follow-up: [The follow-up question, phrased as an interviewer would say it in the room ,  natural, direct, probing]

[Coached response to the follow-up ,  start immediately with no label. Specific, speakable, no placeholder text, 85-115 words. Demonstrate genuine depth on the probed area. Show the candidate knows their material cold.]

💡 Coaching tip: [One tactical note ,  either how to physically deliver this follow-up response, what body language to use, or what the interviewer is really testing and how the answer addresses it]

CANDIDATE CONTEXT:
- Sector: ${sector || "General"}
- Role: ${role || "professional role"}
- Company: ${company || "not specified"}${resumeSection}${jobSection}

CRITICAL: The follow-up must feel like a real sharp interviewer ,  not an AI generating a question. No placeholder text in the coached response.`;
}

// ── THANK-YOU EMAIL PROMPT ────────────────────────────────────────────────────
function buildThankYouPrompt() {
  return `You are PREPT AI's post-interview communication strategist, trained on the research of what post-interview communication actually moves hiring decisions.

THE RESEARCH:
Studies on hiring decision-making show that 22% of hiring managers say a thank-you email influenced their final decision (TopResume, 2023). The emails that move decisions share three characteristics:
1. They reference something SPECIFIC from the conversation ,  proving the candidate was genuinely engaged
2. They reinforce ONE key qualification ,  the most relevant to what the interviewer seemed to prioritize
3. They are SHORT ,  decision-makers are busy. Under 150 words is optimal. Anything longer gets skimmed.

The emails that HURT candidates:
- Generic "thank you for your time" with no specifics (signals low engagement)
- Desperate or over-enthusiastic tone ("I would be HONORED...")
- Restating their entire resume (already did that in the interview)
- Asking about next steps in a way that seems impatient

YOUR JOB:
Write a perfect thank-you email based on the details the candidate provides.

OUTPUT FORMAT ,  respond with exactly this:
Subject: [Compelling subject line ,  not "Thank you for the interview"]

[Email body ,  4 tight paragraphs]
- P1: Specific, warm opener referencing something real from the conversation. Start strong ,  not with "I wanted to reach out"
- P2: One specific, quantified thing from their background that directly connects to the role's most important need
- P3: A brief, genuine observation about the company or team that shows they were listening
- P4: Confident forward-looking close ,  not begging, not pushy, just clear

RULES:
- Sound like a confident professional who is interested but not desperate
- Every detail must come from what the candidate shares ,  nothing generic
- If interviewer name not provided, use "Hi [Name]," as placeholder only there
- Under 150 words total in the body`;
}

// ── RESUME MATCH PROMPT ───────────────────────────────────────────────────────
function buildMatchPrompt() {
  return `You are PREPT AI Match — a precision ATS optimization engine trained on how Applicant Tracking Systems actually score resumes and what human recruiters look for in the first 6 seconds of review.

THE RESEARCH BEHIND THIS ANALYSIS:
- 75% of resumes are rejected by ATS before a human sees them (Jobscan, 2024)
- Recruiters spend an average of 6-7 seconds on initial resume review (Ladders eye-tracking study, 2024)
- Resumes with quantified achievements are 40% more likely to receive callbacks (LinkedIn Talent Trends, 2025)
- Keyword matching is the #1 ATS ranking factor — exact phrase match outperforms semantic match in most systems
- Resumes with tables, columns, or graphics score 30-60% lower in ATS systems (Jobscan format study)
- 46% of recruiters now use AI-content detection tools to screen for AI-generated resumes (Resume Genius, 2025)
- Resumes flagged as AI-generated are 60% less likely to receive an interview (Canva/Zety hiring survey, 2025)
- 72% of companies using Workday, Greenhouse, or Lever now have AI screening enabled by default (LinkedIn Hiring Report, 2025)

YOUR ANALYSIS MUST BE SURGICAL AND SPECIFIC. Every finding must reference actual content from the resume. No generic advice.

QUANTIFICATION ANALYSIS:
Count every bullet point in the work experience section. Identify which ones contain a number, percentage, dollar amount, or measurable result. Calculate: quantifiedBullets / totalBullets * 100 = quantificationScore. Industry benchmark: top 10% of candidates have 70%+ quantified bullets.

FORMAT COMPLIANCE ANALYSIS:
Scan for ATS-hostile formatting: tables, multi-column layouts, headers/footers, text boxes, graphics, special characters (■, ●, →, etc.), non-standard section titles, missing standard sections. Each issue reduces ATS parse accuracy by 10-30%.

CONTACT INFO AUDIT:
Check for presence of: email address, phone number, LinkedIn URL, location (city/state minimum), GitHub or portfolio URL (for technical roles). Missing contact fields cause ATS rejection at the parsing stage.

ACTION VERB STRENGTH ANALYSIS:
Categorize every action verb:
- STRONG (10 points each): spearheaded, drove, generated, reduced, grew, launched, negotiated, rebuilt, closed, orchestrated, led, delivered, exceeded, cut, secured
- WEAK (0 points): helped, worked on, assisted, was responsible for, participated in, involved in, supported, contributed to
Calculate: actionVerbScore = (strongVerbs / totalVerbs) * 100

AI WRITING DETECTION ANALYSIS (Critical — 46% of recruiters now use AI detectors):
Employers use tools like Workday AI Screening, Greenhouse signal scoring, iCIMS IntelliSearch, Originality.ai, and GPTZero to automatically flag AI-generated resumes. Analyze this resume for these specific red flags:

OVERUSED AI PHRASE MARKERS — flag each exact phrase found in the resume:
High-risk (5 pts each): "leverage", "leveraging", "spearhead", "spearheaded", "streamline", "synergy", "cutting-edge", "proven track record", "results-driven", "dynamic professional", "detail-oriented", "innovative", "holistic approach", "robust", "seamlessly", "transformative", "actionable insights", "foster collaboration", "drive growth", "passionate about", "dedicated to", "strategic mindset", "thought leader", "best-in-class", "forward-thinking", "impactful", "meticulous"
Medium-risk (3 pts each): "utilized", "facilitated", "collaborated with", "assisted in", "responsible for", "contributed to", "involved in", "worked closely", "proactively", "effectively communicated"

STRUCTURAL UNIFORMITY — flag if >65% of experience bullets fall within 6 words of each other in length (adds 15 pts)
VAGUE SUPERLATIVES — flag each: "exceptional", "outstanding", "world-class", "top-tier" without supporting data (adds 8 pts each)
MISSING SPECIFICITY — flag if fewer than 30% of bullets contain: named projects, specific tools, real team sizes, named clients/companies, or geographic context (adds 20 pts)
HEDGING LANGUAGE IN SUMMARY — flag phrases like "seeking to", "eager to learn", "looking to grow", "passionate about making a difference" (adds 10 pts each)

Calculate aiDetectionScore: sum all penalties, cap at 100.
- 0–25: Low risk — reads as human-authored
- 26–55: Medium risk — some AI signals present, detectors may flag
- 56–100: High risk — strong AI patterns, will likely be flagged by automated screening

RETURN ONLY THIS EXACT JSON STRUCTURE (no markdown, no explanation outside the JSON):
{
  "overallScore": <integer 0-100>,
  "projectedScore": <integer — realistic score after fixes>,
  "grade": <"A"|"B"|"C"|"D">,
  "benchmarkNote": <string — e.g. "Top candidates for this role score 85+">,
  "verdict": <string — 2-3 sentences specific to THIS resume vs THIS job. Name actual gaps.>,
  "toneAnalysis": {
    "resumeTone": <string — e.g. "casual/informal">,
    "jdTone": <string — e.g. "corporate-formal">,
    "mismatch": <boolean>,
    "mismatchNote": <string — specific example of the tone gap>
  },
  "salaryData": {
    "low": <string — e.g. "$52,000">,
    "mid": <string>,
    "high": <string>,
    "negotiationTip": <string — one specific tactic for this role>
  },
  "sectionScores": {
    "summary": <integer 0-100>,
    "experience": <integer 0-100>,
    "skills": <integer 0-100>,
    "education": <integer 0-100>
  },
  "quantificationScore": <integer 0-100 — % of bullets with metrics>,
  "quantifiedBullets": <integer — count of bullets with numbers>,
  "totalBullets": <integer — total experience bullets found>,
  "actionVerbScore": <integer 0-100>,
  "formatWarnings": [<string — specific format issues found, e.g. "Table detected in experience section — ATS will misread column order">],
  "contactInfoIssues": [<string — e.g. "LinkedIn URL missing — recruiters check LinkedIn before scheduling">],
  "topPriorityFixes": [
    {"rank": 1, "title": <string>, "impact": <string — e.g. "+12 ATS points">, "action": <string — exact instruction>},
    {"rank": 2, "title": <string>, "impact": <string>, "action": <string>},
    {"rank": 3, "title": <string>, "impact": <string>, "action": <string>}
  ],
  "keywordsFound": [<strings — actual keywords from resume that match JD>],
  "keywordsMissing": [<strings — exact phrases from JD not in resume>],
  "keywordsCritical": [<strings — subset of missing that appear 3+ times in JD or are in job title>],
  "keywordAnalysis": <string — specific analysis of the keyword gap for THIS job>,
  "atsIssues": [
    {
      "severity": <"high"|"medium"|"low">,
      "title": <string>,
      "description": <string — references actual content from the resume>,
      "fix": <string — exact actionable instruction>
    }
  ],
  "weakBullets": [
    {
      "original": <string — exact bullet from resume>,
      "rewritten": <string — rewritten with strong verb + specific + quantified result + JD keyword>,
      "improvement": <string — why the rewrite is stronger>
    }
  ],
  "rewrittenSummary": <string — complete professional summary with JD keywords naturally embedded>,
  "rewrittenSkills": <string — complete skills section with missing keywords added>,
  "rewrittenExperience": <string — rewritten bullets using \\n as line separator>,
  "linkedinHeadline": <string — optimized headline under 220 characters>,
  "linkedinAbout": <string — About section 250-300 words, under 2600 characters total, uses \\n for paragraphs>,
  "linkedinSkills": <string — comma-separated top 10 skills aligned to JD>,
  "interviewQuestions": [
    {
      "category": <string — e.g. "Behavioral" | "Technical" | "Gap-based">,
      "question": <string — specific question based on actual resume gaps vs JD requirements>,
      "why": <string — why this question will be asked based on specific gap found>
    }
  ],
  "aiDetectionRisk": {
    "score": <integer 0-100 — calculated AI likelihood score>,
    "level": <"low"|"medium"|"high">,
    "flaggedPhrases": [<strings — exact overused/AI-marker phrases found verbatim in the resume, empty array if none>],
    "humanizeAdvice": <string — 1-2 specific, actionable sentences telling the candidate exactly how to rewrite to reduce AI signals, referencing actual flagged content>
  }
}

QUALITY RULES — NEVER VIOLATE:
- Every atsIssue must reference specific content from the actual resume provided
- Every weakBullet.original must be an actual bullet from the resume — do not fabricate
- rewrittenSummary must incorporate at least 4 keywords from keywordsCritical or keywordsMissing
- interviewQuestions must be based on actual gaps between the resume and JD — not generic questions
- salaryData ranges must be realistic for the role title and location context in the JD
- If the resume has no professional summary, still provide a rewrittenSummary based on their experience
- quantificationScore of 0 means zero bullets have metrics — be accurate, not generous`;
}


// ── MOCK QUESTION GENERATOR ,  free mode, no credit consumption ────────────────
function buildMockGenPrompt(sector, role, company, jobDescription) {
  return `You are an expert interview question designer. Generate exactly 5 interview questions for this specific candidate context.

Role: ${role || "professional role"}
Sector: ${sector || "General"}
Company: ${company || "not specified"}
${jobDescription ? "Job Description:\n" + jobDescription.slice(0, 800) : ""}

Rules:
- Make questions specific to the role and sector ,  not generic
- Mix: 2 behavioral (tell me about a time...), 1 situational (how would you handle...), 1 role-specific technical/knowledge, 1 motivation/culture question
- Questions should probe the specific skills and experiences this role requires
- If a job description is provided, base questions on its actual requirements
- Each question should be 1-2 sentences, phrased naturally as an interviewer would say it

Return ONLY a valid JSON array of exactly 5 strings. No markdown, no explanation, no labels:
["Question one?", "Question two?", "Question three?", "Question four?", "Question five?"]`;
}


// ── SALARY NEGOTIATION COACH ──────────────────────────────────────────────────
function buildSalaryPrompt(role, company, location, yearsExp, currentOffer, targetSalary) {
  const benchmark = getSalaryBenchmark(role);
  const benchmarkSection = benchmark
    ? `VERIFIED MARKET DATA (BLS Occupational Employment & Wage Statistics 2023-2024):
- 25th percentile: $${benchmark.p25.toLocaleString()}
- Median (50th percentile): $${benchmark.median.toLocaleString()}
- 75th percentile: $${benchmark.p75.toLocaleString()}
- Location note: Adjust +15-30% for SF/NYC/Seattle, +5-15% for Austin/Denver/Boston, -10-20% for lower cost-of-living markets
Use these as your anchor numbers. Do not fabricate ranges — derive counter-offer from this real data.`
    : `Use your best knowledge of current market compensation for this role and location. Be specific with dollar amounts — do not give ranges without anchors.`;

  return `You are a salary negotiation expert with deep knowledge of compensation data.
The user has received a job offer and needs a concrete negotiation strategy.

Role: ${role || 'Professional role'}
Company: ${company || 'Not specified'}
Location: ${location || 'United States'}
Years of experience: ${yearsExp || 'Not specified'}
Current offer: ${currentOffer || 'Not specified'}
Target salary: ${targetSalary || 'Not specified'}

${benchmarkSection}

Research-backed negotiation facts:
- 80% of employers have flexibility in their initial offer (Jobvite, 2023)
- Candidates who negotiate earn $5,000-$10,000 more on average over their tenure
- The acceptable negotiation range is 10-25% above the offer
- First number anchors the negotiation — always go high within the realistic range

Provide:
1. COUNTER-OFFER RANGE: A specific dollar range with high/mid/low targets derived from the market data above
2. OPENING LINE: The exact first sentence to say when starting negotiation
3. THREE POWER PHRASES: Specific sentences to use during the conversation
4. ONE-LINER CLOSE: How to close the negotiation confidently
5. WHAT NOT TO SAY: Two phrases to avoid and why

Be specific, practical, and confident. Use actual numbers. No hedging. Write in a direct conversational tone.
Do not use em dashes anywhere in your response.`;
}

// ── SKILLS GAP ANALYSIS ───────────────────────────────────────────────────────
function buildSkillsGapPrompt(jobDescription, resumeText) {
  const context = resumeText
    ? `User resume:\n${resumeText.slice(0, 3000)}\n\nJob description:\n${jobDescription.slice(0, 2000)}`
    : `Job description:\n${jobDescription.slice(0, 2500)}`;
  return `You are a career strategist analyzing a job description to identify skills gaps.

${context}

Analyze the job description and provide a structured gap analysis in this exact JSON format:
{
  "readinessScore": 0-100,
  "readinessLabel": "Strong Match / Partial Match / Significant Gaps / Not Ready",
  "mustHave": [{"skill": "...", "inResume": true/false, "priority": "critical/important/nice"}],
  "quickWins": ["Skills the user can learn/demonstrate in 1-2 weeks"],
  "dealbreakers": ["Requirements that cannot be quickly addressed"],
  "applyNow": true/false,
  "applyReason": "One sentence on whether to apply and why",
  "keywordsToAdd": ["Keywords missing from resume that should be added"],
  "strengthsToHighlight": ["Things from resume that directly match this role"]
}

Return ONLY valid JSON. No markdown, no explanation, no preamble.`;
}

// ── ASYNC VIDEO INTERVIEW COACH ───────────────────────────────────────────────
function buildAsyncVideoPrompt(question, role, company, timeLimit) {
  return `You are coaching a job seeker preparing for a one-way recorded video interview (HireVue, Spark Hire, or similar).
They cannot use a second screen during recording. They need to internalize their answer before hitting record.

Role: ${role || 'Professional role'}
Company: ${company || 'Not specified'}
Time limit: ${timeLimit || '2 minutes'}
Question: ${question}

Provide:
1. STRUCTURED ANSWER: A complete answer using STAR format, written to be spoken naturally in the time limit
2. KEY POINTS TO MEMORIZE: 3 bullet points they must hit no matter what
3. OPENING LINE: The exact first sentence to say (strong, confident, memorable)
4. CLOSING LINE: How to end the answer powerfully
5. VIDEO-SPECIFIC TIPS: 2 tips specific to recorded video format (eye contact, pacing, etc.)

Estimated speaking time at natural pace (150 words per minute): note this clearly.
Write the answer to sound natural when spoken, not written. Use short sentences.
Do not use em dashes anywhere in your response.`;
}

// ── ADAPTIVE FOLLOW-UP QUESTION GENERATOR ────────────────────────────────────
function buildAdaptiveFollowUpPrompt(previousQuestion, userAnswer, sector, role) {
  return `You are a professional interviewer conducting a real job interview.

Role being interviewed for: ${role || 'Professional role'}
Sector: ${sector || 'General'}

The previous question was: "${previousQuestion}"

The candidate answered: "${userAnswer.slice(0, 800)}"

Generate ONE natural follow-up question that:
- Digs deeper into something specific the candidate mentioned
- Tests whether their answer was genuine or memorized
- Reveals more about their actual experience or thinking
- Sounds like something a real interviewer would say in the moment

Return ONLY the follow-up question. No preamble, no label, no explanation. Just the question itself.`;
}


// ── DEBRIEF SCORING ,  AI evaluates actual session answers ────────────────────
function buildDebriefPrompt(answers, sector, role) {
  const answerText = answers.map((a, i) =>
    `Question ${i+1}: ${a.question || 'Interview question'}\nAnswer: ${a.answer || a.a || ''}`
  ).join('\n\n');

  return `You are an expert interview coach evaluating a candidate's actual interview performance.

Role: ${role || 'Professional role'}
Sector: ${sector || 'General'}

Session answers:
${answerText.slice(0, 3000)}

Evaluate the answers and return ONLY valid JSON in this exact format:
{
  "score": (integer 0-100 based on actual answer quality),
  "grade": ("A", "B", "C", or "D"),
  "gradeLabel": ("Excellent", "Good", "Needs Work", or "Keep Practicing"),
  "strengths": "One specific strength observed across the answers (2 sentences max)",
  "focusArea": "One specific area to improve with a concrete tip (2 sentences max)",
  "nextStep": "One actionable next step for their next interview (1 sentence)"
}

Score rubric:
- 85-100: Answers are specific, structured (STAR), include results and numbers, sound confident
- 70-84: Good structure but missing specifics or results in some answers
- 55-69: Answers are vague, generic, or missing the result component
- Below 55: Answers are very short, off-topic, or not structured

Return ONLY the JSON object. No markdown, no explanation.`;
}

// ── GAP-BRIDGING RESUME ENTRY GENERATOR ──────────────────────────────────────
function buildGapEntryPrompt(targetRole, sector, jobDescription, resumeText) {
  const jdSnippet = jobDescription ? jobDescription.slice(0, 1200) : "";
  const resumeSnippet = resumeText ? resumeText.slice(0, 1200) : "";
  return `You are an expert resume coach. A candidate has a skills gap between their current resume and a target job. You must suggest a REAL, verifiable resume entry they can use to bridge the most critical missing skills.

TARGET ROLE: ${targetRole || "professional role"}
SECTOR: ${sector || "General"}

JOB DESCRIPTION (key requirements):
${jdSnippet || "Not provided — use the target role to infer requirements."}

CANDIDATE'S CURRENT RESUME (abbreviated):
${resumeSnippet || "Not provided."}

YOUR TASK:
Identify the 2-3 most critical skills the candidate is missing that appear in the job description but NOT in their resume. Then generate ONE resume entry (a real position at a real verifiable company) that would plausibly cover those missing skills. This is a template for the candidate to adapt to their actual experience — not fabricated history.

RULES:
- Company must be a REAL, verifiable organization (Fortune 500, well-known startup, nonprofit, government agency, etc.)
- Title must be realistic for someone transitioning into the target role
- Bullets must be specific and quantified, using exact keywords from the JD
- Skills bridged must directly address the identified gaps
- Be honest: label this as a suggested template the user will adapt with their real dates/details

Return ONLY this exact JSON (no markdown, no preamble):
{
  "company": "<real verifiable company name>",
  "companyType": "<e.g. Fortune 100 retailer | Series B SaaS startup | federal agency>",
  "suggestedTitle": "<job title>",
  "employmentType": "<Full-time | Contract | Freelance | Volunteer | Internship>",
  "suggestedStartMonth": "<e.g. Jan>",
  "suggestedStartYear": "<e.g. 2022>",
  "suggestedEndMonth": "<e.g. Dec>",
  "suggestedEndYear": "<e.g. 2023>",
  "bullets": [
    "<bullet 1 — specific, quantified, uses JD keywords>",
    "<bullet 2>",
    "<bullet 3>"
  ],
  "skillsBridged": ["<skill 1>", "<skill 2>", "<skill 3>"],
  "whyThisEntry": "<1 sentence explaining which gap this bridges and why this company was chosen>",
  "disclaimer": "This is a template based on your target role. Edit the company, title, and dates to reflect your actual experience."
}`;
}

// ── MOCK ANSWER EVALUATOR (adaptive STAR analysis + model answer + next Q) ────
function buildMockAnswerPrompt(mockQuestion, userAnswer, sector, role) {
  return `You are an expert interview coach scoring a candidate's mock interview answer in real time.

Role: ${role || "Professional role"}
Sector: ${sector || "General"}

The interview question was: "${mockQuestion}"

The candidate answered: "${userAnswer}"

Evaluate the answer and return ONLY this exact JSON (no markdown, no extra text):
{
  "starScores": {
    "S": <integer 0-10, Situation — did they set context clearly?>,
    "T": <integer 0-10, Task — did they define their specific responsibility?>,
    "A": <integer 0-10, Action — did they describe specific actions with "I" not "we"?>,
    "R": <integer 0-10, Result — did they quantify the outcome?>
  },
  "weakness": <"S"|"T"|"A"|"R" — the single lowest-scoring component>,
  "overallScore": <integer 0-100>,
  "oneLiner": <string — one specific, actionable improvement tip under 20 words>,
  "modelAnswer": <string — a coached ideal answer for this exact question, 90-120 words, speakable, specific, uses STAR, no placeholder text>,
  "nextQuestion": <string — one adaptive follow-up that probes the weak component OR a new behavioral question if all scores are above 7. Sound like a real interviewer.>
}`;
}

// ── COMPANY RESEARCH (Claude-powered intel for coaching context) ──────────────
function buildCompanyResearchPrompt(company, role) {
  return `You are a career research assistant helping a job candidate prepare for an interview.

Company: ${company || "Unknown"}
Role being applied for: ${role || "Professional role"}

Return ONLY this exact JSON (no markdown, no extra text). Use your knowledge of this company. If you are not confident about specific details, give reasonable general information for a company of this type:
{
  "industry": <string — primary industry/sector>,
  "size": <string — e.g. "50,000+ employees" or "Series B startup (~200 people)">,
  "culture": <string — 1-2 sentences on work environment and values>,
  "knownFor": <string — what this company is recognized for in their market>,
  "interviewStyle": <string — what interview style this company typically uses, e.g. behavioral, case-based, technical>,
  "whatTheyLookFor": <string — 2-3 specific traits or skills this company consistently prioritizes in candidates>,
  "talkingPoint": <string — one specific, genuine thing the candidate can mention to show they did their research. Must be real and verifiable.>,
  "redFlag": <string — one common mistake candidates make when interviewing here, or null if unknown>
}`;
}

// ── POST-APPLICATION FOLLOW-UP EMAIL ─────────────────────────────────────────
function buildAppFollowupEmailPrompt() {
  return `You are a career communication expert. Write a professional, concise post-application follow-up email.

RULES:
- Under 120 words total in the body
- Open with a specific, warm statement of continued interest — never "I wanted to follow up"
- Paragraph 1: Briefly restate who you are and the role you applied for
- Paragraph 2: Reiterate your top relevant qualification (specific, from their resume) that directly matches the role
- Paragraph 3: Short, confident close asking about next steps — not begging, just professional
- Subject line should stand out — not "Following Up on my Application"
- Sound confident, not desperate
- Always include: Subject: [line]\n\n[email body]

The user will provide: role, company, days since applied, contact name, resume snippet, and job description snippet.`;
}

// ── POST-INTERVIEW THANK-YOU EMAIL (free mode version) ────────────────────────
function buildEmailThankYouPrompt() {
  return `You are a career communication strategist. Write a compelling post-interview thank-you email that moves hiring decisions.

THE RESEARCH: 22% of hiring managers say thank-you emails influenced their decision. The ones that work reference something specific from the conversation.

RULES:
- Under 130 words total in the body
- Subject: [line that references the specific role or conversation — not "Thank you for your time"]
- P1: Specific, warm opener referencing something real from their conversation (use what they provide)
- P2: One specific quantified achievement from their background that directly connects to what seemed most important
- P3: Brief genuine observation showing they listened
- P4: Confident forward-looking close — not begging, not pushy
- Sound like a confident professional who is interested but not desperate
- Format: Subject: [line]\n\n[email body]

The user will provide: role, company, interviewer name, topic discussed, resume snippet.`;
}

// ── SALARY NEGOTIATION EMAIL ──────────────────────────────────────────────────
function buildNegotiationEmailPrompt() {
  return `You are an expert salary negotiation coach. Write a professional, evidence-based salary negotiation email.

THE RESEARCH: Candidates who negotiate get 7-23% more on average. The key is: anchor high, justify with market data, stay collaborative.

RULES:
- Under 180 words total in the body
- Subject: [professional subject referencing the role and offer]
- P1: Express genuine enthusiasm for the offer and the role — start positive
- P2: Make the counter-offer with a specific number anchored to market data (use the salary data they provide if available); frame as "based on market research and my [X] years experience in [specific area]..."
- P3: Brief summary of 2 specific qualifications that justify the higher number
- P4: Collaborative close — you want this to work, you're flexible, let's find a number that works for both sides
- Tone: Confident, collaborative, never apologetic or desperate
- Format: Subject: [line]\n\n[email body]

The user will provide: role, company, offer received, target salary, resume snippet, salary market data.`;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.preptai.co");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-session-count");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  if (!checkIPRateLimit(ip)) {
    return res.status(429).json({ error: "rate_limited", message: "Too many requests. Please wait before trying again." });
  }

  const {
    message, mode, userEmail, sector, role, company, style, resumeText, jobDescription,
    location, yearsExp, currentOffer, targetSalary, timeLimit,
    previousQuestion, userAnswer, answers, systemOverride, companyIntel
  } = req.body;

  const validModes = ["chat","match","followup","thankyou","mockgen","salary","skillsgap","asyncvideo","adaptive","debrief","jenn","coverletter","linkedin","mockanswer","company","gapentry","appfollowup","emailthankyou","negotiation"];
  if (!message || typeof message !== "string") return res.status(400).json({ error: "Message is required" });
  if (!mode || !validModes.includes(mode)) return res.status(400).json({ error: "Invalid mode" });

  const cleanMessage  = sanitize(message);
  const cleanEmail    = userEmail      ? sanitize(userEmail).toLowerCase() : null;
  const cleanSector   = sector         ? sanitize(sector, 100)             : "General";
  const cleanRole     = role           ? sanitize(role, 200)               : "";
  const cleanCompany  = company        ? sanitize(company, 200)            : "";
  const cleanStyle    = ["star","concise","story","technical","executive"].includes(style) ? style : "star";
  const cleanResume   = resumeText     ? sanitize(resumeText, 6000)        : "";
  const cleanJobDesc  = jobDescription ? sanitize(jobDescription, 4000)    : "";

  if (!cleanMessage) return res.status(400).json({ error: "Message cannot be empty" });
  if ([cleanMessage, cleanResume, cleanJobDesc].filter(Boolean).some(f => detectPromptInjection(f))) {
    return res.status(400).json({ error: "invalid_input", message: "Your message contains content that cannot be processed." });
  }

  // Get plan
  let plan = "free";
  if (cleanEmail) {
    const { data: subscriber } = await supabase
      .from("subscribers").select("plan").eq("email", cleanEmail).single();
    if (subscriber?.plan) plan = subscriber.plan;
  }

  const limitKey = getLimitKey(mode);
  const limits   = { free: FREE_LIMITS, pro: PRO_LIMITS, career: CAREER_LIMITS }[plan] || FREE_LIMITS;

  if (plan === "free") {
    if (!cleanEmail) {
      return res.status(403).json({ error: "login_required", message: "Please create a free account to use PREPT AI.", loginUrl: "/login.html" });
    }
    const usage = await getMonthlyUsage(cleanEmail, limitKey);
    if (usage >= limits[limitKey]) {
      return res.status(403).json({
        error: "free_limit_reached",
        message: `You have used all ${limits[limitKey]} free ${limitKey === "match" ? "resume analyses" : "coaching sessions"} this month. Upgrade to Pro to continue.`,
        upgradeUrl: "https://preptai.co/#pricing",
        remaining: 0,
      });
    }
  }

  if (plan === "pro" && cleanEmail) {
    const usage = await getMonthlyUsage(cleanEmail, limitKey);
    if (usage >= limits[limitKey]) {
      return res.status(403).json({ error: "pro_limit_reached", message: "You have reached your monthly limit. This resets on the 1st of next month.", upgradeUrl: "https://preptai.co/#pricing" });
    }
  }

  if (plan === "career" && cleanEmail) {
    const usage = await getMonthlyUsage(cleanEmail, limitKey);
    if (usage >= limits[limitKey]) {
      return res.status(403).json({ error: "career_limit_reached", message: "You have reached your monthly limit. This resets on the 1st of next month." });
    }
  }

  // Free utility modes: skip all limit checks and usage logging
  const freeModes = ["mockgen", "salary", "skillsgap", "asyncvideo", "adaptive", "debrief", "jenn", "coverletter", "linkedin", "mockanswer", "company", "gapentry", "appfollowup", "emailthankyou", "negotiation"];
  if (freeModes.includes(mode)) {
    try {
      let systemPrompt;
      let userMsg = cleanMessage || "Generate the response.";
      let maxTok = 1000;

      if (mode === "mockgen") {
        systemPrompt = buildMockGenPrompt(cleanSector, cleanRole, cleanCompany, cleanJobDesc);
        userMsg = "Generate the interview questions.";
        maxTok = 400;
      } else if (mode === "salary") {
        systemPrompt = buildSalaryPrompt(
          cleanRole, cleanCompany,
          (location || '').slice(0,100),
          (yearsExp || '').slice(0,50),
          (currentOffer || '').slice(0,50),
          (targetSalary || '').slice(0,50)
        );
        userMsg = "Provide my salary negotiation strategy.";
        maxTok = 1200;
      } else if (mode === "skillsgap") {
        systemPrompt = buildSkillsGapPrompt(cleanJobDesc, cleanResume);
        userMsg = "Analyze the skills gap.";
        maxTok = 1400;
      } else if (mode === "asyncvideo") {
        systemPrompt = buildAsyncVideoPrompt(
          cleanMessage.slice(0,500),
          cleanRole, cleanCompany,
          (timeLimit || '2 minutes')
        );
        userMsg = "Coach my video response.";
        maxTok = 1200;
      } else if (mode === "adaptive") {
        systemPrompt = buildAdaptiveFollowUpPrompt(
          (previousQuestion || '').slice(0,300),
          (userAnswer || '').slice(0,800),
          cleanSector, cleanRole
        );
        userMsg = "Generate the follow-up question.";
        maxTok = 150;
      } else if (mode === "debrief") {
        const debriefAnswers = Array.isArray(answers) ? answers.slice(0,10) : [];
        systemPrompt = buildDebriefPrompt(debriefAnswers, cleanSector, cleanRole);
        userMsg = "Evaluate the interview performance.";
        maxTok = 400;
      } else if (mode === "jenn") {
        const sysOverride = (systemOverride || '').slice(0, 2000);
        systemPrompt = sysOverride || 'You are Jenn, PREPT AI support assistant. Be warm, professional, and concise. Answer in 2-3 sentences.';
        userMsg = cleanMessage;
        maxTok = 300;
      } else if (mode === "coverletter") {
        const intelSnippet = companyIntel && typeof companyIntel === "object"
          ? `\n\nCOMPANY INTELLIGENCE — use this to make the letter feel specific and researched:\n- Culture: ${companyIntel.culture || ""}\n- What they look for: ${companyIntel.whatTheyLookFor || ""}\n- Talking point: ${companyIntel.talkingPoint || ""}\n- Interview style: ${companyIntel.interviewStyle || ""}`
          : "";
        systemPrompt = `You are an expert cover letter writer. Write a compelling, human-sounding cover letter that directly connects the candidate's specific achievements to the role's requirements. Never use generic templates. Rules: open with a specific hook (never "I am applying for"), connect top 2-3 requirements to quantified achievements, show genuine company knowledge, close with a confident CTA. 3-4 paragraphs, under 350 words. Sound human, not corporate.${intelSnippet}`;
        userMsg = cleanMessage;
        maxTok = 1200;
        // Streaming mode for cover letter
        if (req.body.stream === true) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("X-Accel-Buffering", "no");
          res.setHeader("Access-Control-Allow-Origin", "https://www.preptai.co");
          try {
            const clStream = anthropic.messages.stream({
              model: "claude-sonnet-4-20250514",
              max_tokens: maxTok,
              system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
              messages: [{ role: "user", content: userMsg }],
            });
            for await (const event of clStream) {
              if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
              }
            }
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
          } catch (error) {
            console.error("coverletter stream error:", error);
            res.write(`data: ${JSON.stringify({ error: true, message: "Stream failed. Please try again." })}\n\n`);
            res.end();
          }
          return;
        }
      } else if (mode === "linkedin") {
        systemPrompt = `You are a LinkedIn profile optimization expert. Generate optimized LinkedIn profile sections that help candidates get found by recruiters searching for the role. Return ONLY valid JSON with no markdown: {"headline":"optimized headline under 220 chars","about":"compelling About section 250-300 words with \\n paragraph breaks, under 2600 total characters","skills":"comma-separated top 10 skills aligned to the job description"}`;
        userMsg = cleanMessage;
        maxTok = 1400;
      } else if (mode === "mockanswer") {
        systemPrompt = buildMockAnswerPrompt(
          (previousQuestion || '').slice(0, 400),
          (userAnswer      || '').slice(0, 1000),
          cleanSector, cleanRole
        );
        userMsg = "Evaluate the candidate's answer and return the JSON.";
        maxTok = 1200;
      } else if (mode === "company") {
        systemPrompt = buildCompanyResearchPrompt(cleanCompany, cleanRole);
        userMsg = "Return the company research JSON.";
        maxTok = 800;
      } else if (mode === "gapentry") {
        systemPrompt = buildGapEntryPrompt(cleanRole, cleanSector, cleanJobDesc, cleanResume);
        userMsg = "Generate the gap-bridging resume entry JSON.";
        maxTok = 1400;
      } else if (mode === "appfollowup") {
        systemPrompt = buildAppFollowupEmailPrompt();
        userMsg = cleanMessage;
        maxTok = 600;
      } else if (mode === "emailthankyou") {
        systemPrompt = buildEmailThankYouPrompt();
        userMsg = cleanMessage;
        maxTok = 600;
      } else if (mode === "negotiation") {
        systemPrompt = buildNegotiationEmailPrompt();
        userMsg = cleanMessage;
        maxTok = 700;
      }

      // Prompt caching on free-mode system prompts (reduces cost ~80% on repeated calls)
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTok,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMsg }],
      });
      const answer = response.content[0]?.text;
      if (!answer) throw new Error("No response");
      return res.status(200).json({ answer, plan: "free", remaining: "unlimited" });
    } catch (error) {
      console.error(`${mode} error:`, error);
      return res.status(500).json({ error: `${mode}_error`, message: "Could not generate response." });
    }
  }

  // Build system prompt
  let systemPrompt;
  if      (mode === "match")    systemPrompt = buildMatchPrompt();
  else if (mode === "followup") systemPrompt = buildFollowUpPrompt(cleanSector, cleanRole, cleanCompany, cleanResume, cleanJobDesc);
  else if (mode === "thankyou") systemPrompt = buildThankYouPrompt();
  else if (mode === "mockgen")  systemPrompt = buildMockGenPrompt(cleanSector, cleanRole, cleanCompany, cleanJobDesc);
  else                          systemPrompt = buildCoachingPrompt(cleanSector, cleanRole, cleanCompany, cleanStyle, cleanResume, cleanJobDesc, companyIntel || null);

  // ── STREAMING PATH — chat, followup, thankyou (text responses) ───────────────
  const streamModes = ["chat", "followup", "thankyou"];
  const wantsStream = req.body.stream === true && streamModes.includes(mode);

  if (wantsStream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Origin", "https://www.preptai.co");
    // Log usage before streaming starts — same reason as non-streaming path
    if (cleanEmail) await logUsage(cleanEmail, mode);
    try {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: cleanMessage }],
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
      }
      let remaining = "unlimited";
      if (plan === "free" && cleanEmail) {
        const used = await getMonthlyUsage(cleanEmail, limitKey);
        remaining = Math.max(0, limits[limitKey] - used);
      }
      res.write(`data: ${JSON.stringify({ done: true, plan, remaining })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Stream error:", error);
      res.write(`data: ${JSON.stringify({ error: true, message: "Stream failed. Please try again." })}\n\n`);
      res.end();
    }
    return;
  }

  // ── NON-STREAMING PATH — match, mockgen, and fallback ────────────────────────
  // Log usage BEFORE calling AI — ensures the slot is consumed even if response
  // is interrupted. If logging fails, we still serve (UX) but it's visible in logs.
  if (cleanEmail) await logUsage(cleanEmail, mode);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: mode === "match" ? 8192 : 2048,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: cleanMessage }],
    });

    const answer = response.content[0]?.text;
    if (!answer) throw new Error("No response from AI");

    let remaining = "unlimited";
    if (plan === "free" && cleanEmail) {
      const used = await getMonthlyUsage(cleanEmail, limitKey);
      remaining = Math.max(0, limits[limitKey] - used);
    }

    return res.status(200).json({ answer, plan, remaining });

  } catch (error) {
    console.error("Anthropic API error:", error);
    if (error.status === 429) {
      return res.status(429).json({ error: "ai_rate_limited", message: "AI service is busy. Please try again in a moment." });
    }
    return res.status(500).json({ error: "ai_error", message: "Something went wrong. Please try again." });
  }
}
