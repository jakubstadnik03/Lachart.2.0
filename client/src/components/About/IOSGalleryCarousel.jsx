/**
 * IOSGalleryCarousel — coverflow slideshow for the "Real screens, not
 * mockups" section. Mirrors the visual treatment of AboutGallerySection
 * ("More views of LaChart") below so the page reads as one consistent
 * gallery pattern: multiple phones visible at once, the active one
 * front-and-center, neighbours scaled down + rotated for depth.
 *
 * Uses Swiper (already a dep — see AboutGallerySection). Autoplay 4.5 s,
 * pauses on hover (touch is handled natively by Swiper).
 */
import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow, Pagination, Navigation, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'swiper/css/effect-coverflow';
import 'swiper/css/autoplay';

const COLORS = {
  primary:     '#5E6590',
  primaryTint: '#EEF0F8',
  ink:         '#0A0E1A',
  muted:       '#6B7280',
  border:      'rgba(180,190,210,.35)',
};

export default function IOSGalleryCarousel({
  shots,
  autoMs = 4500,
  onAppStoreClick,
}) {
  if (!Array.isArray(shots) || shots.length === 0) return null;

  return (
    <div className="lc-ios-gallery-wrap" style={{ position: 'relative' }}>
      <Swiper
        effect="coverflow"
        grabCursor
        centeredSlides
        loop
        initialSlide={Math.min(1, shots.length - 1)}
        slidesPerView="auto"
        coverflowEffect={{
          rotate: 6,
          stretch: 0,
          depth: 140,
          modifier: 2.2,
          slideShadows: false,
        }}
        autoplay={{
          delay: autoMs,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        }}
        pagination={{ clickable: true }}
        navigation
        modules={[EffectCoverflow, Pagination, Navigation, Autoplay]}
        className="lcIosSwiper !pb-12"
      >
        {shots.map((shot) => (
          <SwiperSlide
            key={shot.src}
            className="!w-[210px] sm:!w-[260px] md:!w-[300px]"
          >
            {({ isActive }) => (
              <figure
                style={{
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  transition: 'transform .4s ease, opacity .4s ease',
                  opacity: isActive ? 1 : 0.85,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '9 / 16',
                    background: `linear-gradient(160deg, #F4F5FA 0%, ${COLORS.primaryTint} 100%)`,
                    borderRadius: 24,
                    display: 'grid',
                    placeItems: 'center',
                    padding: 14,
                    border: `1px solid ${COLORS.border}`,
                    overflow: 'hidden',
                    boxShadow: isActive
                      ? '0 24px 60px -24px rgba(94,101,144,0.45)'
                      : '0 10px 30px -16px rgba(10,14,26,0.25)',
                  }}
                >
                  <img
                    src={shot.src}
                    alt={`LaChart iOS — ${shot.title}`}
                    loading="lazy"
                    draggable={false}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 18px 28px rgba(10,14,26,0.18))',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    }}
                  />
                </div>
                <figcaption
                  style={{
                    marginTop: 14,
                    minHeight: 48,
                    opacity: isActive ? 1 : 0.7,
                    transition: 'opacity .3s ease',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.ink, letterSpacing: '-0.005em' }}>
                    {shot.title}
                  </div>
                  <div style={{ fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5, marginTop: 4, maxWidth: 260, marginInline: 'auto' }}>
                    {shot.caption}
                  </div>
                </figcaption>
              </figure>
            )}
          </SwiperSlide>
        ))}
      </Swiper>

      {/* App Store CTA — same black badge as the rest of the page */}
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <a
          href="https://apps.apple.com/cz/app/lachart/id6764768876?l=cs"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onAppStoreClick}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '12px 22px', borderRadius: 12,
            background: '#000', color: '#fff', textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.05 12.04c-.03-2.8 2.29-4.15 2.4-4.21-1.31-1.92-3.35-2.18-4.07-2.21-1.73-.17-3.38 1.02-4.26 1.02-.89 0-2.24-1-3.69-.97-1.9.03-3.65 1.1-4.62 2.8-1.97 3.42-.5 8.47 1.41 11.24.94 1.36 2.04 2.88 3.48 2.83 1.41-.06 1.94-.91 3.64-.91 1.69 0 2.18.91 3.65.88 1.51-.02 2.46-1.37 3.38-2.74 1.07-1.57 1.51-3.09 1.53-3.17-.03-.01-2.93-1.12-2.95-4.46zM14.4 4.34c.78-.95 1.31-2.28 1.17-3.59-1.13.05-2.49.75-3.29 1.7-.72.84-1.36 2.18-1.19 3.48 1.26.1 2.54-.64 3.31-1.59z"/>
          </svg>
          Get it on the App Store
        </a>
      </div>

      {/* Swiper nav arrows live inside the slideshow box by default — tint
          them to LaChart purple instead of the swiper blue default. */}
      <style>{`
        .lcIosSwiper .swiper-button-prev,
        .lcIosSwiper .swiper-button-next {
          color: ${COLORS.primary};
        }
        .lcIosSwiper .swiper-button-prev::after,
        .lcIosSwiper .swiper-button-next::after {
          font-size: 22px;
          font-weight: 800;
        }
        .lcIosSwiper .swiper-pagination-bullet {
          background: ${COLORS.primary};
          opacity: 0.35;
        }
        .lcIosSwiper .swiper-pagination-bullet-active {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
