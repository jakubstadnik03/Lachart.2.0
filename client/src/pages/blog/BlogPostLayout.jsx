import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ArrowLeftIcon, ClockIcon, CalendarDaysIcon, TagIcon } from '@heroicons/react/24/outline';
import { blogPosts } from './blogPosts';

const CATEGORY_STYLE = {
  'Science & Technology': 'bg-violet-100 text-violet-700 border-violet-200',
  'Testing Protocol':     'bg-blue-100  text-blue-700  border-blue-200',
  'Training Science':     'bg-emerald-100 text-emerald-700 border-emerald-200',
};

/**
 * Shared layout for all blog articles.
 *
 * Props:
 *   slug          – current post slug (for canonical + Schema.org)
 *   title         – article H1
 *   subtitle      – lead sentence shown under H1
 *   category      – e.g. "Science & Technology"
 *   date          – ISO date string "YYYY-MM-DD"
 *   readTime      – "12 min"
 *   image         – hero image path e.g. "/images/lactate_curve.jpg"
 *   imageAlt      – descriptive alt text for hero image
 *   description   – meta description (155 chars ideal)
 *   keywords      – comma-separated keywords string
 *   relatedSlugs  – array of up to 2 slugs for related posts
 *   children      – article body JSX
 */
const BlogPostLayout = ({
  slug,
  title,
  subtitle,
  category,
  date,
  readTime,
  image,
  imageAlt,
  description,
  keywords,
  relatedSlugs,
  children,
}) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
    const onScroll = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      setProgress(total > 0 ? (el.scrollTop / total) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const canonical   = `https://lachart.net/blog/${slug}`;
  const fullImage   = `https://lachart.net${image}`;
  const dateISO     = new Date(date).toISOString();
  const dateDisplay = new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const catStyle    = CATEGORY_STYLE[category] || 'bg-gray-100 text-gray-600 border-gray-200';

  const relatedPosts = (relatedSlugs || [])
    .map(s => blogPosts.find(p => p.slug === s))
    .filter(Boolean)
    .slice(0, 2);

  const schema = {
    '@context':        'https://schema.org',
    '@type':           'BlogPosting',
    headline:          title,
    description,
    image:             fullImage,
    datePublished:     dateISO,
    dateModified:      dateISO,
    author:            { '@type': 'Organization', name: 'LaChart', url: 'https://lachart.net' },
    publisher: {
      '@type': 'Organization',
      name:    'LaChart',
      url:     'https://lachart.net',
      logo:    { '@type': 'ImageObject', url: 'https://lachart.net/images/LaChart.png' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    keywords,
    articleSection:   category,
    inLanguage:       'en',
    url:              canonical,
  };

  return (
    <>
      <Helmet>
        <title>{title} | LaChart</title>
        <meta name="description"                      content={description} />
        <meta name="keywords"                         content={keywords} />
        <meta name="robots"                           content="index, follow, max-snippet:-1, max-image-preview:large" />
        <link rel="canonical"                         href={canonical} />

        {/* Open Graph */}
        <meta property="og:title"                     content={title} />
        <meta property="og:description"               content={description} />
        <meta property="og:type"                      content="article" />
        <meta property="og:url"                       content={canonical} />
        <meta property="og:image"                     content={fullImage} />
        <meta property="og:image:width"               content="1200" />
        <meta property="og:image:height"              content="630" />
        <meta property="og:site_name"                 content="LaChart" />
        <meta property="article:published_time"       content={dateISO} />
        <meta property="article:section"              content={category} />

        {/* Twitter Card */}
        <meta name="twitter:card"                     content="summary_large_image" />
        <meta name="twitter:title"                    content={title} />
        <meta name="twitter:description"              content={description} />
        <meta name="twitter:image"                    content={fullImage} />

        <script type="application/ld+json">{JSON.stringify(schema)}</script>
      </Helmet>

      <div className="min-h-screen bg-white">

        {/* ── Reading progress bar ───────────────────────────────── */}
        <div className="fixed top-0 left-0 right-0 h-[3px] bg-transparent z-50 pointer-events-none">
          <div
            className="h-full bg-gradient-to-r from-primary to-violet-500 transition-[width] duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* ── Top navigation ────────────────────────────────────── */}
        <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <img src="/images/LaChart.png" alt="LaChart" className="h-7 w-auto" />
                <span className="font-extrabold text-gray-900 text-lg tracking-tight">LaChart</span>
              </a>
              <div className="hidden sm:flex items-center gap-5 text-sm font-medium text-gray-500">
                <Link to="/lactate-guide" className="hover:text-primary transition-colors">Lactate Guide</Link>
                <Link to="/lactate-curve-calculator" className="hover:text-primary transition-colors">Free Calculator</Link>
                <a href="/about" className="hover:text-primary transition-colors">About</a>
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

        {/* ── Article hero ──────────────────────────────────────── */}
        <header className="bg-gradient-to-b from-gray-50 to-white border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 pb-8">
            {/* Breadcrumb */}
            <Link
              to="/lactate-guide"
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-primary font-medium mb-7 transition-colors"
            >
              <ArrowLeftIcon className="w-3.5 h-3.5" />
              Lactate Guide
            </Link>

            {/* Category · read time · date */}
            <div className="flex flex-wrap items-center gap-2.5 mb-5">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${catStyle}`}>
                <TagIcon className="w-3 h-3" />{category}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                <ClockIcon className="w-3.5 h-3.5" />{readTime} read
              </span>
              <time dateTime={date} className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                <CalendarDaysIcon className="w-3.5 h-3.5" />{dateDisplay}
              </time>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4 tracking-tight">
              {title}
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed max-w-2xl">
              {subtitle}
            </p>
          </div>

          {/* Hero image */}
          {image && (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-10">
              <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-100">
                <img
                  src={image}
                  alt={imageAlt}
                  className="w-full aspect-[16/7] object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          )}
        </header>

        {/* ── Article body ──────────────────────────────────────── */}
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <div className="
            prose prose-lg prose-slate max-w-none
            prose-headings:font-extrabold prose-headings:text-gray-900 prose-headings:tracking-tight
            prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4
            prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
            prose-p:text-gray-700 prose-p:leading-relaxed
            prose-strong:text-gray-900
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 prose-pre:rounded-xl prose-pre:text-sm
            prose-code:text-primary prose-code:bg-primary/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
            prose-table:text-sm prose-table:border-collapse
            prose-th:bg-gray-50 prose-th:font-semibold prose-th:text-left
            prose-li:text-gray-700
          ">
            {children}
          </div>
        </main>

        {/* ── Bottom CTA ────────────────────────────────────────── */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
          <div className="bg-gradient-to-br from-primary to-violet-600 rounded-2xl p-8 sm:p-10 text-white text-center shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2">Analyse your own lactate test</h2>
            <p className="text-white/80 text-sm mb-6 max-w-sm mx-auto">
              Enter your step-test data and get LT1, LT2, OBLA, training zones and a PDF report — free, no account needed to try.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="/lactate-curve-calculator"
                className="px-6 py-2.5 bg-white text-primary font-bold rounded-xl hover:bg-gray-50 transition-colors text-sm shadow"
              >
                Open Free Calculator →
              </a>
              <a
                href="/signup"
                className="px-6 py-2.5 border-2 border-white/50 text-white font-semibold rounded-xl hover:bg-white/10 transition-colors text-sm"
              >
                Create free account
              </a>
            </div>
          </div>
        </div>

        {/* ── Related articles ──────────────────────────────────── */}
        {relatedPosts.length > 0 && (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
            <div className="border-t border-gray-100 pt-10">
              <h3 className="text-base font-bold text-gray-900 mb-5 uppercase tracking-wider text-xs text-gray-400">
                Related articles
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {relatedPosts.map(p => (
                  <Link
                    key={p.slug}
                    to={`/blog/${p.slug}`}
                    className="group flex gap-4 p-4 rounded-xl border border-gray-200 hover:border-primary/40 hover:bg-primary/[0.02] transition-all"
                  >
                    {p.image && (
                      <div className="w-20 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                        <img src={p.image} alt={p.title} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-primary">{p.category}</span>
                      <p className="font-semibold text-gray-900 mt-0.5 group-hover:text-primary transition-colors leading-snug text-sm line-clamp-2">
                        {p.title}
                      </p>
                      <span className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                        <ClockIcon className="w-3 h-3" />{p.readTime}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────── */}
        <footer className="border-t border-gray-100 bg-gray-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <img src="/images/LaChart.png" alt="LaChart" className="h-5 w-auto" />
              <span className="font-semibold text-gray-700">LaChart</span>
              <span className="hidden sm:inline">— Sports performance analytics</span>
            </div>
            <nav className="flex flex-wrap items-center gap-5">
              <Link to="/lactate-guide"           className="hover:text-primary transition-colors">Guide</Link>
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

export default BlogPostLayout;
