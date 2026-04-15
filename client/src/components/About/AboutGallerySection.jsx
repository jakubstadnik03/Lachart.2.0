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
    src: '/screenshots/dashboard-home.png',
    webpSrcSet: '/screenshots/dashboard-home-640.webp 640w, /screenshots/dashboard-home-960.webp 960w, /screenshots/dashboard-home-1280.webp 1280w',
    sizes: '(min-width: 768px) 600px, (min-width: 640px) 450px, 300px',
    alt: 'Dashboard Form & Fitness',
    title: 'Dashboard · CTL / ATL / TSB'
  },
  {
    src: '/screenshots/lactate-testing-page.png',
    webpSrcSet: '/screenshots/lactate-testing-page-640.webp 640w, /screenshots/lactate-testing-page-960.webp 960w, /screenshots/lactate-testing-page-1280.webp 1280w',
    sizes: '(min-width: 768px) 600px, (min-width: 640px) 450px, 300px',
    alt: 'Lactate Testing',
    title: 'Lactate Testing & LT Trends'
  },
  { src: '/images/lactate-curve-calculator.png', alt: 'Lactate Curve Calculator', title: 'Lactate Curve Calculator' },
  { src: '/images/Form-fitness-chart.png', alt: 'Form & Fitness Chart', title: 'Form & Fitness Trend' },
  { src: '/images/training-calendar.png', alt: 'Training Calendar', title: 'Training Calendar' },
  { src: '/images/training-analytics.png', alt: 'Training Analytics', title: 'Analytics & TSS' },
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
              <div className={`relative transition-all duration-300 ${isActive ? 'scale-100' : 'scale-90 opacity-60'}`}>
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
