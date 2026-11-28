'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ApiIcon, EnvironmentIcon, TerminalIcon } from './components/icons';
import { LandingNav } from './components/landing-nav';
import { PublicFooter } from './components/public-footer';

function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
    if (!els.length) return;

    const revealVisible = () => {
      const cutoff = window.innerHeight + 100;
      for (const el of els) {
        if (!el.classList.contains('in-view') && el.getBoundingClientRect().top <= cutoff) {
          el.classList.add('in-view');
        }
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in-view');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.01, rootMargin: '0px 0px 80px 0px' },
    );

    els.forEach((el) => io.observe(el));
    revealVisible();
    window.addEventListener('scroll', revealVisible, { passive: true });
    const timer = window.setTimeout(revealVisible, 350);

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', revealVisible);
      window.clearTimeout(timer);
    };
  }, []);
}

function use3DTilt(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    function onMove(e: MouseEvent) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const rotX = ((y - cy) / cy) * -6;
      const rotY = ((x - cx) / cx) * 6;
      el.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    }

    function onLeave() {
      if (!el) return;
      el.style.transform = '';
    }

    const wrap = el.parentElement;
    wrap?.addEventListener('mousemove', onMove);
    wrap?.addEventListener('mouseleave', onLeave);
    return () => {
      wrap?.removeEventListener('mousemove', onMove);
      wrap?.removeEventListener('mouseleave', onLeave);
    };
  }, [ref]);
}

const pillars = [
  {
    icon: <ApiIcon width={16} height={16} />,
    label: 'Capabilities',
    title: 'Scenario-driven mock APIs & runtime',
    description:
      'Project workspaces with RBAC, draft/publish endpoints, named environments, live runtime testing, and redacted request logs.',
    href: '/capabilities',
    cta: 'Explore capabilities',
  },
  {
    icon: <EnvironmentIcon width={16} height={16} />,
    label: 'Workflow',
    title: 'From draft to hosted mock in minutes',
    description:
      'Follow a predictable six-step flow from project creation and scenario configuration to live runtime verification.',
    href: '/workflow',
    cta: 'View workflow',
  },
  {
    icon: <TerminalIcon width={16} height={16} />,
    label: 'VS Code Extension',
    title: 'Scan routes & publish from your editor',
    description:
      'Download the v0.1.0 .vsix package directly without signing in to scan workspace routes and edit scenarios inside VS Code.',
    href: '/extension',
    cta: 'Get the extension',
  },
];

export default function LandingPage() {
  const previewRef = useRef<HTMLDivElement>(null);
  useReveal();
  use3DTilt(previewRef);

  return (
    <div className="landing-page">
      <LandingNav />

      <main>
        {/* ── Hero ── */}
        <section className="hero-section">
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="hero-eyebrow">
                <span className="hero-eyebrow-dot" aria-hidden="true" />
                Mock API Control Plane &amp; Runtime
              </p>
              <h1>
                Ship frontend and integrations without waiting on a <em>backend.</em>
              </h1>
              <p className="hero-lead">
                MockFlow lets teams create, configure, publish, and test scenario-driven mock APIs
                with isolated project URLs, environment overrides, and redacted request logs.
              </p>
              <div className="hero-ctas">
                <Link href="/signup" className="button button-primary button-lg">
                  Get started free
                </Link>
                <Link href="/signin" className="button button-secondary button-lg">
                  Sign in
                </Link>
                <Link href="/capabilities" className="button button-ghost button-lg">
                  Explore capabilities
                </Link>
              </div>
            </div>

            <div className="hero-preview-wrap">
              <div className="hero-preview panel" ref={previewRef} aria-label="MockFlow endpoint preview">
                <div className="panel-header preview-header">
                  <span className="preview-title">
                    <span className="method method-get">GET</span>
                    <code>/v1/orders</code>
                  </span>
                  <span className="status-pill status-pill-published">Published</span>
                </div>
                <div className="preview-body">
                  <div className="preview-meta">
                    <span>
                      Runtime: <code>/runtime/p/checkout-api/v1/orders</code>
                    </span>
                    <span>
                      Environment: <code>Staging</code>
                    </span>
                  </div>
                  <div className="preview-scenarios">
                    <div className="preview-scenario preview-scenario-active">
                      <strong>Default response</strong>
                      <span>200 · SUCCESS · 0 ms</span>
                    </div>
                    <div className="preview-scenario">
                      <strong>Empty list</strong>
                      <span>200 · EMPTY · 120 ms</span>
                    </div>
                    <div className="preview-scenario">
                      <strong>Unauthorized</strong>
                      <span>401 · ERROR · 0 ms</span>
                    </div>
                  </div>
                  <pre className="preview-code">
                    <code>{`{
  "orders": [
    { "id": "ord_1042", "status": "paid", "total": 4900 }
  ],
  "hasMore": false
}`}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Concise Product Pillars linking to dedicated pages ── */}
        <section className="landing-section">
          <div className="section-inner">
            <div className="section-heading reveal">
              <span className="section-label">Platform Overview</span>
              <h2>Built for local speed and team predictability</h2>
              <p>
                Dive deeper into MockFlow&apos;s capabilities, end-to-end workflow, or download the
                VS Code extension.
              </p>
            </div>
            <div className="capabilities-grid">
              {pillars.map((item, i) => (
                <article
                  className={`panel capability-card pillar-card reveal reveal-delay-${i + 1}`}
                  key={item.title}
                >
                  <div>
                    <div className="capability-icon" aria-hidden="true">
                      {item.icon}
                    </div>
                    <span className="section-label">{item.label}</span>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                  <div className="pillar-card-action">
                    <Link href={item.href} className="button button-secondary button-sm">
                      {item.cta}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Band ── */}
        <section className="landing-cta-band">
          <div className="cta-band-inner">
            <div className="reveal">
              <h2>Ready to start mocking?</h2>
              <p>Create an account, sign in, or download the VS Code extension to get started.</p>
            </div>
            <div className="hero-ctas reveal reveal-delay-1">
              <Link href="/signup" className="button button-lg button-cta-white">
                Create free account
              </Link>
              <Link href="/extension" className="button button-lg button-cta-outline">
                VS Code Extension
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
