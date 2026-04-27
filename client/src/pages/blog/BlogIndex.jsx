import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { blogPosts } from './blogPosts';
import { ArrowRightIcon, ClockIcon, TagIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';

const CATEGORY_STYLE = {
  'Science & Technology': 'bg-violet-100 text-violet-700 border-violet-200',
  'Testing Protocol':     'bg-blue-100  text-blue-700  border-blue-200',
  'Training Science':     'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const schema = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'LaChart Lactate Testing Guide',
  description: 'Expert articles on blood lactate testing, LT1, LT2, training zones and threshold detection methods.',
  url: 'https://lachart.net/lactate-guide',
  publisher: { '@type': 'Organization', name: 'LaChart', url: 'https://lachart.net' },
  blogPost: blogPosts.map(p => ({
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.excerpt,
    datePublished: new Date(p.date).toISOString(),
    url: `https://lachart.net/blog/${p.slug}`,
    image: `https://lachart.net${p.image}`,
    author: { '@type': 'Organization', name: 'LaChart' },
  })),
};

const BlogIndex = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const featured = blogPosts.filter(p => p.featured);
  const rest     = blogPosts.filter(p => !p.featured);

  return (
    <>
      <Helmet>
        <title>Blood Lactate Testing Guide: LT1, LT2 &amp; Training Zones | LaChart</title>
        <meta name="description" content="Expert guides on blood lactate testing, LT1 and LT2 threshold detection, training zones for cyclists, runners, and triathletes. Science-backed articles by LaChart." />
        <meta name="keywords"    content="lactate testing guide, LT1 LT2 training zones, blood lactate test protocol, OBLA, D-max, IAT, lactate threshold methods, cycling training zones, running lactate test" />
        <meta name="robots"      content="index, follow, max-snippet:-1, max-image-preview:large" />
        <link rel="canonical"    href="https://lachart.net/lactate-guide" />
        <meta property="og:title"       content="Blood Lactate Testing Guide | LaChart" />
        <meta property="og:description" content="Science-backed guides on lactate testing, threshold methods, and training zones for cyclists, runners, and triathletes." />
        <meta property="og:type"        content="website" />
        <meta property="og:url"         content="https://lachart.net/lactate-guide" />
        <meta property="og:image"       content="https://lachart.net/images/lactate_curve.jpg" />
        <meta property="og:site_name"   content="LaChart" />
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content="Blood Lactate Testing Guide | LaChart" />
        <meta name="twitter:description" content="Science-backed guides on lactate testing, threshold methods, and training zones." />
        <meta name="twitter:image"       content="https://lachart.net/images/lactate_curve.jpg" />
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
      </Helmet>

      <div className="min-h-screen bg-white">

        {/* ── Navigation ────────────────────────────────────── */}
        <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <img src="/images/LaChart.png" alt="LaChart" className="h-7 w-auto" />
                <span className="font-extrabold text-gray-900 text-lg tracking-tight">LaChart</span>
              </a>
              <div className="hidden sm:flex items-center gap-5 text-sm font-medium text-gray-500">
                <Link to="/lactate-guide"            className="text-primary font-semibold">Lactate Guide</Link>
                <Link to="/lactate-curve-calculator" className="hover:text-primary transition-colors">Free Calculator</Link>
                <a    href="/about"                  className="hover:text-primary transition-colors">About</a>
              </div>
            </div>
            <a
              href="/signup"
              className="hidden sm:inline-flex items-center gap-1 px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
            >
              Sign up free →
            </a>
          </div>
        </nav>

        {/* ── Hero ──────────────────────────────────────────── */}
        <header className="bg-gradient-to-b from-gray-50 to-white border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-14 pb-12 text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-xs font-semibold mb-5 border border-primary/20">
              <TagIcon className="w-3.5 h-3.5" />
              Science-backed articles
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight mb-4">
              Blood Lactate Testing Guide
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-8 leading-relaxed">
              Everything you need to understand LT1, LT2, threshold detection methods,
              and how to turn your test results into smarter training zones.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="/lactate-curve-calculator"
                className="inline-flex items-center gap-2 bg-primary text-white font-bold px-7 py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                Try the Free Calculator <ArrowRightIcon className="w-4 h-4" />
              </a>
              <a
                href="/signup"
                className="inline-flex items-center gap-2 border-2 border-gray-200 text-gray-700 font-semibold px-7 py-3 rounded-xl hover:border-primary/40 hover:text-primary transition-colors"
              >
                Create free account
              </a>
            </div>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">

          {/* ── Featured posts ──────────────────────────────── */}
          <section className="mb-16">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Featured Guides</h2>
            <div className="grid sm:grid-cols-2 gap-6">
              {featured.map(post => {
                const catStyle = CATEGORY_STYLE[post.category] || 'bg-gray-100 text-gray-600 border-gray-200';
                const dateDisplay = new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                return (
                  <Link
                    key={post.slug}
                    to={`/blog/${post.slug}`}
                    className="group flex flex-col rounded-2xl border border-gray-200 overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all"
                  >
                    {post.image && (
                      <div className="w-full aspect-[16/9] bg-gray-100 overflow-hidden">
                        <img
                          src={post.image}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${catStyle}`}>
                          <TagIcon className="w-3 h-3" />{post.category}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <ClockIcon className="w-3.5 h-3.5" />{post.readTime}
                        </span>
                        <time className="flex items-center gap-1 text-xs text-gray-400">
                          <CalendarDaysIcon className="w-3.5 h-3.5" />{dateDisplay}
                        </time>
                      </div>
                      <h3 className="font-extrabold text-gray-900 text-lg leading-snug mb-2 group-hover:text-primary transition-colors">
                        {post.title}
                      </h3>
                      <p className="text-sm text-gray-500 line-clamp-3 flex-1 mb-4">{post.excerpt}</p>
                      <div className="flex items-center gap-1 text-primary text-sm font-semibold">
                        Read article <ArrowRightIcon className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ── All articles ───────────────────────────────── */}
          {rest.length > 0 && (
            <section className="mb-16">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">More Articles</h2>
              <div className="space-y-4">
                {rest.map(post => {
                  const catStyle = CATEGORY_STYLE[post.category] || 'bg-gray-100 text-gray-600 border-gray-200';
                  return (
                    <Link
                      key={post.slug}
                      to={`/blog/${post.slug}`}
                      className="group flex gap-4 p-4 rounded-2xl border border-gray-200 hover:border-primary/40 hover:bg-primary/[0.02] transition-all"
                    >
                      {post.image && (
                        <div className="w-24 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                          <img
                            src={post.image}
                            alt={post.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${catStyle}`}>
                            {post.category}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <ClockIcon className="w-3 h-3" />{post.readTime}
                          </span>
                        </div>
                        <h3 className="font-bold text-gray-900 group-hover:text-primary transition-colors leading-snug mb-1 text-sm sm:text-base">
                          {post.title}
                        </h3>
                        <p className="text-sm text-gray-500 line-clamp-2">{post.excerpt}</p>
                      </div>
                      <ArrowRightIcon className="w-5 h-5 text-gray-300 flex-shrink-0 self-center group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── LT1 / LT2 quick facts ──────────────────────── */}
          <section id="lt1-lt2" className="scroll-mt-20 mb-16">
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight mb-6">LT1 &amp; LT2 at a Glance</h2>
            <div className="grid sm:grid-cols-2 gap-5">
              {[
                {
                  label: 'LT1 — Aerobic Threshold',
                  color: 'border-blue-200 bg-blue-50',
                  badge: 'bg-blue-600 text-white',
                  items: [
                    'First point where lactate rises above baseline',
                    'Typical range: 1.5–2.2 mmol/L (cycling)',
                    'Upper boundary of Zone 2',
                    'Fat metabolism still dominant',
                    '80% of elite training volume stays below LT1',
                  ],
                },
                {
                  label: 'LT2 — Anaerobic Threshold',
                  color: 'border-violet-200 bg-violet-50',
                  badge: 'bg-violet-600 text-white',
                  items: [
                    'Lactate accumulation accelerates sharply',
                    'Typical range: 3.5–4.2 mmol/L',
                    'Equivalent to FTP in cycling',
                    'Maximal Lactate Steady State (MLSS)',
                    'Sustainable for 45–75 minutes',
                  ],
                },
              ].map(({ label, color, badge, items }) => (
                <div key={label} className={`rounded-2xl border-2 p-6 ${color}`}>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${badge} inline-block mb-4`}>{label}</span>
                  <ul className="space-y-2">
                    {items.map(item => (
                      <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-primary mt-0.5 font-bold">›</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* ── Methods quick ref ──────────────────────────── */}
          <section id="methods" className="scroll-mt-20 mb-16">
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight mb-6">Threshold Detection Methods</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { name: 'OBLA',    full: 'Onset of Blood Lactate Accumulation', desc: 'Fixed lactate values (2.0–4.0 mmol/L). Simple and reproducible; best for cross-athlete comparisons.' },
                { name: 'D-max',   full: 'Maximum Distance Method',              desc: 'Finds the point of maximum curvature on the lactate curve. Individualised — no fixed lactate assumption.' },
                { name: 'IAT',     full: 'Individual Anaerobic Threshold',       desc: 'Step with the steepest lactate rise per unit power. Captures the kinetic onset of accumulation.' },
                { name: 'Log-log', full: 'Log-log Transformation',               desc: 'Logarithmic scale reveals the aerobic threshold breakpoint. Best for LT1 in trained athletes.' },
              ].map(({ name, full, desc }) => (
                <div key={name} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-primary/40 hover:shadow-sm transition-all">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="font-extrabold text-primary text-lg">{name}</span>
                    <span className="text-xs text-gray-400 leading-snug">{full}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-0">{desc}</p>
                </div>
              ))}
            </div>
            <Link
              to="/blog/obla-dmax-iat-methods-compared"
              className="inline-flex items-center gap-1 text-primary font-semibold text-sm mt-5 hover:underline"
            >
              Compare all methods in detail <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </section>

          {/* ── CTA ────────────────────────────────────────── */}
          <div className="bg-gradient-to-br from-primary to-violet-600 rounded-2xl p-10 text-white text-center shadow-xl">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to analyse your own test?</h2>
            <p className="text-white/80 mb-7 max-w-lg mx-auto">
              Enter your blood lactate step-test data and get LT1, LT2, training zones, and a PDF report — free, no account needed to try.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="/lactate-curve-calculator"
                className="bg-white text-primary font-bold px-8 py-3 rounded-xl hover:bg-gray-50 transition-colors shadow"
              >
                Open Free Calculator →
              </a>
              <a
                href="/signup"
                className="border-2 border-white/50 text-white font-semibold px-8 py-3 rounded-xl hover:bg-white/10 transition-colors"
              >
                Create free account
              </a>
            </div>
          </div>

        </div>

        {/* ── Footer ─────────────────────────────────────── */}
        <footer className="border-t border-gray-100 bg-gray-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <img src="/images/LaChart.png" alt="LaChart" className="h-5 w-auto" />
              <span className="font-semibold text-gray-700">LaChart</span>
              <span className="hidden sm:inline">— Sports performance analytics</span>
            </div>
            <nav className="flex flex-wrap items-center gap-5">
              <Link to="/lactate-guide"            className="hover:text-primary transition-colors">Guide</Link>
              <Link to="/lactate-curve-calculator" className="hover:text-primary transition-colors">Calculator</Link>
              <a    href="/about"                  className="hover:text-primary transition-colors">About</a>
              <a    href="/privacy"                className="hover:text-primary transition-colors">Privacy</a>
              <a    href="/signup"                 className="text-primary font-semibold hover:text-primary/80 transition-colors">Sign up free →</a>
            </nav>
          </div>
        </footer>

      </div>
    </>
  );
};

export default BlogIndex;
