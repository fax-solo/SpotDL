import { useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Headphones, Zap, Tags, Smartphone, Download, LogIn, UserPlus } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { gsap, ScrollTrigger } from '../lib/gsap'
import './LandingPage.css'

async function downloadLatestAPK() {
  try {
    const res = await fetch('https://api.github.com/repos/fax-solo/SpotDL/releases/latest')
    const data = await res.json()
    const asset = data.assets?.find((a: { name: string }) => a.name.endsWith('.apk'))
    if (asset?.browser_download_url) {
      window.location.href = asset.browser_download_url
      return
    }
  } catch { /* fallback */ }
  window.location.href = 'https://github.com/fax-solo/SpotDL/releases/latest'
}

export function LandingPage() {
  const { user } = useAuth()

  useEffect(() => {
    import('./Downloader')
  }, [])

  const buildDesktopTL = useCallback((): gsap.core.Timeline => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#scrollytell',
        start: 'top top',
        end: '+=600%',
        scrub: 1.5,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        pin: '.pinned-content',
      },
      defaults: { ease: 'none' },
    })

    tl.set('.phone-frame', { y: '120vh', opacity: 0, scale: 0.85 })
    tl.set('.stage-text.s2, .stage-text.s3, .stage-text.s4, .stage-text.s5', { opacity: 0 })
    tl.set('.stage-text.s1', { opacity: 1 })
    tl.set('#stage1Reveal', { text: '' })

    tl.to('.phone-frame', { y: 0, opacity: 1, scale: 1, duration: 0.14, ease: 'power2.out' }, 0)
    tl.to('#stage1Reveal', { duration: 0.06, text: 'Discover the Power of Sinc', ease: 'none' }, 0.04)
    tl.to('#orb1', { scale: 1.2, opacity: 0.6, duration: 0.14 }, 0)
    tl.to('#orb2', { scale: 1.3, opacity: 0.5, duration: 0.14 }, 0)

    tl.to('.stage-text.s1', { opacity: 0, duration: 0.03, ease: 'power2.in' }, 0.14)
    tl.set('.stage-text.s2', { opacity: 1 }, 0.17)
    tl.set('.stage-text.s2 h2', { opacity: 0, y: 25, scale: 0.95 }, 0.17)
    tl.set('.stage-text.s2 p', { opacity: 0, y: 15 }, 0.17)
    tl.to('.stage-text.s2 h2', { opacity: 1, y: 0, scale: 1, duration: 0.05, ease: 'power3.out' }, 0.17)
    tl.to('.stage-text.s2 p', { opacity: 1, y: 0, duration: 0.04, ease: 'power2.out' }, 0.20)
    tl.to('#orb1', { x: 80, y: -60, scale: 1.5, duration: 0.16 }, 0.14)
    tl.to('#orb2', { x: -60, y: 40, scale: 1.4, duration: 0.16 }, 0.14)

    tl.to('.screen-1', { opacity: 0, duration: 0.02 }, 0.30)
    tl.to('.screen-2', { opacity: 1, duration: 0.02 }, 0.30)
    tl.to('.stage-text.s2', { opacity: 0, duration: 0.03, ease: 'power2.in' }, 0.30)
    tl.set('.stage-text.s3', { opacity: 1 }, 0.33)
    tl.set('.stage-text.s3 h2', { opacity: 0, y: 25, scale: 0.95 }, 0.33)
    tl.set('.stage-text.s3 p', { opacity: 0, y: 15 }, 0.33)
    tl.to('.stage-text.s3 h2', { opacity: 1, y: 0, scale: 1, duration: 0.05, ease: 'power3.out' }, 0.33)
    tl.to('.stage-text.s3 p', { opacity: 1, y: 0, duration: 0.04, ease: 'power2.out' }, 0.36)

    tl.set('#cursorDot, #cursorRing', { opacity: 0, scale: 1, left: '20%', top: '5%' })
    tl.to('#cursorDot', { opacity: 0.9, duration: 0.02 }, 0.34)
    tl.to('#cursorRing', { opacity: 0.4, duration: 0.02 }, 0.34)
    tl.to('#cursorDot', { left: '50%', top: '67%', duration: 0.06, ease: 'power2.inOut' }, 0.36)
    tl.to('#cursorRing', { left: '50%', top: '67%', duration: 0.06, ease: 'power2.inOut' }, 0.36)
    tl.to('#cursorDot', { scale: 0.6, opacity: 0.7, duration: 0.02 }, 0.42)
    tl.to('#cursorRing', { scale: 0.6, duration: 0.02 }, 0.42)
    tl.set('#cursorClickRing', { left: '50%', top: '67%', opacity: 1, scale: 0 })
    tl.to('#cursorClickRing', { scale: 2.5, opacity: 0, duration: 0.06, ease: 'power2.out' }, 0.43)
    tl.to('#cursorDot, #cursorRing', { opacity: 0, duration: 0.02 }, 0.47)
    tl.to('#progressFill', { scaleX: 1, duration: 0.18, ease: 'power3.inOut' }, 0.35)

    tl.to('.screen-2', { opacity: 0, duration: 0.02 }, 0.50)
    tl.to('.screen-3', { opacity: 1, duration: 0.02 }, 0.50)
    tl.to('.stage-text.s3', { opacity: 0, duration: 0.03, ease: 'power2.in' }, 0.50)
    tl.set('.stage-text.s4', { opacity: 1 }, 0.53)
    tl.set('.stage-text.s4 h2', { opacity: 0, y: 25, scale: 0.95 }, 0.53)
    tl.set('.stage-text.s4 p', { opacity: 0, y: 15 }, 0.53)
    tl.to('.stage-text.s4 h2', { opacity: 1, y: 0, scale: 1, duration: 0.05, ease: 'power3.out' }, 0.53)
    tl.to('.stage-text.s4 p', { opacity: 1, y: 0, duration: 0.04, ease: 'power2.out' }, 0.56)
    tl.to('#successOverlay', { opacity: 1, duration: 0.04, ease: 'power2.out' }, 0.52)
    tl.to('#checkmarkIcon', { scale: 1, rotation: 0, opacity: 1, duration: 0.06, ease: 'back.out(2.5)' }, 0.54)
    tl.to('#successText', { opacity: 1, y: 0, duration: 0.03 }, 0.56)
    tl.to('#libraryText', { opacity: 1, y: 0, duration: 0.03 }, 0.57)
    tl.to('#successActions', { opacity: 1, y: 0, duration: 0.03 }, 0.58)

    tl.to('.phone-frame', { scale: 0.7, x: '-42vw', y: 20, duration: 0.10, ease: 'power2.inOut' }, 0.75)
    tl.to('.stage-text.s4', { opacity: 0, duration: 0.03, ease: 'power2.in' }, 0.75)
    tl.set('.stage-text.s5', { opacity: 1 }, 0.78)
    tl.set('.stage-text.s5 h2', { opacity: 0, y: 25, scale: 0.95 }, 0.78)
    tl.set('.stage-text.s5 p', { opacity: 0, y: 15 }, 0.78)
    tl.to('.stage-text.s5 h2', { opacity: 1, y: 0, scale: 1, duration: 0.05, ease: 'power3.out' }, 0.78)
    tl.to('.stage-text.s5 p', { opacity: 1, y: 0, duration: 0.04, ease: 'power2.out' }, 0.81)
    tl.to('#sideCopy', { x: '-10vw', opacity: 0, duration: 0.08, ease: 'power2.in' }, 0.78)
    tl.to('#orb1', { x: 200, y: -120, scale: 2, opacity: 0.3, duration: 0.10 }, 0.75)
    tl.to('#orb2', { x: -200, y: 120, scale: 2, opacity: 0.3, duration: 0.10 }, 0.75)
    tl.to('.phone-frame', { opacity: 0.2, scale: 0.45, duration: 0.10 }, 0.85)
    tl.to('#orb1', { opacity: 0.1, duration: 0.10 }, 0.90)
    tl.to('#orb2', { opacity: 0.1, duration: 0.10 }, 0.95)

    return tl
  }, [])

  const buildMobileTL = useCallback((): gsap.core.Timeline => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#scrollytell',
        start: 'top top',
        end: '+=600%',
        scrub: 1.5,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        pin: '.pinned-content',
      },
      defaults: { ease: 'none' },
    })

    tl.set('.phone-frame', { y: '100vh', opacity: 0, scale: 0.8 })
    tl.set('.stage-text.s2, .stage-text.s3, .stage-text.s4, .stage-text.s5', { opacity: 0 })
    tl.set('.stage-text.s1', { opacity: 1 })
    tl.set('#stage1Reveal', { text: '' })

    tl.to('.phone-frame', { y: 0, opacity: 1, scale: 1, duration: 0.14, ease: 'power2.out' }, 0)
    tl.to('#stage1Reveal', { duration: 0.06, text: 'Discover the Power of Sinc', ease: 'none' }, 0.04)
    tl.to('#orb1', { scale: 1.2, opacity: 0.6, duration: 0.14 }, 0)
    tl.to('#orb2', { scale: 1.3, opacity: 0.5, duration: 0.14 }, 0)

    tl.to('.stage-text.s1', { opacity: 0, duration: 0.03, ease: 'power2.in' }, 0.14)
    tl.set('.stage-text.s2', { opacity: 1 }, 0.17)
    tl.set('.stage-text.s2 h2', { opacity: 0, y: 16, scale: 0.95 }, 0.17)
    tl.set('.stage-text.s2 p', { opacity: 0, y: 10 }, 0.17)
    tl.to('.stage-text.s2 h2', { opacity: 1, y: 0, scale: 1, duration: 0.05, ease: 'power3.out' }, 0.17)
    tl.to('.stage-text.s2 p', { opacity: 1, y: 0, duration: 0.04, ease: 'power2.out' }, 0.20)
    tl.to('#orb1', { x: 40, y: -30, scale: 1.3, duration: 0.16 }, 0.14)
    tl.to('#orb2', { x: -30, y: 20, scale: 1.2, duration: 0.16 }, 0.14)

    tl.to('.screen-1', { opacity: 0, duration: 0.02 }, 0.30)
    tl.to('.screen-2', { opacity: 1, duration: 0.02 }, 0.30)
    tl.to('.stage-text.s2', { opacity: 0, duration: 0.03, ease: 'power2.in' }, 0.30)
    tl.set('.stage-text.s3', { opacity: 1 }, 0.33)
    tl.set('.stage-text.s3 h2', { opacity: 0, y: 16, scale: 0.95 }, 0.33)
    tl.set('.stage-text.s3 p', { opacity: 0, y: 10 }, 0.33)
    tl.to('.stage-text.s3 h2', { opacity: 1, y: 0, scale: 1, duration: 0.05, ease: 'power3.out' }, 0.33)
    tl.to('.stage-text.s3 p', { opacity: 1, y: 0, duration: 0.04, ease: 'power2.out' }, 0.36)

    tl.set('#cursorDot, #cursorRing', { opacity: 0, scale: 1, left: '20%', top: '5%' })
    tl.to('#cursorDot', { opacity: 0.9, duration: 0.02 }, 0.34)
    tl.to('#cursorRing', { opacity: 0.4, duration: 0.02 }, 0.34)
    tl.to('#cursorDot', { left: '50%', top: '67%', duration: 0.06, ease: 'power2.inOut' }, 0.36)
    tl.to('#cursorRing', { left: '50%', top: '67%', duration: 0.06, ease: 'power2.inOut' }, 0.36)
    tl.to('#cursorDot', { scale: 0.6, opacity: 0.7, duration: 0.02 }, 0.42)
    tl.to('#cursorRing', { scale: 0.6, duration: 0.02 }, 0.42)
    tl.set('#cursorClickRing', { left: '50%', top: '67%', opacity: 1, scale: 0 })
    tl.to('#cursorClickRing', { scale: 2, opacity: 0, duration: 0.06, ease: 'power2.out' }, 0.43)
    tl.to('#cursorDot, #cursorRing', { opacity: 0, duration: 0.02 }, 0.47)
    tl.to('#progressFill', { scaleX: 1, duration: 0.18, ease: 'power3.inOut' }, 0.35)

    tl.to('.screen-2', { opacity: 0, duration: 0.02 }, 0.50)
    tl.to('.screen-3', { opacity: 1, duration: 0.02 }, 0.50)
    tl.to('.stage-text.s3', { opacity: 0, duration: 0.03, ease: 'power2.in' }, 0.50)
    tl.set('.stage-text.s4', { opacity: 1 }, 0.53)
    tl.set('.stage-text.s4 h2', { opacity: 0, y: 16, scale: 0.95 }, 0.53)
    tl.set('.stage-text.s4 p', { opacity: 0, y: 10 }, 0.53)
    tl.to('.stage-text.s4 h2', { opacity: 1, y: 0, scale: 1, duration: 0.05, ease: 'power3.out' }, 0.53)
    tl.to('.stage-text.s4 p', { opacity: 1, y: 0, duration: 0.04, ease: 'power2.out' }, 0.56)
    tl.to('#successOverlay', { opacity: 1, duration: 0.04 }, 0.52)
    tl.to('#checkmarkIcon', { scale: 1, rotation: 0, opacity: 1, duration: 0.06, ease: 'back.out(2.5)' }, 0.54)
    tl.to('#successText', { opacity: 1, y: 0, duration: 0.03 }, 0.56)
    tl.to('#libraryText', { opacity: 1, y: 0, duration: 0.03 }, 0.57)
    tl.to('#successActions', { opacity: 1, y: 0, duration: 0.03 }, 0.58)

    tl.to('.phone-frame', { scale: 0.7, x: '-50vw', y: 20, duration: 0.10, ease: 'power2.inOut' }, 0.75)
    tl.to('.stage-text.s4', { opacity: 0, duration: 0.03, ease: 'power2.in' }, 0.75)
    tl.set('.stage-text.s5', { opacity: 1 }, 0.78)
    tl.set('.stage-text.s5 h2', { opacity: 0, y: 16, scale: 0.95 }, 0.78)
    tl.set('.stage-text.s5 p', { opacity: 0, y: 10 }, 0.78)
    tl.to('.stage-text.s5 h2', { opacity: 1, y: 0, scale: 1, duration: 0.05, ease: 'power3.out' }, 0.78)
    tl.to('.stage-text.s5 p', { opacity: 1, y: 0, duration: 0.04, ease: 'power2.out' }, 0.81)
    tl.to('#sideCopy', { x: '-10vw', opacity: 0, duration: 0.08, ease: 'power2.in' }, 0.78)
    tl.to('#orb1', { x: 100, y: -60, scale: 1.5, opacity: 0.3, duration: 0.10 }, 0.75)
    tl.to('#orb2', { x: -100, y: 60, scale: 1.5, opacity: 0.3, duration: 0.10 }, 0.75)
    tl.to('.phone-frame', { opacity: 0.2, scale: 0.45, duration: 0.10 }, 0.85)
    tl.to('#orb1', { opacity: 0.1, duration: 0.10 }, 0.90)
    tl.to('#orb2', { opacity: 0.1, duration: 0.10 }, 0.95)

    return tl
  }, [])

  useEffect(() => {
    const mm = gsap.matchMedia()
    mm.add('(min-width: 768px)', buildDesktopTL)
    mm.add('(max-width: 767px)', buildMobileTL)

    const handleResize = () => ScrollTrigger.refresh()
    window.addEventListener('resize', handleResize)
    ScrollTrigger.refresh()
    const timer = setTimeout(() => ScrollTrigger.refresh(), 800)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
      mm.revert()
    }
  }, [buildDesktopTL, buildMobileTL])

  return (
    <div className="relative overflow-x-hidden bg-[#0C0C0E] text-white font-sans">


      {/* Auth Header */}
      <div className="absolute top-0 left-0 right-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-end gap-3">
          {user ? (
            <Link to="/settings" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/50 dark:bg-dark-surface/50 backdrop-blur-md border border-light-border/50 dark:border-dark-border/50 text-sm font-medium text-light-text dark:text-dark-text hover:bg-white dark:hover:bg-dark-surface transition-colors">
              <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold text-accent">{(user.display_name || 'U')[0]}</span>
                )}
              </div>
              {user.display_name || 'Account'}
            </Link>
          ) : (
            <>
              <Link to="/login" className="px-4 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-white/40">
                <LogIn className="w-4 h-4" />
                Sign In
              </Link>
              <Link to="/signup" className="px-4 py-2 rounded-xl bg-[#1DB954] text-white text-sm font-medium hover:bg-[#169c46] transition-colors flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-white/40">
                <UserPlus className="w-4 h-4" />
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: -1 }}>
        <div className="absolute -top-[20%] -left-[10%] w-[800px] h-[800px] bg-[#1DB954]/10 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] -right-[20%] w-[600px] h-[600px] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      {/* Hero Section */}
      <section className="h-screen flex flex-col items-center justify-center text-center relative min-h-[500px]">
        <div>
          <div className="text-[#1DB954] text-xs font-semibold tracking-[3px] uppercase mb-3">Sinc v3</div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-none">
            <span className="bg-gradient-to-r from-[#1DB954] to-[#1ed760] bg-clip-text text-transparent">Scrollytelling</span>
            <br />
            <span className="text-white/90">Preview</span>
          </h1>
          <p className="mt-4 text-white/30 text-sm max-w-md mx-auto leading-relaxed px-4">
            Scroll down to experience the interactive narrative. Each scroll phase reveals a new dimension of the Sinc app.
          </p>
          <div className="mt-8 flex justify-center animate-bounce">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 13l5 5 5-5" /><path d="M7 6l5 5 5-5" />
            </svg>
          </div>
        </div>
      </section>

      {/* Scrollytelling */}
      <section id="scrollytell" className="relative">
          <div className="pinned-content h-screen w-full flex items-center justify-center relative">
          <div className="backdrop-orb orb-1" id="orb1" />
          <div className="backdrop-orb orb-2" id="orb2" />

          <div className="flex items-center justify-center gap-8 md:gap-16 xl:gap-24 px-4 md:px-8 w-full max-w-6xl mx-auto relative z-10">
            {/* Phone */}
            <div className="phone-wrapper relative flex-shrink-0" id="phoneWrapper">
              <div className="phone-frame" id="phoneFrame">
                <div className="phone-notch">
                  <div className="phone-notch-inner">
                    <div className="phone-notch-camera" />
                  </div>
                </div>

                <div className="screen-viewport" id="screenViewport">
                  {/* Screen 1: Home */}
                  <div className="screen screen-1" id="screen1">
                    <div className="status-bar">
                      <span>9:41</span>
                      <div className="status-icons">
                        <svg viewBox="0 0 24 24"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" /></svg>
                        <svg viewBox="0 0 24 24"><rect x="2" y="7" width="4" height="10" rx="1" /><rect x="8" y="5" width="4" height="14" rx="1" /><rect x="14" y="3" width="4" height="18" rx="1" /></svg>
                      </div>
                    </div>

                    <div className="home-header">
                      <div className="home-logo">Sinc</div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
                    </div>

                    <div className="home-greeting">Good evening</div>
                    <div className="home-title">Discover the Power<br />of Sinc</div>

                    <div className="search-bar">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                      Search or paste a Spotify link...
                    </div>

                    <div className="section-label">
                      Trending Downloads
                      <span>See all</span>
                    </div>

                    {[
                      { name: 'Blinding Lights', artist: 'The Weeknd', meta: '12.4k', bg: 'url(https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36) center/cover, linear-gradient(135deg, #7c3aed, #1DB95433)' },
                      { name: 'Flowers', artist: 'Miley Cyrus', meta: '8.7k', bg: 'url(https://i.scdn.co/image/ab67616d0000b273cd222052a2594be29a6616b5) center/cover, linear-gradient(135deg, #f59e0b, #1DB95433)' },
                      { name: 'Starboy', artist: 'The Weeknd', meta: '6.2k', bg: 'url(https://i.scdn.co/image/ab67616d0000b2734718e2b124f79258be7bc452) center/cover, linear-gradient(135deg, #ec4899, #1DB95433)' },
                    ].map(track => (
                      <div key={track.name} className="track-row">
                        <div className="track-art" style={{ background: track.bg }} />
                        <div className="track-info">
                          <div className="track-name">{track.name}</div>
                          <div className="track-artist">{track.artist}</div>
                        </div>
                        <div className="track-meta">{track.meta}</div>
                      </div>
                    ))}

                    <div className="bottom-nav">
                      <div className="nav-item active">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12h3v9h6v-6h2v6h6v-9h3L12 2z" /></svg>
                        <span>Home</span>
                      </div>
                      <div className="nav-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                        <span>Search</span>
                      </div>
                      <div className="nav-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        <span>DL</span>
                      </div>
                      <div className="nav-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="12" r="4" /></svg>
                        <span>Profile</span>
                      </div>
                    </div>
                  </div>

                  {/* Screen 2: Download */}
                  <div className="screen screen-2" id="screen2">
                    <div className="status-bar">
                      <span>9:41</span>
                      <div className="status-icons">
                        <svg viewBox="0 0 24 24"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" /></svg>
                        <svg viewBox="0 0 24 24"><rect x="2" y="7" width="4" height="10" rx="1" /><rect x="8" y="5" width="4" height="14" rx="1" /><rect x="14" y="3" width="4" height="18" rx="1" /></svg>
                      </div>
                    </div>

                    <div className="detail-back">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                      Now Playing
                    </div>

                    <div className="album-art-large" style={{ background: 'url(https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36) center/cover, linear-gradient(135deg, #4a1a7a, #1a1a4e)' }}>
                      <div className="album-art-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                      </div>
                    </div>

                    <div className="detail-info">
                      <div className="detail-title">Blinding Lights</div>
                      <div className="detail-artist">The Weeknd</div>
                      <div className="detail-album">After Hours &middot; 2020</div>
                    </div>

                    <div className="detail-meta-row">
                      <span>&#9834; 3:20</span>
                      <span>&#8962; 9.2 MB</span>
                      <span>&#9835; 320kbps</span>
                    </div>

                    <div className="download-btn-wrap">
                      <button className="download-btn" id="downloadBtn">
                        <div className="download-btn-glow" />
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        DOWNLOAD SONG
                      </button>
                    </div>

                    <div className="progress-bar">
                      <div className="progress-fill" id="progressFill" />
                    </div>

                    <div className="detail-footer">
                      ID3 Tags &middot; Album Art &middot; LRC Lyrics
                    </div>
                  </div>

                  {/* Screen 3: Success */}
                  <div className="screen screen-3" id="screen3">
                    <div className="status-bar" style={{ position: 'relative', zIndex: 10 }}>
                      <span>9:41</span>
                      <div className="status-icons">
                        <svg viewBox="0 0 24 24"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" /></svg>
                        <svg viewBox="0 0 24 24"><rect x="2" y="7" width="4" height="10" rx="1" /><rect x="8" y="5" width="4" height="14" rx="1" /><rect x="14" y="3" width="4" height="18" rx="1" /></svg>
                      </div>
                    </div>

                    <div className="album-art-large" style={{ marginTop: '4px', background: 'url(https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36) center/cover, linear-gradient(135deg, #4a1a7a, #1a1a4e)' }}>
                      <div className="album-art-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                      </div>
                    </div>

                    <div className="detail-info">
                      <div className="detail-title">Blinding Lights</div>
                      <div className="detail-artist">The Weeknd</div>
                    </div>

                    <div className="progress-bar" style={{ margin: '4px 20px' }}>
                      <div className="progress-fill" style={{ transform: 'scaleX(1)' }} />
                    </div>

                    <div className="success-overlay" id="successOverlay">
                      <div className="checkmark" id="checkmarkIcon">
                        <svg viewBox="0 0 24 24" stroke="currentColor"><polyline points="20 6 9 17 4 12" /></svg>
                      </div>
                      <div className="success-text" id="successText">DOWNLOADED SUCCESSFULLY</div>
                      <div className="library-text" id="libraryText">ADDED TO LOCAL MEDIA STORE</div>
                      <div className="success-actions" id="successActions">
                        <button className="success-btn success-btn-primary">&#9654; Play Now</button>
                        <button className="success-btn success-btn-secondary">&#9776; Library</button>
                      </div>
                    </div>
                  </div>

                  {/* Cursor */}
                  <div className="cursor-dot" id="cursorDot" />
                  <div className="cursor-ring" id="cursorRing" />
                  <div className="cursor-click-ring" id="cursorClickRing" />
                </div>
              </div>
            </div>

            {/* Side Copy */}
            <div className="side-copy relative" id="sideCopy">
              <div className="stage-text s1" data-stage="1">
                <div className="label">Stage 01</div>
                <h2><span id="stage1Reveal">Discover the Power of Sinc</span></h2>
                <p>Paste any Spotify track, album, or playlist link and let Sinc handle the rest. High-fidelity audio, album art, and metadata — all in one seamless experience.</p>
                <div className="stage-number">01</div>
              </div>
              <div className="stage-text s2" data-stage="2">
                <div className="label">Stage 02</div>
                <h2>Immersive Native<br />User Interface</h2>
                <p>Crafted for speed and beauty. Every pixel of the Sinc app is optimized for a fluid, native-feeling experience with Material You theming.</p>
                <div className="stage-number">02</div>
              </div>
              <div className="stage-text s3" data-stage="3">
                <div className="label">Stage 03</div>
                <h2>Seamless One-Tap<br />Downloads</h2>
                <p>Tap once and watch the magic happen. Sinc fetches, converts, and tags your track at 320kbps with full album artwork embedded.</p>
                <div className="stage-number">03</div>
              </div>
              <div className="stage-text s4" data-stage="4">
                <div className="label">Stage 04</div>
                <h2>Automatically Added<br />to Your Library</h2>
                <p>Every download is instantly cataloged into your local media store. No sync required — your music is always available, even offline.</p>
                <div className="stage-number">04</div>
              </div>
              <div className="stage-text s5" data-stage="5">
                <div className="label">Stage 05</div>
                <h2>Ready for High-Quality<br />Offline Audio?</h2>
                <p>Download the Sinc app and start building your offline music collection today. Free, open-source, and privacy-first.</p>
                <div className="stage-number">05</div>
              </div>
            </div>
          </div>


        </div>
      </section>

      {/* Exit CTA Section */}
      <section className="relative flex items-center justify-center px-6 py-8 md:py-12" style={{ background: '#0C0C0E' }}>
        <div className="max-w-[680px] text-center px-6 py-8 md:px-12 md:py-10 rounded-3xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1DB954]/10 border border-[#1DB954]/20 text-[#1DB954] text-xs font-semibold tracking-wider uppercase mb-3">
            Sinc v3
          </span>
          <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-3">Your Music, Always Yours to Keep</h2>
          <p className="text-white/40 text-sm max-w-md mx-auto mb-5 leading-relaxed">
            Download high-fidelity audio from Spotify with automated ID3 tagging, album art, and LRC lyrics.
          </p>
          <button onClick={downloadLatestAPK} className="inline-flex items-center gap-2 px-8 py-3 bg-[#1DB954] hover:bg-[#169c46] text-white font-bold rounded-xl transition-colors shadow-[0_0_30px_-5px_rgba(29,185,84,0.4)] focus-visible:ring-2 focus-visible:ring-white/40">
            <Download className="w-5 h-5" />
            Get Sinc on Android
          </button>
          <p className="mt-3 text-white/20 text-xs">v3.0.0 &middot; Free &amp; Open Source</p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-4 py-12 md:py-16 bg-gradient-to-b from-transparent to-black/30 relative" style={{ background: '#0C0C0E' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 md:mb-12">
            <h2 className="text-2xl md:text-4xl font-bold text-white mb-3">Why choose Sinc?</h2>
            <p className="text-sm md:text-base text-white/40 max-w-2xl mx-auto">We've built the most reliable, feature-rich downloading pipeline to give you the ultimate audio experience.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<Headphones className="w-7 h-7 text-[#1DB954]" />}
              title="High Quality Audio"
              description="Downloads are processed at up to 320kbps MP3 for crystal clear, lossless-feeling sound."
            />
            <FeatureCard
              icon={<Tags className="w-7 h-7 text-blue-500" />}
              title="Metadata Tagging"
              description="Automatically embeds correct titles, artists, albums, and high-res cover art."
            />
            <FeatureCard
              icon={<Zap className="w-7 h-7 text-yellow-500" />}
              title="Lightning Fast"
              description="Optimized yt-dlp backend pipeline ensures your downloads finish in mere seconds."
            />
            <FeatureCard
              icon={<Smartphone className="w-7 h-7 text-purple-500" />}
              title="Cross Platform"
              description="Use Sinc beautifully on the web or install the native Android APK for on-the-go access."
            />
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="px-4 py-12 md:py-16 scroll-mt-20" style={{ background: '#0C0C0E' }}>
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-bold text-white mb-10 md:mb-12">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8 md:gap-6 relative">

            <StepCard number="1" title="Copy Link" description="Find a track, album, or playlist on Spotify and copy its share link." />
            <StepCard number="2" title="Paste & Fetch" description="Paste the link into Sinc. We'll instantly fetch the metadata and artwork." />
            <StepCard number="3" title="Download" description="Click download. We'll find the highest quality audio and tag it for you." />
          </div>
          <div className="mt-12 md:mt-16">
            <Link to="/download">
              <button className="inline-flex items-center gap-2 px-8 py-4 bg-white/5 border border-[#1DB954]/30 text-[#1DB954] font-semibold rounded-2xl hover:bg-[#1DB954] hover:text-white hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)] transition-all hover:scale-[1.05] active:scale-[0.95] focus-visible:ring-2 focus-visible:ring-[#1DB954]">
                <Download className="w-5 h-5" />
                Try it Now
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-sm text-white/30 border-t border-white/5" style={{ background: '#0C0C0E' }}>
        <p>Built with React, Tailwind CSS, GSAP, and FastAPI.</p>
        <p className="mt-1 text-xs opacity-70">Sinc is not affiliated with Spotify AB.</p>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all relative overflow-hidden group hover:-translate-y-1">
      <div className="absolute top-0 right-0 p-6 opacity-5 transform translate-x-1/4 -translate-y-1/4 group-hover:scale-150 transition-transform duration-500 pointer-events-none">
        {icon}
      </div>
      <div className="w-12 h-12 rounded-xl bg-black/30 flex items-center justify-center mb-4 border border-white/10 shadow-sm">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-white/40 text-sm leading-relaxed">{description}</p>
    </div>
  )
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="relative flex flex-col items-center group">
      <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl font-bold text-[#1DB954] shadow-lg mb-6 z-10 relative overflow-hidden group-hover:scale-110 transition-transform">
        <div className="absolute inset-0 bg-[#1DB954]/5 group-hover:bg-[#1DB954]/10 transition-colors" />
        {number}
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-white/40 text-sm leading-relaxed max-w-xs">{description}</p>
    </div>
  )
}
