import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Shield, Lock, FileText, ArrowLeft, Search, X, ChevronUp, Copy, Check,
  Printer, Menu, ChevronDown, ExternalLink, Scale, Globe,
  Database, Users, MessageSquare, Bot, CreditCard, Bell, Zap, Calendar, AlertTriangle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import './TermsOfService.css';

/* ─── Constants ─────────────────────────────────────────────── */
const COMPANY_NAME = 'GetAiPilot';
const PRODUCT_NAME = 'GAP FlowPilot';
const DOMAIN = 'getaipilot.in';
const SUPPORT_EMAIL = 'getaipilott@gmail.com';
const LEGAL_EMAIL = 'legal@getaipilot.in';
const LAST_UPDATED = 'July 23, 2026';
const EFFECTIVE_DATE = 'July 23, 2026';

/* ─── Terms Sections Data ─────────────────────────────────────── */
const TERMS_SECTIONS = [
  {
    id: 'agreement',
    title: '1. Binding Agreement & Acceptance',
    icon: Scale,
    content: [
      {
        type: 'paragraph',
        text: `These Terms of Service ("Terms," "Agreement") constitute a legally binding contract between ${COMPANY_NAME} ("Company," "we," "us," or "our") and the individual or business entity ("User," "Customer," "you," or "your") accessing or using the ${PRODUCT_NAME} platform available at ${DOMAIN} and all associated APIs, web applications, and services (collectively, the "Services").`,
      },
      {
        type: 'paragraph',
        text: `By registering for an account, accessing the platform, or integrating your WhatsApp Business Account or Google Calendar with the Services, you confirm that you are at least 18 years of age, have the legal authority to bind your organization, and agree to comply with all terms herein.`,
      },
      {
        type: 'paragraph',
        text: `If you do not agree to these Terms, you must immediately cease accessing and using the Services.`,
      },
    ],
  },
  {
    id: 'services-description',
    title: '2. Description of Services',
    icon: Zap,
    content: [
      {
        type: 'paragraph',
        text: `${PRODUCT_NAME} is a Software-as-a-Service (SaaS) platform that enables businesses to manage WhatsApp communications, build visual conversation flows, automate customer support, broadcast targeted template messages, and schedule meetings via Google Calendar integrations.`,
      },
      {
        type: 'list',
        items: [
          { label: 'WhatsApp Cloud API Integration', text: 'Facilitating connection to official Meta Cloud API endpoints for message transmission and receiving.' },
          { label: 'Visual Flow Engine', text: 'Drag-and-drop interface for constructing interactive messaging flows, condition rules, and decision trees.' },
          { label: 'Multi-Agent Live Chat Inbox', text: 'Shared team portal for human agents to manage, assign, and respond to WhatsApp customer conversations.' },
          { label: 'Google Calendar Scheduling', text: 'OAuth 2.0-powered integration allowing contacts to inspect availability slots and book meetings synced to Google Calendar.' },
          { label: 'Broadcasting & Analytics', text: 'Bulk message sending utilizing approved Meta templates with delivery analytics and status reporting.' },
        ],
      },
    ],
  },
  {
    id: 'meta-whatsapp-policy',
    title: '3. Meta Platforms & WhatsApp Business Compliance',
    icon: MessageSquare,
    content: [
      {
        type: 'paragraph',
        text: `Our Services depend on the WhatsApp Business Platform provided by Meta Platforms, Inc. Your use of WhatsApp messaging through ${PRODUCT_NAME} is strictly subject to Meta\'s Platform Terms, WhatsApp Business Messaging Policy, and WhatsApp Commerce Policy.`,
      },
      {
        type: 'subsection',
        title: '3.1 User Responsibilities for WhatsApp Usage',
        items: [
          'You must maintain explicit user opt-in consent before initiating business messages to end-customers.',
          'You shall not send unsolicited bulk spam messages, deceptive marketing, or prohibited content (e.g. adult content, illegal gambling, counterfeit goods).',
          'You are responsible for obtaining template approvals directly from Meta prior to launching broadcast campaigns.',
          'Meta reserves the right to suspend or ban WhatsApp Business Accounts (WABAs) that violate their quality messaging guidelines. ${COMPANY_NAME} is not liable for Meta-enforced account restrictions.',
        ],
      },
    ],
  },
  {
    id: 'google-calendar-policy',
    title: '4. Google Calendar Integration & OAuth Policy',
    icon: Calendar,
    content: [
      {
        type: 'paragraph',
        text: `${PRODUCT_NAME} offers an optional Google Calendar integration allowing users to connect their Google Account to facilitate automated meeting scheduling within WhatsApp conversations.`,
      },
      {
        type: 'subsection',
        title: '4.1 Google OAuth 2.0 & Data Usage',
        items: [
          'Authentication is conducted securely through Google OAuth 2.0 protocols. We store encrypted refresh tokens using AES-256-CBC encryption.',
          'Requested Google Scopes include userinfo.email (for account identification), calendar.readonly (for busy slot verification), and calendar.events (for event creation and deletion).',
          'We adhere strictly to the Google API Services User Data Policy, including Limited Use requirements. Your Google Calendar data is never sold, shared with ad networks, or used for AI training.',
          'Users may disconnect their Google Account at any time via the Integrations page or Google Security Settings, which revokes token access immediately.',
        ],
      },
      {
        type: 'subsection',
        title: '4.2 Appointment Lifecycle & Timezone Handling',
        items: [
          'Meeting events created by ${PRODUCT_NAME} use exact ISO timestamps including local timezone offsets (e.g., IST +05:30).',
          'When an appointment is deleted within the ${PRODUCT_NAME} portal, a corresponding API request issues a deletion event to remove the item from Google Calendar.',
        ],
      },
    ],
  },
  {
    id: 'account-security',
    title: '5. Account Registration & Workspace Security',
    icon: Users,
    content: [
      {
        type: 'paragraph',
        text: `To access the platform, you must create an account. You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your workspace account.`,
      },
      {
        type: 'list',
        items: [
          { label: 'Multi-Tenant Workspaces', text: 'Each workspace is isolated. Workspace Owners and Admins control member invitations, agent roles, and permission levels.' },
          { label: 'Credential Safety', text: 'You must notify us immediately at ${SUPPORT_EMAIL} if you suspect unauthorized access or security breaches in your workspace.' },
          { label: 'Account Termination', text: 'We reserve the right to suspend or terminate accounts that violate these Terms, remain inactive for extended periods, or pose security risks.' },
        ],
      },
    ],
  },
  {
    id: 'acceptable-use',
    title: '6. Acceptable Use & Prohibited Conduct',
    icon: AlertTriangle,
    content: [
      {
        type: 'paragraph',
        text: `You agree to use the Services solely for lawful business purposes. You explicitly agree NOT to:`,
      },
      {
        type: 'list',
        items: [
          { label: 'Spamming & Abuse', text: 'Send unsolicited bulk messages, phishing attempts, malware, viruses, or illegal content.' },
          { label: 'System Interference', text: 'Attempt to reverse engineer, decompile, hack, probe, or overload platform servers or APIs.' },
          { label: 'Impersonation', text: 'Impersonate any person, brand, or entity without explicit authorization.' },
          { label: 'Data Harvesting', text: 'Scrape or extract customer data outside authorized API functionality.' },
        ],
      },
    ],
  },
  {
    id: 'billing-payments',
    title: '7. Billing, Subscriptions & WhatsApp Charges',
    icon: CreditCard,
    content: [
      {
        type: 'paragraph',
        text: `Access to certain features of ${PRODUCT_NAME} requires a paid subscription or prepaid messaging wallet balance.`,
      },
      {
        type: 'subsection',
        title: '7.1 Fees & Charges',
        items: [
          'Subscription Fees are billed in advance on a recurring monthly or annual basis.',
          'WhatsApp Conversation Charges: Charges incurred for Meta conversation categories (Utility, Marketing, Service, Authentication) are deducted from your platform wallet balance based on official Meta pricing schedules.',
          'Non-Refundable Wallet: Wallet top-ups used for WhatsApp messaging charges are non-refundable once consumed.',
          'Taxes: All fees are exclusive of applicable taxes (GST, VAT, Sales Tax) which will be calculated at checkout.',
        ],
      },
    ],
  },
  {
    id: 'data-privacy',
    title: '8. Data Ownership & Privacy Compliance',
    icon: Lock,
    content: [
      {
        type: 'paragraph',
        text: `Your privacy and data security are fundamental to our architecture.`,
      },
      {
        type: 'list',
        items: [
          { label: 'Customer Data Ownership', text: 'You retain all ownership rights to your contacts, conversation content, and business data. We act as a Data Processor on your behalf.' },
          { label: 'Compliance Standards', text: 'We process personal data in compliance with applicable laws, including the Indian Digital Personal Data Protection Act, 2023 (DPDP) and EU General Data Protection Regulation (GDPR).' },
          { label: 'Privacy Policy', text: 'Our collection and processing of personal data is governed by our Privacy Policy, available at ${DOMAIN}/privacy-policy.' },
        ],
      },
    ],
  },
  {
    id: 'intellectual-property',
    title: '9. Intellectual Property Rights',
    icon: Shield,
    content: [
      {
        type: 'paragraph',
        text: `All rights, title, and interest in and to the ${PRODUCT_NAME} platform, including software code, UI designs, logos, algorithms, flow builder interfaces, and documentation, are and remain the exclusive property of ${COMPANY_NAME} and its licensors.`,
      },
      {
        type: 'paragraph',
        text: `Subject to compliance with these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to access and use the platform during your subscription term.`,
      },
    ],
  },
  {
    id: 'limitation-liability',
    title: '10. Warranties & Limitation of Liability',
    icon: Shield,
    content: [
      {
        type: 'paragraph',
        text: `THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.`,
      },
      {
        type: 'paragraph',
        text: `TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${COMPANY_NAME} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES, LOSS OF PROFITS, DATA LOSS, OR BUSINESS INTERRUPTION ARISING FROM YOUR USE OF THE SERVICES OR THIRD-PARTY PLATFORM (META / GOOGLE) OUTAGES.`,
      },
      {
        type: 'paragraph',
        text: `OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING UNDER THESE TERMS SHALL NOT EXCEED THE TOTAL AMOUNT PAID BY YOU TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.`,
      },
    ],
  },
  {
    id: 'indemnification',
    title: '11. Indemnification',
    icon: Scale,
    content: [
      {
        type: 'paragraph',
        text: `You agree to defend, indemnify, and hold harmless ${COMPANY_NAME}, its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including legal fees) arising out of your breach of these Terms, your messaging content, or your violation of Meta/Google policies.`,
      },
    ],
  },
  {
    id: 'governing-law',
    title: '12. Governing Law & Dispute Resolution',
    icon: Globe,
    content: [
      {
        type: 'paragraph',
        text: `These Terms shall be governed by and construed in accordance with the laws of India, without regard to its conflict of law principles.`,
      },
      {
        type: 'paragraph',
        text: `Any legal suit, action, or proceeding arising out of or related to these Terms or the Services shall be instituted exclusively in the competent courts located in India.`,
      },
    ],
  },
  {
    id: 'changes-terms',
    title: '13. Modifications to Terms & Contact Information',
    icon: FileText,
    content: [
      {
        type: 'paragraph',
        text: `We reserve the right to modify or update these Terms at any time. We will provide notice of material changes by updating the "Last Updated" date at the top of this page and sending an email notification to workspace administrators.`,
      },
      {
        type: 'paragraph',
        text: `If you have any questions or legal inquiries regarding these Terms, please contact our legal team at:`,
      },
      {
        type: 'list',
        items: [
          { label: 'Company', text: COMPANY_NAME },
          { label: 'Legal Contact', text: LEGAL_EMAIL },
          { label: 'Support Contact', text: SUPPORT_EMAIL },
          { label: 'Website Domain', text: DOMAIN },
        ],
      },
    ],
  },
];

/* ─── Terms Component ────────────────────────────────────────── */
export default function TermsOfService() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('agreement');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    document.title = `Terms of Service | ${PRODUCT_NAME}`;
    window.scrollTo(0, 0);

    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);

      // Section scroll tracking
      const sectionElements = TERMS_SECTIONS.map(s => document.getElementById(s.id)).filter(Boolean);
      const scrollPosition = window.scrollY + 160;

      for (let i = sectionElements.length - 1; i >= 0; i--) {
        const el = sectionElements[i];
        if (el && el.offsetTop <= scrollPosition) {
          setActiveSection(TERMS_SECTIONS[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id) => {
    setActiveSection(id);
    setMobileSidebarOpen(false);
    const el = document.getElementById(id);
    if (el) {
      const offset = 100;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = el.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      window.scrollTo({
        top: elementPosition - offset,
        behavior: 'smooth'
      });
    }
  };

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return TERMS_SECTIONS;
    const q = searchQuery.toLowerCase();
    return TERMS_SECTIONS.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.content.some(c =>
        (c.text && c.text.toLowerCase().includes(q)) ||
        (c.items && c.items.some(i => (typeof i === 'string' ? i.toLowerCase().includes(q) : i.text.toLowerCase().includes(q))))
      )
    );
  }, [searchQuery]);

  return (
    <div className="terms-root">
      {/* Navbar */}
      <header className="terms-header">
        <div className="terms-container terms-header__inner">
          <Link to="/" className="terms-brand">
            <img src="/logo.png" alt={`${PRODUCT_NAME} Logo`} className="terms-brand__logo" />
            <span className="terms-brand__name">{PRODUCT_NAME}</span>
          </Link>
          <div className="terms-header__actions">
            <button onClick={() => window.print()} className="terms-btn terms-btn--outline">
              <Printer className="w-4 h-4" /> Print Terms
            </button>
            <Link to="/login" className="terms-btn terms-btn--primary">
              Log In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="terms-hero">
        <div className="terms-container">
          <div className="terms-hero__badge">
            <Scale className="w-3.5 h-3.5 text-emerald-600" /> Terms of Service & Master Subscription Agreement
          </div>
          <h1 className="terms-hero__title">Terms of Service</h1>
          <p className="terms-hero__sub">
            Please read these Terms of Service carefully before accessing or using the {PRODUCT_NAME} platform and associated services.
          </p>
          <div className="terms-hero__meta">
            <span><strong>Effective Date:</strong> {EFFECTIVE_DATE}</span>
            <span className="terms-hero__dot">•</span>
            <span><strong>Last Updated:</strong> {LAST_UPDATED}</span>
          </div>

          {/* Search Box */}
          <div className="terms-search">
            <Search className="terms-search__icon" />
            <input
              type="text"
              placeholder="Search Terms (e.g. Google Calendar, Refunds, Meta, Billing)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="terms-search__input"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="terms-search__clear">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Layout */}
      <div className="terms-container terms-body">
        {/* Mobile TOC Toggle */}
        <button
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          className="terms-mobile-toc-toggle"
        >
          <Menu className="w-4 h-4" /> Table of Contents <ChevronDown className={`w-4 h-4 transition-transform ${mobileSidebarOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Sidebar Navigation */}
        <aside className={`terms-sidebar ${mobileSidebarOpen ? 'terms-sidebar--open' : ''}`}>
          <div className="terms-sidebar__inner">
            <h4 className="terms-sidebar__title">Table of Contents</h4>
            <nav className="terms-sidebar__nav">
              {TERMS_SECTIONS.map((section) => {
                const IconComp = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={`terms-sidebar__item ${isActive ? 'terms-sidebar__item--active' : ''}`}
                  >
                    <IconComp className="w-4 h-4 shrink-0" />
                    <span>{section.title}</span>
                  </button>
                );
              })}
            </nav>

            <div className="terms-sidebar__box">
              <Shield className="w-5 h-5 text-emerald-600 mb-2" />
              <h5 className="font-bold text-xs text-slate-900 mb-1">Legal Support</h5>
              <p className="text-xs text-slate-600 mb-2">Have questions about these terms?</p>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-xs font-semibold text-emerald-700 hover:underline">
                Contact Legal Desk &rarr;
              </a>
            </div>
          </div>
        </aside>

        {/* Legal Text Content */}
        <main className="terms-main">
          {filteredSections.length === 0 ? (
            <div className="terms-empty">
              <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
              <h3 className="font-bold text-slate-900">No matching sections found</h3>
              <p className="text-sm text-slate-600">Try searching for alternative terms like "Google", "WhatsApp", or "Billing".</p>
            </div>
          ) : (
            filteredSections.map((section) => {
              const IconComp = section.icon;
              return (
                <section key={section.id} id={section.id} className="terms-section">
                  <div className="terms-section__header">
                    <div className="terms-section__icon-bg">
                      <IconComp className="w-5 h-5 text-emerald-600" />
                    </div>
                    <h2 className="terms-section__title">{section.title}</h2>
                  </div>

                  <div className="terms-section__content">
                    {section.content.map((block, idx) => {
                      if (block.type === 'paragraph') {
                        return <p key={idx} className="terms-p">{block.text}</p>;
                      }
                      if (block.type === 'list') {
                        return (
                          <ul key={idx} className="terms-list">
                            {block.items.map((item, iIdx) => (
                              <li key={iIdx}>
                                <strong>{item.label}:</strong> {item.text}
                              </li>
                            ))}
                          </ul>
                        );
                      }
                      if (block.type === 'subsection') {
                        return (
                          <div key={idx} className="terms-subsection">
                            <h4 className="terms-subsection__title">{block.title}</h4>
                            <ul className="terms-bullet-list">
                              {block.items.map((item, iIdx) => (
                                <li key={iIdx}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </section>
              );
            })
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="terms-footer">
        <div className="terms-container terms-footer__inner">
          <div className="terms-footer__brand">
            <img src="/logo.png" alt={`${PRODUCT_NAME} Logo`} width="32" height="32" />
            <span className="font-bold text-slate-900">{PRODUCT_NAME}</span>
            <p className="text-xs text-slate-500">Master Terms of Service & Enterprise Agreement by {COMPANY_NAME}</p>
          </div>

          <div className="terms-footer__links">
            <Link to="/">Home</Link>
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/login">Log In</Link>
            <a href={`mailto:${SUPPORT_EMAIL}`}>Support</a>
          </div>
        </div>
        <div className="terms-container terms-footer__bottom">
          <p>&copy; {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
          <p>{DOMAIN}</p>
        </div>
      </footer>

      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="terms-scroll-top"
          aria-label="Scroll to top"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
