import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { blogPosts } from './blogPosts';
import { ArrowRightIcon, ClockIcon, TagIcon } from '@heroicons/react/24/outline';

const categoryColors = {
  'Science & Technology': 'bg-[#767EB5] text-white',
  'Testing Protocol': 'bg-[#5B60A0] text-white',
  'Training Science': 'bg-green-600 text-white',
};

const BlogIndex = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const featured = blogPosts.filter(p => p.featured);
  const rest = blogPosts.filter(p => !p.featured);

  return (
    <>
      <Helmet>
        <title>Lactate Testing Guide & Blog | LaChart</title>
        <meta name="description" content="Expert articles on blood lactate testing, threshold detection methods (LT1, LT2, OBLA, D-max), training zones for cyclists, runners, and triathletes. Science-backed guides by LaChart." />
        <meta name="keywords" content="lactate testing guide, LT1 LT2 training zones, blood lactate test protocol, OBLA, D-max, IAT, lactate threshold methods, cycling training zones, running lactate test" />
        <link rel="canonical" href="https://lachart.net/lactate-guide" />
        <meta property="og:title" content="Lactate Testing Guide & Blog | LaChart" />
        <meta property="og:description" content="Science-backed guides on lactate testing, threshold methods, and training zones for cyclists, runners, and triathletes." />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="min-h-screen bg-white">

        {/* Hero */}
        <div className="bg-gradient-to-br from-[#EDE9F6] via-[#E4DFF5] to-[#D8D0F0] py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur border border-[#D8D0F0] rounded-full px-4 py-1.5 text-sm text-[#767EB5] font-medium mb-6">
              <TagIcon className="w-3.5 h-3.5" />
              Science-backed articles
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-[#2D3561] mb-4 leading-tight">
              Lactate Testing Guide
            </h1>
            <p className="text-xl text-[#5B60A0] max-w-2xl mx-auto mb-8">
              Everything you need to understand blood lactate testing, threshold detection, and how to use your results to train smarter.
            </p>
            <a
              href="/lactate-curve-calculator"
              className="inline-flex items-center gap-2 bg-[#5B60A0] text-white font-bold px-8 py-3.5 rounded-xl hover:bg-[#2D3561] transition-colors shadow-lg"
            >
              Try the Free Calculator <ArrowRightIcon className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Quick nav */}
        <div className="border-b border-[#E8E2F5] bg-white sticky top-0 z-10 hidden md:block">
          <div className="max-w-4xl mx-auto px-4 flex gap-6 py-3 text-sm">
            <span className="text-gray-400 font-medium">Jump to:</span>
            {[
              ['LT1 vs LT2', '#lt1-lt2'],
              ['Test Protocol', '#protocol'],
              ['LaChart Algorithm', '#algorithm'],
              ['Methods Compared', '#methods'],
            ].map(([label, href]) => (
              <a key={href} href={href} className="text-[#767EB5] hover:text-[#2D3561] font-medium transition-colors">
                {label}
              </a>
            ))}
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-14">

          {/* Featured posts */}
          <div className="mb-14">
            <h2 className="text-xl font-bold text-[#2D3561] mb-6">Featured Guides</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {featured.map(post => (
                <Link
                  key={post.slug}
                  to={`/blog/${post.slug}`}
                  className="group block bg-gradient-to-br from-[#F5F3FE] to-[#EDE9F6] rounded-2xl border border-[#D8D0F0] p-6 hover:border-[#767EB5] hover:shadow-lg transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${categoryColors[post.category] || 'bg-gray-200 text-gray-700'}`}>
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <ClockIcon className="w-3.5 h-3.5" /> {post.readTime}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-[#2D3561] mb-2 group-hover:text-[#5B60A0] transition-colors leading-snug">
                    {post.title}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-3">{post.excerpt}</p>
                  <div className="flex items-center gap-1 text-[#767EB5] text-sm font-semibold">
                    Read article <ArrowRightIcon className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* All articles */}
          <div>
            <h2 className="text-xl font-bold text-[#2D3561] mb-6">All Articles</h2>
            <div className="space-y-4">
              {[...featured, ...rest].map(post => (
                <Link
                  key={post.slug}
                  to={`/blog/${post.slug}`}
                  className="group flex gap-5 items-start p-5 rounded-2xl border border-[#E8E2F5] hover:border-[#767EB5] hover:bg-[#F5F3FE] transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${categoryColors[post.category] || 'bg-gray-200 text-gray-700'}`}>
                        {post.category}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <ClockIcon className="w-3 h-3" /> {post.readTime}
                      </span>
                    </div>
                    <h3 className="font-bold text-[#2D3561] group-hover:text-[#5B60A0] transition-colors leading-snug mb-1">
                      {post.title}
                    </h3>
                    <p className="text-sm text-gray-500 line-clamp-2">{post.excerpt}</p>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {post.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs bg-white border border-[#E8E2F5] text-[#767EB5] px-2 py-0.5 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ArrowRightIcon className="w-5 h-5 text-[#767EB5] flex-shrink-0 mt-1 group-hover:translate-x-1 transition-transform" />
                </Link>
              ))}
            </div>
          </div>

          {/* Quick facts section */}
          <div id="lt1-lt2" className="mt-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-[#2D3561] mb-6">LT1 &amp; LT2 at a Glance</h2>
            <div className="grid md:grid-cols-2 gap-5">
              {[
                {
                  label: 'LT1 — Aerobic Threshold',
                  color: 'border-blue-300 bg-blue-50',
                  badge: 'bg-blue-500 text-white',
                  items: [
                    'First point where lactate rises above baseline',
                    'Typical range: 1.5–2.2 mmol/L (cycling)',
                    'Upper boundary of Zone 2',
                    'Fat metabolism still dominant',
                    '80% of elite training happens below LT1',
                  ],
                },
                {
                  label: 'LT2 — Anaerobic Threshold',
                  color: 'border-purple-300 bg-purple-50',
                  badge: 'bg-[#767EB5] text-white',
                  items: [
                    'Lactate accumulation accelerates sharply',
                    'Typical range: 3.5–4.2 mmol/L',
                    'Equivalent to FTP in cycling',
                    'Maximal Lactate Steady State (MLSS)',
                    'Sustainable for 45–75 minutes',
                  ],
                },
              ].map(({ label, color, badge, items }) => (
                <div key={label} className={`rounded-2xl border-2 p-5 ${color}`}>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${badge} inline-block mb-3`}>{label}</span>
                  <ul className="space-y-1.5">
                    {items.map(item => (
                      <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-[#767EB5] mt-0.5">›</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Methods quick ref */}
          <div id="methods" className="mt-16 scroll-mt-20">
            <h2 className="text-2xl font-bold text-[#2D3561] mb-6">Threshold Detection Methods</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { name: 'OBLA', full: 'Onset of Blood Lactate Accumulation', desc: 'Fixed lactate values (2.0–4.0 mmol/L). Simple and reproducible; best for cross-athlete comparison.' },
                { name: 'D-max', full: 'Maximum Distance Method', desc: 'Finds the point of maximum curvature on the lactate curve. Individualised — no fixed lactate assumption.' },
                { name: 'IAT', full: 'Individual Anaerobic Threshold', desc: 'Step with the steepest lactate rise per unit power. Captures the kinetic onset of accumulation.' },
                { name: 'Log-log', full: 'Log-log Transformation', desc: 'Logarithmic scale reveals the aerobic threshold breakpoint. Best for LT1 in trained athletes.' },
              ].map(({ name, full, desc }) => (
                <div key={name} className="bg-white rounded-xl border border-[#E8E2F5] p-4 hover:border-[#767EB5] transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-extrabold text-[#767EB5] text-lg">{name}</span>
                    <span className="text-xs text-gray-400">{full}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-0">{desc}</p>
                </div>
              ))}
            </div>
            <Link to="/blog/obla-dmax-iat-methods-compared" className="inline-flex items-center gap-1 text-[#767EB5] font-semibold text-sm mt-4 hover:text-[#2D3561] transition-colors">
              Compare all methods in detail <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>

          {/* CTA */}
          <div className="mt-16 bg-gradient-to-r from-[#767EB5] to-[#5B60A0] rounded-2xl p-10 text-white text-center">
            <h2 className="text-2xl font-bold mb-2">Ready to test your own thresholds?</h2>
            <p className="text-white/80 mb-6 max-w-lg mx-auto">
              Enter your blood lactate test results into LaChart and get LT1, LT2, training zones, and a professional PDF report — free for 30 days.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="/lactate-curve-calculator" className="bg-white text-[#5B60A0] font-bold px-8 py-3 rounded-xl hover:bg-[#EDE9F6] transition-colors">
                Try Free Calculator →
              </a>
              <a href="/signup" className="border-2 border-white/60 text-white font-bold px-8 py-3 rounded-xl hover:bg-white/10 transition-colors">
                Create Free Account
              </a>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default BlogIndex;
