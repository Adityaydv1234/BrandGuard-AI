// A scripted stand-in for the OpenAI API, used to test the AI pipeline offline.
// It misbehaves on purpose so the evidence-binding guard can be verified.
import http from 'http';
const PORT = Number(process.env.MOCK_PORT || 4010);
const log = [];

function vec(text) {
  const v = new Array(64).fill(0);
  for (const w of (text.toLowerCase().match(/[a-z0-9]+/g) || [])) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 64; v[h] += 1; }
  return v;
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const j = body ? JSON.parse(body) : {};
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/embeddings')) {
      return res.end(JSON.stringify({ data: j.input.map((t) => ({ embedding: vec(t) })) }));
    }
    if (req.url === '/_log') return res.end(JSON.stringify(log));
    const sys = j.messages[0].content, user = j.messages[1].content;
    log.push({ sys: sys.slice(0, 40), user: user.slice(0, 2000) });
    let out;
    if (sys.includes('claims analyst')) {
      const content = user.replace(/<\/?content>/g, '');
      const claims = [];
      const pick = (needle, claim) => { const i = content.indexOf(needle); if (i >= 0) claims.push({ quote: content.slice(i, i + needle.length), claim, kind: 'factual' }); };
      pick('settles payments within 24 hours', 'Payments settle within 24 hours');
      pick('Trusted by 50,000 merchants', 'PayNova has 50,000 merchants');
      pick('award-winning support', 'Support has won awards');
      pick('Made-up sentence not in the draft', 'hallucinated quote');
      out = { claims };
    } else {
      const verdicts = [];
      for (const m of user.matchAll(/C(\d+): "([^"]+)"[\s\S]*?evidence:\n([\s\S]*?)(?=\n\nC\d+:|$)/g)) {
        const id = 'C' + m[1], quote = m[2], ev = [...m[3].matchAll(/\[(E\d+)\]/g)].map((x) => x[1]);
        if (/24 hours/.test(quote)) verdicts.push({ claim_id: id, verdict: 'supported', evidence_ids: ev.slice(0, 1), rationale: 'Product sheet states settlement within 24 hours.', suggestion: null, severity: 'info' });
        else if (/50,000/.test(quote)) verdicts.push({ claim_id: id, verdict: 'contradicted', evidence_ids: ev.slice(0, 1), rationale: 'The product sheet says more than 12,000 merchants, not 50,000.', suggestion: 'Trusted by more than 12,000 merchants', severity: 'high' });
        else if (/award/.test(quote)) verdicts.push({ claim_id: id, verdict: 'supported', evidence_ids: ['E99'], rationale: 'Looks plausible.', suggestion: null, severity: 'info' });
      }
      out = { verdicts };
    }
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
  });
});
server.listen(PORT, () => console.log('mock openai on ' + PORT));
