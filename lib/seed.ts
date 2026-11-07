// Seeds a fictional PayNova workspace so judges land on a working product with real sources.
import { audit, createVersion, indexSource, runAnalysisForVersion, type Q } from './repo';
import { SAMPLES } from './samples';

export const WS = 'ws_paynova';

const PALETTE = [
  { name: 'PayNova Blue', hex: '#0B3D91' },
  { name: 'Teal', hex: '#00796B' },
  { name: 'Ink', hex: '#1A1A1A' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Mist', hex: '#F5F7FA' },
  { name: 'Saffron', hex: '#F2A900' },
];

const PRODUCT_SHEET = `§1 Overview
PayNova Business is a payments platform for small and medium businesses in India. Merchants accept UPI, cards and net banking through one dashboard.

§2 Pricing
Domestic card transactions are charged at 1.9% per transaction. UPI payments carry no transaction fee for amounts up to ₹2,000; above ₹2,000 a 0.4% fee applies. There is no setup fee and no annual maintenance charge.

§3 Settlement
Funds settle to the merchant's registered bank account within 24 hours (T+1) on business days. Instant settlement is not currently offered.

§4 Onboarding and approval
Merchant onboarding is subject to KYC verification and risk review. Approval is not guaranteed. Most applicants receive a decision within 2 business days.

§5 Security
PayNova Business is PCI DSS Level 1 certified. Payment data is stored in data centres located in India.

§6 Support
Chat support is available 24x7. Phone support is available from 9 am to 9 pm IST, Monday to Saturday.

§7 Scale
PayNova Business serves more than 12,000 active merchants as of September 2026.`;

const OLD_SHEET = `§1 Overview
PayNova Lite is a payments app for sole traders.

§2 Pricing
Card transactions are charged at 2.4% per transaction.

§3 Settlement
Funds settle within 48 hours.`;

const VOICE = `§1 Voice
PayNova sounds clear, calm and confident. We explain what the product does in plain words and never hype it.

§2 Claims
Every number, timing, fee or certification must match the current product sheet. Do not promise guaranteed outcomes such as guaranteed approval or guaranteed savings. Avoid unqualified superlatives such as "best", "number one" or "unbeatable" unless an approved source substantiates them.

§3 Naming
The product is "PayNova Business". "PayNova Lite" was retired in 2025 and must not be used. Write "PayNova" as one word with a capital N. Write "UPI" in capitals.

§4 Punctuation and emphasis
Use at most one exclamation mark per piece. Do not use all-caps words for emphasis.

§5 Inclusive and accessible writing
Write for every merchant, whatever their size. Describe every image with alt text when content is published on the web.`;

const VISUAL = `§1 Palette
PayNova Blue #0B3D91 is the primary colour. Teal #00796B is the accent. Ink #1A1A1A, White #FFFFFF and Mist #F5F7FA are neutrals. Saffron #F2A900 is for highlights and icons only, never for text on light backgrounds.

§2 Text contrast
Body text must meet a contrast ratio of at least 4.5:1 against its background; large headings at least 3:1 (WCAG 2.2 SC 1.4.3).

§3 Logo
Keep clear space equal to the height of the N around the logo. Never recolour or stretch the logo.`;

const OFFER_DRAFT = `§1 Diwali week offer (proposal, not yet approved by Finance)
During Diwali week, PayNova Business charges zero fees on all UPI payments.`;

export async function seed(db: { query: (t: string, p?: unknown[]) => Promise<any[]> }) {
  const q: Q = (t, p) => db.query(t, p);
  // Only the first instance to insert the workspace seeds it (safe across concurrent cold starts).
  const created = await q(
    "INSERT INTO workspaces (id, name, palette) VALUES ($1,'PayNova (demo workspace)',$2) ON CONFLICT (id) DO NOTHING RETURNING id",
    [WS, JSON.stringify(PALETTE)]
  );
  if (!created.length) return;

  await q(
    `INSERT INTO users (id, workspace_id, name, title, role) VALUES
     ('u_priya',$1,'Priya Sharma','Content creator, agency partner','creator'),
     ('u_arjun',$1,'Arjun Mehta','Brand manager','reviewer'),
     ('u_meera',$1,'Meera Iyer','Brand operations admin','admin')`,
    [WS]
  );

  const addSource = async (title: string, kind: string, version: string, status: string, owner: string, date: string, body: string) => {
    const [s] = await q(
      'INSERT INTO sources (workspace_id, title, kind, version, status, owner, effective_date, body) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [WS, title, kind, version, status, owner, date, body]
    );
    await indexSource(s.id, WS, body, q, false);
    return s.id as number;
  };

  const product = await addSource('PayNova Business product sheet', 'product', '2.1', 'approved', 'Meera Iyer', '2026-10-01', PRODUCT_SHEET);
  const voice = await addSource('Brand voice and messaging guide', 'voice', '3.0', 'approved', 'Arjun Mehta', '2026-07-01', VOICE);
  await addSource('Visual identity guide', 'visual', '1.2', 'approved', 'Arjun Mehta', '2026-06-01', VISUAL);
  await addSource('PayNova Lite product sheet', 'product', '1.0', 'obsolete', 'Meera Iyer', '2025-01-15', OLD_SHEET);
  await addSource('Diwali 2026 fee offer', 'offer', '0.3', 'draft', 'Finance team', '2026-11-10', OFFER_DRAFT);

  const terms: [string, string, string, string, number, string][] = [
    ['PayNova Lite', 'PayNova Business', 'PayNova Lite was retired in 2025. Use the current product name.', 'medium', voice, '§3'],
    ['PayNova Pro', 'PayNova Business', 'There is no product called PayNova Pro.', 'medium', voice, '§3'],
    ['Pay Nova', 'PayNova', 'Write PayNova as one word.', 'low', voice, '§3'],
    ['Paynova', 'PayNova', 'PayNova takes a capital N.', 'low', voice, '§3'],
    ['upi', 'UPI', 'UPI is always written in capitals.', 'low', voice, '§3'],
  ];
  for (const t of terms)
    await q('INSERT INTO terms (workspace_id, banned, preferred, note, severity, source_id, ref) VALUES ($1,$2,$3,$4,$5,$6,$7)', [WS, ...t]);

  const rules: [string, string, string, string, string, string, string | null, number | null, string][] = [
    [
      'Guaranteed outcome',
      'claim',
      '(?:100\\s?%\\s+)?\\bguarantee[ds]?\\b(?:\\s+approvals?)?',
      'contradicted',
      'high',
      'Approval is subject to KYC verification and risk review and is explicitly not guaranteed. The voice guide also bans promises of guaranteed outcomes.',
      'approval subject to a quick KYC check',
      product,
      '§4',
    ],
    [
      'Instant settlement claim',
      'claim',
      '\\b(?:instant(?:ly)?|immediate(?:ly)?|real[- ]time)\\s+(?:settlements?|settles?|settled|payouts?|transfers?)\\b',
      'contradicted',
      'high',
      'Settlement is T+1: within 24 hours on business days. The product sheet states instant settlement is not offered.',
      'settlement within 24 hours on business days',
      product,
      '§3',
    ],
    [
      'Unqualified fee claim',
      'claim',
      '\\b(?:zero|no)\\s+(?:fees|charges|commission|MDR)\\b|\\bfee[- ]free\\b',
      'contradicted',
      'high',
      'Cards are charged 1.9% and UPI is free only up to ₹2,000. A Diwali fee offer exists only as an unapproved draft, so it cannot back this claim yet.',
      'no transaction fee on UPI payments up to ₹2,000',
      product,
      '§2',
    ],
    [
      'Unqualified superlative',
      'tone',
      '(?:#1\\b|\\b(?:the\\s+best(?:\\s+[\\w-]+){0,3}?\\s+ever|best|number\\s+one|unbeatable|world[- ]class|revolutionary|industry[- ]leading|market[- ]leading)\\b)',
      'rule',
      'low',
      'The voice guide allows superlatives only when an approved source substantiates them. Name a specific, supported benefit instead.',
      'a payments app that settles within 24 hours',
      voice,
      '§2',
    ],
    [
      'Risk-free promise',
      'claim',
      '\\brisk[- ]free\\b',
      'rule',
      'medium',
      'No approved source describes the product as risk-free. Payments involve chargebacks and KYC review.',
      null,
      voice,
      '§2',
    ],
    [
      'Instruction aimed at an AI reviewer',
      'security',
      '(?:note to the ai(?:\\s+reviewer)?|ignore\\s+(?:all\\s+|any\\s+)?(?:previous|prior|above|earlier)\\s+instructions|(?:mark|approve)\\s+this\\s+(?:content|post|draft|email)\\s+(?:as\\s+)?approved)',
      'rule',
      'medium',
      'This text tries to instruct an automated reviewer. BrandGuard treats submitted content as data and ignored it, but it must not reach customers. The attempt is recorded in the audit log.',
      '',
      null,
      '',
    ],
  ];
  for (const r of rules)
    await q(
      'INSERT INTO rules (workspace_id, name, category, pattern, verdict, severity, message, suggestion, source_id, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [WS, ...r.map((x) => (x === '' ? null : x))]
    );

  await audit(q, WS, null, 'u_meera', 'workspace_seeded', { sources: 5, terms: terms.length, rules: rules.length });

  // Example 1: an approved post with a full trail.
  const clean = SAMPLES.find((s) => s.key === 'clean')!;
  const [s1] = await q(
    "INSERT INTO submissions (workspace_id, title, channel, creator_id, status, created_at) VALUES ($1,$2,$3,'u_priya','DRAFT', now() - interval '26 hours') RETURNING id",
    [WS, clean.title, clean.channel]
  );
  await audit(q, WS, s1.id, 'u_priya', 'submission_created', { title: clean.title });
  const v1 = await createVersion(s1.id, WS, 'u_priya', clean.content, clean.colors, q);
  await runAnalysisForVersion(v1.id, WS, 'u_priya', q, { skipAI: true });
  await q("UPDATE submissions SET status='UNDER_REVIEW' WHERE id=$1", [s1.id]);
  await audit(q, WS, s1.id, 'u_priya', 'submitted_for_review', { version: 1 });
  await q("INSERT INTO decisions (submission_id, version_number, hash, reviewer_id, decision, reason) VALUES ($1,1,$2,'u_arjun','approved',$3)", [
    s1.id,
    v1.hash,
    'Claims match product sheet v2.1. Good to publish.',
  ]);
  await q("UPDATE submissions SET status='APPROVED', updated_at=now() - interval '20 hours' WHERE id=$1", [s1.id]);
  await audit(q, WS, s1.id, 'u_arjun', 'approved', { version: 1, hash: v1.hash.slice(0, 12) });

  // Example 2: waiting in the reviewer's queue.
  const inj = SAMPLES.find((s) => s.key === 'injection')!;
  const [s2] = await q(
    "INSERT INTO submissions (workspace_id, title, channel, creator_id, status, created_at) VALUES ($1,$2,$3,'u_priya','DRAFT', now() - interval '3 hours') RETURNING id",
    [WS, inj.title, inj.channel]
  );
  await audit(q, WS, s2.id, 'u_priya', 'submission_created', { title: inj.title });
  const v2 = await createVersion(s2.id, WS, 'u_priya', inj.content, inj.colors, q);
  await runAnalysisForVersion(v2.id, WS, 'u_priya', q, { skipAI: true });
  await q("UPDATE submissions SET status='UNDER_REVIEW' WHERE id=$1", [s2.id]);
  await audit(q, WS, s2.id, 'u_priya', 'submitted_for_review', { version: 1 });
}
