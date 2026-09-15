import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, EffectCoverflow, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'swiper/css/effect-coverflow';
import 'swiper/css/autoplay';

const galleryImages = [
  {
    src: '/screenshots/2026/dashboard.jpg',
    webpSrcSet: '/screenshots/2026/dashboard-640.webp 640w, /screenshots/2026/dashboard-960.webp 960w, /screenshots/2026/dashboard-1280.webp 1280w',
    sizes: '(min-width: 768px) 600px, (min-width: 640px) 450px, 300px',
    alt: 'Dashboard with the week, the daily brief and upcoming races',
    title: 'Dashboard · your week at a glance'
  },
  {
    src: '/screenshots/2026/threshold-analysis.jpg',
    webpSrcSet: '/screenshots/2026/threshold-analysis-640.webp 640w, /screenshots/2026/threshold-analysis-960.webp 960w, /screenshots/2026/threshold-analysis-1280.webp 1280w',
    sizes: '(min-width: 768px) 600px, (min-width: 640px) 450px, 300px',
    alt: 'Lactate test with LT1 and LT2 on the curve and every method side by side',
    title: 'Lactate testing · threshold analysis'
  },
  {
    src: '/screenshots/2026/training-detail.jpg',
    webpSrcSet: '/screenshots/2026/training-detail-640.webp 640w, /screenshots/2026/training-detail-960.webp 960w, /screenshots/2026/training-detail-1280.webp 1280w',
    sizes: '(min-width: 768px) 600px, (min-width: 640px) 450px, 300px',
    alt: 'Training detail with power, heart rate and speed over distance',
    title: 'Training · power, HR & speed'
  },
  {
    src: '/screenshots/2026/training-laps.jpg',
    webpSrcSet: '/screenshots/2026/training-laps-640.webp 640w, /screenshots/2026/training-laps-960.webp 960w, /screenshots/2026/training-laps-1280.webp 1280w',
    sizes: '(min-width: 768px) 600px, (min-width: 640px) 450px, 300px',
    alt: 'Training laps with a lactate sample on any interval',
    title: 'Training · laps & lactate'
  },
  {
    src: '/screenshots/2026/workout-builder.jpg',
    webpSrcSet: '/screenshots/2026/workout-builder-640.webp 640w, /screenshots/2026/workout-builder-960.webp 960w, /screenshots/2026/workout-builder-1280.webp 1280w',
    sizes: '(min-width: 768px) 600px, (min-width: 640px) 450px, 300px',
    alt: 'Planned workout builder with warm-up, intervals and cool-down',
    title: 'Planner · structured workout'
  },
  {
    src: '/screenshots/2026/calendar.jpg',
    webpSrcSet: '/screenshots/2026/calendar-640.webp 640w, /screenshots/2026/calendar-960.webp 960w, /screenshots/2026/calendar-1280.webp 1280w',
    sizes: '(min-width: 768px) 600px, (min-width: 640px) 450px, 300px',
    alt: 'Training calendar for a month with weekly summaries',
    title: 'Training calendar'
  },
  {
    src: '/screenshots/2026/workout-planner.jpg',
    webpSrcSet: '/screenshots/2026/workout-planner-640.webp 640w, /screenshots/2026/workout-planner-960.webp 960w, /screenshots/2026/workout-planner-1280.webp 1280w',
    sizes: '(min-width: 768px) 600px, (min-width: 640px) 450px, 300px',
    alt: 'Workout planner with a template library and the week ahead',
    title: 'Workout planner'
  },
  {
    src: '/screenshots/2026/annual-plan.jpg',
    webpSrcSet: '/screenshots/2026/annual-plan-640.webp 640w, /screenshots/2026/annual-plan-960.webp 960w, /screenshots/2026/annual-plan-1280.webp 1280w',
    sizes: '(min-width: 768px) 600px, (min-width: 640px) 450px, 300px',
    alt: 'Annual training plan with load, fitness and race peaks',
    title: 'Annual training plan'
  },
];

export default function AboutGallerySection({ BrowserFrame, LazyImage }) {
  return (
    <section className="py-20 bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-10 text-center">
        <p className="text-primary-dark font-semibold tracking-widest text-xs uppercase mb-3">Gallery</p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">More views of LaChart</h2>
      </div>
      <Swiper
        effect="coverflow"
        grabCursor
        centeredSlides
        loop
        initialSlide={2}
        slidesPerView="auto"
        coverflowEffect={{ rotate: 0, stretch: 0, depth: 100, modifier: 2.5, slideShadows: false }}
        autoplay={{ delay: 2000, disableOnInteraction: false, pauseOnMouseEnter: true }}
        pagination={{ clickable: true }}
        navigation
        modules={[EffectCoverflow, Pagination, Navigation, Autoplay]}
        className="mySwiper !pb-12"
      >
        {galleryImages.map(image => (
          <SwiperSlide key={image.alt} className="!w-[300px] sm:!w-[450px] md:!w-[600px]">
            {({ isActive }) => (
              <div className={`relative transition-all duration-300 ${isActive ? 'scale-100' : 'scale-90'}`}>
                <BrowserFrame label={image.title}>
                  <LazyImage
                    src={image.src}
                    webpSrcSet={image.webpSrcSet}
                    sizes={image.sizes}
                    alt={image.alt}
                    className="w-full h-[200px] sm:h-[280px] md:h-[360px] object-contain bg-gray-50"
                  />
                </BrowserFrame>
              </div>
            )}
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}
