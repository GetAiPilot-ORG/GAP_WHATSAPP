import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

/* ─── Constants ─────────────────────────────────────────────── */
const COMPANY = 'GetAiPilot';
const PRODUCT = 'GAP FlowPilot';
const DOMAIN = 'getaipilot.in';
const SUPPORT_EMAIL = 'getaipilott@gmail.com';

/* ─── Inline SVG Icon Component ────────────────────────────── */
const Icon = ({ d, size = 20, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const icons = {
  flow: 'M12 3v3m0 12v3M3 12h3m12 0h3M5.636 5.636l2.121 2.121m8.486 8.486l2.121 2.121M5.636 18.364l2.121-2.121m8.486-8.486l2.121-2.121',
  message: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  bot: 'M12 8V4H8M12 4h4m-4 0v4m-6 4v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4a4 4 0 0 0-4-4h-4a4 4 0 0 0-4 4zm3 2h.01M15 14h.01',
  calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  broadcast: 'M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z',
  contacts: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  check: 'M20 6L9 17l-5-5',
  arrow: 'M5 12h14m-7-7l7 7-7 7',
  globe: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z',
  chart: 'M18 20V10M12 20V4M6 20v-6',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
  template: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8m8 4H8m2-8H8',
  users: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  sparkles: 'M12 3v3m0 12v3M3 12h3m12 0h3M7.05 7.05l2.12 2.12m5.66 5.66l2.12 2.12M7.05 16.95l2.12-2.12m5.66-5.66l2.12-2.12'
};

/* ─── Home Page Component ───────────────────────────────────── */
export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.title = `${PRODUCT} | Enterprise WhatsApp Automation & Google Calendar Platform`;

    // Ensure body and html overflow allows natural scrolling on this page
    document.documentElement.style.overflowY = 'auto';
    document.body.style.overflowY = 'auto';

    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => {
      window.removeEventListener('scroll', handler);
    };
  }, []);

  return (
    <div className="hp-root">
      {/* ── Header / Navigation ── */}
      <nav className={`hp-nav ${scrolled ? 'hp-nav--scrolled' : ''}`}>
        <div className="hp-container hp-nav__inner">
          <Link to="/" className="hp-nav__brand">
            <img src="/logo.png" alt={`${PRODUCT} Logo`} className="hp-nav__logo" />
            <span className="hp-nav__name">{PRODUCT}</span>
          </Link>

          <div className="hp-nav__actions-only">
            <Link to="/login" className="hp-btn hp-btn--ghost">Log In</Link>
            <Link to="/login" className="hp-btn hp-btn--primary">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero Section (Apple x Vercel Crafted) ── */}
      <section className="hp-hero">
        <div className="hp-hero__ambient" aria-hidden="true" />
        <div className="hp-container">
          <div className="hp-hero__badge">
            <span className="hp-hero__badge-pulse" />
            <span>Meta Cloud API & Google Calendar Sync Engine</span>
          </div>

          <h1 className="hp-hero__title">
            Enterprise WhatsApp Automation <br className="hidden md:inline" /> & Intelligent Scheduling.
          </h1>

          <p className="hp-hero__sub">
            Build complex conversational flows, route support chats to multi-agent desks, broadcast Meta-approved campaigns, and sync appointments directly into Google Calendar.
          </p>

          <div className="hp-hero__ctas">
            <Link to="/login" className="hp-btn hp-btn--primary hp-btn--lg">
              Get Started <Icon d={icons.arrow} size={16} />
            </Link>
            <Link to="/login" className="hp-btn hp-btn--ghost hp-btn--lg">Log In to Workspace</Link>
          </div>

          <div className="hp-hero__mockup-wrapper">
            <div className="hp-hero__mockup-frame">
              <div className="hp-hero__mockup-bar">
                <div className="hp-hero__mockup-dots">
                  <span className="bg-red-400/80" />
                  <span className="bg-amber-400/80" />
                  <span className="bg-emerald-400/80" />
                </div>
                <div className="hp-hero__mockup-title">gap-flowpilot.app / workspace / dashboard</div>
              </div>
              <img
                src="/images/hero-dashboard.png"
                alt={`${PRODUCT} SaaS Dashboard Interface`}
                className="hp-hero__img"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Tech Stack Strip ── */}
      <section className="hp-trust">
        <div className="hp-container">
          <p className="hp-trust__label">BUILT ON OFFICIAL ENTERPRISE APIS & SECURE INFRASTRUCTURE</p>
          <div className="hp-trust__logos">
            <div className="hp-trust__tech-item">
              <img src="https://cdn.simpleicons.org/whatsapp/25D366" alt="WhatsApp Business" width="24" height="24" />
              <span>WhatsApp Cloud API</span>
            </div>
            <div className="hp-trust__tech-item">
              <img src="https://cdn.simpleicons.org/googlecalendar/4285F4" alt="Google Calendar" width="24" height="24" />
              <span>Google Calendar API</span>
            </div>
            <div className="hp-trust__tech-item">
              <img src="https://cdn.simpleicons.org/meta/0081FB" alt="Meta Platforms" width="24" height="24" />
              <span>Meta Business Platform</span>
            </div>
            <div className="hp-trust__tech-item">
              <img src="https://cdn.simpleicons.org/supabase/3ECF8E" alt="Supabase" width="24" height="24" />
              <span>Supabase Enterprise DB</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Apple-Style Bento Grid Features (Diverse & Rich Visuals) ── */}
      <section className="hp-bento">
        <div className="hp-container">
          <div className="hp-section-header">
            <h2 className="hp-section-title">Core Platform Architecture</h2>
            <p className="hp-section-sub">
              Everything your team needs to scale automated customer operations on WhatsApp.
            </p>
          </div>

          <div className="hp-bento__grid">
            {/* Bento 1: Visual Flow Engine */}
            <div className="hp-bento__card hp-bento__card--hero">
              <div className="hp-bento__body">
                <div className="hp-bento__header-row">
                  <div className="hp-bento__icon-badge hp-bento__icon-badge--emerald">
                    <Icon d={icons.flow} size={20} />
                  </div>
                  <div className="hp-bento__tag">Drag & Drop Engine</div>
                </div>
                <h3 className="hp-bento__title">Visual Flow Builder Engine</h3>
                <p className="hp-bento__desc">
                  Construct visual decision trees with zero code. Process button taps, list selectors, keyword triggers, and condition branches in real-time.
                </p>
              </div>
              <div className="hp-bento__visual-box">
                <img src="/images/feature-flow-builder.png" alt="Visual Flow Builder Canvas" className="hp-bento__img" />
              </div>
            </div>

            {/* Bento 2: Google Calendar */}
            <div className="hp-bento__card hp-bento__card--blue">
              <div className="hp-bento__body">
                <div className="hp-bento__header-row">
                  <div className="hp-bento__icon-badge hp-bento__icon-badge--blue">
                    <Icon d={icons.calendar} size={20} />
                  </div>
                  <div className="hp-bento__tag hp-bento__tag--blue">OAuth 2.0 Direct</div>
                </div>
                <h3 className="hp-bento__title">Google Calendar Sync</h3>
                <p className="hp-bento__desc">
                  Expose live calendar free/busy slots via WhatsApp. Customers pick a slot, and an event is booked automatically with exact timezone offsets.
                </p>
              </div>

              {/* Interactive Visual Slot Preview */}
              <div className="hp-bento__preview-widget hp-bento__preview-widget--gcal">
                <div className="hp-bento__gcal-slot hp-bento__gcal-slot--active">
                  <span className="hp-bento__dot hp-bento__dot--green" />
                  <span>10:00 AM IST</span>
                  <span className="hp-bento__slot-badge">Confirmed</span>
                </div>
                <div className="hp-bento__gcal-slot">
                  <span className="hp-bento__dot hp-bento__dot--blue" />
                  <span>02:30 PM IST</span>
                  <span className="hp-bento__slot-badge hp-bento__slot-badge--free">Free</span>
                </div>
              </div>
            </div>

            {/* Bento 3: Multi-Agent Inbox */}
            <div className="hp-bento__card hp-bento__card--teal">
              <div className="hp-bento__body">
                <div className="hp-bento__header-row">
                  <div className="hp-bento__icon-badge hp-bento__icon-badge--teal">
                    <Icon d={icons.message} size={20} />
                  </div>
                  <div className="hp-bento__tag hp-bento__tag--teal">Real-time Sockets</div>
                </div>
                <h3 className="hp-bento__title">Multi-Agent Live Chat Desk</h3>
                <p className="hp-bento__desc">
                  Unified team inbox allowing multiple agents to manage WhatsApp conversations, transfer chats, add tags, and collaborate with internal notes.
                </p>
              </div>

              <div className="hp-bento__preview-widget hp-bento__preview-widget--chat">
                <div className="hp-bento__chat-bubble">
                  <span className="hp-bento__chat-sender">Agent Chetana</span>
                  <p className="hp-bento__chat-msg">Meeting confirmed for tomorrow at 10:00 AM! Calendar invite sent.</p>
                </div>
              </div>
            </div>

            {/* Bento 4: Broadcast Manager */}
            <div className="hp-bento__card hp-bento__card--amber">
              <div className="hp-bento__body">
                <div className="hp-bento__header-row">
                  <div className="hp-bento__icon-badge hp-bento__icon-badge--amber">
                    <Icon d={icons.broadcast} size={20} />
                  </div>
                  <div className="hp-bento__tag hp-bento__tag--amber">Meta Approved</div>
                </div>
                <h3 className="hp-bento__title">Template Broadcast Engine</h3>
                <p className="hp-bento__desc">
                  Draft, approve, and send targeted WhatsApp broadcasts. Upload CSV contact lists and track delivery metrics in real time.
                </p>
              </div>

              <div className="hp-bento__preview-widget hp-bento__preview-widget--broadcast">
                <div className="hp-bento__stat-chip">
                  <span className="hp-bento__stat-val">99.4%</span>
                  <span className="hp-bento__stat-lbl">Deliverability</span>
                </div>
                <div className="hp-bento__stat-chip">
                  <span className="hp-bento__stat-val">CSV</span>
                  <span className="hp-bento__stat-lbl">Bulk Upload</span>
                </div>
              </div>
            </div>

            {/* Bento 5: AI Bots (Purple/Indigo AI Tint Card) */}
            <div className="hp-bento__card hp-bento__card--purple">
              <div className="hp-bento__body">
                <div className="hp-bento__header-row">
                  <div className="hp-bento__icon-badge hp-bento__icon-badge--purple">
                    <Icon d={icons.bot} size={20} />
                  </div>
                  <div className="hp-bento__tag hp-bento__tag--purple">RAG Knowledge Engine</div>
                </div>
                <h3 className="hp-bento__title">AI Knowledge Chatbots</h3>
                <p className="hp-bento__desc">
                  Train specialized AI agents on custom document bases to resolve repetitive support queries automatically before human handoff.
                </p>
              </div>

              <div className="hp-bento__preview-widget hp-bento__preview-widget--purple">
                <div className="hp-bento__ai-prompt">
                  <Icon d={icons.sparkles} size={14} className="text-purple-600" />
                  <span>AI: "Checking workspace availability..."</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Deep Dive Technical Overview ── */}
      <section className="hp-deep-dive">
        <div className="hp-container">
          <div className="hp-section-header">
            <h2 className="hp-section-title">In-Depth Application Capabilities</h2>
            <p className="hp-section-sub">
              Detailed breakdown of how {PRODUCT} powers end-to-end business communication.
            </p>
          </div>

          <div className="hp-deep-dive__stack">
            {/* Block 1 */}
            <div className="hp-deep-dive__row">
              <div className="hp-deep-dive__col">
                <h3 className="hp-deep-dive__heading">1. Interactive WhatsApp Flow Engine</h3>
                <p className="hp-deep-dive__text">
                  The flow builder maps complex interactive messaging journeys without writing code. Incoming messages trigger node executions that evaluate conditions, request user inputs, or call external API webhooks.
                </p>
                <ul className="hp-deep-dive__list">
                  <li><Icon d={icons.check} size={16} /> <strong>Trigger Management:</strong> Start flows via inbound keywords, WhatsApp link clicks, or webhook events.</li>
                  <li><Icon d={icons.check} size={16} /> <strong>Interactive Messaging:</strong> Send native WhatsApp button choices, multi-item pickers, and dynamic media documents.</li>
                  <li><Icon d={icons.check} size={16} /> <strong>Session State Storage:</strong> Save customer selections directly into flow variables for downstream processing.</li>
                </ul>
              </div>
              <div className="hp-deep-dive__col-img">
                <img src="/images/feature-flow-builder.png" alt="Visual WhatsApp Flow Builder Canvas" className="hp-deep-dive__card-img" />
              </div>
            </div>

            {/* Block 2 */}
            <div className="hp-deep-dive__row hp-deep-dive__row--reverse">
              <div className="hp-deep-dive__col">
                <h3 className="hp-deep-dive__heading">2. Multi-Agent Shared Live Chat Desk</h3>
                <p className="hp-deep-dive__text">
                  When automated flows reach human hand-off nodes, conversations seamlessly route to the team inbox. Multiple support members can step in, answer questions, and manage customer relations.
                </p>
                <ul className="hp-deep-dive__list">
                  <li><Icon d={icons.check} size={16} /> <strong>Agent Assignment:</strong> Route incoming WhatsApp chats automatically or manually to designated team agents.</li>
                  <li><Icon d={icons.check} size={16} /> <strong>Internal Workspace Notes:</strong> Collaborate behind the scenes with internal agent notes before replying.</li>
                  <li><Icon d={icons.check} size={16} /> <strong>Real-time Socket Sync:</strong> Instant web socket updates ensure messages display across agent screens instantly.</li>
                </ul>
              </div>
              <div className="hp-deep-dive__col-img">
                <img src="/images/Agent-page.png" alt="Multi-Agent Live Chat Workspace" className="hp-deep-dive__card-img" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Comprehensive Google Calendar Integration Section ── */}
      <section className="hp-gcal">
        <div className="hp-container">
          <div className="hp-gcal__header">
            <div className="hp-gcal__badge">
              <img src="https://cdn.simpleicons.org/googlecalendar/4285F4" alt="" width="16" height="16" />
              <span>Official Google API Integration Specification</span>
            </div>
            <h2 className="hp-section-title">Google Calendar API Usage & OAuth Compliance</h2>
            <p className="hp-section-sub">
              {PRODUCT} integrates with the Google Calendar API to allow businesses to offer direct meeting scheduling inside WhatsApp. Below is the operational specification for Google OAuth verification compliance.
            </p>
          </div>

          <div className="hp-gcal__grid">
            <div className="hp-gcal__card">
              <h4 className="hp-gcal__card-title">1. Purpose & Core Value</h4>
              <p className="hp-gcal__card-desc">
                The Google Calendar integration lets workspace owners connect their primary calendar. When a customer uses a WhatsApp flow to request a demo, consultation, or meeting, {PRODUCT} queries free/busy availability and creates the event automatically.
              </p>
            </div>

            <div className="hp-gcal__card">
              <h4 className="hp-gcal__card-title">2. Requested OAuth Scopes</h4>
              <p className="hp-gcal__card-desc">
                We request scope access to:
                <br />• <code>userinfo.email</code> (identifies the connected Google account display name)
                <br />• <code>calendar.events</code> (creates, fetches, and deletes appointment events)
                <br />• <code>calendar.readonly</code> (inspects busy slots to prevent booking conflicts)
              </p>
            </div>

            <div className="hp-gcal__card">
              <h4 className="hp-gcal__card-title">3. Timezone Offset Calculation</h4>
              <p className="hp-gcal__card-desc">
                Events are created using exact local ISO string timestamps (e.g. <code>2026-07-25T11:00:00+05:30</code> for IST). The system resolves the calendar's primary timezone setting to ensure events land on the accurate local hour.
              </p>
            </div>

            <div className="hp-gcal__card">
              <h4 className="hp-gcal__card-title">4. Token Storage & Encryption</h4>
              <p className="hp-gcal__card-desc">
                Google OAuth access tokens and refresh tokens are encrypted using AES-256-CBC cipher prior to being stored in our Supabase database. Tokens are never exposed to client-side scripts.
              </p>
            </div>

            <div className="hp-gcal__card">
              <h4 className="hp-gcal__card-title">5. Event Deletion & Management</h4>
              <p className="hp-gcal__card-desc">
                If an appointment is cancelled or deleted within the {PRODUCT} Scheduled Meetings portal, the application issues a <code>DELETE</code> request to the Google Calendar API to immediately remove the event.
              </p>
            </div>

            <div className="hp-gcal__card">
              <h4 className="hp-gcal__card-title">6. Data Privacy & Non-Disclosure</h4>
              <p className="hp-gcal__card-desc">
                Google user data is strictly used to provide appointment scheduling features. We do not sell, rent, or share Google Calendar data with third-party advertising networks or data brokers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Security & Infrastructure ── */}
      <section className="hp-security">
        <div className="hp-container">
          <div className="hp-section-header">
            <h2 className="hp-section-title">Infrastructure, Security & Compliance</h2>
            <p className="hp-section-sub">
              Designed with enterprise safeguards to manage high-volume messaging and sensitive API tokens securely.
            </p>
          </div>

          <div className="hp-security__grid">
            {[
              { icon: icons.lock, title: 'AES-256 Token Encryption', desc: 'All third-party credentials (Meta tokens, Google OAuth refresh tokens) are encrypted at rest using AES-256-CBC encryption.' },
              { icon: icons.shield, title: 'Meta & Google Policy Compliance', desc: 'Full compliance with Meta Cloud API Policies and Google API Services User Data Policy, including Limited Use requirements.' },
              { icon: icons.globe, title: 'DPDP & GDPR Compliance', desc: 'Strict compliance with India’s Digital Personal Data Protection Act, 2023 (DPDP) and EU GDPR standards.' },
              { icon: icons.users, title: 'Multi-Tenant Isolation', desc: 'Complete organization level data segregation ensuring workspaces access only their authorized accounts and contacts.' },
            ].map((s) => (
              <div key={s.title} className="hp-security-card">
                <div className="hp-security-card__icon"><Icon d={s.icon} size={20} /></div>
                <h3 className="hp-security-card__title">{s.title}</h3>
                <p className="hp-security-card__desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Call To Action Section ── */}
      <section className="hp-cta">
        <div className="hp-container">
          <div className="hp-cta__box">
            <h2 className="hp-cta__title">Access {PRODUCT} Workspace</h2>
            <p className="hp-cta__desc">
              Log in to configure your WhatsApp Cloud API connections, build interactive flows, and manage scheduled meetings.
            </p>
            <div className="hp-cta__actions">
              <Link to="/login" className="hp-btn hp-btn--primary hp-btn--lg">Log In to Application</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="hp-footer">
        <div className="hp-container hp-footer__inner">
          <div className="hp-footer__brand">
            <img src="/logo.png" alt={`${PRODUCT} logo`} width="32" height="32" />
            <span className="hp-footer__name">{PRODUCT}</span>
            <p className="hp-footer__tagline">Enterprise WhatsApp Automation & Integration Platform by {COMPANY}</p>
          </div>

          <div className="hp-footer__cols">
            <div className="hp-footer__col">
              <h4 className="hp-footer__col-title">Platform</h4>
              <Link to="/login">Flow Builder</Link>
              <Link to="/login">Live Chat Inbox</Link>
              <Link to="/login">Google Calendar Sync</Link>
              <Link to="/login">Broadcast Campaigns</Link>
            </div>
            <div className="hp-footer__col">
              <h4 className="hp-footer__col-title">Compliance & Legal</h4>
              <Link to="/terms">Terms of Service</Link>
              <Link to="/privacy-policy">Privacy Policy</Link>
              <a href={`mailto:${SUPPORT_EMAIL}`}>Support Inquiry ({SUPPORT_EMAIL})</a>
            </div>
            <div className="hp-footer__col">
              <h4 className="hp-footer__col-title">Authentication</h4>
              <Link to="/login">User Login</Link>
              <Link to="/agent-login">Agent Login</Link>
              <Link to="/login">Register Workspace</Link>
            </div>
          </div>
        </div>

        <div className="hp-container hp-footer__bottom">
          <p>&copy; {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
          <p>{DOMAIN}</p>
        </div>
      </footer>
    </div>
  );
}
