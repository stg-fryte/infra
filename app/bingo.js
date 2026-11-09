const GRID_SIZE = 5;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;
const FREE_INDEX = 12;
const FREE_LABEL = 'FREE';
const MAX_TITLE_WORDS = 8;
const MAX_TRACK_WORDS = 12;

const GENERIC_BUZZWORDS = [
  'Cloud Native', 'Kubernetes', 'Open Source', 'Scale', 'Community', 'Ecosystem', 'Observability',
  'Production', 'Roadmap', 'Maintainers', 'Best Practices', 'Lessons Learned', 'Zero Trust',
  'Declarative', 'Control Plane', 'Day 2', 'Multi-cluster', 'Vendor Neutral', 'CNCF', 'Pods',
  'Upstream', 'Operators', 'GitOps', 'Open Standards', 'Developer Experience', 'Demo',
];

const TRACK_BUZZWORDS = {
  'Operations + Performance': ['SLO', 'Latency', 'Autoscaling', 'Tracing', 'Throughput', 'Incident', 'Runbook', 'On-call', 'Telemetry', 'OpenTelemetry', 'Cost Optimization', 'Tail Latency'],
  'Cloud Native Experience': ['Onboarding', 'Adoption', 'Journey', 'Culture', 'Migration', 'Transformation', 'Org Chart', 'Champions', 'Playbook', 'Maturity Model'],
  'AI Inference + Agentic': ['LLM', 'Agents', 'GPU', 'Inference', 'MCP', 'Tokens', 'RAG', 'Guardrails', 'Hallucination', 'Fine-tuning', 'Model Serving', 'Agentic', 'Prompt', 'Vector DB'],
  'Platform Engineering': ['Golden Path', 'Internal Developer Platform', 'Self-service', 'Backstage', 'Paved Road', 'Abstraction', 'Crossplane', 'Platform as a Product', 'Cognitive Load', 'Templates'],
  'Data Processing + Storage': ['Stateful', 'Persistent Volumes', 'CSI', 'Postgres', 'Streaming', 'Data Lake', 'Replication', 'Backup', 'Object Storage', 'Batch'],
  Connectivity: ['Service Mesh', 'eBPF', 'Gateway API', 'Ingress', 'mTLS', 'CNI', 'Sidecar', 'Cilium', 'Envoy', 'Network Policy', 'Zero Downtime', 'Egress'],
  Security: ['Supply Chain', 'SBOM', 'Sigstore', 'CVE', 'Least Privilege', 'RBAC', 'Attestation', 'Policy as Code', 'Secrets', 'Shift Left', 'Threat Model', 'Compliance'],
  'Cloud Native Novice': ['Getting Started', 'Containers', 'kubectl', 'YAML', 'Deployments', 'Basics', 'Hello World', 'Namespace', 'Helm', 'Manifest'],
  'Maintainer Track': ['Governance', 'Contributors', 'Burnout', 'Release Cycle', 'Sustainability', 'Triage', 'Backlog', 'Pull Request', 'Mentorship', 'Graduation'],
  Contribfest: ['Good First Issue', 'Pull Request', 'Contributors', 'Mentorship', 'Code Review', 'Hands-on', 'Fork', 'Merge'],
  'Keynote Sessions': ['Announcement', 'Vision', 'Keynote', 'Milestone', 'Momentum', 'Thank You', 'Next Decade', 'Journey'],
  'Project Lightning Talks': ['Five Minutes', 'Quick Demo', 'Update', 'Graduated', 'Incubating', 'Sandbox', 'Roadmap', 'Adopters'],
  'Inclusion + Accessibility': ['Accessibility', 'Inclusion', 'Belonging', 'Allyship', 'Diversity', 'Mentorship', 'Welcoming', 'Community'],
  Experiences: ['Networking', 'Meetup', 'Swag', 'Hallway Track', 'Happy Hour', 'Badge Scan', 'Selfie', 'Coffee', 'Run Club', 'Social'],
  'Poster Sessions': ['Research', 'Poster', 'Abstract', 'Findings', 'Benchmark', 'Hypothesis', 'Methodology', 'Paper', 'Academic', 'Preliminary Results'],
  'Solutions Showcase': ['Booth', 'Sponsor', 'Enterprise', 'Free Trial', 'Lead Scan', 'Platform', 'Unified', 'Turnkey', 'Pricing', 'Partner'],
  'Project Opportunities': ['Contribute', 'Get Involved', 'Working Group', 'SIG', 'Volunteer', 'Help Wanted', 'Onboarding', 'Roadmap', 'Open Issues', 'Mentorship'],
  'Sponsor Demo Theater': ['Live Demo', 'Platform', 'Enterprise', 'Single Pane of Glass', 'Free Trial', 'Integration', 'Seamless', 'Unified', 'Next-gen', 'Out of the Box'],
  'Project Pavilion Tours': ['Walkthrough', 'Pavilion', 'Maintainers', 'Project Update', 'Graduated', 'Incubating', 'Sandbox', 'Booth', 'Meet the Team', 'Stickers'],
  'Cloud Native Theater': ['Theater', 'Lightning', 'Live Demo', 'Case Study', 'Deep Dive', 'Adoption', 'Real World', 'Lessons Learned', 'Architecture', 'Roadmap'],
  'Network Nook': ['Networking', 'Introductions', 'Hiring', 'Career', 'Connections', 'Coffee Chat', 'Mentorship', 'LinkedIn', 'Community', 'Meetup'],
  'Learning Lounge': ['Workshop', 'Hands-on', 'Tutorial', 'Certification', 'CKA', 'Training', 'Learning Path', 'Skill Up', 'Office Hours', 'Q&A'],
  'Project Pavilion Stage': ['Project Update', 'Maintainers', 'Graduated', 'Incubating', 'Community', 'Roadmap', 'Adopters', 'Release', 'Demo', 'Governance'],
};

const STOPWORDS = new Set([
  'with', 'from', 'that', 'this', 'your', 'about', 'into', 'over', 'than', 'then', 'what', 'when',
  'where', 'which', 'while', 'will', 'have', 'been', 'being', 'their', 'there', 'they', 'them',
  'more', 'most', 'some', 'only', 'also', 'just', 'like', 'make', 'made', 'using', 'used', 'does',
  'don\'t', 'building', 'beyond', 'session', 'keynote', 'welcome', 'lunch', 'break', 'registration',
]);

const normalize = (word) => word.trim().toLowerCase();

function titleBuzzwords(title) {
  const tokens = title.split(/[^A-Za-z0-9+#.-]+/).map((t) => t.replace(/^[.-]+|[.-]+$/g, ''));
  return tokens.filter((t) => t.length >= 4 && !STOPWORDS.has(normalize(t))).slice(0, MAX_TITLE_WORDS);
}

function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function uniqueBy(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalize(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buzzwordPool(session) {
  const fromTitle = titleBuzzwords(session.title);
  const fromTrack = TRACK_BUZZWORDS[session.track] || [];
  return { fromTitle, fromTrack, generic: GENERIC_BUZZWORDS };
}

function buildCard(session, random = Math.random) {
  const { fromTitle, fromTrack, generic } = buzzwordPool(session);
  const ranked = uniqueBy([
    ...shuffle(fromTitle, random),
    ...shuffle(fromTrack, random).slice(0, MAX_TRACK_WORDS),
    ...shuffle(generic, random),
  ]);
  const words = shuffle(ranked.slice(0, CELL_COUNT - 1), random);
  words.splice(FREE_INDEX, 0, FREE_LABEL);
  return words;
}

const LINES = (() => {
  const lines = [];
  for (let r = 0; r < GRID_SIZE; r++) lines.push(Array.from({ length: GRID_SIZE }, (_, c) => r * GRID_SIZE + c));
  for (let c = 0; c < GRID_SIZE; c++) lines.push(Array.from({ length: GRID_SIZE }, (_, r) => r * GRID_SIZE + c));
  lines.push(Array.from({ length: GRID_SIZE }, (_, i) => i * GRID_SIZE + i));
  lines.push(Array.from({ length: GRID_SIZE }, (_, i) => i * GRID_SIZE + (GRID_SIZE - 1 - i)));
  return lines;
})();

function winningLines(marked) {
  const set = new Set(marked);
  return LINES.filter((line) => line.every((index) => set.has(index)));
}

const isMarkableIndex = (index) =>
  Number.isInteger(index) && index >= 0 && index < CELL_COUNT && index !== FREE_INDEX;

module.exports = { TRACK_BUZZWORDS, CELL_COUNT, FREE_INDEX, GRID_SIZE, buildCard, titleBuzzwords, isMarkableIndex, winningLines };
